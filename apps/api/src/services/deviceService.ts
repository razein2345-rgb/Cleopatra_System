import { prisma } from '../lib/prisma.js';
import type { TrustedDevice, UpdateTrustedDeviceInput } from '@cleopatra/shared';
import { recordAudit } from './auditService.js';
import type { Prisma } from '../generated/prisma/client.js';

/**
 * Device Access Control (2026-08-24, owner: "عايز اقدر احدد الأجهزة
 * المسموح لها بفتح النظام"). Enforced from `requireAuth.ts` on every
 * request (not just login) — a device's `deviceToken` is a random,
 * non-sensitive value the browser generates once and keeps in
 * `localStorage`, sent as the `X-Device-Id` header. No fingerprinting:
 * `deviceType`/`os`/`browser` are parsed server-side from the standard
 * `User-Agent` header every request already carries, not collected.
 */

export class DeviceAccessDeniedError extends Error {
  constructor(
    public reason: 'PENDING' | 'BLOCKED' | 'WRONG_STAFF' | 'MISSING',
    message: string,
  ) {
    super(message);
    this.name = 'DeviceAccessDeniedError';
  }
}

export class DeviceNotFoundError extends Error {}

type TrustedDeviceRecord = Prisma.TrustedDeviceGetPayload<{ include: { staff: { select: { name: true } } } }>;

function mapDeviceToDto(record: TrustedDeviceRecord): TrustedDevice {
  return {
    id: record.id,
    label: record.label,
    staffId: record.staffId,
    staffName: record.staff?.name ?? null,
    status: record.status,
    deviceType: record.deviceType,
    os: record.os,
    browser: record.browser,
    firstSeenAt: record.firstSeenAt.toISOString(),
    lastLoginAt: record.lastLoginAt ? record.lastLoginAt.toISOString() : null,
    lastActiveAt: record.lastActiveAt ? record.lastActiveAt.toISOString() : null,
    approvedById: record.approvedById,
    approvedAt: record.approvedAt ? record.approvedAt.toISOString() : null,
    blockedById: record.blockedById,
    blockedAt: record.blockedAt ? record.blockedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
  };
}

/**
 * Lightweight, in-house `User-Agent` parser — deliberately not a new npm
 * dependency for three fields nobody needs high precision on (owner: "لا
 * تقم بإضافة أي آلية Fingerprinting عدوانية أو تجمع بيانات غير ضرورية").
 * Good-enough classification, not a full UA database.
 */
export function parseUserAgent(ua: string | undefined): {
  deviceType: string | null;
  os: string | null;
  browser: string | null;
} {
  if (!ua) return { deviceType: null, os: null, browser: null };

  const isTablet = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua);
  const isMobile = !isTablet && /Mobile|Android|iPhone/i.test(ua);
  const deviceType = isTablet ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';

  let os: string | null = null;
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) os = 'iOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser: string | null = null;
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  return { deviceType, os, browser };
}

/** Throttle window for the device's own presence write, same rationale/value as `StaffProfile.lastActiveAt` in `requireAuth.ts`. */
const PRESENCE_UPDATE_INTERVAL_MS = 60_000;

/**
 * The single enforcement point, called from `requireAuth.ts` for every
 * authenticated request (Kiosk exempted by the caller before this is ever
 * reached). Finds-or-registers the device, applies `Setting.deviceAccessMode`
 * to a first-seen device, then checks status + Policy A/B ownership.
 * Throws `DeviceAccessDeniedError` — never returns a denial silently.
 */
export async function resolveDeviceAccess(params: {
  deviceToken: string | undefined;
  userAgent: string | undefined;
  staffId: string;
}): Promise<void> {
  if (!params.deviceToken) {
    throw new DeviceAccessDeniedError('MISSING', 'Device identification missing');
  }

  let device = await prisma.trustedDevice.findUnique({ where: { deviceToken: params.deviceToken } });

  if (!device || device.isDeleted) {
    const setting = await prisma.setting.findFirst({ select: { deviceAccessMode: true } });
    const mode = setting?.deviceAccessMode ?? 'ALLOW_ALL_REGISTERED';
    const parsed = parseUserAgent(params.userAgent);
    const status = mode === 'ONLY_APPROVED' ? 'PENDING' : 'ACTIVE';

    device = await prisma.trustedDevice.create({
      data: {
        deviceToken: params.deviceToken,
        // Policy B by default (bound to whoever first used it) — the safer,
        // more restrictive default; SUPER_ADMIN can unbind it to Policy A
        // (general/shared) afterward if that's what the device actually is.
        staffId: params.staffId,
        status,
        deviceType: parsed.deviceType,
        os: parsed.os,
        browser: parsed.browser,
        label: parsed.deviceType && parsed.browser ? `${parsed.deviceType} — ${parsed.browser}` : parsed.deviceType,
        lastLoginAt: status === 'ACTIVE' ? new Date() : null,
        lastActiveAt: status === 'ACTIVE' ? new Date() : null,
      },
    });

    await recordAudit({
      entityType: 'TrustedDevice',
      entityId: device.id,
      action: 'DEVICE_REGISTERED',
      performedById: params.staffId,
      newValue: { status: device.status, deviceType: device.deviceType, os: device.os, browser: device.browser },
    });
  }

  if (device.status === 'BLOCKED') {
    await recordAudit({
      entityType: 'TrustedDevice',
      entityId: device.id,
      action: 'UNAUTHORIZED_DEVICE_ATTEMPT',
      performedById: params.staffId,
      newValue: { reason: 'BLOCKED' },
    });
    throw new DeviceAccessDeniedError('BLOCKED', 'This device has been blocked');
  }

  if (device.status === 'PENDING') {
    await recordAudit({
      entityType: 'TrustedDevice',
      entityId: device.id,
      action: 'UNAUTHORIZED_DEVICE_ATTEMPT',
      performedById: params.staffId,
      newValue: { reason: 'PENDING' },
    });
    throw new DeviceAccessDeniedError('PENDING', 'This device is awaiting administrator approval');
  }

  // Policy B — bound to a specific staff member; anyone else is denied
  // even with correct credentials, regardless of the device's own status.
  if (device.staffId && device.staffId !== params.staffId) {
    await recordAudit({
      entityType: 'TrustedDevice',
      entityId: device.id,
      action: 'UNAUTHORIZED_DEVICE_ATTEMPT',
      performedById: params.staffId,
      newValue: { reason: 'WRONG_STAFF' },
    });
    throw new DeviceAccessDeniedError('WRONG_STAFF', 'This device is not authorized for this account');
  }

  const isStale = !device.lastActiveAt || Date.now() - device.lastActiveAt.getTime() > PRESENCE_UPDATE_INTERVAL_MS;
  if (isStale) {
    prisma.trustedDevice
      .update({ where: { id: device.id }, data: { lastActiveAt: new Date(), lastLoginAt: new Date() } })
      .catch(() => {});
  }
}

