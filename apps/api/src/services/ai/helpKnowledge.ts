/**
 * Task 14.1 — Structured System Help Knowledge (read-only, static).
 *
 * Answers "how does Cleopatra work?" questions (Task 14's audit finding:
 * `systemKnowledge.ts` only has one-line module definitions, and nothing
 * anywhere in the AI's context describes an actual workflow, UI action, or
 * route). This is deliberately separate from `systemKnowledge.ts` — that
 * file is always-injected static prompt text; this module is looked up
 * on-demand by `search_help_topics` (tools/searchHelpTopics.ts) only when
 * actually asked for, so it costs zero tokens on every other request.
 *
 * Every fact below was verified against the CURRENT implementation, not
 * assumed from documentation (Task 14.1's own instruction) — see each
 * topic's own comment for its source. Where the project's own
 * `CLAUDE.md` describes a workflow slightly differently than the real
 * seeded `WorkflowTemplate` data (`apps/api/prisma/seed.ts`), the seed
 * data — the actual current implementation — is what's used here; the
 * discrepancy is called out in the relevant topic's comment and in this
 * task's own final report, not silently resolved.
 *
 * Deliberately NOT a RAG/embedding system (Task 14.1's own constraint) —
 * plain substring matching over a small, hand-curated, hand-reviewed list,
 * same spirit as every `search_*` tool's own simple filter (e.g.
 * `search_customers`' `.includes()` check) and `toolRouting.ts`'s own
 * `KEYWORD_RULES` (no `\b` word-boundary anchors — they silently never
 * match Arabic text, a bug class already hit once in this project per
 * `searchSuppliers.ts`'s "Gap 2a" comment).
 */

export interface SystemHelpTopic {
  id: string;
  title: string;
  keywords: string[];
  category: string;
  answer: string;
}

export interface HelpTopicMatch {
  id: string;
  title: string;
  category: string;
  answer: string;
}

/**
 * Verified against `treasuryService.ts` (`closeTreasuryDay`,
 * `reopenTreasuryDay`, `reopenDayIfClosed`), `jobs/autoCloseDayJob.ts`, the
 * `closeTreasuryDayHandler`/`reopenTreasuryDayHandler` controllers, and the
 * real button/field labels in `TreasuryPage.tsx` (`تقفيل حساب اليوم`,
 * `الرصيد الافتتاحي`, `النقدية الفعلية`, `إعادة فتح اليوم`, the confirm-
 * dialog text) — not from CLAUDE.md alone.
 */
const DAILY_CLOSURE: SystemHelpTopic = {
  id: 'daily_closure',
  title: 'تقفيل حساب اليوم (الخزينة)',
  keywords: ['اغلاق اليومية', 'إغلاق اليومية', 'تقفيل اليوم', 'تقفيل الحساب', 'قفل اليومية', 'اقفال اليومية', 'تقفيل الخزينة', 'اعادة فتح اليوم', 'إعادة فتح اليوم'],
  category: 'treasury',
  answer:
    'تقفيل حساب اليوم بيتم من شاشة الخزينة (/treasury)، قسم "تقفيل حساب اليوم (كاش)". بيعرض الرصيد الافتتاحي والداخل والخارج تلقائيًا، وانت بتدخل "النقدية الفعلية" (الكاش اللي اتعد فعليًا في الدرج) وتضغط زرار "تقفيل حساب اليوم" — من ساعتها معدش تقدر تسجّل حركات نقدية جديدة على نفس اليوم إلا لو اتعمله إعادة فتح. لو فيه وقت تقفيل تلقائي متحدد في الإعدادات (Setting.autoCloseDayTime)، النظام بيقفل كل الفروع لوحده أول ما الوقت ده يجي، وبيحسب النقدية الفعلية = الرصيد المتوقع نفسه (لأن محدش عدّ الدرج فعليًا). إعادة فتح يوم مقفول مقصورة على المسؤول العام/الأدمن بس، ومحتاجة سبب إجباري.',
};

