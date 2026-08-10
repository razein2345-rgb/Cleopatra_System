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
    // FEATURE-002: Business Partners. Namespace is `partners.*`, not
    // `customers.*` — approved in
    // docs/AI/FEATURES/FEATURE-002-CUSTOMERS/02_PLAN.md. Only the actions
    // each milestone actually enforces are seeded here as it ships;
    // attachments/merge/import/export are added as their own milestones
    // are implemented, not reserved in advance.
    module: 'partners',
    moduleLabel: 'Business Partners',
    actions: [
      { action: 'view', label: 'View business partners' },
      { action: 'create', label: 'Create business partners' },
      { action: 'edit', label: 'Edit business partners' },
      { action: 'delete', label: 'Deactivate business partners' },
      // FEATURE-002 M2 — resolves to key `partners.contacts.manage`.
      { action: 'contacts.manage', label: 'Manage business partner contacts' },
      // FEATURE-002 M3 — resolves to key `partners.addresses.manage`.
      { action: 'addresses.manage', label: 'Manage business partner addresses' },
      // FEATURE-002 M6 — resolves to key `partners.credit.manage`. Covers
      // both viewing and changing the Commercial & Credit Profile (no
      // separate view-only credit permission, per 02_PLAN.md §5's note).
      { action: 'credit.manage', label: 'View and manage business partner commercial & credit profiles' },
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
    // FEATURE-004 M1. Administering Workflow Templates/Stages is a
    // separate concern from operating within them (advancing a
    // WorkflowInstance stays under `work-orders.edit`, per
    // 01_ANALYSIS.md's Permission Mapping) — the same `roles`/`permissions`
    // split precedent (administering the rules vs. operating within them).
    module: 'workflow-templates',
    moduleLabel: 'Workflow Templates',
    actions: [
      { action: 'view', label: 'View workflow templates' },
      { action: 'create', label: 'Create workflow templates' },
      { action: 'edit', label: 'Edit draft workflow templates' },
      { action: 'delete', label: 'Delete workflow templates' },
      { action: 'publish', label: 'Publish a workflow template version' },
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
    // FEATURE-007 M2 — Inventory. `create` covers both registering a new
    // stock item and recording a stock movement (add/adjust); auto-deduct
    // on Order creation happens inside the Order transaction and is not a
    // separately-gated action (the caller only needs `orders.create`).
    module: 'inventory',
    moduleLabel: 'Inventory',
    actions: [
      { action: 'view', label: 'View inventory stock' },
      { action: 'create', label: 'Register stock items and record movements' },
      { action: 'edit', label: 'Edit stock items' },
      { action: 'delete', label: 'Delete stock items' },
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
