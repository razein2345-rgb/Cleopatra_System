import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  BusinessPartner,
  Order,
  Quotation,
  QuotationApprovalState,
  QuotationStatus,
  UpdateQuotationInput,
} from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';
import {
  ITEM_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  QUOTATION_APPROVAL_LABELS,
  QUOTATION_STATUS_LABELS,
} from './quotationLabels';

/**
 * FEATURE-007 — item creation/pricing now happens exclusively through the
 * unified الطلبات والمستندات screen (owner's explicit clarification,
 * 2026-08-10, that Quotation/Order/WorkOrder creation is one flow, not
 * three). This component is read/status-only: it shows an existing
 * Quotation's already-frozen items and lets staff manage its lifecycle
 * (status/approval/versioning/conversion) and its few still-editable
 * fields (validity, discount, VAT toggle, notes) — never a caller-priced
 * item or total.
 */
export function QuotationDetail({ quotationId }: { quotationId: string }) {
  const { can } = useAuth();
  const canEdit = can('quotations.edit');

  const [quotation, setQuotation] = useState<Quotation | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<Quotation>(`/api/quotations/${quotationId}`)
      .then((q) => {
        setQuotation(q);
        return apiGet<BusinessPartner>(`/api/partners/${q.partnerId}`);
      })
      .then(setPartner)
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : 'تعذر تحميل عرض السعر'),
      )
      .finally(() => setLoading(false));
  }, [quotationId]);

  if (loadError) return <div className="text-destructive text-sm">{loadError}</div>;
  if (loading) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;
  if (!quotation) return <div className="text-destructive text-sm">عرض السعر غير موجود.</div>;

  return (
    <div className="space-y-4">
      <QuotationLifecycle quotation={quotation} canEdit={canEdit} onChanged={setQuotation} />
      <QuotationSummary quotation={quotation} partner={partner} canEdit={canEdit} onSaved={setQuotation} />
    </div>
  );
}

/**
 * Status/approval transitions — a plain `<select>` of every possible
 * value, not a pre-filtered "legal next states" list. The frontend does
 * not know or encode transition legality (FEATURE-003 M1's "Workflow
 * Ready" architectural decision) — it submits whatever was picked and
 * surfaces the server's rejection if the transition wasn't legal.
 */