/**
 * Verified against `WORKFLOW_TEMPLATES` in `apps/api/prisma/seed.ts`
 * (code: 'OFFSET') and `packages/shared`'s `ProductionTrack` enum usage —
 * the REAL current stage sequence, not CLAUDE.md's simplified example
 * ("Design → Pre-Press → Plate → Printing → Numbering → Folding → Binding
 * → Packaging"), which names two extra/merged stages that don't exist as
 * separate seeded stages today. Workflows are dynamic (project rule 14 —
 * no hardcoded production steps), editable from `/workflow-templates`, so
 * this reflects the default/seeded sequence, not a permanently fixed one.
 */
const OFFSET_WORKFLOW: SystemHelpTopic = {
  id: 'offset_workflow',
  title: 'خطوات مسار الطباعة الأوفست',
  keywords: ['اوفست', 'أوفست', 'خطوات تشغيل اوفست', 'مراحل الاوفست', 'مسار الاوفست'],
  category: 'production',
  answer:
    'مسار الأوفست الافتراضي (قابل للتعديل من شاشة قوالب الوركفلو /workflow-templates): التصميم (اختياري) ← تجهيز زنك ← طباعة ← ترقيم ← تقفيل ← تسليم. مرحلة التصميم اختيارية وممكن تتخطى لو الشغل مش محتاج تصميم جديد؛ الباقي مراحل إجبارية بالترتيب. تقدر تتابع كل أمر شغل حي من لوحة الإنتاج (/production-board).',
};

/**
 * Verified against `WORKFLOW_TEMPLATES` in `apps/api/prisma/seed.ts`
 * (code: 'DIGITAL') — also differs from CLAUDE.md's simplified example
 * ("Design → Digital Printing → Cutting → Packaging"), which omits the
 * real سلوفان/بشر stages entirely.
 */
const DIGITAL_WORKFLOW: SystemHelpTopic = {
  id: 'digital_workflow',
  title: 'خطوات مسار الطباعة الديجيتال',
  keywords: ['ديجيتال', 'خطوات تشغيل ديجيتال', 'مراحل الديجيتال', 'مسار الديجيتال'],
  category: 'production',
  answer:
    'مسار الديجيتال الافتراضي (قابل للتعديل من شاشة قوالب الوركفلو /workflow-templates): التصميم (اختياري) ← طباعة ← سلوفان ← بشر (اختياري) ← قص ← تسليم. التصميم وبشر مراحل اختيارية وممكن تتخطى؛ الباقي إجبارية بالترتيب. تقدر تتابع كل أمر شغل حي من لوحة الإنتاج (/production-board).',
};

const OFFSET_VS_DIGITAL: SystemHelpTopic = {
  id: 'offset_vs_digital',
  title: 'الفرق بين الأوفست والديجيتال',
  keywords: ['الفرق بين الاوفست والديجيتال', 'فرق بين اوفست وديجيتال', 'اوفست ولا ديجيتال'],
  category: 'production',
  answer:
    'الاتنين بيبدأوا بمرحلة تصميم اختيارية وبينتهوا بتسليم، لكن مراحل الإنتاج نفسها مختلفة: الأوفست بيعدي على تجهيز زنك ← طباعة ← ترقيم ← تقفيل (مناسب للكميات الكبيرة والدفاتر/الكتب اللي محتاجة تجليد حقيقي). الديجيتال بيعدي على طباعة ← سلوفان ← بشر (اختياري) ← قص (أسرع للكميات الصغيرة والشغل اللي محتاج تسليم سريع). اختيار المسار بيحصل تلقائيًا حسب نوع الصنف وقت إنشاء الطلب.',
};

/**
 * Verified against `NewOrderPage.tsx` (route `/orders/new`, the
 * `partnerId`/`walkIn` state, and the walk-in "لا يحتاج عميل" comment) and
 * the shared component's `editOrder`/`editQuotation` props (the same
 * composer builds a quotation OR order depending on which prop is set).
 */
