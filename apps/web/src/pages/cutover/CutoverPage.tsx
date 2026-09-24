import { useEffect, useState } from 'react';
import type { BranchSummary, CutoverRecord, InventoryItem, InventoryOpening, TreasuryOpening } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
// Cutover-revision-round decision (post-3D) — Badge introduced here purely
// as a cosmetic swap for the plain-text status this page already showed;
// deliberately NOT bundled with any `selfApprovedException` logic change
// (that field/behavior was already fully implemented in the services
// round). Kept as its own distinguishable diff on purpose, per the
// owner's explicit instruction to never blend a cosmetic change into a
// logic-change commit.
import { Badge } from '@/components/ui/badge';
import { InventoryItemCombobox } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * Opening State / Cutover (Phase 3C.2) — the minimum frontend needed to
 * actually use the backend feature: create a branch's Cutover, add its
 * opening lines, verify/submit/approve/activate/reopen/supersede it.
 * Every sensitive action still relies on the SERVER re-checking role/
 * maker-checker/branch access — the UI only hides buttons that would be
 * rejected anyway, it is never the source of truth for authorization.
 */

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

// The API returns these as raw enum values; the UI is Arabic-only, so every
// place that shows one goes through a label map (unknown values fall back to
// the raw value rather than rendering blank).
const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'مسودة',
  REVIEW: 'قيد المراجعة',
  APPROVED: 'معتمد',
  ACTIVE: 'مُفعّل',
};
const VERIFICATION_LABELS: Record<string, string> = { UNVERIFIED: 'لم يتم التحقق', VERIFIED: 'تم التحقق' };
const METHOD_LABELS: Record<string, string> = {
  CASH: 'كاش',
  VODAFONE_CASH: 'فودافون كاش',
  INSTAPAY: 'انستاباي',
  BANK_ACCOUNT: 'حساب بنكي',
};
const label = (map: Record<string, string>, key: string) => map[key] ?? key;

type CutoverDetail = CutoverRecord & { treasuryOpenings: TreasuryOpening[]; inventoryOpenings: InventoryOpening[] };

