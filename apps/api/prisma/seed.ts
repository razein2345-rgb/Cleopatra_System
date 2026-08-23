import { prisma } from '../src/lib/prisma.js';
import { DocumentType, ServiceCategory } from '../src/generated/prisma/enums.js';
import { GLOBAL_PERMISSION, PERMISSION_CATALOG } from '@cleopatra/shared';
import { replaceTemplateStages } from '../src/services/workflowTemplateService.js';

// The 8 default roles required by Phase 2. `isSystem: true` protects these
// from deletion via the Role management UI (they can still be renamed or
// have their permission set edited).
const DEFAULT_ROLES = [
  {
    name: 'SUPER_ADMIN',
    label: 'مسؤول عام',
    description: 'صلاحية كاملة على كل الفروع وكل الصلاحيات.',
  },
  { name: 'ADMIN', label: 'مدير', description: 'صلاحية كاملة داخل الفرع المخصص له.' },
  { name: 'SALES', label: 'مبيعات', description: 'يدير العملاء والطلبات وعروض الأسعار.' },
  {
    name: 'CASHIER',
    label: 'أمين خزينة',
    description: 'يدير الخزينة ويشاهد الطلبات والعملاء.',
  },
  {
    name: 'PRODUCTION_MANAGER',
    label: 'مدير الإنتاج',
    description: 'يدير طابور إنتاج أوامر الشغل.',
  },
  {
    name: 'DESIGNER',
    label: 'مصمم',
    description: 'يشاهد الطلبات وأوامر الشغل الخاصة بالتصميم.',
  },
  {
    name: 'PRINTING_OPERATOR',
    label: 'مشغّل طباعة',
    description: 'يشاهد ويحدّث حالة إنتاج أوامر الشغل.',
  },
  { name: 'VIEWER', label: 'مشاهد', description: 'صلاحية اطلاع فقط على كل الأقسام.' },
] as const;