const NEW_ORDER: SystemHelpTopic = {
  id: 'new_order',
  title: 'إنشاء طلب/فاتورة جديدة',
  keywords: ['اعمل طلب جديد', 'إنشاء طلب', 'طلب جديد', 'فاتورة جديدة', 'اعمل فاتورة'],
  category: 'orders',
  answer:
    'الطلب الجديد بيتعمل من شاشة "/orders/new". أول خطوة اختيار أو البحث عن العميل (أو تعليم الطلب كـ"بيع نقدي/كاش" لو مفيش عميل محدد ومفيش تتبع مطلوب). بعدين تضيف بنود الطلب (أوفست، ديجيتال، لوحات وإعلانات، منتجات جاهزة، خدمات، بضاعة من المخزون، أو بند يدوي حر) — النظام بيحسب السعر تلقائيًا بمحرك التسعير الحقيقي لكل بند. تقدر تسجّل دفعة عند الحفظ أو تسيبها لاحقًا. نفس الشاشة تستخدم لعمل عرض سعر (Quotation) بدل فاتورة مباشرة.',
};

/**
 * Verified against `controllers/quotations.ts::convertQuotation` (sets
 * `status: 'CONVERTED'` + `convertedOrderId`) and ADR-0010 (quotation and
 * work-order are independent entities, not the same record).
 */
const QUOTATION_VS_ORDER: SystemHelpTopic = {
  id: 'quotation_vs_order',
  title: 'الفرق بين عرض السعر والطلب',
  keywords: ['فرق بين عرض السعر والطلب', 'عرض سعر ولا طلب', 'يعني ايه عرض سعر', 'يعني إيه عرض سعر'],
  category: 'orders',
  answer:
    'عرض السعر (Quotation) هو تسعير مبدئي للعميل قبل ما يوافق — لسه معندهوش أمر شغل ولا هيدخل الإنتاج. لما العميل يوافق، عرض السعر بيتحول (Convert) لطلب حقيقي (Order) بنفس البنود، وساعتها بس أوامر الشغل بتتعمل وتدخل الإنتاج. شاشة عروض الأسعار: "/quotations".',
};

/**
 * Verified against `Order → OrderItem → WorkOrder → WorkflowInstance →
 * StageInstance` chain (CLAUDE.md §4's own documented flow, cross-checked
 * against the real WorkOrder creation logic already confirmed in
 * `orderService.ts`/`tryAutoCreateWorkOrders`).
 */
const ORDER_FULL_LIFECYCLE: SystemHelpTopic = {
  id: 'order_full_lifecycle',
  title: 'رحلة الطلب من أوله لآخره',
  keywords: ['الطلب بيمشي ازاي', 'الطلب بيمشي إزاي', 'رحلة الطلب', 'دورة حياة الطلب'],
  category: 'orders',
  answer:
    'الرحلة الكاملة: عميل (أو Lead لسه ما اتحولش) ← عرض سعر اختياري ← طلب (Order) بعد الموافقة ← كل بند محتاج تصنيع بياخد أمر شغل (Work Order) مستقل بمساره الإنتاجي الخاص بيه (أوفست/ديجيتال/لوحات/منتجات جاهزة/خدمات) ← أمر الشغل بيعدي على مراحل الوركفلو بتاعته قسم بقسم، متابع لحظيًا من لوحة الإنتاج (/production-board) ← تسليم ← تحصيل الدفعات على الفاتورة نفسها (متابع من شاشة الطلب) ← النظام بيتتبع تاريخ الطلب ده لتوقع ميعاد إعادة الطلب القادم تلقائيًا.',
};

/**
 * Verified against `WorkOrder`/`WorkflowInstance`/`StageInstance` schema
 * shape and `ProductionBoardPage.tsx`'s own tabs (لوحة الإنتاج,
 * `/production-board`). Also directly addresses Task 14's audit finding:
 * a plain "أمر الشغل بيمشي إزاي؟" question was previously routed to
 * `get_production_status` (live data) instead of getting this conceptual
 * explanation — this topic exists so a future help-routing task has real
 * content to route to instead.
 */
