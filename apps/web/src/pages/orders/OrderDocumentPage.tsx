import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { BranchSummary, BusinessIdentity, BusinessPartner, Order, OrderItem, Payment, PaymentMethod, User } from '@cleopatra/shared';
import { PRODUCTION_TRACK_LABELS } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Breadcrumbs, PartnerCombobox, useConfirm } from '@/components/cleopatra';
import { DocumentRenderer, type DocumentRendererItem } from '@/components/documents/DocumentRenderer';
import { resolveDocumentSnapshot } from '@/lib/documents/documentSnapshot';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';
import { partnerSalutation } from '@/lib/documents/partnerSalutation';
import { useAuth } from '@/state/AuthContext';

/** Owner (2026-08-20, "خليها بدون عميل") — mirrors orderService.ts's WALK_IN_ALLOWED_KINDS exactly. */
const WALK_IN_ALLOWED_KINDS = new Set(['INVENTORY_RETAIL', 'MANUAL']);

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'كاش',
  BANK_ACCOUNT: 'حساب بنكي',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'انستاباي',
};
const PAYMENT_METHOD_OPTIONS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[];

/**
 * FEATURE-006 M9 / FEATURE-007 — the first page that actually mounts
 * `DocumentRenderer` and calls `window.print()` (M7 built the renderer +
 * print CSS but never wired either into a real page). No template
 * picker/override editor yet (M9's fuller scope) — this is the minimum
 * for "اطبع الفاتورة" to actually work: real order data, real business
 * identity, the default template config.
 *
 * FEATURE-007 (2026-08-12) — "تعديل"/"حذف" (owner: "أقدر افتح... واعدل
 * فيها او احذفهم"). Edit routes to the unified creation screen in edit
 * mode (`/orders/new?editOrder=:id`, full item replacement); delete calls
 * the guarded `deleteOrder` service (blocked server-side if the invoice
 * has payments or a Work Order — see its own doc comment).
 */
