import type { Request, Response } from 'express';
import {
  createUserSchema,
  setUserBranchAccessSchema,
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
 * Creating a user is an invite, not a password-set: Supabase Auth sends the
 * invite email and owns the credential from the start (ADR 0005/0021) — this
 * system never sees, sets, or stores a password at any point.
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

  // FEATURE-001.2 fix (2026-08-13) — found live: a retry after a failed/stuck
  // invite (e.g. the invited person's accept-invite page errored before they
  // ever set a password) used to hit inviteUserByEmail again — wasting a rate-
  // limited invite email on an account that already exists — and then failed
  // with a raw, unhandled Prisma unique-constraint exception instead of a
  // clear message telling the caller what actually happened.
  const existing = await prisma.staffProfile.findFirst({ where: { email: input.email, isDeleted: false } });
  if (existing) {
    res.status(400).json({
      success: false,
      error: {
        message: 'هذا البريد الإلكتروني مسجّل بالفعل لموظف موجود — استخدم "إعادة تعيين كلمة المرور" له بدل إضافته من جديد',
        code: 'EMAIL_ALREADY_REGISTERED',
      },
    });
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: ACCEPT_INVITE_REDIRECT_URL,
  });
  if (error || !data.user) {
    res
      .status(400)
      .json({ success: false, error: { message: error?.message ?? 'Failed to invite user' } });
    return;
  }

  let staff;
  try {
    staff = await prisma.staffProfile.create({
      data: {
        supabaseUserId: data.user.id,
        name: input.name,
        email: input.email,
        phone: input.phone,
        branchId: input.branchId,
        roles: { create: input.roleIds.map((roleId) => ({ roleId })) },
      },
      include: userInclude,
    });
  } catch (err) {
    // The Supabase invite already went out at this point (it isn't
    // transactional with the row below) — surface a message that at least
    // explains a real account now exists in Supabase Auth without a
    // matching StaffProfile, rather than an opaque Prisma stack trace.
    const isDuplicate = err instanceof Error && err.message.includes('Unique constraint failed');
    res.status(isDuplicate ? 409 : 500).json({
      success: false,
      error: {
        message: isDuplicate
          ? 'تم إنشاء حساب الدخول لكن فشل تسجيله كموظف — بريد إلكتروني مكرر. تواصل مع الدعم الفني.'
          : 'تم إرسال الدعوة لكن فشل تسجيل الموظف في النظام',
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