const WORK_ORDER_BASICS: SystemHelpTopic = {
  id: 'work_order_basics',
  title: 'يعني إيه أمر شغل، وبيمشي إزاي',
  keywords: ['يعني ايه امر شغل', 'يعني إيه أمر شغل', 'امر الشغل بيمشي', 'أمر الشغل بيمشي', 'امر شغل ايه', 'work order'],
  category: 'production',
  answer:
    'أمر الشغل (Work Order) هو الوحدة اللي بيتتبع بيها تصنيع بند واحد محتاج إنتاج فعلي جوه المصنع — كل بند من بنود الطلب المحتاج تصنيع بياخد أمر شغل مستقل بيه. أمر الشغل بيتبع مسار وركفلو محدد (أوفست/ديجيتال/لوحات وإعلانات/منتجات جاهزة/خدمات...)، وبيعدي على مراحل هذا المسار قسم بقسم لحد ما يوصل لمرحلة التسليم. تقدر تتابع كل أوامر الشغل الشغالة لحظيًا من لوحة الإنتاج (/production-board) — فيها تاب "الكل" يجمع كل الأقسام، وتاب "حسب الوركفلو" بيعرضها Kanban حسب مرحلتها.',
};

/**
 * A small, generic fallback for "فين ألاقي X؟" questions that don't map
 * cleanly to one of the more specific topics above — deliberately brief
 * (a route list, not a tutorial); verified against `apps/web/src/App.tsx`'s
 * actual `<Route path=...>` declarations, not assumed.
 */
const NAVIGATION_MAP: SystemHelpTopic = {
  id: 'navigation_map',
  title: 'أماكن الشاشات الرئيسية في النظام',
  keywords: ['فين اقدر اشوف', 'فين أقدر أشوف', 'فين ألاقي', 'مكان شاشة', 'وين اشوف'],
  category: 'navigation',
  answer:
    'أهم الشاشات: الخزينة "/treasury"، الطلبات الجديدة "/orders/new"، عروض الأسعار "/quotations"، لوحة الإنتاج "/production-board"، المخزون "/inventory"، العملاء "/partners"، الموردين "/suppliers"، الموظفين "/users"، الماكينات "/machines"، قوالب الوركفلو "/workflow-templates"، التقارير "/reports".',
};

export const SYSTEM_HELP_TOPICS: readonly SystemHelpTopic[] = [
  DAILY_CLOSURE,
  OFFSET_WORKFLOW,
  DIGITAL_WORKFLOW,
  OFFSET_VS_DIGITAL,
  NEW_ORDER,
  QUOTATION_VS_ORDER,
  ORDER_FULL_LIFECYCLE,
  WORK_ORDER_BASICS,
  NAVIGATION_MAP,
];

/**
 * Beyond lowercase/trim, folds common Arabic spelling variants that are
 * interchangeable in everyday Egyptian typing (أ/إ/آ → ا, ة → ه, ى → ي) —
 * a single bounded character substitution, not a stemmer or NLP step.
 * Without this, a query like "فين أقدر أشوف" would silently fail to match
 * a keyword written "فين اقدر اشوف" purely because of a hamza, which is
 * exactly the kind of Arabic-matching gap this project has already hit
 * once before (`searchSuppliers.ts`'s own "Gap 2a" comment, re: `\b` word
 * boundaries never matching Arabic text).
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي');
}

/**
 * Deliberately simple scoring — a keyword hit counts more than a title
 * hit, which counts more than an answer-body hit — so a short, specific
 * query (the realistic case) reliably surfaces the one intended topic
 * first, without any embedding/similarity machinery.
 */
function scoreTopic(topic: SystemHelpTopic, normalizedQuery: string): number {
  let score = 0;
  for (const keyword of topic.keywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedQuery.includes(normalizedKeyword) || normalizedKeyword.includes(normalizedQuery)) {
      score += 3;
    }
  }
  const normalizedTitle = normalize(topic.title);
  if (normalizedQuery.includes(normalizedTitle) || normalizedTitle.includes(normalizedQuery)) {
    score += 2;
  }
  if (normalize(topic.answer).includes(normalizedQuery)) {
    score += 1;
  }
  return score;
}

/** Pure, synchronous, in-memory — no database, no network, no side effects. Returns `[]` (never throws, never guesses) when nothing scores above zero. */
export function findHelpTopics(query: string, limit = 3): HelpTopicMatch[] {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  return SYSTEM_HELP_TOPICS.map((topic) => ({ topic, score: scoreTopic(topic, normalizedQuery) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ topic }) => ({ id: topic.id, title: topic.title, category: topic.category, answer: topic.answer }));
}
