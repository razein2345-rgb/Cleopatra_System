import { prisma } from '../src/lib/prisma.js';
import { DocumentType } from '../src/generated/prisma/enums.js';
import { GLOBAL_PERMISSION, PERMISSION_CATALOG } from '@cleopatra/shared';

// The 8 default roles required by Phase 2. `isSystem: true` protects these
// from deletion via the Role management UI (they can still be renamed or
// have their permission set edited).
const DEFAULT_ROLES = [
  {
    name: 'SUPER_ADMIN',
    label: 'Super Admin',
    description: 'Full access to every branch and every permission.',
  },
  { name: 'ADMIN', label: 'Admin', description: 'Full access within their assigned branch.' },
  { name: 'SALES', label: 'Sales', description: 'Manages customers, orders, and quotations.' },
  {
    name: 'CASHIER',
    label: 'Cashier',
    description: 'Manages treasury and views orders/customers.',
  },
  {
    name: 'PRODUCTION_MANAGER',
    label: 'Production Manager',
    description: 'Manages the work-order production queue.',
  },
  {
    name: 'DESIGNER',
    label: 'Designer',
    description: 'Views orders and work orders relevant to design.',
  },
  {
    name: 'PRINTING_OPERATOR',
    label: 'Printing Operator',
    description: 'Views and updates work-order production status.',
  },
  { name: 'VIEWER', label: 'Viewer', description: 'Read-only access across modules.' },
] as const;

// Default permission grants per role, expressed as the permission keys each
// role starts with. These are seed defaults only — the actual grants live in
// the RolePermission table and are freely editable from the Role management
// UI once Phase 2 ships; nothing here is re-applied after the first seed.
const DEFAULT_ROLE_PERMISSIONS: Record<(typeof DEFAULT_ROLES)[number]['name'], string[]> = {
  SUPER_ADMIN: [GLOBAL_PERMISSION],
  ADMIN: [
    'customers.*',
    'orders.*',
    'quotations.*',
    'work-orders.*',
    'treasury.*',
    'suppliers.*',
    'tenders.*',
    'reports.*',
    'settings.*',
    'employees.*',
    'roles.view',
    'permissions.view',
  ],
  SALES: ['customers.*', 'orders.*', 'quotations.*', 'reports.view'],
  CASHIER: ['treasury.*', 'orders.view', 'customers.view'],
  PRODUCTION_MANAGER: ['work-orders.*', 'orders.view'],
  DESIGNER: ['work-orders.view', 'orders.view'],
  PRINTING_OPERATOR: ['work-orders.view', 'work-orders.edit'],
  VIEWER: [
    'customers.view',
    'orders.view',
    'quotations.view',
    'work-orders.view',
    'treasury.view',
    'suppliers.view',
    'tenders.view',
    'reports.view',
    'settings.view',
    'employees.view',
  ],
};

// Mirrors legacy DEFAULT_SETTINGS exactly (LEGACY_ANALYSIS §4). Do not change
// any of these values — they are the pricing constants the calculation
// engine (Phase 4) will read.
const DEFAULT_SETTINGS = {
  zincPrice: 75,
  printRunPrice: 75,
  numberingRunPrice: 75,
  envelopeDesignPrice: 100,
  envelopePrintRunPrice: 100,
  envelopeZincPrice: 75,
  designPrice: 75,
  wasteSheetsDefault: 2,
  profitPercent: 25,
  notebookThreshold: 30,
  looseThreshold: 3000,
  sellophanePricePerSheet: 4,
  boardsBannerNoDesign: 130,
  boardsBannerWithDesign: 170,
  boardsVinylPrintCutNoSello: 280,
  boardsVinylPrintCutWithSello: 320,
  boardsVinylNormalNoSello: 200,
  boardsVinylNormalWithSello: 250,
  boardsFlex: 210,
  boardsSeasro: 230,
  boardsGapMM: 5,
};

