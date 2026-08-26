import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ItemReorderOverride, Order } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPut } from '@/lib/api';
import { whatsappLink } from '@/lib/whatsapp';
import { useAuth } from '@/state/AuthContext';
import { Button } from '@/components/ui/button';
import { buildItemGroups, isOverdue, isSoon, resolveEffectiveDate, type ItemGroup } from '@/lib/reorderPrediction';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

/**
 * Owner (2026-08-26, "رسالة جاهزة بالأصناف اللي قربت تخلص اول ما ادوس على
 * اللينك تتكتب للعميل وانا ابعتها") — a draft message pre-filled into the
 * wa.me compose box, listing only the items due-or-overdue (not every
 * item ever bought). The staff member still reviews and presses send
 * themselves; nothing here sends automatically.
 */
function buildReminderMessage(partnerName: string | undefined, items: ItemGroup[]): string {
  const lines = items.map((g) => `- ${g.label}`);
  const greeting = partnerName ? `مرحبًا ${partnerName} 👋` : 'مرحبًا 👋';
  return [
    greeting,
    'حبينا نفكرك إن الأصناف دي قربت تخلص عندك وممكن تحتاج تطلب تاني قريب:',
    ...lines,
    '',
    'لو حابب تطلب، إحنا في الخدمة.',
  ].join('\n');
}

interface EditDraft {
  dailyConsumptionRate: string;
  manualNextDate: string;
}

