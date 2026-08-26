import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReportsOverview } from '@cleopatra/shared';
import { apiGet } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PAYMENT_METHOD_LABELS } from '@/pages/partners/partnerLabels';
import { WALLET_COLORS } from '@/pages/treasury/treasuryLabels';
import { downloadDocumentAsPdf } from '@/lib/documents/exportPdf';

const money = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });
const dateOnly = (iso: string) => new Date(iso).toLocaleDateString('ar-EG');

type TabId = 'debts' | 'invoices' | 'expenses' | 'transfers' | 'purchases' | 'inventory' | 'employees';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'debts', label: 'ديون العملاء' },
  { id: 'invoices', label: 'فواتير البيع' },
  { id: 'expenses', label: 'المصروفات' },
  { id: 'transfers', label: 'التحويلات' },
  { id: 'purchases', label: 'المشتريات' },
  { id: 'inventory', label: 'المخزن' },
  { id: 'employees', label: 'مدفوعات الموظفين' },
];

const INVENTORY_MOVEMENT_LABELS: Record<'IN' | 'OUT' | 'ADJUSTMENT', string> = {
  IN: 'وارد',
  OUT: 'صادر',
  ADJUSTMENT: 'تسوية',
};

const EMPLOYEE_PAYMENT_KIND_LABELS: Record<'SALARY_PAYMENT' | 'EMPLOYEE_ADVANCE' | 'EMPLOYEE_ADVANCE_REPAYMENT', string> = {
  SALARY_PAYMENT: 'صرف مرتب',
  EMPLOYEE_ADVANCE: 'سلفة',
  EMPLOYEE_ADVANCE_REPAYMENT: 'سداد سلفة',
};

/**
 * صفحة التقارير الشاملة — جزء 6 (الأخير عمدًا) من مبادرة "فصل الخزينة/
 * الربح بالفرع + الموردين + التقارير" (docs/AI/PROJECT_STATUS.md § 6).
 * تصميم مطابق لصور مرجعية اتبعتت: أرصدة لكل طريقة دفع بفترة زمنية + جدول
 * تفصيلي متبوّب. مجمّعة لكل الشركة (owner صريح) — مفيش فلتر فرع هنا، بعكس
 * ويدجت "صافي الربح بالفرع" في جزء 2.
 */