// Mirrors legacy DEFAULT_FAMILIES exactly (LEGACY_ANALYSIS §3/§4).
const DEFAULT_FAMILIES = [
  {
    key: 'standard',
    label: 'الفرخ العادي (٧٠×١٠٠)',
    base: 'REGULAR' as const,
    sizes: [
      ['12.5×17.5', 32],
      ['17.5×25', 16],
      ['25×35', 8],
      ['35×50', 4],
      ['50×70', 2],
      ['70×100', 1],
    ],
  },
  {
    key: 'foolscap',
    label: 'فلوسكاب',
    base: 'REGULAR' as const,
    sizes: [
      ['11.5×16.5', 36],
      ['16.5×23', 18],
      ['23×33', 9],
    ],
  },
  {
    key: 'extra1',
    label: 'مقاسات إضافية ١',
    base: 'REGULAR' as const,
    sizes: [
      ['10×14', 50],
      ['14×20', 25],
      ['20×28', 10],
      ['28×40', 5],
    ],
  },
  {
    key: 'extra2',
    label: 'مقاسات إضافية ٢',
    base: 'REGULAR' as const,
    sizes: [
      ['10×15', 44],
      ['15×20', 22],
      ['20×30', 11],
      ['30×40', 5],
    ],
  },
  {
    key: 'extra3',
    label: 'مقاسات إضافية ٣',
    base: 'REGULAR' as const,
    sizes: [
      ['11.5×20', 30],
      ['20×23', 15],
      ['20×25', 14],
      ['23×25', 12],
    ],
  },
  {
    key: 'gawab',
    label: 'الجواب',
    base: 'REGULAR' as const,
    sizes: [
      ['11×14', 44],
      ['14×22', 22],
      ['22×28', 10],
      ['28×42', 5],
    ],
  },
  {
    key: 'aSeries',
    label: 'مقاسات A',
    base: 'REGULAR' as const,
    sizes: [
      ['A7', 64],
      ['A6', 32],
      ['A5', 16],
      ['A4', 8],
      ['A3', 4],
      ['A2', 2],
      ['A1', 1],
    ],
  },
  {
    key: 'koshiaGayer',
    label: 'الكوشية الجاير (٦٦×٨٨)',
    base: 'GAYER' as const,
    sizes: [
      ['11×16.5', 32],
      ['16.5×22', 16],
      ['22×33', 8],
      ['33×44', 4],
      ['44×66', 2],
      ['66×88', 1],
    ],
  },
];

// Mirrors legacy SHEET_TYPE_NAMES exactly (LEGACY_ANALYSIS §4), price 0 until
// an admin fills in real prices via the Settings screen, same as legacy.
const SHEET_TYPE_NAMES = [
  'كوشيه 115',
  'كوشيه 135',
  'كوشيه 150',
  'كوشيه 170',
  'كوشيه 200',
  'كوشيه 250',
  'كوشيه 300',
  'برستول',
  'دوبلكس',
  'ورق 60',
  'ورق 70',
  'ورق 80',
  'ورق 100',
];

async function main() {
  const branch = await prisma.branch.upsert({
    where: { code: 'MAIN' },
    update: {},
    create: {
      code: 'MAIN',
      name: 'الفرع الرئيسي',
      isDefault: true,
    },
  });

  const year = new Date().getFullYear();
  const sequences: Array<[DocumentType, string]> = [
    [DocumentType.INVOICE, 'CLP-INV'],
    [DocumentType.QUOTATION, 'CLP-QUO'],
    [DocumentType.WORK_ORDER, 'CLP-WO'],
  ];
  for (const [documentType, prefix] of sequences) {
    await prisma.documentSequence.upsert({
      where: { branchId_documentType_year: { branchId: branch.id, documentType, year } },
      update: {},
      create: { branchId: branch.id, documentType, year, prefix, lastNumber: 0 },
    });
  }

  const settingExists = await prisma.setting.findFirst();
  if (!settingExists) {
    await prisma.setting.create({ data: DEFAULT_SETTINGS });
  }

  for (const family of DEFAULT_FAMILIES) {
    await prisma.sizeFamily.upsert({
      where: { key: family.key },
      update: {},
      create: {
        key: family.key,
        label: family.label,
        base: family.base,
        entries: {
          create: family.sizes.map(([label, piecesPerSheet], sortOrder) => ({
            label: label as string,
            piecesPerSheet: piecesPerSheet as number,
            sortOrder,
          })),
        },
      },
    });
  }

  const existingSheetTypes = await prisma.sheetType.count();
  if (existingSheetTypes === 0) {
    await prisma.sheetType.createMany({
      data: SHEET_TYPE_NAMES.flatMap((name) => [
        { base: 'GAYER' as const, name, price: 0 },
        { base: 'REGULAR' as const, name, price: 0 },
      ]),
    });
  }

  // ---- Identity & Access Management (Phase 2) ----

  await prisma.permission.upsert({
    where: { key: GLOBAL_PERMISSION },
    update: {},
    create: {
      key: GLOBAL_PERMISSION,
      module: '*',
      label: 'Super admin — every permission, every module',
      isSystem: true,
    },
  });
  for (const entry of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: entry.key },
      update: {},
      create: { key: entry.key, module: entry.module, label: entry.label, isSystem: true },
    });
  }

  const allPermissions = await prisma.permission.findMany();
  const permissionByKey = new Map(allPermissions.map((p) => [p.key, p]));

  for (const roleDef of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      update: {},
      create: {
        name: roleDef.name,
        label: roleDef.label,
        description: roleDef.description,
        isSystem: true,
      },
    });

    const grantKeys = DEFAULT_ROLE_PERMISSIONS[roleDef.name];
    for (const key of grantKeys) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }
  }

  console.log(`Seed complete. Default branch: ${branch.name} (${branch.code}).`);
  console.log(
    `Seeded ${allPermissions.length} permissions and ${DEFAULT_ROLES.length} default roles.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