export function OrderDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { can } = useAuth();
  const confirm = useConfirm();
  const [order, setOrder] = useState<Order | null>(null);
  const [partner, setPartner] = useState<BusinessPartner | null>(null);
  const [business, setBusiness] = useState<BusinessIdentity | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  /** Owner (2026-08-20, "وهل ممكن اكتب عميل فقط بلاش عميل نقدي") — toggle an existing invoice between a real customer and no customer at all (displayed simply as "عميل", not "عميل نقدي" — owner's explicit follow-up). */
  const [editingPartner, setEditingPartner] = useState(false);
  const [allPartners, setAllPartners] = useState<BusinessPartner[]>([]);
  const [newPartnerId, setNewPartnerId] = useState('');
  const [partnerSaving, setPartnerSaving] = useState(false);
  const [partnerError, setPartnerError] = useState<string | null>(null);
  /** Owner (2026-08-23, "لازم اقدر اغير الفرع") — a correction tool, same shape as the customer-change UI above. */
  const [editingBranch, setEditingBranch] = useState(false);
  const [newBranchId, setNewBranchId] = useState('');
  const [branchSaving, setBranchSaving] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  /** Owner (2026-08-20, "عايز اضيف دفعة اعمل ده ازاي") — recording a payment after creation had no UI anywhere, only at composer time. */
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  /** Owner (2026-08-20, "تعديل المدفوع... تعديل أي دفعة سابقة") — gated on the dedicated `payments.edit` permission, not `orders.edit`. */
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null);
  const [paymentActionBusy, setPaymentActionBusy] = useState<string | null>(null);
  /** Owner (2026-08-23, "مرتجعات") — gated on the dedicated `returns.create` permission, not `orders.edit`. */
  const [showAddReturn, setShowAddReturn] = useState(false);

  useEffect(() => {
    if (!id) return;
    apiGet<Order>(`/api/orders/${id}`)
      .then((o) => {
        setOrder(o);
        return Promise.all([
          // Owner (2026-08-20, "فاتورة بدون إسم العميل") — a walk-in/cash
          // invoice has no BusinessPartner to fetch.
          o.partnerId ? apiGet<BusinessPartner>(`/api/partners/${o.partnerId}`) : Promise.resolve(null),
          apiGet<BusinessIdentity>('/api/settings/business-identity'),
          apiGet<BranchSummary[]>('/api/branches').catch(() => []),
          apiGet<User[]>('/api/users').catch(() => []),
        ]);
      })
      .then(([p, b, br, s]) => {
        setPartner(p);
        setBusiness(b);
        setBranches(br);
        setStaff(s);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الفاتورة'));
  }, [id]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!order || !business) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  const removeOrder = async () => {
    if (
      !(await confirm({
        title: `حذف الفاتورة ${order.invoiceNumber}؟`,
        description: 'لا يمكن التراجع عن هذا الإجراء.',
        destructive: true,
      }))
    )
      return;
    setError(null);
    setDeleting(true);
    try {
      await apiDelete(`/api/orders/${order.id}`);
      navigate('/quotations');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف الفاتورة');
      setDeleting(false);
    }
  };

  const canGoWalkIn = order.items.every((i) => WALK_IN_ALLOWED_KINDS.has((i.breakdown as { kind?: string } | null)?.kind ?? ''));

  // Owner (2026-08-23, "مرتجعات: بضاعة من المخزون فقط... يقدر يحدّد
  // الكمية المرتجعة") — only INVENTORY_RETAIL items, only what's still
  // returnable (sold minus already returned).
  const returnableItems = order.items
    .map((item) => {
      const breakdown = item.breakdown as { kind?: string; itemName?: string | null } | null;
      const sold = item.sheetsConsumed ?? 0;
      const alreadyReturned = item.returns.reduce((sum, r) => sum + r.quantity, 0);
      const returnable = sold - alreadyReturned;
      const name = breakdown?.itemName ?? item.kind ?? '—';
      return { item, name, returnable };
    })
    .filter(({ item, returnable }) => (item.breakdown as { kind?: string } | null)?.kind === 'INVENTORY_RETAIL' && returnable > 0);

  const allReturns = order.items.flatMap((item) =>
    item.returns.map((r) => ({
      ...r,
      itemName: (item.breakdown as { itemName?: string | null } | null)?.itemName ?? item.kind ?? '—',
    })),
  );

  const startEditingPartner = () => {
    setEditingPartner(true);
    setPartnerError(null);
    setNewPartnerId('');
    if (allPartners.length === 0) {
      apiGet<BusinessPartner[]>('/api/partners')
        .then(setAllPartners)
        .catch(() => undefined);
    }
  };

  const applyPartnerChange = async (partnerId: string | null) => {
    setPartnerSaving(true);
    setPartnerError(null);
    try {
      const updated = await apiPut<Order>(`/api/orders/${order.id}/partner`, { partnerId });
      setOrder(updated);
      setPartner(partnerId ? (allPartners.find((p) => p.id === partnerId) ?? (await apiGet<BusinessPartner>(`/api/partners/${partnerId}`))) : null);
      setEditingPartner(false);
    } catch (err) {
      setPartnerError(err instanceof Error ? err.message : 'تعذر تغيير العميل');
    } finally {
      setPartnerSaving(false);
    }
  };

  const applyBranchChange = async (branchId: string) => {
    setBranchSaving(true);
    setBranchError(null);
    try {
      const updated = await apiPut<Order>(`/api/orders/${order.id}/branch`, { branchId });
      setOrder(updated);
      setEditingBranch(false);
    } catch (err) {
      setBranchError(err instanceof Error ? err.message : 'تعذر تغيير الفرع');
    } finally {
      setBranchSaving(false);
    }
  };

  const confirmGoWalkIn = async () => {
    if (
      !(await confirm({
        title: 'تحويل الفاتورة لفاتورة بدون عميل؟',
        description: partner ? `هتتشال من سجل "${partner.nameAr}".` : undefined,
      }))
    )
      return;
    await applyPartnerChange(null);
  };

  const submitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentSaving) return;
    const amount = Number(paymentAmount);
    if (!paymentAmount || Number.isNaN(amount) || amount <= 0) {
      setPaymentError('اكتب مبلغ أكبر من صفر');
      return;
    }
    setPaymentError(null);
    setPaymentSaving(true);
    try {
      const updated = await apiPost<Order>(`/api/orders/${order.id}/payments`, { method: paymentMethod, amount });
      setOrder(updated);
      setShowAddPayment(false);
      setPaymentAmount('');
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : 'تعذر تسجيل الدفعة');
    } finally {
      setPaymentSaving(false);
    }
  };

  const deletePaymentRow = async (payment: Payment) => {
    if (
      !(await confirm({
        title: `حذف دفعة بمبلغ ${payment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م؟`,
        description: 'هيترجع المبلغ ده تلقائيًا من قيد الخزينة المرتبط بيها.',
        destructive: true,
      }))
    )
      return;
    setPaymentActionError(null);
    setPaymentActionBusy(payment.id);
    try {
      const updated = await apiDelete<Order>(`/api/orders/${order.id}/payments/${payment.id}`);
      setOrder(updated);
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : 'تعذر حذف الدفعة');
    } finally {
      setPaymentActionBusy(null);
    }
  };

  const exportPdf = async () => {
    setError(null);
    setExportingPdf(true);
    try {
      // Owner (2026-08-26, "عايز عرض السعر او الفاتورة لما تتسيف تنزل بإسم العميل") — the downloaded filename, not just the number.
      await downloadDocumentAsPdf(`فاتورة ${order.invoiceNumber} - ${partner ? partner.nameAr : 'عميل نقدي'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تصدير الفاتورة كملف PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  const items: DocumentRendererItem[] = order.items.map((item) => {
    const breakdown = item.breakdown as { quantity?: number; notes?: string | null } | null;
    return {
      itemType: item.kind ?? '—',
      quantity: breakdown?.quantity ?? 0,
      size: item.realSizeLabel,
      description: item.modelName,
      notes: breakdown?.notes ?? null,
      lineTotal: item.itemTotal,
      discountAmount: item.discountAmount,
    };
  });

  const branch = branches.find((b) => b.id === order.branchId);
  // Owner (2026-08-13): "في الفاتورة مش عايز يظهر فيها العنوان والرقم
  // الأرضي والإيميل ورقم التليفون وصفحة الفيس إلا بإختياري" — Invoice has
  // no template, so these owner-configured toggles apply as a one-time
  // override on top of the (address/phone/email true, landline/facebook
  // true) template defaults, exactly like Quotation's showSignatureArea
  // override above.
  const snapshot = resolveDocumentSnapshot(
    business,
    null,
    {
      showBusinessAddress: business.showInvoiceAddress,
      showBusinessPhone: business.showInvoicePhone,
      showBusinessEmail: business.showInvoiceEmail,
      showBusinessLandline: business.showInvoiceLandline,
      showBusinessFacebook: business.showInvoiceFacebook,
    },
    branch,
  );
  const createdByName = staff.find((s) => s.id === order.staffId)?.name ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <Breadcrumbs
            items={[
              { label: 'المستندات', to: '/quotations' },
              ...(partner ? [{ label: partner.nameAr, to: `/partners/${order.partnerId}` }] : []),
              { label: `فاتورة ${order.invoiceNumber}` },
            ]}
          />
          <div className="flex flex-wrap items-center gap-x-3 text-sm">
            <h1 className="text-xl font-bold">فاتورة {order.invoiceNumber}</h1>
            {order.quotationOriginId && (
              <Link to={`/quotations/${order.quotationOriginId}`} className="text-primary hover:underline">
                عرض السعر الأصلي
              </Link>
            )}
          </div>
          {/* Owner (2026-08-20, "وهل ممكن اكتب عميل فقط بلاش عميل نقدي") —
              toggle an existing invoice between a real customer and "عميل
              نقدي" (only allowed back to walk-in when every item still
              qualifies — same rule creation enforces). */}
          {can('orders.edit') && (
            <div className="mt-1">
              {!editingPartner ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    العميل: <span className="text-foreground font-medium">{partner ? partner.nameAr : 'عميل'}</span>
                  </span>
                  {partner ? (
                    canGoWalkIn && (
                      <button type="button" onClick={() => void confirmGoWalkIn()} className="text-primary text-xs hover:underline">
                        خليها بدون عميل
                      </button>
                    )
                  ) : (
                    <button type="button" onClick={startEditingPartner} className="text-primary text-xs hover:underline">
                      + إضافة عميل
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <PartnerCombobox partners={allPartners} value={newPartnerId} onChange={setNewPartnerId} />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newPartnerId || partnerSaving}
                    onClick={() => void applyPartnerChange(newPartnerId)}
                  >
                    {partnerSaving ? 'جارٍ الحفظ…' : 'حفظ'}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditingPartner(false)}>
                    إلغاء
                  </Button>
                </div>
              )}
              {partnerError && <p className="text-destructive text-xs">{partnerError}</p>}
            </div>
          )}
          {/* Owner (2026-08-23, "لازم اقدر اغير الفرع") — a correction tool for a wrongly-assigned branch on an already-created invoice. */}
          {can('orders.edit') && (
            <div className="mt-1">
              {!editingBranch ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted-foreground">
                    الفرع: <span className="text-foreground font-medium">{branch?.name ?? '—'}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBranch(true);
                      setBranchError(null);
                      setNewBranchId(order.branchId);
                    }}
                    className="text-primary text-xs hover:underline"
                  >
                    تغيير الفرع
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={newBranchId}
                    onChange={(e) => setNewBranchId(e.target.value)}
                    className="border-input bg-background rounded-md border px-3 py-2 text-sm"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newBranchId || newBranchId === order.branchId || branchSaving}
                    onClick={() => void applyBranchChange(newBranchId)}
                  >
                    {branchSaving ? 'جارٍ الحفظ…' : 'حفظ'}
                  </Button>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setEditingBranch(false)}>
                    إلغاء
                  </Button>
                </div>
              )}
              {branchError && <p className="text-destructive text-xs">{branchError}</p>}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can('orders.edit') && order.remainingBalance > 0 && (
            <Button type="button" variant="secondary" onClick={() => setShowAddPayment(true)}>
              + تسجيل دفعة
            </Button>
          )}
          {can('returns.create') && returnableItems.length > 0 && (
            <Button type="button" variant="secondary" onClick={() => setShowAddReturn(true)}>
              + مرتجع
            </Button>
          )}
          {can('orders.edit') && (
            <Button type="button" variant="secondary" onClick={() => navigate(`/orders/new?editOrder=${order.id}`)}>
              تعديل الفاتورة
            </Button>
          )}
          {can('orders.delete') && (
            <Button type="button" variant="destructive" disabled={deleting} onClick={() => void removeOrder()}>
              {deleting ? 'جارٍ الحذف…' : 'حذف الفاتورة'}
            </Button>
          )}
          {/* "أمر شغل مستقل لكل صنف حسب مساره" (2026-08-16) — an order can now
              have several Work Orders (one per resolved track); one print
              button per Work Order instead of the old singular button. */}
          {order.workOrders.map((wo) => (
            <Button key={wo.id} type="button" variant="secondary" onClick={() => navigate(`/work-orders/${wo.id}`)}>
              طباعة أمر شغل {PRODUCTION_TRACK_LABELS[wo.productionTrack]}
            </Button>
          ))}
          <Button type="button" variant="secondary" disabled={exportingPdf} onClick={() => void exportPdf()}>
            {exportingPdf ? 'جارٍ التصدير…' : 'تنزيل PDF'}
          </Button>
          <Button type="button" onClick={() => window.print()}>
            طباعة الفاتورة
          </Button>
        </div>
      </div>

      {error && <p className="text-destructive text-sm print:hidden">{error}</p>}

      <DocumentRenderer
        snapshot={snapshot}
        showBranding={false}
        contactIconTheme={branch && !branch.isDefault ? 'blue-pink' : 'red'}
        hideCustomerSignature
        showStamp={business.showStampOnInvoice}
        createdByName={createdByName}
        // Owner (2026-09-02, "عايز الفاتورة... أقدر انا أغير إسمها من السيستم
        // أكتب إنها فاتورة أو إذن إستلام او أي حاجه بمزاجي") — configurable
        // from Settings → الهوية التجارية, defaults to "فاتورة" when unset.
        documentTypeLabel={business.invoiceDocumentLabel || 'فاتورة'}
        documentNumber={order.invoiceNumber}
        date={order.date}
        partnerName={partner ? partner.nameAr : 'عميل'}
        partnerPhone={partner?.phone}
        partnerSalutation={partner ? partnerSalutation(partner) : ''}
        items={items}
        totals={{
          subtotal: order.subtotal,
          discountPercent: order.discountPercent,
          vatOn: order.vatOn,
          vatAmount: order.vatAmount,
          finalTotal: order.finalTotal,
          itemDiscountsTotal: order.itemDiscountsTotal,
        }}
        paymentSummary={{ paidTotal: order.paidTotal, remainingBalance: order.remainingBalance }}
        customerNotes={order.customerNotes}
        paymentTerms={order.paymentTerms}
        deliveryDate={order.deliveryDate}
      />

      {order.payments.length > 0 && (
        <div className="border-border bg-card space-y-2 rounded-2xl border p-4 print:hidden">
          <p className="text-sm font-bold">سجل الدفعات</p>
          {paymentActionError && <p className="text-destructive text-sm">{paymentActionError}</p>}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-2">التاريخ</th>
                <th className="p-2">طريقة التحصيل</th>
                <th className="p-2">المبلغ</th>
                {can('payments.edit') && <th className="p-2" />}
              </tr>
            </thead>
            <tbody>
              {order.payments.map((payment) => (
                <tr key={payment.id} className="border-border border-b last:border-0">
                  <td className="text-muted-foreground p-2">{new Date(payment.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="p-2">{PAYMENT_METHOD_LABELS[payment.method]}</td>
                  <td className="p-2" dir="ltr">
                    {payment.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  {can('payments.edit') && (
                    <td className="p-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={paymentActionBusy === payment.id}
                          onClick={() => setEditingPayment(payment)}
                          className="text-primary text-xs hover:underline disabled:opacity-50"
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          disabled={paymentActionBusy === payment.id}
                          onClick={() => void deletePaymentRow(payment)}
                          className="text-destructive text-xs hover:underline disabled:opacity-50"
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {allReturns.length > 0 && (
        <div className="border-border bg-card space-y-2 rounded-2xl border p-4 print:hidden">
          <p className="text-sm font-bold">سجل المرتجعات</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
                <th className="p-2">التاريخ</th>
                <th className="p-2">الصنف</th>
                <th className="p-2">الكمية</th>
                <th className="p-2">المبلغ المسترد</th>
                <th className="p-2">السبب</th>
              </tr>
            </thead>
            <tbody>
              {allReturns.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <td className="text-muted-foreground p-2">{new Date(r.createdAt).toLocaleString('ar-EG')}</td>
                  <td className="p-2">{r.itemName}</td>
                  <td className="p-2" dir="ltr">
                    {r.quantity}
                  </td>
                  <td className="p-2" dir="ltr">
                    {r.refundAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="text-muted-foreground p-2">{r.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddReturn && (
        <AddReturnDialog
          orderId={order.id}
          returnableItems={returnableItems}
          onClose={() => setShowAddReturn(false)}
          onSaved={(updated) => {
            setOrder(updated);
            setShowAddReturn(false);
          }}
        />
      )}

      {editingPayment && (
        <EditPaymentDialog
          orderId={order.id}
          payment={editingPayment}
          onClose={() => setEditingPayment(null)}
          onSaved={(updated) => {
            setOrder(updated);
            setEditingPayment(null);
          }}
        />
      )}

      {showAddPayment && (
        <Dialog open onOpenChange={(open) => !open && setShowAddPayment(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>تسجيل دفعة على فاتورة {order.invoiceNumber}</DialogTitle>
            </DialogHeader>
            <form onSubmit={submitPayment} className="space-y-3">
              {paymentError && <p className="text-destructive text-sm">{paymentError}</p>}
              <p className="text-muted-foreground text-sm">
                المتبقي: <span className="font-bold" dir="ltr">{order.remainingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> ج.م
              </p>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">المبلغ</span>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">طريقة التحصيل</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                >
                  {PAYMENT_METHOD_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={paymentSaving}>
                  {paymentSaving ? 'جارٍ الحفظ…' : 'تأكيد الدفعة'}
                </Button>
                <Button type="button" variant="secondary" onClick={() => setShowAddPayment(false)}>
                  إلغاء
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

/** Owner (2026-08-20, "تعديل المدفوع") — edits an already-recorded payment's amount/method; the linked TreasuryEntry (and a closed treasury day, if the payment landed on one) update in the same transaction server-side. */
function EditPaymentDialog({
  orderId,
  payment,
  onClose,
  onSaved,
}: {
  orderId: string;
  payment: Payment;
  onClose: () => void;
  onSaved: (order: Order) => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState<PaymentMethod>(payment.method);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed <= 0) {
      setError('اكتب مبلغ أكبر من صفر');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiPut<Order>(`/api/orders/${orderId}/payments/${payment.id}`, { amount: parsed, method });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تعديل الدفعة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تعديل دفعة</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المبلغ</span>
            <input
              autoFocus
              type="number"
              min={0}
              step="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">طريقة التحصيل</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {PAYMENT_METHOD_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ التعديل'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Owner (2026-08-23, "مرتجعات: عمل مرتجع... يقدر يحدّد الكمية المرتجعة")
 * — scoped to INVENTORY_RETAIL items with returnable quantity left
 * (`OrderDocumentPage`'s `returnableItems`). Restocks inventory and
 * refunds cash server-side, atomically — see `orderService.createReturn`.
 */
function AddReturnDialog({
  orderId,
  returnableItems,
  onClose,
  onSaved,
}: {
  orderId: string;
  returnableItems: { item: OrderItem; name: string; returnable: number }[];
  onClose: () => void;
  onSaved: (order: Order) => void;
}) {
  const [itemId, setItemId] = useState(returnableItems[0]?.item.id ?? '');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const selected = returnableItems.find((r) => r.item.id === itemId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const parsed = Number(quantity);
    if (!itemId) {
      setError('اختر الصنف');
      return;
    }
    if (!quantity || Number.isNaN(parsed) || parsed <= 0) {
      setError('اكتب كمية أكبر من صفر');
      return;
    }
    if (!Number.isInteger(parsed)) {
      setError('الكمية لازم تكون رقم صحيح، مش كسر');
      return;
    }
    if (selected && parsed > selected.returnable) {
      setError(`أقصى كمية قابلة للإرجاع: ${selected.returnable}`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const updated = await apiPost<Order>(`/api/orders/${orderId}/items/${itemId}/return`, {
        quantity: parsed,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل المرتجع');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>مرتجع</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">الصنف</span>
            <select
              value={itemId}
              onChange={(e) => {
                setItemId(e.target.value);
                setQuantity('');
              }}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            >
              {returnableItems.map(({ item, name, returnable }) => (
                <option key={item.id} value={item.id}>
                  {name} (المتاح للإرجاع: {returnable})
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">الكمية المرتجعة</span>
            <input
              autoFocus
              type="number"
              min={0}
              max={selected?.returnable}
              step="1"
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">السبب (اختياري)</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'تأكيد المرتجع'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              إلغاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