export function CutoverPage() {
  const { authContext } = useAuth();
  const [cutovers, setCutovers] = useState<CutoverRecord[]>([]);
  const [selected, setSelected] = useState<CutoverDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);

  const roleNames = authContext?.user.roles.map((r) => r.name) ?? [];
  const isSuperAdmin = roleNames.includes('SUPER_ADMIN');
  const isAdmin = roleNames.includes('ADMIN') || isSuperAdmin;
  const staffId = authContext?.user.id;

  const load = () => {
    apiGet<CutoverRecord[]>('/api/cutover')
      .then(setCutovers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل قائمة الـCutover'));
  };
  useEffect(load, []);
  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches').then(setBranches).catch(() => undefined);
    apiGet<InventoryItem[]>('/api/inventory-items').then(setInventoryItems).catch(() => undefined);
  }, []);
  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? '—';
  const itemName = (id: string) => inventoryItems.find((i) => i.id === id)?.name ?? '—';

  const loadDetail = (id: string) => {
    apiGet<CutoverDetail>(`/api/cutover/${id}`)
      .then(setSelected)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل التفاصيل'));
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      load();
      if (selected) loadDetail(selected.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ العملية');
    }
  };

  const canApproveThis = selected && staffId && (selected.createdById !== staffId || isAdmin);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cutover — الرصيد الافتتاحي عند بدء التشغيل</h1>
        <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ Cutover جديد'}</Button>
      </div>
      {error && <div className="text-destructive text-sm">{error}</div>}

      {showCreate && (
        <CreateCutoverForm
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="border-border bg-card space-y-2 rounded-2xl border p-4 md:col-span-1">
          <p className="font-semibold">القائمة</p>
          {cutovers.length === 0 && <p className="text-muted-foreground text-sm">لا يوجد أي Cutover بعد.</p>}
          {cutovers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => loadDetail(c.id)}
              className={`border-border block w-full rounded-md border p-2 text-start text-sm ${selected?.id === c.id ? 'bg-accent' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span>
                  {branchName(c.branchId)} — {c.goLiveDate}
                </span>
                <span className="text-xs">{label(STATUS_LABELS, c.status)}{c.isSuperseded ? ' (أُلغي نهائيًا)' : ''}</span>
              </div>
            </button>
          ))}
        </div>

        {selected && (
          <div className="border-border bg-card space-y-4 rounded-2xl border p-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-semibold">Cutover {branchName(selected.branchId)} — {selected.goLiveDate}</p>
                <p className="text-muted-foreground text-xs">
                  آخر يوم يدوي: {selected.lastManualDate} · الحالة: {label(STATUS_LABELS, selected.status)}
                </p>
                {/* Cutover-revision-round decision (post-3D) — the logic (selfApprovedException itself) was already implemented in the services round; only its display here is new. */}
                {selected.selfApprovedException && <Badge variant="destructive">⚠️ تم الاعتماد ذاتيًا (استثناء طارئ)</Badge>}
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.status === 'DRAFT' && (
                  <Button size="sm" onClick={() => runAction(() => apiPost(`/api/cutover/${selected.id}/submit`, {}))}>
                    إرسال للمراجعة
                  </Button>
                )}
                {selected.status === 'REVIEW' && (
                  <Button size="sm" disabled={!canApproveThis} onClick={() => runAction(() => apiPost(`/api/cutover/${selected.id}/approve`, {}))}>
                    اعتماد
                  </Button>
                )}
                {selected.status === 'APPROVED' && isSuperAdmin && (
                  <Button size="sm" onClick={() => runAction(() => apiPost(`/api/cutover/${selected.id}/activate`, {}))}>
                    تفعيل (بدء التشغيل)
                  </Button>
                )}
                {(selected.status === 'APPROVED' || selected.status === 'ACTIVE') && isAdmin && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const reason = window.prompt('سبب إعادة الفتح؟');
                      if (reason) runAction(() => apiPost(`/api/cutover/${selected.id}/reopen`, { reason }));
                    }}
                  >
                    إعادة فتح
                  </Button>
                )}
                {isSuperAdmin && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      const reason = window.prompt('سبب الإلغاء النهائي؟ — سيسمح بإنشاء Cutover جديد لهذا الفرع');
                      if (reason) runAction(() => apiPost(`/api/cutover/${selected.id}/supersede`, { reason }));
                    }}
                  >
                    إلغاء نهائي
                  </Button>
                )}
              </div>
            </div>

            {selected.status === 'DRAFT' && (
              <>
                <AddTreasuryOpeningForm cutoverId={selected.id} onAdded={() => loadDetail(selected.id)} />
                <AddInventoryOpeningForm cutoverId={selected.id} items={inventoryItems} onAdded={() => loadDetail(selected.id)} />
              </>
            )}

            <div>
              <p className="mb-1 text-sm font-semibold">رصيد الخزينة الافتتاحي</p>
              <table className="w-full text-sm">
                <tbody>
                  {selected.treasuryOpenings.map((t) => (
                    <tr key={t.id} className="border-border border-b">
                      <td className="p-2">{label(METHOD_LABELS, t.method)}</td>
                      <td className="p-2" dir="ltr">{fmt(t.amount)}</td>
                      <td className="p-2 text-xs">{label(VERIFICATION_LABELS, t.verificationStatus)}</td>
                      {selected.status === 'DRAFT' && t.verificationStatus === 'UNVERIFIED' && (
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-primary text-xs hover:underline"
                            onClick={() =>
                              runAction(() =>
                                apiPut(`/api/cutover/treasury-openings/${t.id}/verify`, { verificationStatus: 'VERIFIED' }),
                              )
                            }
                          >
                            تحقق
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {selected.treasuryOpenings.length === 0 && (
                    <tr>
                      <td className="text-muted-foreground p-2" colSpan={4}>لا يوجد بنود بعد.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold">الرصيد الافتتاحي للمخزون</p>
              <table className="w-full text-sm">
                <tbody>
                  {selected.inventoryOpenings.map((i) => (
                    <tr key={i.id} className="border-border border-b">
                      <td className="p-2">{itemName(i.inventoryItemId)}</td>
                      <td className="p-2" dir="ltr">{fmt(i.quantity)}</td>
                      <td className="p-2 text-xs">{label(VERIFICATION_LABELS, i.verificationStatus)}</td>
                      <td className="p-2 text-xs">{i.activatedAt ? `مُفعّل — ${new Date(i.activatedAt).toLocaleDateString('ar-EG')}` : '—'}</td>
                      {selected.status === 'DRAFT' && i.verificationStatus === 'UNVERIFIED' && (
                        <td className="p-2">
                          <button
                            type="button"
                            className="text-primary text-xs hover:underline"
                            onClick={() =>
                              runAction(() =>
                                apiPut(`/api/cutover/inventory-openings/${i.id}/verify`, { verificationStatus: 'VERIFIED' }),
                              )
                            }
                          >
                            تحقق
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                  {selected.inventoryOpenings.length === 0 && (
                    <tr>
                      <td className="text-muted-foreground p-2" colSpan={4}>لا يوجد أصناف بعد.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CreateCutoverForm({ onCreated }: { onCreated: () => void }) {
  const { authContext } = useAuth();
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [branchId, setBranchId] = useState('');
  const [lastManualDate, setLastManualDate] = useState('');
  const [goLiveDate, setGoLiveDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<BranchSummary[]>('/api/branches')
      .then(setBranches)
      .catch(() => setError('تعذر تحميل قائمة الفروع'));
  }, []);
  // Same "don't offer a branch the backend will just reject" narrowing as
  // TreasuryPage/SupplierDetailPage — the server still re-checks branch
  // access on create; this only keeps the list honest.
  const isSuperAdmin = authContext?.user.roles.some((r) => r.name === 'SUPER_ADMIN') ?? false;
  const accessibleBranches = isSuperAdmin ? branches : branches.filter((b) => authContext?.user.accessibleBranchIds.includes(b.id));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await apiPost('/api/cutover', { branchId, lastManualDate, goLiveDate, notes: notes || undefined });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الـCutover');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-2xl border p-4">
      <p className="font-semibold">Cutover جديد</p>
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">الفرع</span>
          <select required value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm">
            <option value="">اختر الفرع…</option>
            {accessibleBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">آخر يوم يدوي</span>
          <input required type="date" value={lastManualDate} onChange={(e) => setLastManualDate(e.target.value)} className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm" />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground block">تاريخ الـGo-Live</span>
          <input required type="date" value={goLiveDate} onChange={(e) => setGoLiveDate(e.target.value)} className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm" />
        </label>
        <input placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} className="border-input bg-background rounded-md border px-3 py-2 text-sm" />
      </div>
      <Button type="submit" disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'إنشاء'}</Button>
    </form>
  );
}

function AddTreasuryOpeningForm({ cutoverId, onAdded }: { cutoverId: string; onAdded: () => void }) {
  const [method, setMethod] = useState('CASH');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiPost(`/api/cutover/${cutoverId}/treasury-openings`, { method, amount: Number(amount) });
      setAmount('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الإضافة');
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 text-sm">
      <span className="font-semibold">+ رصيد خزينة افتتاحي:</span>
      {error && <span className="text-destructive">{error}</span>}
      <select value={method} onChange={(e) => setMethod(e.target.value)} className="border-input bg-background rounded-md border px-2 py-1">
        <option value="CASH">كاش</option>
        <option value="VODAFONE_CASH">فودافون كاش</option>
        <option value="INSTAPAY">انستاباي</option>
        <option value="BANK_ACCOUNT">حساب بنكي</option>
      </select>
      <input required type="number" min={0} step="0.01" placeholder="المبلغ" value={amount} onChange={(e) => setAmount(e.target.value)} className="border-input bg-background w-32 rounded-md border px-2 py-1" />
      <Button size="sm" type="submit">إضافة</Button>
    </form>
  );
}

function AddInventoryOpeningForm({ cutoverId, items, onAdded }: { cutoverId: string; items: InventoryItem[]; onAdded: () => void }) {
  const [inventoryItemId, setInventoryItemId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!inventoryItemId) {
      setError('اختر الصنف أولًا');
      return;
    }
    try {
      await apiPost(`/api/cutover/${cutoverId}/inventory-openings`, { inventoryItemId, quantity: Number(quantity) });
      setInventoryItemId('');
      setQuantity('');
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الإضافة');
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 text-sm">
      <span className="font-semibold">+ رصيد مخزون افتتاحي:</span>
      {error && <span className="text-destructive">{error}</span>}
      <InventoryItemCombobox items={items} value={inventoryItemId} onChange={(item) => setInventoryItemId(item.id)} placeholder="اختر الصنف…" className="w-56" />
      <input required type="number" min={0} step="0.001" placeholder="الكمية الفعلية" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="border-input bg-background w-32 rounded-md border px-2 py-1" />
      <Button size="sm" type="submit">إضافة</Button>
    </form>
  );
}