export function ReportsOverviewPage() {
  const [overview, setOverview] = useState<ReportsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tab, setTab] = useState<TabId>('debts');

  const load = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    apiGet<ReportsOverview>(`/api/reports/overview${qs ? `?${qs}` : ''}`)
      .then(setOverview)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل التقارير'));
  };

  useEffect(load, [from, to]);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!overview) return <div className="text-muted-foreground">جارٍ التحميل…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-2xl font-bold">التقارير</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            طباعة
          </Button>
          <Button variant="outline" onClick={() => downloadDocumentAsPdf('تقرير-الحركات')}>
            تنزيل PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">من تاريخ</span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">إلى تاريخ</span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="border-input bg-background rounded-md border px-3 py-2 text-sm"
          />
        </label>
        {(from || to) && (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            مسح الفترة
          </Button>
        )}
      </div>

      <div className="document-print-root space-y-4">
        <div className="hidden print:block">
          <h2 className="text-lg font-bold">تقرير الحركات للفترة الزمنية</h2>
          {(from || to) && (
            <p className="text-muted-foreground text-sm">
              الفترة: {from || 'البداية'} — {to || 'اليوم'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {overview.byPaymentMethod.map(({ method, balance }) => {
            const colors = WALLET_COLORS[method as keyof typeof WALLET_COLORS];
            return (
              <Card key={method} className={`p-4 ${colors?.bg ?? ''}`}>
                <p className={`text-sm ${colors?.text ?? ''}`}>{PAYMENT_METHOD_LABELS[method as keyof typeof PAYMENT_METHOD_LABELS] ?? method}</p>
                <p className={`text-lg font-bold ${colors?.text ?? ''}`}>{money(balance)}</p>
              </Card>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Card className="p-4">
            <p className="text-muted-foreground text-xs">إجمالي الوارد</p>
            <p className="text-lg font-bold">{money(overview.totalIncome)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-muted-foreground text-xs">إجمالي المصروفات</p>
            <p className="text-lg font-bold">{money(overview.totalExpense)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-muted-foreground text-xs">إجمالي التحويلات</p>
            <p className="text-lg font-bold">{money(overview.totalTransfer)}</p>
          </Card>
          <Card className="p-4">
            <p className="text-muted-foreground text-xs">إجمالي ديون العملاء (الحالة الحالية)</p>
            <p className={`text-lg font-bold ${overview.totalCustomerDebt > 0 ? 'text-destructive' : ''}`}>
              {money(overview.totalCustomerDebt)}
            </p>
          </Card>
        </div>

        <div>
          <div className="border-border mb-3 flex flex-wrap gap-4 border-b text-sm print:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={
                  tab === t.id
                    ? 'text-primary border-primary -mb-px border-b-2 px-1 pb-2 font-semibold'
                    : 'text-muted-foreground hover:text-foreground px-1 pb-2'
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="hidden print:block">
            {TABS.map((t) => (
              <h3 key={t.id} className="mt-4 font-bold">
                {t.label}
              </h3>
            ))}
          </div>

          {tab === 'debts' && (
            <div className="border-border overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">العميل</th>
                    <th className="p-2 text-start">المستحق</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.customerDebts.map((d) => (
                    <tr key={d.partnerId} className="border-border border-t">
                      <td className="p-2">
                        <Link to={`/partners/${d.partnerId}`} className="text-primary hover:underline print:no-underline print:text-inherit">
                          {d.nameAr}
                        </Link>
                      </td>
                      <td className="text-destructive p-2 font-semibold">{money(d.outstanding)}</td>
                    </tr>
                  ))}
                  {overview.customerDebts.length === 0 && (
                    <tr>
                      <td colSpan={2} className="text-muted-foreground p-4 text-center">
                        لا يوجد عملاء عليهم مديونية حاليًا.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'invoices' && (
            <div className="border-border overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">رقم الفاتورة</th>
                    <th className="p-2 text-start">التاريخ</th>
                    <th className="p-2 text-start">العميل</th>
                    <th className="p-2 text-start">الإجمالي</th>
                    <th className="p-2 text-start">المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.salesInvoices.map((o) => (
                    <tr key={o.orderId} className="border-border border-t">
                      <td className="p-2">
                        <Link to={`/orders/${o.orderId}`} className="text-primary hover:underline print:no-underline print:text-inherit">
                          {o.invoiceNumber}
                        </Link>
                      </td>
                      <td className="p-2">{dateOnly(o.date)}</td>
                      <td className="p-2">{o.partnerName ?? '—'}</td>
                      <td className="p-2">{money(o.finalTotal)}</td>
                      <td className={`p-2 ${o.remainingBalance > 0 ? 'text-destructive' : ''}`}>{money(o.remainingBalance)}</td>
                    </tr>
                  ))}
                  {overview.salesInvoices.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted-foreground p-4 text-center">
                        لا توجد فواتير في هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {(tab === 'expenses' || tab === 'transfers') && (
            <div className="border-border overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">التاريخ</th>
                    <th className="p-2 text-start">المبلغ</th>
                    <th className="p-2 text-start">طريقة الدفع</th>
                    <th className="p-2 text-start">التصنيف</th>
                    <th className="p-2 text-start">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {(tab === 'expenses' ? overview.expenses : overview.transfers).map((e) => (
                    <tr key={e.id} className="border-border border-t">
                      <td className="p-2">{dateOnly(e.date)}</td>
                      <td className="p-2">{money(e.amount)}</td>
                      <td className="p-2">{e.method ? (PAYMENT_METHOD_LABELS[e.method as keyof typeof PAYMENT_METHOD_LABELS] ?? e.method) : '—'}</td>
                      <td className="p-2">{e.category ?? '—'}</td>
                      <td className="text-muted-foreground p-2">{e.note ?? e.partnerName ?? '—'}</td>
                    </tr>
                  ))}
                  {(tab === 'expenses' ? overview.expenses : overview.transfers).length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted-foreground p-4 text-center">
                        لا توجد حركات في هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'purchases' && (
            <div className="border-border overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">التاريخ</th>
                    <th className="p-2 text-start">المورّد</th>
                    <th className="p-2 text-start">المبلغ</th>
                    <th className="p-2 text-start">البيان</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.purchases.map((p) => (
                    <tr key={p.id} className="border-border border-t">
                      <td className="p-2">{dateOnly(p.date)}</td>
                      <td className="p-2">{p.supplierName}</td>
                      <td className="p-2">{money(p.amount)}</td>
                      <td className="text-muted-foreground p-2">{p.description ?? '—'}</td>
                    </tr>
                  ))}
                  {overview.purchases.length === 0 && (
                    <tr>
                      <td colSpan={4} className="text-muted-foreground p-4 text-center">
                        لا توجد مشتريات من الموردين في هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'inventory' && (
            <div className="border-border overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">التاريخ</th>
                    <th className="p-2 text-start">الصنف</th>
                    <th className="p-2 text-start">النوع</th>
                    <th className="p-2 text-start">الكمية</th>
                    <th className="p-2 text-start">المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.inventoryMovements.map((m) => (
                    <tr key={m.id} className="border-border border-t">
                      <td className="p-2">{dateOnly(m.date)}</td>
                      <td className="p-2">{m.itemName}</td>
                      <td className="p-2">{INVENTORY_MOVEMENT_LABELS[m.type]}</td>
                      <td className="p-2">{m.quantity}</td>
                      <td className="text-muted-foreground p-2">{m.reference ?? '—'}</td>
                    </tr>
                  ))}
                  {overview.inventoryMovements.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted-foreground p-4 text-center">
                        لا توجد حركات مخزون في هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'employees' && (
            <div className="border-border overflow-hidden rounded-2xl border">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start">التاريخ</th>
                    <th className="p-2 text-start">الموظف</th>
                    <th className="p-2 text-start">النوع</th>
                    <th className="p-2 text-start">المبلغ</th>
                    <th className="p-2 text-start">ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.employeePayments.map((e) => (
                    <tr key={e.id} className="border-border border-t">
                      <td className="p-2">{dateOnly(e.date)}</td>
                      <td className="p-2">{e.staffName}</td>
                      <td className="p-2">{EMPLOYEE_PAYMENT_KIND_LABELS[e.kind]}</td>
                      <td className="p-2">{money(e.amount)}</td>
                      <td className="text-muted-foreground p-2">{e.note ?? '—'}</td>
                    </tr>
                  ))}
                  {overview.employeePayments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-muted-foreground p-4 text-center">
                        لا توجد مدفوعات موظفين في هذه الفترة.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
