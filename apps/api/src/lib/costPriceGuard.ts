import type { Response } from 'express';
import { hasPermission } from '@cleopatra/shared';

/**
 * Owner (2026-08-26, "عايز دي تبقى صلاحية اقدر اديها للشخص اللي قاعد
 * بيسجل المخزون") — `costPrice` (purchase cost, on both `InventoryItem`
 * and `ReadyProduct`) is sensitive financial data gated behind the real
 * `inventory.costPrice` permission (grantable to any role, e.g. a
 * warehouse-registration staff member), not hardcoded to SUPER_ADMIN as
 * it first shipped — SUPER_ADMIN still has it automatically via the `*`
 * wildcard `hasPermission` already resolves. Shared here since both
 * `inventoryItems.ts` and `readyProducts.ts` controllers need the
 * identical read-strip/write-reject behavior — rule 5, no duplicate logic.
 */
export function canSeeCostPrice(auth: { permissions: string[] }): boolean {
  return hasPermission(auth.permissions, 'inventory.costPrice');
}

/** Removes `costPrice` from a DTO (or list of DTOs) before it leaves the controller, for anyone without `inventory.costPrice` — omitted entirely, not just nulled, so its absence can't be mistaken for "no cost recorded yet". */
export function stripCostPrice<T extends { costPrice?: number | null }>(dto: T, auth: { permissions: string[] }): T {
  if (canSeeCostPrice(auth)) return dto;
  const { costPrice: _costPrice, ...rest } = dto;
  return rest as T;
}

export function stripCostPriceList<T extends { costPrice?: number | null }>(dtos: T[], auth: { permissions: string[] }): T[] {
  return dtos.map((dto) => stripCostPrice(dto, auth));
}

/** Rejects (403) a create/update call that tries to set `costPrice` from a caller without `inventory.costPrice`. Returns true if it responded (caller should stop). */
export function rejectCostPriceWrite(input: { costPrice?: unknown }, auth: { permissions: string[] }, res: Response): boolean {
  if (input.costPrice !== undefined && !canSeeCostPrice(auth)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'تعديل سعر التكلفة محتاج صلاحية "سعر التكلفة"', code: 'COST_PRICE_RESTRICTED' } });
    return true;
  }
  return false;
}
