import type { Response } from 'express';

/**
 * Owner (2026-08-26, "مقصور على المسؤول العام") — `costPrice` (purchase
 * cost, on both `InventoryItem` and `ReadyProduct`) is sensitive financial
 * data restricted to SUPER_ADMIN, same discipline as attendance/payroll
 * records (see attendance.ts's own `roleNames.includes('SUPER_ADMIN')`
 * checks). Shared here since both `inventoryItems.ts` and
 * `readyProducts.ts` controllers need the identical read-strip/write-reject
 * behavior — rule 5, no duplicate logic.
 */
export function isSuperAdmin(auth: { roleNames: string[] }): boolean {
  return auth.roleNames.includes('SUPER_ADMIN');
}

/** Removes `costPrice` from a DTO (or list of DTOs) before it leaves the controller, for anyone who isn't SUPER_ADMIN — omitted entirely, not just nulled, so its absence can't be mistaken for "no cost recorded yet". */
export function stripCostPrice<T extends { costPrice?: number | null }>(dto: T, auth: { roleNames: string[] }): T {
  if (isSuperAdmin(auth)) return dto;
  const { costPrice: _costPrice, ...rest } = dto;
  return rest as T;
}

export function stripCostPriceList<T extends { costPrice?: number | null }>(dtos: T[], auth: { roleNames: string[] }): T[] {
  return dtos.map((dto) => stripCostPrice(dto, auth));
}

/** Rejects (403) a create/update call that tries to set `costPrice` from a non-SUPER_ADMIN caller. Returns true if it responded (caller should stop). */
export function rejectCostPriceWrite(input: { costPrice?: unknown }, auth: { roleNames: string[] }, res: Response): boolean {
  if (input.costPrice !== undefined && !isSuperAdmin(auth)) {
    res
      .status(403)
      .json({ success: false, error: { message: 'تعديل سعر التكلفة مقصور على المسؤول العام', code: 'COST_PRICE_RESTRICTED' } });
    return true;
  }
  return false;
}