function QuotationLifecycle({
  quotation,
  canEdit,
  onChanged,
}: {
  quotation: Quotation;
  canEdit: boolean;
  onChanged: (q: Quotation) => void;
}) {
  const { can } = useAuth();
  const canConvert = can('quotations.convert');
  const canDelete = can('quotations.delete');
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<QuotationStatus>(quotation.status);
  const [approvalState, setApprovalState] = useState<QuotationApprovalState>(
    quotation.approvalState,
  );
  const [order, setOrder] = useState<Order | null>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!quotation.convertedOrderId) return;
    apiGet<Order>(`/api/orders/${quotation.convertedOrderId}`)
      .then(setOrder)
      .catch(() => {
        /* Order summary is a convenience; a failed fetch just leaves it hidden. */
      });
  }, [quotation.convertedOrderId]);

  const convertToOrder = async () => {
    if (!confirm(`تحويل ${quotation.quotationNumber} إلى فاتورة؟ لا يمكن التراجع عن هذا الإجراء.`))
      return;
    setError(null);
    setConverting(true);
    try {
      const createdOrder = await apiPost<Order>(`/api/quotations/${quotation.id}/convert`, {});
      setOrder(createdOrder);
      const refreshed = await apiGet<Quotation>(`/api/quotations/${quotation.id}`);
      onChanged(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تحويل عرض السعر إلى فاتورة');
    } finally {
      setConverting(false);
    }
  };

  // Adjust local selection state during render when the quotation prop
  // changes underneath us (e.g. after a save) — React's documented
  // pattern for this, rather than a `useEffect` that would cascade an
  // extra render.
  const [syncedFor, setSyncedFor] = useState(quotation.id + quotation.status + quotation.approvalState);
  const currentSyncKey = quotation.id + quotation.status + quotation.approvalState;
  if (currentSyncKey !== syncedFor) {
    setStatus(quotation.status);
    setApprovalState(quotation.approvalState);
    setSyncedFor(currentSyncKey);
  }

  const submitStatus = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiPut<Quotation>(`/api/quotations/${quotation.id}/status`, {
        status,
      });
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير الحالة');
    } finally {
      setSubmitting(false);
    }
  };

  const submitApproval = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiPut<Quotation>(`/api/quotations/${quotation.id}/approval`, {
        approvalState,
      });
      onChanged(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تغيير حالة الاعتماد');
    } finally {
      setSubmitting(false);
    }
  };

  const removeQuotation = async () => {
    if (!confirm(`حذف ${quotation.quotationNumber}؟ لا يمكن التراجع عن هذا الإجراء.`)) return;
    setError(null);
    setDeleting(true);
    try {
      await apiDelete(`/api/quotations/${quotation.id}`);
      navigate('/quotations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف عرض السعر');
      setDeleting(false);
    }
  };

  const createVersion = async () => {
    if (!confirm(`إنشاء نسخة جديدة من ${quotation.quotationNumber}؟`)) return;
    setError(null);
    setSubmitting(true);
    try {
      const created = await apiPost<Quotation>(`/api/quotations/${quotation.id}/versions`, {});
      onChanged(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء نسخة جديدة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{quotation.quotationNumber}</h2>
        <span className="bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs">
          v{quotation.version}
        </span>
        {quotation.nextVersionExists && (
          <span className="bg-secondary rounded-full px-2 py-0.5 text-xs">
            توجد نسخة أحدث
          </span>
        )}
      </div>
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الحالة</span>
          <div className="flex gap-2">
            <select
              disabled={!canEdit}
              value={status}
              onChange={(e) => setStatus(e.target.value as QuotationStatus)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              {Object.entries(QUOTATION_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={submitting || status === quotation.status}
                onClick={() => void submitStatus()}
              >
                تحديث
              </Button>
            )}
          </div>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">الاعتماد</span>
          <div className="flex gap-2">
            <select
              disabled={!canEdit}
              value={approvalState}
              onChange={(e) => setApprovalState(e.target.value as QuotationApprovalState)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
            >
              {Object.entries(QUOTATION_APPROVAL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {canEdit && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={submitting || approvalState === quotation.approvalState}
                onClick={() => void submitApproval()}
              >
                تحديث
              </Button>
            )}
          </div>
        </label>
        {canEdit && (
          <div className="flex items-end">
            <Button
              type="button"
              variant="secondary"
              disabled={submitting}
              onClick={() => void createVersion()}
            >
              إنشاء نسخة جديدة
            </Button>
          </div>
        )}
      </div>

      {/* FEATURE-016 (2026-08-16, owner: "عرض السعر لسه مش بعرف أطبعه أكتر من مره ولا حتى لما
          اعدله") — the only print entry point used to be a one-time link on the creation
          success screen; editing (which lands back here) and revisiting from المستندات both
          had no way to reach `/quotations/:id/print` again. Unconditional, same as
          OrderDocumentPage's "طباعة الفاتورة" — printing an existing document isn't gated
          behind quotations.edit. */}
      <Button type="button" variant="secondary" onClick={() => navigate(`/quotations/${quotation.id}/print`)}>
        طباعة عرض السعر
      </Button>

      {/* FEATURE-007 (2026-08-12, owner: "المفروض أقدر أعدل في عرض السعر إني أضيف مثلا بند") — full item-replacement edit, reusing the exact same unified-screen edit mode `/orders/new?editOrder=<id>` already uses for invoices. Hidden once converted — the resulting Order is the thing to edit at that point, not a quotation that's already become one. */}
      {canEdit && !quotation.convertedOrderId && (
        <Button type="button" variant="secondary" onClick={() => navigate(`/orders/new?editQuotation=${quotation.id}`)}>
          تعديل بنود عرض السعر
        </Button>
      )}

      {/* FEATURE-003 M2 — Order Conversion. Visible only when it's actually
          legal (ACCEPTED, not yet converted); the server enforces the same
          rule regardless, per this component's "no workflow knowledge"
          convention above. */}
      {canConvert && quotation.status === 'ACCEPTED' && !quotation.convertedOrderId && (
        <Button type="button" disabled={converting} onClick={() => void convertToOrder()}>
          {converting ? 'جارٍ التحويل…' : 'تحويل إلى فاتورة'}
        </Button>
      )}

      {canDelete && !quotation.convertedOrderId && (
        <Button type="button" variant="destructive" size="sm" disabled={deleting} onClick={() => void removeQuotation()}>
          {deleting ? 'جارٍ الحذف…' : 'حذف عرض السعر'}
        </Button>
      )}

      {quotation.convertedOrderId && (
        <div className="border-border bg-muted/30 space-y-1 rounded-xl border p-3 text-sm">
          <p className="font-medium">الفاتورة</p>
          {order ? (
            <div className="text-muted-foreground grid grid-cols-2 gap-1 sm:grid-cols-4">
              <span>{order.invoiceNumber}</span>
              <span>{ORDER_STATUS_LABELS[order.status]}</span>
              <span>{order.finalTotal.toFixed(2)}</span>
              <span>{new Date(order.date).toLocaleDateString('ar-EG')}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">جارٍ التحميل…</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Items are shown read-only — each one carries its own frozen Pricing
 * Engine result (`itemTotal`/`breakdown`) from creation time, exactly like
 * an Order's items (§5.3 — internal calc detail never re-exposed as an
 * editable field). Only `validUntil`/`discountPercent`/`vatOn`/notes stay
 * editable here; `subtotal`/`vatAmount`/`finalTotal` are server-computed
 * and shown for reference only.
 */
function QuotationSummary({
  quotation,
  partner,
  canEdit,
  onSaved,
}: {
  quotation: Quotation;
  partner: BusinessPartner | null;
  canEdit: boolean;
  onSaved: (quotation: Quotation) => void;
}) {
  const [validUntil, setValidUntil] = useState(quotation.validUntil?.slice(0, 10) ?? '');
  const [discountPercent, setDiscountPercent] = useState(quotation.discountPercent.toString());
  const [vatOn, setVatOn] = useState(quotation.vatOn);
  const [customerNotes, setCustomerNotes] = useState(quotation.customerNotes ?? '');
  const [internalNotes, setInternalNotes] = useState(quotation.internalNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: UpdateQuotationInput = {
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
        discountPercent: Number(discountPercent),
        vatOn,
        customerNotes: customerNotes || null,
        internalNotes: internalNotes || null,
      };
      const saved = await apiPut<Quotation>(`/api/quotations/${quotation.id}`, input);
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ عرض السعر');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-4 rounded-2xl border p-4">
      <h2 className="font-semibold">بيانات عرض السعر</h2>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 text-sm">
          <span className="text-muted-foreground">العميل</span>
          <p className="border-input bg-muted/30 w-full rounded-md border px-3 py-2">
            {partner ? `${partner.nameAr}${partner.nameEn ? ` (${partner.nameEn})` : ''}` : '—'}
          </p>
        </div>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">صالح حتى (اختياري)</span>
          <input
            type="date"
            disabled={!canEdit}
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">نسبة الخصم %</span>
          <input
            type="number"
            min={0}
            max={100}
            step="0.1"
            disabled={!canEdit}
            value={discountPercent}
            onChange={(e) => setDiscountPercent(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            disabled={!canEdit}
            checked={vatOn}
            onChange={(e) => setVatOn(e.target.checked)}
          />
          تطبيق ضريبة القيمة المضافة
        </label>
        <div className="space-y-1 text-sm">
          <span className="text-muted-foreground">الإجمالي الفرعي</span>
          <p className="border-input bg-muted/30 w-full rounded-md border px-3 py-2">
            {quotation.subtotal.toFixed(2)}
          </p>
        </div>
        <div className="space-y-1 text-sm">
          <span className="text-muted-foreground">قيمة الضريبة</span>
          <p className="border-input bg-muted/30 w-full rounded-md border px-3 py-2">
            {quotation.vatAmount.toFixed(2)}
          </p>
        </div>
        <div className="space-y-1 text-sm sm:col-span-2">
          <span className="text-muted-foreground">الإجمالي النهائي</span>
          <p className="border-input bg-muted/30 w-full rounded-md border px-3 py-2 font-semibold">
            {quotation.finalTotal.toFixed(2)}
          </p>
        </div>
      </div>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">ملاحظات العميل</span>
        <textarea
          disabled={!canEdit}
          value={customerNotes}
          onChange={(e) => setCustomerNotes(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">ملاحظات داخلية (لا تظهر للعميل)</span>
        <textarea
          disabled={!canEdit}
          value={internalNotes}
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={2}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      <div className="space-y-2">
        <p className="text-sm font-medium">البنود</p>
        <div className="border-border overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-start">النوع</th>
                <th className="p-2 text-start">الصنف</th>
                <th className="p-2 text-start">الكمية</th>
                <th className="p-2 text-start">المقاس</th>
                <th className="p-2 text-start">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {quotation.items.map((item) => {
                const breakdown = item.breakdown as { quantity?: number } | null;
                return (
                  <tr key={item.id} className="border-border border-t">
                    <td className="p-2">
                      {ITEM_TYPE_LABELS[item.itemType as keyof typeof ITEM_TYPE_LABELS] ?? item.itemType}
                    </td>
                    <td className="p-2">{item.modelName ?? item.description ?? '—'}</td>
                    <td className="p-2">{breakdown?.quantity ?? '—'}</td>
                    <td className="p-2">{item.realSizeLabel ?? '—'}</td>
                    <td className="p-2">{item.itemTotal?.toFixed(2) ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {canEdit && (
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}
        </Button>
      )}
    </form>
  );
}
