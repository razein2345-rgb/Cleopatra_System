import type { Request, Response } from 'express';
import {
  buildInternalLoginEmail,
  createUserSchema,
  INTERNAL_LOGIN_DOMAIN,
  setAttendancePinSchema,
  setUserBranchAccessSchema,
  setUserPasswordSchema,
  setUserRolesSchema,
  updateUserSchema,
} from '@cleopatra/shared';
import { prisma } from '../lib/prisma.js';
import { supabaseAdmin } from '../lib/supabase.js';
import type { Prisma } from '../generated/prisma/client.js';
import { getUserDto, mapStaffToUser, userInclude } from '../services/userService.js';
import { canAccessBranch } from '../services/authContext.js';
import { recordAudit } from '../services/auditService.js';
import { env } from '../config/env.js';
import { AdminSafetyService, hasAdminRole, LastActiveAdminError } from '../services/adminSafety.js';
import { setAttendancePin } from '../services/attendanceService.js';

// Where invite/recovery email links send the user to complete account setup
// (FEATURE-001.2). CORS_ORIGIN is already the frontend's own origin — reused
// rather than introducing a new env var.
const ACCEPT_INVITE_REDIRECT_URL = `${env.CORS_ORIGIN}/accept-invite`;

// Branch scoping (Requirement 5): Super Admin sees every branch; everyone
// else is restricted to their home branch plus any explicit UserBranchAccess
// grants. This is the concrete implementation of the branch-access pattern
// documented in ARCHITECTURE.md, applied here to the one branch-scoped
// resource that exists so far (users themselves).
export async function listUsers(req: Request, res: Response) {
  const auth = req.auth!;
  const isSuperAdmin = auth.roleNames.includes('SUPER_ADMIN');
  const branchId = typeof req.query.branchId === 'string' ? req.query.branchId : undefined;
  const role = typeof req.query.role === 'string' ? req.query.role.toUpperCase() : undefined;
  const isActive =
    typeof req.query.isActive === 'string' ? req.query.isActive === 'true' : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

  const where: Prisma.StaffProfileWhereInput = {
    isDeleted: false,
    ...(isActive !== undefined ? { isActive } : {}),
    ...(role ? { roles: { some: { role: { name: role } } } } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  if (isSuperAdmin) {
    if (branchId) where.branchId = branchId;
  } else {
    where.branchId =
      branchId && auth.accessibleBranchIds.includes(branchId)
        ? branchId
        : { in: auth.accessibleBranchIds };
  }

  const staff = await prisma.staffProfile.findMany({
    where,
    include: userInclude,
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: staff.map(mapStaffToUser) });
}

export async function getUser(req: Request<{ id: string }>, res: Response) {
  const user = await getUserDto(req.params.id);
  if (!user) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(req.auth!, user.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }
  res.json({ success: true, data: user });
}

/**
 * FEATURE-015 (2026-08-16, owner: "عايز انا اللي ادخل الموظفين بنفسي واعملهم
 * باسوورد وID بدل موضوع الإيميل ده") — most employees have no real email
 * inbox to receive an invite in, so the owner sets the account up complete
 * with a password directly (`createUser` + `email_confirm: true`, not
 * `inviteUserByEmail`) and hands the login ID + password to the employee
 * himself. Still a normal Supabase email-based account under the hood
 * (`buildInternalLoginEmail` appends a fixed internal domain), so nothing
 * else about auth/session handling changes.
 */
export async function createUser(req: Request, res: Response) {
  const auth = req.auth!;
  const input = createUserSchema.parse(req.body);

  if (!canAccessBranch(auth, input.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  const email = buildInternalLoginEmail(input.loginId);

  // FEATURE-001.2 fix (2026-08-13) — found live: a retry after a failed/stuck
  // signup used to hit Supabase again — wasting effort on an account that
  // already exists — and then failed with a raw, unhandled Prisma
  // unique-constraint exception instead of a clear message telling the
  // caller what actually happened.
  const existing = await prisma.staffProfile.findFirst({ where: { email, isDeleted: false } });
  if (existing) {
    res.status(400).json({
      success: false,
      error: {
        message: 'هذا المعرّف مستخدم بالفعل لموظف موجود — اختر معرّفًا آخر، أو استخدم "تعيين كلمة مرور جديدة" له بدل إضافته من جديد',
        code: 'LOGIN_ID_ALREADY_REGISTERED',
      },
    });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
  });
  if (error || !data.user) {
    res
      .status(400)
      .json({ success: false, error: { message: error?.message ?? 'Failed to create user' } });
    return;
  }

  let staff;
  try {
    staff = await prisma.staffProfile.create({
      data: {
        supabaseUserId: data.user.id,
        name: input.name,
        email,
        phone: input.phone,
        branchId: input.branchId,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
      include: userInclude,
    });
  } catch (err) {
    // The Supabase account already exists at this point (it isn't
    // transactional with the row below) — surface a message that at least
    // explains a real account now exists in Supabase Auth without a
    // matching StaffProfile, rather than an opaque Prisma stack trace.
    const isDuplicate = err instanceof Error && err.message.includes('Unique constraint failed');
    res.status(isDuplicate ? 409 : 500).json({
      success: false,
      error: {
        message: isDuplicate
          ? 'تم إنشاء حساب الدخول لكن فشل تسجيله كموظف — معرّف مكرر. تواصل مع الدعم الفني.'
          : 'تم إنشاء حساب الدخول لكن فشل تسجيل الموظف في النظام',
      },
    });
    return;
  }

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: staff.id,
    action: 'CREATE',
    performedById: auth.staffId,
    branchId: staff.branchId,
    newValue: {
      name: staff.name,
      email: staff.email,
      branchId: staff.branchId,
      roleIds: input.roleIds,
    },
  });

  res.status(201).json({ success: true, data: mapStaffToUser(staff) });
}

export async function updateUser(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = updateUserSchema.parse(req.body);

  const existing = await prisma.staffProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }
  if (input.branchId && !canAccessBranch(auth, input.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to the target branch' } });
    return;
  }

  if (input.isActive === false) {
    try {
      await AdminSafetyService.assertNotLastActiveAdmin({
        staffId: existing.id,
        willRemainActiveAdmin: false,
        performedById: auth.staffId,
        operation: 'DEACTIVATE',
      });
    } catch (err) {
      if (err instanceof LastActiveAdminError) {
        res
          .status(409)
          .json({ success: false, error: { message: err.message, code: 'LAST_ACTIVE_ADMIN' } });
        return;
      }
      throw err;
    }
  }

  const updated = await prisma.staffProfile.update({
    where: { id: req.params.id },
    data: {
      ...input,
      hireDate: input.hireDate !== undefined ? (input.hireDate ? new Date(input.hireDate) : null) : undefined,
    },
    include: userInclude,
  });

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: updated.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: updated.branchId,
    previousValue: {
      name: existing.name,
      phone: existing.phone,
      branchId: existing.branchId,
      isActive: existing.isActive,
    },
    newValue: input,
  });

  res.json({ success: true, data: mapStaffToUser(updated) });
}

