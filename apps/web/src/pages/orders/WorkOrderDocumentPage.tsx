import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BranchSummary, BusinessIdentity, BusinessPartner, Order, OrderItem, PricingReference, ProductionTrack, User, WorkOrder } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPatch } from '@/lib/api';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/button';
import { Breadcrumbs, EditableNumberCell, EditableSelectCell, StatusBadge, useConfirm } from '@/components/cleopatra';
import { DocumentRenderer, type DocumentRendererItem } from '@/components/documents/DocumentRenderer';
import { resolveDocumentSnapshot } from '@/lib/documents/documentSnapshot';
import { partnerSalutation } from '@/lib/documents/partnerSalutation';

const PRODUCTION_STATUS_LABELS: Record<OrderItem['productionStatus'], string> = {
  WAITING: 'في الانتظار',
  IN_PROGRESS: 'جاري التنفيذ',
  DONE: 'تم',
};
const PRODUCTION_STATUS_OPTIONS = Object.entries(PRODUCTION_STATUS_LABELS) as [OrderItem['productionStatus'], string][];
const PRODUCTION_STATUS_TONE: Record<OrderItem['productionStatus'], 'neutral' | 'warning' | 'success'> = {
  WAITING: 'neutral',
  IN_PROGRESS: 'warning',
  DONE: 'success',
};

/**
 * "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19, owner: "أقدر أعرف A4
 * خلصت والA5 لسه") — per-item production progress, independent of the
 * shared Work Order's own stage-by-stage state above. Only items that
 * actually carry a `requiredQuantity` snapshot are shown (retail/no-track
 * items never get one) — an empty result means this section renders
 * nothing, not an empty table. `print:hidden` — this is an internal
 * tracking widget with editable inputs, not part of the physical job card
 * handed to the production floor.
 */
