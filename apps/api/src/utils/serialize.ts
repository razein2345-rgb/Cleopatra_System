import { Prisma } from '../generated/prisma/client.js';

/** Recursively converts Prisma Decimal fields to plain numbers for JSON responses. */
export function serializeDecimals<T>(value: T): T {
  if (value instanceof Prisma.Decimal) {
    return value.toNumber() as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeDecimals(item)) as unknown as T;
  }
  if (value instanceof Date) {
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, val]) => [
        key,
        serializeDecimals(val),
      ]),
    ) as T;
  }
  return value;
}