/** Soft delete only (ADR 0007) — Supabase Auth account is left alone; our own `requireAuth` already rejects `isActive: false` / `isDeleted: true` staff regardless of Supabase's own account state. */
export async function deleteUser(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.staffProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  try {
    await AdminSafetyService.assertNotLastActiveAdmin({
      staffId: existing.id,
      willRemainActiveAdmin: false,
      performedById: auth.staffId,
      operation: 'DELETE',
    });
  } catch (err) {
    if (err instanceof LastActiveAdminError) {
      res
        .status(409)
        .json({ success: false, error: { message: err.message, code: 'LAST_ACTIVE_ADMIN' } });
      return;
    }
    throw err;
  }

  const deleted = await prisma.staffProfile.update({
    where: { id: req.params.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: auth.staffId, isActive: false },
  });

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: deleted.id,
    action: 'DELETE',
    performedById: auth.staffId,
    branchId: deleted.branchId,
  });

  res.json({ success: true, data: { id: deleted.id } });
}

export async function setUserRoles(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = setUserRolesSchema.parse(req.body);

  const existing = await prisma.staffProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  const newRoles = await prisma.role.findMany({ where: { id: { in: input.roleIds } } });
  const willRemainActiveAdmin =
    existing.isActive && hasAdminRole(newRoles.map((role) => role.name));
  try {
    await AdminSafetyService.assertNotLastActiveAdmin({
      staffId: existing.id,
      willRemainActiveAdmin,
      performedById: auth.staffId,
      operation: 'REMOVE_ADMIN_ROLE',
    });
  } catch (err) {
    if (err instanceof LastActiveAdminError) {
      res
        .status(409)
        .json({ success: false, error: { message: err.message, code: 'LAST_ACTIVE_ADMIN' } });
      return;
    }
    throw err;
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { staffId: req.params.id } }),
    prisma.userRole.createMany({
      data: input.roleIds.map((roleId) => ({ staffId: req.params.id, roleId })),
    }),
  ]);

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: req.params.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: existing.branchId,
    newValue: { roleIds: input.roleIds },
  });

  res.json({ success: true, data: await getUserDto(req.params.id) });
}