export function ReorderPredictionTab({
  partnerId,
  partnerName,
  partnerPhone,
}: {
  partnerId: string;
  partnerName?: string;
  partnerPhone?: string | null;
}) {
  const { can } = useAuth();
  const canEdit = can('orders.edit');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [overrides, setOverrides] = useState<ItemReorderOverride[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft>({ dailyConsumptionRate: '', manualNextDate: '' });
  const [saving, setSaving] = useState(false);

  const loadOverrides = () => {
    apiGet<ItemReorderOverride[]>(`/api/partners/${partnerId}/reorder-overrides`)
      .then(setOverrides)
      .catch(() => setOverrides([]));
  };

  useEffect(() => {
    apiGet<Order[]>(`/api/orders?partnerId=${partnerId}`)
      .then(setOrders)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات الطلبات'));
    loadOverrides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId]);

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!orders || !overrides) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  const overrideByKey = new Map(overrides.map((o) => [o.itemKey, o]));
  const groups = buildItemGroups(orders);
  const now = Date.now();

  // Re-sort by the *effective* date (auto heuristic, unless a manual
  // override replaces it) — a manual override should move an item to the
  // top of the list just as much as the auto estimate would.
  const effectiveByKey = new Map(groups.map((g) => [g.key, resolveEffectiveDate(g, overrideByKey.get(g.key))]));
  const sortedGroups = [...groups].sort((a, b) => {
    const da = effectiveByKey.get(a.key) ?? null;
    const db = effectiveByKey.get(b.key) ?? null;
    if (da && db) return da.getTime() - db.getTime();
    if (da) return -1;
    if (db) return 1;
    return new Date(b.lastOrderDate).getTime() - new Date(a.lastOrderDate).getTime();
  });

  const dueItems = sortedGroups.filter((g) => {
    const d = effectiveByKey.get(g.key);
    return d && (isOverdue(d, now) || isSoon(d, now));
  });
  const reminderLink =
    dueItems.length > 0 ? whatsappLink(partnerPhone, buildReminderMessage(partnerName, dueItems)) : null;

  const startEdit = (g: ItemGroup) => {
    const existing = overrideByKey.get(g.key);
    setEditingKey(g.key);
    setDraft({
      dailyConsumptionRate: existing?.dailyConsumptionRate != null ? String(existing.dailyConsumptionRate) : '',
      manualNextDate: existing?.manualNextDate ? existing.manualNextDate.slice(0, 10) : '',
    });
  };

  const saveOverride = async (g: ItemGroup) => {
    setSaving(true);
    try {
      await apiPut(`/api/partners/${partnerId}/reorder-overrides/${encodeURIComponent(g.key)}`, {
        itemLabel: g.label,
        dailyConsumptionRate: draft.dailyConsumptionRate ? Number(draft.dailyConsumptionRate) : null,
        manualNextDate: draft.manualNextDate || null,
      });
      setEditingKey(null);
      loadOverrides();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ التعديل');
    } finally {
      setSaving(false);
    }
  };

  const clearOverride = async (g: ItemGroup) => {
    setSaving(true);
    try {
      await apiDelete(`/api/partners/${partnerId}/reorder-overrides/${encodeURIComponent(g.key)}`);
      setEditingKey(null);
      loadOverrides();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر مسح التعديل');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">
        تقدير تقريبي بناءً على متوسط الفترة بين طلبات العميل السابقة لكل صنف — مش تنبؤ ذكاء اصطناعي. تقدر تعدّل الموعد
        المتوقع يدويًا لأي صنف (بمعدل استهلاك يومي أو بتاريخ مباشر) لو عندك معلومة أدق من الحساب التلقائي.
      </p>
      {reminderLink && (
        <a
          href={reminderLink}
          target="_blank"
          rel="noreferrer"
          className="bg-success/10 text-success inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium hover:underline"
        >
          📩 ابعت تذكير واتساب للعميل بالأصناف اللي قربت تخلص ({dueItems.length})
        </a>
      )}
      <div className="border-border overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="p-2 text-start">الصنف</th>
              <th className="p-2 text-start">عدد مرّات الشراء</th>
              <th className="p-2 text-start">آخر مرة اتشرى</th>
              <th className="p-2 text-start">متوسط الفترة بين الطلبات</th>
              <th className="p-2 text-start">متوقّع يحتاج تاني</th>
              {canEdit && <th className="p-2 text-start"></th>}
            </tr>
          </thead>
          <tbody>
            {sortedGroups.map((g) => {
              const override = overrideByKey.get(g.key);
              const effective = effectiveByKey.get(g.key) ?? null;
              const isManual = Boolean(override?.manualNextDate || override?.dailyConsumptionRate);
              return (
                <Fragment key={g.key}>
                  <tr className="border-border border-t">
                    <td className="p-2 font-medium">{g.label}</td>
                    <td className="p-2">
                      {g.orderCount} ({money(g.totalQuantity)} قطعة إجمالاً)
                    </td>
                    <td className="p-2">
                      <Link to={`/orders/${g.lastOrderId}`} className="text-primary hover:underline">
                        {new Date(g.lastOrderDate).toLocaleDateString('ar-EG')}
                      </Link>
                      <span className="text-muted-foreground"> ({g.lastInvoiceNumber})</span>
                    </td>
                    <td className="p-2">
                      {g.avgGapDays !== null ? `كل ${Math.round(g.avgGapDays)} يوم تقريبًا` : '—'}
                    </td>
                    <td
                      className={`p-2 font-medium ${
                        effective && isOverdue(effective, now)
                          ? 'text-destructive'
                          : effective && isSoon(effective, now)
                            ? 'text-warning'
                            : ''
                      }`}
                    >
                      {effective ? effective.toLocaleDateString('ar-EG') : 'محتاج طلبين على الأقل للتقدير'}
                      {isManual && <span className="text-muted-foreground text-xs font-normal"> (تعديل يدوي)</span>}
                    </td>
                    {canEdit && (
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => (editingKey === g.key ? setEditingKey(null) : startEdit(g))}
                        >
                          {editingKey === g.key ? 'إلغاء' : 'تعديل'}
                        </Button>
                      </td>
                    )}
                  </tr>
                  {canEdit && editingKey === g.key && (
                    <tr className="bg-muted/20 border-border border-t">
                      <td colSpan={6} className="p-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <label className="space-y-1 text-xs">
                            <span className="text-muted-foreground block">معدل الاستهلاك اليومي (قطعة/يوم)</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={draft.dailyConsumptionRate}
                              onChange={(e) => setDraft((d) => ({ ...d, dailyConsumptionRate: e.target.value }))}
                              className="border-input bg-background w-40 rounded-md border px-2 py-1.5 text-sm"
                              placeholder="مثلاً 5"
                            />
                          </label>
                          <label className="space-y-1 text-xs">
                            <span className="text-muted-foreground block">أو تاريخ متوقّع مباشر</span>
                            <input
                              type="date"
                              value={draft.manualNextDate}
                              onChange={(e) => setDraft((d) => ({ ...d, manualNextDate: e.target.value }))}
                              className="border-input bg-background rounded-md border px-2 py-1.5 text-sm"
                            />
                          </label>
                          <Button type="button" size="sm" disabled={saving} onClick={() => void saveOverride(g)}>
                            حفظ
                          </Button>
                          {override && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={saving}
                              onClick={() => void clearOverride(g)}
                            >
                              مسح التعديل (رجوع للحساب التلقائي)
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sortedGroups.length === 0 && (
              <tr>
                <td colSpan={6} className="text-muted-foreground p-4 text-center">
                  لا توجد بيانات كافية بعد لتوقّع أي صنف.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