// Default permission grants per role, expressed as the permission keys each
// role starts with. These are seed defaults only — the actual grants live in
// the RolePermission table and are freely editable from the Role management
// UI once Phase 2 ships; nothing here is re-applied after the first seed.
const DEFAULT_ROLE_PERMISSIONS: Record<(typeof DEFAULT_ROLES)[number]['name'], string[]> = {
  SUPER_ADMIN: [GLOBAL_PERMISSION],
  ADMIN: [
    'partners.*',
    'orders.*',
    'quotations.*',
    'work-orders.*',
    'machines.*',
    'treasury.*',
    'inventory.*',
    'tenders.*',
    'reports.*',
    'settings.*',
    'employees.*',
    'leads.*',
    'roles.view',
    'permissions.view',
  ],
  SALES: ['partners.*', 'orders.*', 'quotations.*', 'reports.view', 'inventory.view', 'leads.*'],
  // Owner (2026-08-20, "عايز انا بس اللي أقدر اعدل او احذف في المخزن مش كل
  // الموظفين... هو فقط يقدر يضيف") — deliberately `view`+`create` only, no
  // `edit`/`delete`/`inventory.*`: a cashier can see stock and record new
  // movements (restocking, POS sales), but correcting or removing an
  // already-recorded one stays owner-only unless explicitly granted.
  CASHIER: ['treasury.*', 'orders.view', 'partners.view', 'inventory.view', 'inventory.create'],
  PRODUCTION_MANAGER: ['work-orders.*', 'machines.*', 'orders.view'],
  DESIGNER: ['work-orders.view', 'work-orders.edit', 'orders.view'],
  PRINTING_OPERATOR: ['work-orders.view', 'work-orders.edit', 'machines.view'],
  VIEWER: [
    'partners.view',
    'orders.view',
    'quotations.view',
    'work-orders.view',
    'machines.view',
    'treasury.view',
    'inventory.view',
    'tenders.view',
    'reports.view',
    'settings.view',
    'employees.view',
    'leads.view',
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

// system_specifications_v2.md §17 — starter catalog of named agency
// sub-services, one row per bullet across the 5 categories. `price: 0`
// placeholders exactly like SHEET_TYPE_NAMES below (an admin fills in real
// prices via Settings → خدمات الوكالة once agreed with the owner) — this
// just gives the "أضف خدمة" flow a populated, editable starting point
// instead of an empty list per category.
const DEFAULT_SERVICES: { name: string; category: ServiceCategory }[] = [
  // 17.1 التصميم
  { name: 'هوية بصرية / براندنج', category: 'DESIGN' },
  { name: 'تصميم سوشيال ميديا', category: 'DESIGN' },
  { name: 'تصميم مطبوعات', category: 'DESIGN' },
  { name: 'تصميم واجهات UI/UX', category: 'DESIGN' },
  { name: 'تصميم عروض تقديمية', category: 'DESIGN' },
  { name: 'إنفوجرافيك', category: 'DESIGN' },
  { name: 'تصميم تغليف وعبوات', category: 'DESIGN' },
  { name: 'تعديل وريتاتش الصور', category: 'DESIGN' },
  // 17.2 المونتاج
  { name: 'فيديوهات سوشيال ميديا قصيرة', category: 'MONTAGE' },
  { name: 'فيديوهات تعريفية للشركات', category: 'MONTAGE' },
  { name: 'فيديوهات إعلانية وترويجية', category: 'MONTAGE' },
  { name: 'موشن جرافيك', category: 'MONTAGE' },
  { name: 'تصحيح الألوان ومعالجة الصوت', category: 'MONTAGE' },
  { name: 'فيديوهات مناسبات وفعاليات', category: 'MONTAGE' },
  { name: 'تعديل لقطات خام', category: 'MONTAGE' },
  // 17.3 التصوير
  { name: 'تصوير منتجات', category: 'PHOTOGRAPHY' },
  { name: 'تصوير فعاليات ومناسبات', category: 'PHOTOGRAPHY' },
  { name: 'تصوير بورتريه / شخصي', category: 'PHOTOGRAPHY' },
  { name: 'تصوير أماكن', category: 'PHOTOGRAPHY' },
  { name: 'تصوير فيديو مرافق', category: 'PHOTOGRAPHY' },
  // 17.4 التسويق
  { name: 'إدارة سوشيال ميديا', category: 'MARKETING' },
  { name: 'إعلانات ممولة (Meta / Google / TikTok)', category: 'MARKETING' },
  { name: 'تحسين محركات البحث (SEO)', category: 'MARKETING' },
  { name: 'تسويق بالمحتوى', category: 'MARKETING' },
  { name: 'تسويق عبر البريد الإلكتروني / واتساب بيزنس', category: 'MARKETING' },
  // 17.5 بناء المواقع
  { name: 'مواقع تعريفية', category: 'WEBSITES' },
  { name: 'متاجر إلكترونية', category: 'WEBSITES' },
  { name: 'صفحات هبوط', category: 'WEBSITES' },
  { name: 'برمجة مخصصة', category: 'WEBSITES' },
  { name: 'الصيانة والدعم الفني', category: 'WEBSITES' },
];

// FEATURE-004 M1. Representative departments from VISION.md's
// Department-Based Workflow — starting data an administrator can rename,
// add to, or remove (not `isSystem`-protected, unlike Role: no code ever
// branches on a specific department's identity).
// FEATURE-010 (2026-08-14) — `productionTrack` groups a department under
// its لوحة الإنتاج track for the "الأقسام" tab; omitted (`undefined`) for
// departments shared across every track (DESIGN, DELIVERY) or unrelated to
// production (SALES, WAREHOUSE, PURCHASING, EXTERNAL_SUPPLIER,
// CUSTOMER_SERVICE) — same nullable-on-purpose reasoning as the Prisma
// field's own doc comment. NUMBERING/BINDING (Offset) and CELLOPHANE/
// BASHR/CUTTING (Digital) are new — see DEFAULT_WORKFLOW_TEMPLATES below
// for why (owner's exact stage lists for the two confirmed tracks).
const DEFAULT_DEPARTMENTS = [
  { code: 'SALES', name: 'المبيعات' },
  { code: 'DESIGN', name: 'التصميم' },
  { code: 'OFFSET_PRINTING', name: 'الطباعة الأوفست', productionTrack: 'OFFSET' },
  { code: 'DIGITAL_PRINTING', name: 'الطباعة الديجيتال', productionTrack: 'DIGITAL' },
  { code: 'PLATE_PREPARATION', name: 'تجهيز الزنكات', productionTrack: 'OFFSET' },
  { code: 'NUMBERING', name: 'ترقيم', productionTrack: 'OFFSET' },
  { code: 'BINDING', name: 'تقفيل', productionTrack: 'OFFSET' },
  { code: 'CELLOPHANE', name: 'سلوفان', productionTrack: 'DIGITAL' },
  { code: 'BASHR', name: 'بشر', productionTrack: 'DIGITAL' },
  { code: 'CUTTING', name: 'قص', productionTrack: 'DIGITAL' },
  { code: 'FINISHING', name: 'التشطيب' },
  { code: 'WAREHOUSE', name: 'المخزن' },
  { code: 'PURCHASING', name: 'المشتريات' },
  { code: 'EXTERNAL_SUPPLIER', name: 'مورّد خارجي' },
  { code: 'DELIVERY', name: 'التسليم' },
  { code: 'CUSTOMER_SERVICE', name: 'خدمة العملاء' },
  // ERP-navigation research (2026-08-16) — activates assignee/deadline/
  // status tracking for SERVICE-kind order items (system_specifications_v2.md
  // §17.7) by reusing the existing Workflow Engine, exactly like every
  // other track — not a new schema, just the missing template/department
  // for the `SERVICES` track that already existed as a reserved enum value.
  { code: 'AGENCY_SERVICES', name: 'خدمات الوكالة', productionTrack: 'SERVICES' },
  // system_specifications_v2.md §2.4/§7-A.6 "Sublimation & Gifts" (2026-08-16,
  // owner: "أضف المسارات المذكورة جميعًا... كطباعة التيشرتات") — its own
  // dedicated machines, separate from Digital/Boards/Finishing.
  { code: 'SUBLIMATION_PRINTING', name: 'الطباعة الحرارية (سبليميشن)', productionTrack: 'SUBLIMATION_GIFTS' },
] as const;

/**
 * FEATURE-007 WF-A — one WorkflowTemplate per confirmed production track.
 *
 * Owner decision, 2026-08-10 (see FEATURE-007-OPERATIONAL-MVP/02_PLAN.md's
 * WF-A note): Design is not four independent stages, it is one shared
 * intake every track routes through first, regardless of product type.
 * The schema has no cross-template shared-stage entity — each track's
 * "التصميم" stage is still its own row — so the unification happens at
 * the Department level instead: every track's first stage points at the
 * exact same DESIGN department, so the Production Board's per-department
 * view already shows every item awaiting design in one place, and design
 * staff never need to know or care which track an item continues on
 * after they finish it.
 */
const DEFAULT_WORKFLOW_TEMPLATES: Array<{
  code: string;
  name: string;
  description: string;
  stages: Array<{
    tempKey: string;
    order: number;
    name: string;
    departmentCode: (typeof DEFAULT_DEPARTMENTS)[number]['code'];
    nextStageTempKey?: string;
    requiresFiles?: boolean;
    isMandatory?: boolean;
    canSkip?: boolean;
    variables?: Array<{ key: string; label: string; isRequired?: boolean; order?: number }>;
  }>;
}> = [
  {
    // FEATURE-010 (2026-08-14, owner's exact stage list) — التصميم is a
    // shared, optional first stage (`Order.requiresDesign`, see
    // createWorkflowInstance's auto-skip); تجهيز زنك/طباعة/ترقيم/تقفيل are
    // this track's own real production stages; تسليم is the final stage
    // (no `nextStageTempKey`), completing it auto-completes the instance.
    code: 'OFFSET',
    name: 'مسار الطباعة الأوفست',
    description: 'التصميم (اختياري) ← تجهيز زنك ← طباعة ← ترقيم ← تقفيل ← تسليم.',
    stages: [
      { tempKey: 'design', order: 1, name: 'التصميم', departmentCode: 'DESIGN', requiresFiles: true, isMandatory: false, canSkip: true, nextStageTempKey: 'plate' },
      { tempKey: 'plate', order: 2, name: 'تجهيز زنك', departmentCode: 'PLATE_PREPARATION', nextStageTempKey: 'print' },
      { tempKey: 'print', order: 3, name: 'طباعة', departmentCode: 'OFFSET_PRINTING', nextStageTempKey: 'numbering' },
      { tempKey: 'numbering', order: 4, name: 'ترقيم', departmentCode: 'NUMBERING', nextStageTempKey: 'binding' },
      { tempKey: 'binding', order: 5, name: 'تقفيل', departmentCode: 'BINDING', nextStageTempKey: 'delivery' },
      { tempKey: 'delivery', order: 6, name: 'تسليم', departmentCode: 'DELIVERY' },
    ],
  },
  {
    // FEATURE-010 (2026-08-14) — بشر is optional per the owner ("إن وجد"),
    // same isMandatory:false/canSkip:true shape as design.
    code: 'DIGITAL',
    name: 'مسار الطباعة الديجيتال',
    description: 'التصميم (اختياري) ← طباعة ← سلوفان ← بشر (اختياري) ← قص ← تسليم.',
    stages: [
      { tempKey: 'design', order: 1, name: 'التصميم', departmentCode: 'DESIGN', requiresFiles: true, isMandatory: false, canSkip: true, nextStageTempKey: 'print' },
      { tempKey: 'print', order: 2, name: 'طباعة', departmentCode: 'DIGITAL_PRINTING', nextStageTempKey: 'cellophane' },
      { tempKey: 'cellophane', order: 3, name: 'سلوفان', departmentCode: 'CELLOPHANE', nextStageTempKey: 'bashr' },
      { tempKey: 'bashr', order: 4, name: 'بشر', departmentCode: 'BASHR', isMandatory: false, canSkip: true, nextStageTempKey: 'cutting' },
      { tempKey: 'cutting', order: 5, name: 'قص', departmentCode: 'CUTTING', nextStageTempKey: 'delivery' },
      { tempKey: 'delivery', order: 6, name: 'تسليم', departmentCode: 'DELIVERY' },
    ],
  },
  {
    code: 'BOARDS_SIGNAGE',
    name: 'مسار اللوحات والإعلانات',
    description: 'التصميم ← إنتاج اللوحات والإعلانات ← التسليم ← خدمة العملاء.',
    stages: [
      { tempKey: 'design', order: 1, name: 'التصميم', departmentCode: 'DESIGN', requiresFiles: true, nextStageTempKey: 'produce' },
      { tempKey: 'produce', order: 2, name: 'إنتاج اللوحات والإعلانات', departmentCode: 'FINISHING', nextStageTempKey: 'delivery' },
      { tempKey: 'delivery', order: 3, name: 'التسليم', departmentCode: 'DELIVERY', nextStageTempKey: 'service' },
      { tempKey: 'service', order: 4, name: 'خدمة العملاء', departmentCode: 'CUSTOMER_SERVICE' },
    ],
  },
  {
    code: 'OTHER_PRODUCTS',
    name: 'مسار المنتجات الأخرى (أختام، أكريليك، إلخ)',
    description: 'التصميم ← الإنتاج ← التسليم ← خدمة العملاء — لمنتجات زي الأختام النحاسية والأكريليك اللي محتاجة بيانات خاصة بكل قطعة.',
    stages: [
      { tempKey: 'design', order: 1, name: 'التصميم', departmentCode: 'DESIGN', requiresFiles: true, nextStageTempKey: 'produce' },
      {
        tempKey: 'produce',
        order: 2,
        name: 'الإنتاج',
        departmentCode: 'FINISHING',
        nextStageTempKey: 'delivery',
        variables: [{ key: 'customer_text', label: 'نص/بيانات العميل على المنتج', isRequired: true, order: 1 }],
      },
      { tempKey: 'delivery', order: 3, name: 'التسليم', departmentCode: 'DELIVERY', nextStageTempKey: 'service' },
      { tempKey: 'service', order: 4, name: 'خدمة العملاء', departmentCode: 'CUSTOMER_SERVICE' },
    ],
  },
  {
    // ERP-navigation research (2026-08-16) — a minimal, generic 2-stage
    // flow (execution ← delivery) so every `SERVICE`-kind order item gets
    // a real WorkOrder + trackable stage instance (assignee/dueDate/
    // priority/status — all existing WorkflowInstance/StageInstance
    // fields, nothing new). Deliberately not one stage per service
    // sub-type (تصميم/مونتاج/مواقع/تصوير/تسويق) — those differ too much in
    // practice to force into one shared template; splitting into
    // per-category tracks is future work if it's ever actually needed,
    // never invented ahead of a real requirement.
    code: 'SERVICES',
    name: 'مسار خدمات الوكالة',
    description: 'تنفيذ الخدمة ← التسليم للعميل.',
    stages: [
      { tempKey: 'execute', order: 1, name: 'تنفيذ الخدمة', departmentCode: 'AGENCY_SERVICES', nextStageTempKey: 'delivery' },
      { tempKey: 'delivery', order: 2, name: 'التسليم للعميل', departmentCode: 'DELIVERY' },
    ],
  },
  {
    // §2.4/§7-A.6 "Sublimation & Gifts" — design is optional/shared like
    // every other track (a mug/shirt/cap may print a stock design with no
    // custom artwork needed), then one dedicated production stage, then
    // the shared delivery stage.
    code: 'SUBLIMATION_GIFTS',
    name: 'مسار الطباعة الحرارية (سبليميشن وهدايا)',
    description: 'التصميم (اختياري) ← الطباعة الحرارية ← التسليم.',
    stages: [
      { tempKey: 'design', order: 1, name: 'التصميم', departmentCode: 'DESIGN', requiresFiles: true, isMandatory: false, canSkip: true, nextStageTempKey: 'print' },
      { tempKey: 'print', order: 2, name: 'الطباعة الحرارية', departmentCode: 'SUBLIMATION_PRINTING', nextStageTempKey: 'delivery' },
      { tempKey: 'delivery', order: 3, name: 'التسليم', departmentCode: 'DELIVERY' },
    ],
  },
];

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

  const existingServices = await prisma.service.count({ where: { isDeleted: false } });
  if (existingServices === 0) {
    await prisma.service.createMany({
      data: DEFAULT_SERVICES.map((s) => ({ name: s.name, category: s.category, price: 0 })),
    });
  }

  // ---- Workflow Engine (FEATURE-004 M1) ----

  for (const dept of DEFAULT_DEPARTMENTS) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: {},
      create: {
        code: dept.code,
        name: dept.name,
        productionTrack: 'productionTrack' in dept ? dept.productionTrack : null,
      },
    });
  }

  // FEATURE-007 WF-A — one published template per confirmed production
  // track, created + published only the first time (a published template
  // version is immutable by design — see `assertTemplateEditable` — so a
  // template that already exists here is left completely alone on rerun,
  // same discipline as DEFAULT_ROLE_PERMISSIONS above).
  const departmentByCode = new Map((await prisma.department.findMany()).map((d) => [d.code, d.id]));

  for (const tmpl of DEFAULT_WORKFLOW_TEMPLATES) {
    const existing = await prisma.workflowTemplate.findFirst({
      where: { code: tmpl.code, isDeleted: false },
    });
    if (existing) continue;

    await prisma.$transaction(async (tx) => {
      const created = await tx.workflowTemplate.create({
        data: { code: tmpl.code, name: tmpl.name, description: tmpl.description },
      });
      await replaceTemplateStages(
        tx,
        created.id,
        tmpl.stages.map((s) => ({
          tempKey: s.tempKey,
          order: s.order,
          name: s.name,
          departmentId: departmentByCode.get(s.departmentCode),
          nextStageTempKey: s.nextStageTempKey,
          requiresFiles: s.requiresFiles,
          isMandatory: s.isMandatory,
          canSkip: s.canSkip,
          variables: s.variables,
        })),
      );
      await tx.workflowTemplate.update({
        where: { id: created.id },
        data: { publishedAt: new Date() },
      });
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