export async function setUserBranchAccess(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = setUserBranchAccessSchema.parse(req.body);

  const existing = await prisma.staffProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  await prisma.$transaction([
    prisma.userBranchAccess.deleteMany({ where: { staffId: req.params.id } }),
    prisma.userBranchAccess.createMany({
      data: input.branchIds.map((branchId) => ({ staffId: req.params.id, branchId })),
    }),
  ]);

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: req.params.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: existing.branchId,
    newValue: { accessibleBranchIds: input.branchIds },
  });

  res.json({ success: true, data: await getUserDto(req.params.id) });
}

/** Admin-triggered password reset: sends a Supabase recovery link. Self-service "forgot password" bypasses this endpoint entirely and calls Supabase directly from the frontend (see ARCHITECTURE.md). */
export async function resetUserPassword(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const existing = await prisma.staffProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  // FEATURE-015 — a synthetic `<id>@cleopatra.local` address has no real
  // inbox; generateLink would still report success and this would log a
  // PASSWORD_RESET audit entry for a link nobody can ever receive. Point
  // the caller at the endpoint that actually works for these accounts.
  if (existing.email.endsWith(`@${INTERNAL_LOGIN_DOMAIN}`)) {
    res.status(400).json({
      success: false,
      error: {
        message: 'هذا الموظف مسجّل بمعرّف دخول، مش إيميل حقيقي — استخدم "تعيين كلمة مرور جديدة" بدل إعادة التعيين عبر البريد',
        code: 'NO_REAL_EMAIL',
      },
    });
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: existing.email,
    options: { redirectTo: ACCEPT_INVITE_REDIRECT_URL },
  });
  if (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
    return;
  }

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: existing.id,
    action: 'PASSWORD_RESET',
    performedById: auth.staffId,
    branchId: existing.branchId,
  });

  res.status(204).send();
}

/**
 * FEATURE-015 (2026-08-16) — the direct counterpart to `resetUserPassword`
 * for employees with no real email to receive a recovery link at: the owner
 * types a new password himself and it takes effect immediately. Mirrors
 * `resetUserPassword`'s branch-scoping exactly.
 */
export async function setUserPassword(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = setUserPasswordSchema.parse(req.body);
  const existing = await prisma.staffProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(existing.supabaseUserId, {
    password: input.password,
  });
  if (error) {
    res.status(400).json({ success: false, error: { message: error.message } });
    return;
  }

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: existing.id,
    action: 'PASSWORD_RESET',
    performedById: auth.staffId,
    branchId: existing.branchId,
  });

  res.status(204).send();
}

/**
 * FEATURE-013 (2026-08-14) — set/change a staff member's Kiosk attendance
 * PIN. Mirrors `resetUserPassword`'s branch-scoping exactly; never returns
 * the PIN back once set.
 */
export async function setAttendancePinHandler(req: Request<{ id: string }>, res: Response) {
  const auth = req.auth!;
  const input = setAttendancePinSchema.parse(req.body);
  const existing = await prisma.staffProfile.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.isDeleted) {
    res.status(404).json({ success: false, error: { message: 'User not found' } });
    return;
  }
  if (!canAccessBranch(auth, existing.branchId)) {
    res.status(403).json({ success: false, error: { message: 'You do not have access to this branch' } });
    return;
  }

  await setAttendancePin(existing.id, input.pin);

  await recordAudit({
    entityType: 'StaffProfile',
    entityId: existing.id,
    action: 'UPDATE',
    performedById: auth.staffId,
    branchId: existing.branchId,
    newValue: { attendancePinChanged: true },
  });

  res.status(204).send();
}