export async function listDevices(): Promise<TrustedDevice[]> {
  const rows = await prisma.trustedDevice.findMany({
    where: { isDeleted: false },
    include: { staff: { select: { name: true } } },
    orderBy: { firstSeenAt: 'desc' },
  });
  return rows.map(mapDeviceToDto);
}

async function loadDeviceOr404(id: string): Promise<TrustedDeviceRecord> {
  const device = await prisma.trustedDevice.findUnique({ where: { id }, include: { staff: { select: { name: true } } } });
  if (!device || device.isDeleted) throw new DeviceNotFoundError();
  return device;
}

export async function approveDevice(id: string, performedById: string): Promise<TrustedDevice> {
  await loadDeviceOr404(id);
  const updated = await prisma.trustedDevice.update({
    where: { id },
    data: { status: 'ACTIVE', approvedById: performedById, approvedAt: new Date() },
    include: { staff: { select: { name: true } } },
  });
  await recordAudit({ entityType: 'TrustedDevice', entityId: id, action: 'DEVICE_APPROVED', performedById });
  return mapDeviceToDto(updated);
}

export async function blockDevice(id: string, performedById: string): Promise<TrustedDevice> {
  await loadDeviceOr404(id);
  const updated = await prisma.trustedDevice.update({
    where: { id },
    data: { status: 'BLOCKED', blockedById: performedById, blockedAt: new Date() },
    include: { staff: { select: { name: true } } },
  });
  await recordAudit({ entityType: 'TrustedDevice', entityId: id, action: 'DEVICE_BLOCKED', performedById });
  return mapDeviceToDto(updated);
}

export async function unblockDevice(id: string, performedById: string): Promise<TrustedDevice> {
  await loadDeviceOr404(id);
  const updated = await prisma.trustedDevice.update({
    where: { id },
    data: { status: 'ACTIVE', blockedById: null, blockedAt: null },
    include: { staff: { select: { name: true } } },
  });
  await recordAudit({ entityType: 'TrustedDevice', entityId: id, action: 'DEVICE_UNBLOCKED', performedById });
  return mapDeviceToDto(updated);
}

export async function updateDevice(id: string, input: UpdateTrustedDeviceInput, performedById: string): Promise<TrustedDevice> {
  const existing = await loadDeviceOr404(id);
  const updated = await prisma.trustedDevice.update({
    where: { id },
    data: { label: input.label, staffId: input.staffId },
    include: { staff: { select: { name: true } } },
  });
  await recordAudit({
    entityType: 'TrustedDevice',
    entityId: id,
    action: 'DEVICE_RENAMED',
    performedById,
    previousValue: { label: existing.label, staffId: existing.staffId },
    newValue: { label: updated.label, staffId: updated.staffId },
  });
  return mapDeviceToDto(updated);
}

export async function deleteDevice(id: string, performedById: string): Promise<void> {
  await loadDeviceOr404(id);
  await prisma.trustedDevice.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: performedById },
  });
  await recordAudit({ entityType: 'TrustedDevice', entityId: id, action: 'DEVICE_REMOVED', performedById });
}

/**
 * "Logout From All Devices" (owner requirement #9) — blocks every Policy B
 * device bound to this staff member. There is no way to remotely invalidate
 * a specific Supabase JWT/session from the Admin API using only a user id,
 * so this reuses the same enforcement `requireAuth.ts` already runs on
 * every request: a blocked device's next request fails immediately,
 * regardless of how long its Supabase token would otherwise stay valid.
 * Policy A (shared) devices are untouched — they aren't "this user's
 * devices," other staff still use them.
 */
export async function logoutAllDevices(staffId: string, performedById: string): Promise<number> {
  const devices = await prisma.trustedDevice.findMany({
    where: { staffId, isDeleted: false, status: { not: 'BLOCKED' } },
    select: { id: true },
  });
  if (devices.length === 0) return 0;

  await prisma.trustedDevice.updateMany({
    where: { id: { in: devices.map((d) => d.id) } },
    data: { status: 'BLOCKED', blockedById: performedById, blockedAt: new Date() },
  });
  for (const d of devices) {
    await recordAudit({ entityType: 'TrustedDevice', entityId: d.id, action: 'DEVICE_BLOCKED', performedById, newValue: { reason: 'LOGOUT_ALL_DEVICES' } });
  }
  return devices.length;
}