function ProductionProgressSection({
  workOrderId,
  items,
  onItemUpdated,
}: {
  workOrderId: string;
  items: OrderItem[];
  onItemUpdated: (updated: OrderItem) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const trackable = items.filter((item) => item.requiredQuantity !== null);
  if (trackable.length === 0) return null;

  const update = async (item: OrderItem, patch: { producedQuantity?: number; status?: OrderItem['productionStatus'] }) => {
    setErrors((prev) => ({ ...prev, [item.id]: '' }));
    try {
      const updated = await apiPatch<OrderItem>(`/api/work-orders/${workOrderId}/items/${item.id}/production`, patch);
      onItemUpdated(updated);
    } catch (err) {
      setErrors((prev) => ({ ...prev, [item.id]: err instanceof Error ? err.message : 'تعذر الحفظ' }));
    }
  };

  return (
    <div className="border-border bg-card space-y-2 rounded-2xl border p-4 print:hidden">
      <h2 className="font-semibold">تتبع الإنتاج لكل بند</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-2">الصنف</th>
              <th className="p-2">المطلوب</th>
              <th className="p-2">المنتَج فعليًا</th>
              <th className="p-2">المتبقي</th>
              <th className="p-2">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {trackable.map((item) => {
              const required = item.requiredQuantity ?? 0;
              const remaining = Math.max(0, required - item.producedQuantity);
              return (
                <tr key={item.id} className="border-border border-b last:border-0">
                  <td className="p-2">
                    {item.modelName || item.kind || '—'}
                    {errors[item.id] && <p className="text-destructive text-xs">{errors[item.id]}</p>}
                  </td>
                  <td className="p-2" dir="ltr">
                    {required}
                  </td>
                  <td className="p-2">
                    <EditableNumberCell
                      value={item.producedQuantity}
                      min={0}
                      onSave={(next) => update(item, { producedQuantity: next })}
                    />
                  </td>
                  <td className="p-2" dir="ltr">
                    {remaining}
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1.5">
                      <StatusBadge tone={PRODUCTION_STATUS_TONE[item.productionStatus]}>
                        {PRODUCTION_STATUS_LABELS[item.productionStatus]}
                      </StatusBadge>
                      <EditableSelectCell
                        value={item.productionStatus}
                        options={PRODUCTION_STATUS_OPTIONS}
                        onSave={(next) => update(item, { status: next })}
                        renderValue={() => '✎'}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * FEATURE-006 M10 — Work Order document. Owner's explicit clarification
 * (2026-08-12): Offset is the one track with a genuinely different,
 * richer internal production job-card (per-item sheet/run/numbering/
 * color/paper/binding detail — see `OffsetItemCards` below, a stacked
 * label/value card per item, owner: "العناوين تحت بعض مش جمب بعض"
 * (2026-08-13)); every other track (Digital/Boards & Signage/Other Products, or an
 * order with no `productionTrack` set at all) "مش هيبقى فيه إلا تفاصيل
 * الأوردر اللي من الشاشة الرئيسية" — just the same item list already on
 * the invoice, reusing `DocumentRenderer` exactly like `OrderDocumentPage`
 * does, no separate internal-production table invented for tracks that
 * were never asked for one.
 */
interface OffsetItemBreakdown {
  quantity?: number;
  sheetsNeeded?: number;
  printRuns?: number;
  numberingRuns?: number;
  numberingStartNumber?: number | null;
  numberingEnd?: number | null;
  colorCount?: number;
  sides?: 1 | 2;
  isNewDesign?: boolean;
  paperName?: string | null;
  contentType?: 'ORIGINAL_ONLY' | 'ORIGINAL_PLUS_COPIES';
  copies?: number | null;
  // Present only on FOLDER/ENVELOPE breakdowns respectively — used only to
  // tell the four Offset sub-kinds apart for the "عدد الدفاتر/عدد الورق"
  // label below, same heuristic NewOrderPage.tsx's `inferStoredKind` uses.
  sellophaneEnabled?: boolean;
  readyEnvelopePricePerPiece?: number;
  notes?: string | null;
  // FEATURE-009 (2026-08-13) — see createOrderItemSchema's own doc comment.
  inkColor?: string | null;
  bindingType?: string | null;
  sellophaneType?: string | null;
  referenceImageUrl?: string | null;
  /**
   * Multi-material NOTEBOOK (2026-08-17, owner: "الاصل خامة والصورة خامة
   * والصورة التالته خامة تالتة") — one entry per material actually in use,
   * frozen by `pricingEngineService.ts`'s NOTEBOOK case straight into
   * `breakdown` (not read from the `OrderItemMaterial` DB relation — this
   * page already reads everything from the frozen `breakdown` JSON). Absent
   * or a single entry ⇒ render the same single "نوع الورق"/"عدد الأفرخ"
   * rows every other kind already gets, unchanged.
   */
  materials?: { role: string; paperName: string | null; sheetsNeeded: number }[];
}

/**
 * Multi-material NOTEBOOK (2026-08-17, owner: "هختار نوع الورق لكل نسخة")
 * — Arabic label for a material role, same rule `NewOrderPage.tsx` uses for
 * its live preview. `role` is either `'ORIGINAL'` or `COPY_${n}` (1-indexed,
 * one per copy — no fixed count/naming).
 */
function notebookMaterialRoleLabel(role: string): string {
  if (role === 'ORIGINAL') return 'الأصل';
  const match = /^COPY_(\d+)$/.exec(role);
  return match ? `نسخة ${match[1]}` : role;
}

function offsetBreakdown(item: OrderItem): OffsetItemBreakdown {
  return (item.breakdown as OffsetItemBreakdown | null) ?? {};
}

/**
 * FEATURE-009 (2026-08-13, owner: "عدد الدفاتر بتظهر لما اكون مختار دفاتر
 * / عدد الورق بتظهر لما اكون مختار ورق سايب") — the quantity field's own
 * label depends on which of the 4 Offset sub-kinds the item actually is;
 * mirrors `NewOrderPage.tsx`'s `inferStoredKind` breakdown-shape heuristic
 * (no `kind` column exists on `OrderItem` itself to read directly).
 */
function offsetQuantityLabel(b: OffsetItemBreakdown): string {
  if (b.readyEnvelopePricePerPiece !== undefined) return 'عدد الأظرف';
  if (b.contentType !== undefined) return 'عدد الدفاتر';
  if (b.sellophaneEnabled !== undefined) return 'عدد الفولدرات';
  return 'عدد الورق';
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border-border flex flex-wrap gap-2 border-b py-1.5">
      <span className="text-muted-foreground shrink-0">{label} :</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/**
 * FEATURE-009 (2026-08-13, owner: "عايز أمر الشغل بتاع الأوفست يكون
 * العناوين تحت بعض مش جمب بعض") — replaces the previous wide table (one
 * row per item, columns side by side) with a stacked label/value card per
 * item, exact field order and labels as specified. "مقاس التكسير" is the
 * press/sheet size already used in the pricing formulas (`SizeFamily.label`,
 * e.g. "الفرخ العادي (٧٠×١٠٠)"); "مقاس الموديل" is the actual final product
 * size (`OrderItem.realSizeLabel`, e.g. "17.5×25") — two distinct sizes,
 * both real, neither invented.
 */
function OffsetItemCard({
  item,
  partnerName,
  sizeFamilyLabel,
}: {
  item: OrderItem;
  partnerName: string;
  sizeFamilyLabel: string;
}) {
  const b = offsetBreakdown(item);
  const quantityValue = (
    <>
      <span dir="ltr">{b.quantity ?? '—'}</span>
      {b.contentType && (
        <span className="text-muted-foreground">
          {' — '}
          {b.contentType === 'ORIGINAL_PLUS_COPIES' ? `أصل و${b.copies ?? '—'} صورة` : 'أصل فقط'}
        </span>
      )}
    </>
  );

  return (
    <div className="border-border mb-6 space-y-0 rounded-lg border p-3 text-base break-inside-avoid">
      <Field label="العميل" value={partnerName} />
      <Field label="إسم الصنف" value={item.modelName ?? item.kind ?? '—'} />
      <Field label={offsetQuantityLabel(b)} value={quantityValue} />
      {b.materials && b.materials.length > 1 ? (
        b.materials.map((m, i) => (
          <div key={`${m.role}-${i}`} className="border-border flex flex-wrap gap-4 border-b py-1.5">
            <span>
              <span className="text-muted-foreground">نوع ورق {notebookMaterialRoleLabel(m.role)} :</span>{' '}
              <span className="font-medium">{m.paperName ?? '—'}</span>
            </span>
            <span>
              <span className="text-muted-foreground">عدد الأفرخ :</span> <span dir="ltr">{m.sheetsNeeded}</span>
            </span>
          </div>
        ))
      ) : (
        <>
          <Field label="نوع الورق" value={b.paperName ?? '—'} />
          <Field label="عدد الأفرخ" value={<span dir="ltr">{b.sheetsNeeded ?? '—'}</span>} />
        </>
      )}
      <div className="border-border flex flex-wrap gap-4 border-b py-1.5">
        <span>
          <span className="text-muted-foreground">الترقيم من :</span> <span dir="ltr">{b.numberingStartNumber ?? '—'}</span>
        </span>
        <span>
          <span className="text-muted-foreground">إلى :</span> <span dir="ltr">{b.numberingEnd ?? '—'}</span>
        </span>
      </div>
      <Field label="مقاس التكسير" value={sizeFamilyLabel} />
      <Field label="مقاس الموديل" value={item.realSizeLabel ?? '—'} />
      <Field label="نوع السلوفان" value={b.sellophaneType ?? '—'} />
      <Field label="عدد الألوان" value={<span dir="ltr">{b.colorCount ?? '—'}</span>} />
      <Field label="لون الحبر" value={b.inkColor ?? '—'} />
      <Field label="نوع التجليد" value={b.bindingType ?? '—'} />
      <div className="py-1.5">
        <div className="text-muted-foreground">ملاحظات</div>
        <div className="font-medium">{b.notes ?? '—'}</div>
      </div>
      {b.referenceImageUrl && (
        <div className="py-1.5">
          <div className="text-muted-foreground mb-1">صورة الموديل</div>
          <img src={b.referenceImageUrl} alt="" className="max-h-40 rounded-md border object-contain" />
        </div>
      )}
    </div>
  );
}

/**
 * FEATURE-009 (2026-08-13, owner: "كل قسم رئيسي... له شكل Work Order
 * مختلف حسب طبيعة العمل... يجب تصميم النظام بحيث يكون هناك Work Order
 * structure قابل للتخصيص حسب نوع الـProduct/Service والـDepartment"). A
 * registry keyed by `ProductionTrack`, not an ad-hoc boolean check — adding
 * a distinct shape for a track later (once its content is actually
 * specified) means adding a new `TrackRenderer` case + a new branch below,
 * without touching how the others render. OFFSET is the only track with a
 * defined distinct shape today (`OffsetItemCards`); every other track
 * intentionally falls through to the same generic shape until its own is
 * specified — never invented ahead of a real spec.
 */
type TrackRenderer = 'OFFSET_DETAILED' | 'GENERIC';
const WORK_ORDER_TRACK_RENDERERS: Record<ProductionTrack, TrackRenderer> = {
  OFFSET: 'OFFSET_DETAILED',
  DIGITAL: 'GENERIC',
  BOARDS_SIGNAGE: 'GENERIC',
  OTHER_PRODUCTS: 'GENERIC',
  SERVICES: 'GENERIC',
  READY_PRODUCTS: 'GENERIC',
  SUBLIMATION_GIFTS: 'GENERIC',
};

function OffsetItemCards({
  items,
  partnerName,
  sizeFamilyLabelByKey,
}: {
  items: OrderItem[];
  partnerName: string;
  sizeFamilyLabelByKey: Map<string, string>;
}) {
  return (
    <div>
      {items.map((item) => (
        <OffsetItemCard
          key={item.id}
          item={item}
          partnerName={partnerName}
          sizeFamilyLabel={(item.sizeFamilyKey && sizeFamilyLabelByKey.get(item.sizeFamilyKey)) || '—'}
        />
      ))}
    </div>
  );
}

export function WorkOrderDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [pricingReference, setPricingReference] = useState<PricingReference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    apiGet<WorkOrder>(`/api/work-orders/${id}`)
      .then((wo) => {
        setWorkOrder(wo);
        return apiGet<Order>(`/api/orders/${wo.orderId}`);
      })
      .then((o) => {
        setOrder(o);
        return Promise.all([
          apiGet<BusinessPartner>(`/api/partners/${o.partnerId}`),
          apiGet<BusinessIdentity>('/api/settings/business-identity'),
          apiGet<User[]>('/api/users').catch(() => []),
          apiGet<BranchSummary[]>('/api/branches').catch(() => []),
          apiGet<PricingReference>('/api/pricing-reference').catch(() => null),
        ]);
      })
      .then(([p, b, s, br, pr]) => {
        setPartner(p);
        setBusiness(b);
        setStaff(s);
        setBranches(br);
        setPricingReference(pr);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل أمر الشغل'));
  }, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!workOrder || !order || !partner || !business) {
    return <div className="text-muted-foreground">جارٍ التحميل…</div>;
  }

  // "تصميم واحد بمتغيرات إنتاج متعددة" (2026-08-19) — swaps the just-updated
  // item into local state so `ProductionProgressSection` reflects the save
  // immediately, without a full re-fetch of the Work Order.
  const handleItemProductionUpdated = (updated: OrderItem) => {
    setWorkOrder((prev) => (prev ? { ...prev, items: prev.items.map((i) => (i.id === updated.id ? updated : i)) } : prev));
  };

  // FEATURE-012 (2026-08-14, owner: "لازم اكون أقدر أحذف أمر الشغل") — mirrors
  // OrderDocumentPage.tsx's removeOrder exactly (confirm → soft-delete → leave).
  const removeWorkOrder = async () => {
    if (
      !(await confirm({
        title: `حذف أمر الشغل ${workOrder.workOrderNumber}؟`,
        description: 'لا يمكن التراجع عن هذا الإجراء.',
        destructive: true,
      }))
    )
      return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await apiDelete(`/api/work-orders/${workOrder.id}`);
      navigate('/quotations');
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'تعذر حذف أمر الشغل');
      setDeleting(false);
    }
  };

  const responsibleStaff = staff.find((s) => s.id === order.staffId)?.name ?? '—';
  // FEATURE-007 (2026-08-12) — the issuing branch's own identity wins over the global one.
  const branch = branches.find((b) => b.id === order.branchId);
  const effectiveLogoUrl = branch?.logoUrl || business.logoUrl;
  const effectiveName = branch?.name || business.businessNameAr;

  // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — was
  // `order.productionTrack` (one value for the whole order, now removed);
  // every Work Order carries its own frozen track directly, always
  // non-null, no fallback needed.
  const trackRenderer = WORK_ORDER_TRACK_RENDERERS[workOrder.productionTrack];
  if (trackRenderer !== 'OFFSET_DETAILED') {
    // "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — was `order.items`
    // (every item on the whole Order); now `workOrder.items`, the items
    // belonging to *this* Work Order only — printing two Work Orders for
    // the same mixed-track Order used to print the same full item list
    // twice, this is exactly the bug that fixes.
    const items: DocumentRendererItem[] = workOrder.items.map((item) => {
      const breakdown = item.breakdown as { quantity?: number; notes?: string | null } | null;
      return {
        itemType: item.kind ?? '—',
        quantity: breakdown?.quantity ?? 0,
        size: item.realSizeLabel,
        description: item.modelName,
        notes: breakdown?.notes ?? null,
      };
    });
    const snapshot = resolveDocumentSnapshot(business, null, null, branch);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <Breadcrumbs
              items={[
                { label: 'المستندات', to: '/quotations' },
                { label: partner.nameAr, to: `/partners/${order.partnerId}` },
                { label: `أمر شغل ${workOrder.workOrderNumber}` },
              ]}
            />
            <div className="flex flex-wrap items-center gap-x-3 text-sm">
              <h1 className="text-xl font-bold">أمر شغل {workOrder.workOrderNumber}</h1>
              <Link to={`/orders/${order.id}`} className="text-primary hover:underline">
                الفاتورة الأصلية
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {can('orders.edit') && (
              <Button type="button" variant="secondary" onClick={() => navigate(`/orders/new?editOrder=${order.id}`)}>
                تعديل
              </Button>
            )}
            {can('work-orders.delete') && (
              <Button type="button" variant="destructive" disabled={deleting} onClick={() => void removeWorkOrder()}>
                {deleting ? 'جارٍ الحذف…' : 'حذف أمر الشغل'}
              </Button>
            )}
            <Button type="button" onClick={() => window.print()}>
              طباعة أمر الشغل
            </Button>
          </div>
        </div>
        {deleteError && <p className="text-destructive text-sm print:hidden">{deleteError}</p>}
        <DocumentRenderer
          snapshot={snapshot}
          contactIconTheme={branch && !branch.isDefault ? 'blue-pink' : 'red'}
          documentTypeLabel="أمر شغل"
          documentNumber={workOrder.workOrderNumber}
          date={workOrder.createdAt}
          partnerName={partner.nameAr}
          partnerPhone={partner.phone}
          partnerSalutation={partnerSalutation(partner)}
          items={items}
          customerNotes={order.customerNotes}
        />
        <ProductionProgressSection workOrderId={workOrder.id} items={workOrder.items} onItemUpdated={handleItemProductionUpdated} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <Breadcrumbs
            items={[
              { label: 'المستندات', to: '/quotations' },
              { label: partner.nameAr, to: `/partners/${order.partnerId}` },
              { label: `أمر شغل ${workOrder.workOrderNumber}` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-3 text-sm">
            <h1 className="text-xl font-bold">أمر شغل {workOrder.workOrderNumber}</h1>
            <Link to={`/orders/${order.id}`} className="text-primary hover:underline">
              الفاتورة الأصلية
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('orders.edit') && (
            <Button type="button" variant="secondary" onClick={() => navigate(`/orders/new?editOrder=${order.id}`)}>
              تعديل
            </Button>
          )}
          {can('work-orders.delete') && (
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void removeWorkOrder()}>
              {deleting ? 'جارٍ الحذف…' : 'حذف أمر الشغل'}
            </Button>
          )}
          <Button type="button" onClick={() => window.print()}>
            طباعة أمر الشغل
          </Button>
        </div>
      </div>
      {deleteError && <p className="text-destructive text-sm print:hidden">{deleteError}</p>}

      <div className="document-print-root bg-background text-foreground relative mx-auto max-w-4xl overflow-hidden p-8 text-sm">
        {effectiveLogoUrl && (
          <img
            src={effectiveLogoUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 max-h-[65%] max-w-[65%] -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.06] print:opacity-[0.08]"
          />
        )}
        <header className="border-border relative mb-6 flex items-start justify-between border-b pb-4">
          <div className="text-end">
            <div className="text-lg font-bold">{effectiveName || '—'}</div>
            <div className="text-lg font-bold">أمر شغل — أوفست</div>
            <div className="text-xs">
              رقم: <span dir="ltr">{workOrder.workOrderNumber}</span>
            </div>
            <div className="text-xs">
              تاريخ الإنشاء: <span dir="ltr">{new Date(workOrder.createdAt).toLocaleDateString('ar-EG')}</span>
            </div>
            {order.deliveryDate && (
              <div className="text-xs">
                موعد التسليم: <span dir="ltr">{new Date(order.deliveryDate).toLocaleDateString('ar-EG')}</span>
              </div>
            )}
          </div>
          <div>{effectiveLogoUrl && <img src={effectiveLogoUrl} alt="" className="h-14 object-contain" />}</div>
        </header>

        {/* owner (2026-08-14): "العميل مكتوب مرتين... رقم تليفونه... الحالة الحالية دي مش فاهم ايه لازمة وجودها" — العميل now shows once, inside each item's own card below (it's a per-worker-slip field there, not a header field); phone and status dropped entirely as irrelevant to the worker producing the job. الموظف المسؤول stays (owner: "دي حاجه موافق عليها"). */}
        <section className="relative mb-6 space-y-1">
          <div>
            <span className="text-muted-foreground text-xs">الموظف المسؤول: </span>
            <span>{responsibleStaff}</span>
          </div>
        </section>

        <OffsetItemCards
          items={workOrder.items}
          partnerName={partner.nameAr}
          sizeFamilyLabelByKey={new Map((pricingReference?.sizeFamilies ?? []).map((f) => [f.key, f.label]))}
        />

        {order.customerNotes && (
          <section className="mb-3">
            <div className="text-muted-foreground text-xs">ملاحظات العميل</div>
            <div className="text-xs">{order.customerNotes}</div>
          </section>
        )}
        {order.internalNotes && (
          <section className="mb-3">
            <div className="text-muted-foreground text-xs">ملاحظات داخلية</div>
            <div className="text-xs">{order.internalNotes}</div>
          </section>
        )}
      </div>
      <ProductionProgressSection workOrderId={workOrder.id} items={workOrder.items} onItemUpdated={handleItemProductionUpdated} />
    </div>
  );
}
