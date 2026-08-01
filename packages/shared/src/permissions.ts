/**
 * Canonical permission catalog and wildcard-matching logic for RBAC.
 *
 * The catalog here is *seed data* — what permission keys exist — consumed by
 * `apps/api/prisma/seed.ts` to populate the `Permission` table. It is not an
 * authorization decision: "who has what" always lives in the database
 * (`RolePermission`/`UserRole`), never in this file or in application code.
 * See ADR 0022.
 */

type ModuleDef = {
  module: string;
  moduleLabel: string;
  actions: { action: string; label: string }[];
};

const MODULES: ModuleDef[] = [
  {
    module: 'customers',
    moduleLabel: 'Customers',
    actions: [
      { action: 'view', label: 'View customers' },
      { action: 'create', label: 'Create customers' },
      { action: 'edit', label: 'Edit customers' },
      { action: 'delete', label: 'Delete customers' },
    ],
  },
  {
    module: 'orders',
    moduleLabel: 'Orders & Invoices',
    actions: [
      { action: 'view', label: 'View orders' },
      { action: 'create', label: 'Create orders' },
      { action: 'edit', label: 'Edit orders' },
      { action: 'delete', label: 'Delete orders' },
      { action: 'finalize', label: 'Finalize/invoice an order' },
    ],
  },
  {
    module: 'quotations',
    moduleLabel: 'Quotations',
    actions: [
      { action: 'view', label: 'View quotations' },
      { action: 'create', label: 'Create quotations' },
      { action: 'edit', label: 'Edit quotations' },
      { action: 'delete', label: 'Delete quotations' },
      { action: 'convert', label: 'Convert a quotation to an invoice' },
    ],
  },
  {
    module: 'work-orders',
    moduleLabel: 'Work Orders',
    actions: [
      { action: 'view', label: 'View work orders' },
      { action: 'edit', label: 'Update work order production status' },
      { action: 'delete', label: 'Delete work orders' },
    ],
  },
  {
    module: 'treasury',
    moduleLabel: 'Treasury',
    actions: [
      { action: 'view', label: 'View treasury ledger' },
      { action: 'create', label: 'Record treasury entries' },
      { action: 'edit', label: 'Edit treasury entries' },
      { action: 'delete', label: 'Delete treasury entries' },
    ],
  },
  {
    module: 'suppliers',
    moduleLabel: 'Suppliers',
    actions: [
      { action: 'view', label: 'View suppliers' },
      { action: 'create', label: 'Create suppliers' },
      { action: 'edit', label: 'Edit suppliers' },
      { action: 'delete', label: 'Delete suppliers' },
    ],
  },
  {
    module: 'tenders',
    moduleLabel: 'Tenders',
    actions: [
      { action: 'view', label: 'View tenders' },
      { action: 'create', label: 'Create tenders' },
      { action: 'edit', label: 'Edit tenders' },
      { action: 'delete', label: 'Delete tenders' },
    ],
  },
  {
    module: 'reports',
    moduleLabel: 'Reports',
    actions: [{ action: 'view', label: 'View reports & dashboard' }],
  },
  {
    module: 'settings',
    moduleLabel: 'Settings',
    actions: [
      { action: 'view', label: 'View settings & catalog' },
      { action: 'edit', label: 'Edit settings & catalog' },
    ],
  },
  {
    module: 'employees',
    moduleLabel: 'Employees',
    actions: [
      { action: 'view', label: 'View employees' },
      { action: 'create', label: 'Create employees' },
      { action: 'edit', label: 'Edit employees' },
      { action: 'delete', label: 'Deactivate/delete employees' },
    ],
  },
  {
    module: 'roles',
    moduleLabel: 'Roles',
    actions: [
      { action: 'view', label: 'View roles' },
      { action: 'create', label: 'Create roles' },
      { action: 'edit', label: 'Edit roles & their permissions' },
      { action: 'delete', label: 'Delete roles' },
    ],
  },
  {
    module: 'permissions',
    moduleLabel: 'Permissions',
    actions: [
      { action: 'view', label: 'View permission catalog' },
      { action: 'create', label: 'Create new permission keys' },
      { action: 'delete', label: 'Delete non-system permission keys' },
    ],
  },
];

export type PermissionCatalogEntry = { key: string; module: string; label: string };

export const GLOBAL_PERMISSION = '*';

/** Every permission key that should exist in the database, including per-module wildcards. */
export const PERMISSION_CATALOG: PermissionCatalogEntry[] = MODULES.flatMap((m) => [
  ...m.actions.map((a) => ({ key: `${m.module}.${a.action}`, module: m.module, label: a.label })),
  { key: `${m.module}.*`, module: m.module, label: `All ${m.moduleLabel} permissions` },
]);

/** Whether a single granted key satisfies a required permission key. */
export function permissionMatches(grantedKey: string, requiredKey: string): boolean {
  if (grantedKey === GLOBAL_PERMISSION) return true;
  if (grantedKey === requiredKey) return true;
  if (grantedKey.endsWith('.*')) {
    const grantedModule = grantedKey.slice(0, -2);
    const requiredModule = requiredKey.split('.')[0];
    return grantedModule === requiredModule;
  }
  return false;
}

/** Whether a set of granted keys (a user's flattened permissions) satisfies a required key. */
export function hasPermission(grantedKeys: string[], requiredKey: string): boolean {
  return grantedKeys.some((granted) => permissionMatches(granted, requiredKey));
}
