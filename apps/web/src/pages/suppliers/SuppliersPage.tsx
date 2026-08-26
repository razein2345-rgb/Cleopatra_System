import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { BranchSummary, CreateBusinessPartnerInput, SupplierDebtOverview, SupplierSummary } from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

/**
 * صفحة الموردين — جزء 3 من مبادرة "فصل الخزينة/الربح بالفرع + الموردين +
 * التقارير" (docs/AI/PROJECT_STATUS.md § 6). owner: "صفحة الموردين منفصله
 * عن صفحة العملا... كل مورد معروف بتعامل معاه كل قد ايه بوردله فلوس وهو
 * ليه كام عندي بالظبط". Standalone page (own route/nav entry), but the
 * underlying record IS a BusinessPartner with the SUPPLIER role (shared
 * data, per the agreed "صفحة مستقلة، بيانات مشتركة" architecture) — a
 * supplier created here shows up in /partners too, and vice versa.
 */
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

export function SuppliersPage() {
  const { can } = useAuth();
  const [suppliers, setSuppliers] = useState<SupplierSummary[] | null>(null);
  const [overview, setOverview] = useState<SupplierDebtOverview | null>(null);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    Promise.all([
      apiGet<SupplierSummary[]>('/api/suppliers'),
      apiGet<SupplierDebtOverview>('/api/suppliers/debt-overview'),
      apiGet<BranchSummary[]>('/api/branches'),
    ])
      .then(([s, o, b]) => {
        setSuppliers(s);
        setOverview(o);
        setBranches(b);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الموردين'));
  };

  useEffect(load, []);

  if (error) return <div className="text-destructive">{error}</div>;
  if (!suppliers) return <div className="text-muted-foreground">جارٍ تحميل الموردين…</div>;

  const filtered = search.trim()
    ? suppliers.filter((s) => s.nameAr.includes(search.trim()) || (s.phone ?? '').includes(search.trim()))
    : suppliers;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">الموردين</h1>
        {can('suppliers.create') && (
          <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ مورّد جديد'}</Button>
        )}
      </div>

      {overview && (
        <div className="border-border bg-card rounded-2xl border p-4">
          <p className="text-muted-foreground text-xs">إجمالي الديون عليك للموردين</p>
          <p className={`text-2xl font-bold ${overview.totalOwedToSuppliers > 0 ? 'text-destructive' : ''}`}>
            {fmt(overview.totalOwedToSuppliers)}
          </p>
          <p className="text-muted-foreground text-xs">{overview.supplierCount} مورّد</p>
        </div>
      )}

      {showCreate && (
        <CreateSupplierForm
          branches={branches}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="بحث بالاسم أو الهاتف…"
        className="border-input bg-background w-full max-w-sm rounded-md border px-3 py-2 text-sm"
      />

      <div className="border-border bg-card overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-3">المورّد</th>
              <th className="p-3">الهاتف</th>
              <th className="p-3">شروط الدفع</th>
              <th className="p-3">إجمالي المشتريات</th>
              <th className="p-3">إجمالي المدفوعات</th>
              <th className="p-3">المتبقي عليك</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.partnerId} className="border-border border-b last:border-0">
                <td className="p-3 font-medium">
                  <Link to={`/suppliers/${s.partnerId}`} className="hover:underline">
                    {s.nameAr}
                  </Link>
                </td>
                <td className="text-muted-foreground p-3">{s.phone ?? '—'}</td>
                <td className="text-muted-foreground p-3">
                  {s.paymentTermsDays == null ? '—' : s.paymentTermsDays === 0 ? 'فوري' : `آجل ${s.paymentTermsDays} يوم`}
                </td>
                <td className="p-3">{fmt(s.totalPurchases)}</td>
                <td className="p-3">{fmt(s.totalPayments)}</td>
                <td className={`p-3 font-semibold ${s.balance > 0 ? 'text-destructive' : ''}`}>{fmt(s.balance)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-3" colSpan={6}>
                  لا يوجد موردين بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CreateSupplierForm({ branches, onCreated }: { branches: BranchSummary[]; onCreated: () => void }) {
  const [nameAr, setNameAr] = useState('');
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateBusinessPartnerInput = {
        nameAr,
        branchId,
        phone: phone || undefined,
        roles: ['SUPPLIER'],
      };
      await apiPost('/api/partners', input);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء المورّد');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          required
          placeholder="اسم المورّد"
          value={nameAr}
          onChange={(e) => setNameAr(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-2"
        />
        <select
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        >
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <input
          placeholder="الهاتف (اختياري)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-3"
        />
      </div>
      <Button type="submit" disabled={submitting}>
        {submitting ? 'جارٍ الإنشاء…' : 'إنشاء المورّد'}
      </Button>
    </form>
  );
}
