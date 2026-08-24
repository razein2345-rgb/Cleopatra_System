import type { Request, Response } from 'express';
import { updateTrustedDeviceSchema } from '@cleopatra/shared';
import {
  approveDevice,
  blockDevice,
  deleteDevice,
  DeviceNotFoundError,
  listDevices,
  logoutAllDevices,
  unblockDevice,
  updateDevice,
} from '../services/deviceService.js';

/**
 * Device Access Control (2026-08-24, owner: "عايز اقدر احدد الأجهزة
 * المسموح لها بفتح النظام"). Explicit SUPER_ADMIN check in every handler —
 * same `roleNames.includes('SUPER_ADMIN')` pattern `auditLogs.ts` already
 * uses, not the regular permission catalog (this isn't a capability meant
 * to be delegated to any other role, ever).
 */
function requireSuperAdmin(req: Request, res: Response): boolean {
  if (!req.auth!.roleNames.includes('SUPER_ADMIN')) {
    res.status(403).json({ success: false, error: { message: 'Device management is restricted to Super Admin' } });
    return false;
  }
  return true;
}

function handleDeviceError(err: unknown, res: Response): boolean {
  if (err instanceof DeviceNotFoundError) {
    res.status(404).json({ success: false, error: { message: 'Device not found' } });
    return true;
  }
  return false;
}

export async function listDevicesHandler(req: Request, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  const devices = await listDevices();
  res.json({ success: true, data: devices });
}

export async function approveDeviceHandler(req: Request<{ id: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const device = await approveDevice(req.params.id, req.auth!.staffId);
    res.json({ success: true, data: device });
  } catch (err) {
    if (handleDeviceError(err, res)) return;
    throw err;
  }
}

export async function blockDeviceHandler(req: Request<{ id: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const device = await blockDevice(req.params.id, req.auth!.staffId);
    res.json({ success: true, data: device });
  } catch (err) {
    if (handleDeviceError(err, res)) return;
    throw err;
  }
}

export async function unblockDeviceHandler(req: Request<{ id: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const device = await unblockDevice(req.params.id, req.auth!.staffId);
    res.json({ success: true, data: device });
  } catch (err) {
    if (handleDeviceError(err, res)) return;
    throw err;
  }
}

export async function updateDeviceHandler(req: Request<{ id: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  const input = updateTrustedDeviceSchema.parse(req.body);
  try {
    const device = await updateDevice(req.params.id, input, req.auth!.staffId);
    res.json({ success: true, data: device });
  } catch (err) {
    if (handleDeviceError(err, res)) return;
    throw err;
  }
}

export async function deleteDeviceHandler(req: Request<{ id: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  try {
    await deleteDevice(req.params.id, req.auth!.staffId);
    res.json({ success: true, data: { id: req.params.id } });
  } catch (err) {
    if (handleDeviceError(err, res)) return;
    throw err;
  }
}

/** Owner requirement #9, "Logout From All Devices" — blocks every Policy B device bound to `:staffId`. */
export async function logoutAllDevicesHandler(req: Request<{ staffId: string }>, res: Response) {
  if (!requireSuperAdmin(req, res)) return;
  const count = await logoutAllDevices(req.params.staffId, req.auth!.staffId);
  res.json({ success: true, data: { blockedCount: count } });
}
