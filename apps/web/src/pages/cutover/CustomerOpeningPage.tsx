import { useEffect, useState } from 'react';
import type { BusinessPartner, CustomerOpening, CustomerOpeningPosition } from '@cleopatra/shared';
import { apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PartnerCombobox } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * Cutover-revision-round decision (post-3D) — CustomerOpening's own
 * minimal screen, deliberately limited scope (search + detail +
 * correction), not a full CRM page. Separate from CutoverPage.tsx since
 * CustomerOpening is company-wide/standalone, never a branch-scoped
 * Cutover child. Same "the server re-checks everything, this UI only
 * hides buttons that would be rejected anyway" discipline as CutoverPage.
 */

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2 });

export function CustomerOpeningPage() {
  const { authContext } = useAuth();
  const roleNames = authContext?.user.roles.map((r) => r.name) ?? [];
  const isAdminOrAbove = roleNames.includes('ADMIN') || roleNames.includes('SUPER_ADMIN');
  const isSuperAdmin = roleNames.includes('SUPER_ADMIN');
  const staffId = authContext?.user.id;

  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [partnerId, setPartnerId] = useState('');
  const [opening, setOpening] = useState<CustomerOpening | null>(null);
  const [position, setPosition] = useState<CustomerOpeningPosition | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showCorrect, setShowCorrect] = useState(false);

  useEffect(() => {
    apiGet<BusinessPartner[]>('/api/partners')
      .then(setPartners)
      .catch(() => undefined);
  }, []);

  const load = (id: string) => {
    setError(null);
    apiGet<{ opening: CustomerOpening | null; position: CustomerOpeningPosition }>(`/api/opening-state/customer/${id}`)
      .then((data) => {
        setOpening(data.opening);
        setPosition(data.position);
        setLoaded(true);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل بيانات العميل'));
  };

  const onSelectPartner = (id: string) => {
    setPartnerId(id);
    setOpening(null);
    setPosition(null);
    setLoaded(false);
    setShowCreate(false);
    setShowCorrect(false);
    if (id) load(id);
  };

  const runAction = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      if (partnerId) load(partnerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تنفيذ العملية');
    }
  };

  const canApproveThis = Boolean(opening && staffId && (opening.enteredById !== staffId || isAdminOrAbove));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">الرصيد الافتتاحي للعملاء (Customer Opening)</h1>
      {error && <div className="text-destructive text-sm">{error}</div>}

      <div className="border-border bg-card space-y-2 rounded-2xl border p-4">
        <p className="font-semibold">بحث عن عميل</p>
        <PartnerCombobox partners={partners} value={partnerId} onChange={onSelectPartner} />
      </div>

      {partnerId && loaded && !opening && (
        <div className="border-border bg-card space-y-3 rounded-2xl border p-4">
          <p className="text-muted-foreground text-sm">لا يوجد رصيد افتتاحي مسجل لهذا العميل بعد.</p>
          {!showCreate ? (
            <Button size="sm" onClick={() => setShowCreate(true)}>
              + إضافة رصيد افتتاحي
            </Button>
          ) : (
            <CreateCustomerOpeningForm
              partnerId={partnerId}
              onCreated={() => {
                setShowCreate(false);
                load(partnerId);
              }}
            />
          )}
        </div>
      )}

      {opening && (
        <div className="border-border bg-card space-y-4 rounded-2xl border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="font-semibold">الحالة: {opening.status}</p>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{opening.verificationStatus}</Badge>
                {opening.selfApprovedException && <Badge variant="destructive">⚠️ تم الاعتماد ذاتيًا (استثناء طارئ)</Badge>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {opening.status === 'DRAFT' && isAdminOrAbove && opening.verificationStatus === 'UNVERIFIED' && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    runAction(() => apiPut(`/api/opening-state/customer/${opening.id}/verify`, { verificationStatus: 'VERIFIED' }))
                  }
                >
                  تحقق
                </Button>
              )}
              {opening.status === 'DRAFT' && (
                <Button size="sm" disabled={!canApproveThis} onClick={() => runAction(() => apiPost(`/api/opening-state/customer/${opening.id}/approve`, {}))}>
                  اعتماد
                </Button>
              )}
              {opening.status === 'APPROVED' && isAdminOrAbove && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const reason = window.prompt('سبب إعادة الفتح؟');
                    if (reason) runAction(() => apiPost(`/api/opening-state/customer/${opening.id}/reopen`, { reason }));
                  }}
                >
                  إعادة فتح
                </Button>
              )}
              {/* Owner decision — a real financial correction needs a proper form with visual review before confirming, not window.prompt (see CorrectCreditDialog below). */}
              {isSuperAdmin && (
                <Button size="sm" variant="destructive" onClick={() => setShowCorrect(true)}>
                  تصحيح الرصيد
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground text-xs">مديونية افتتاحية</p>
              <p dir="ltr">{fmt(opening.receivableAmount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">رصيد افتتاحي (Credit)</p>
              <p dir="ltr">{fmt(opening.creditAmount)}</p>
            </div>
            {position && (
              <>
                <div>
                  <p className="text-muted-foreground text-xs">المستهلك من الرصيد</p>
                  <p dir="ltr">{fmt(position.consumedOpeningCredit)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">المتبقي من الرصيد</p>
                  <p dir="ltr">{fmt(position.remainingOpeningCredit)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">الموقف الحي الكامل</p>
                  <p dir="ltr">{fmt(position.position)}</p>
                </div>
              </>
            )}
          </div>

          {opening.creditCorrectedAt && (
            <p className="text-muted-foreground border-t pt-2 text-xs">
              آخر تصحيح: {new Date(opening.creditCorrectedAt).toLocaleString('ar-EG')} — السبب: {opening.creditCorrectionReason}
            </p>
          )}
        </div>
      )}

      {opening && showCorrect && (
        <CorrectCreditDialog
          opening={opening}
          onClose={() => setShowCorrect(false)}
          onCorrected={() => {
            setShowCorrect(false);
            load(partnerId);
          }}
        />
      )}
    </div>
  );
}

function CreateCustomerOpeningForm({ partnerId, onCreated }: { partnerId: string; onCreated: () => void }) {
  const [receivableAmount, setReceivableAmount] = useState('0');
  const [creditAmount, setCreditAmount] = useState('0');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaving(true);
    try {
      await apiPost('/api/opening-state/customer', {
        partnerId,
        receivableAmount: Number(receivableAmount) || 0,
        creditAmount: Number(creditAmount) || 0,
        notes: notes || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إنشاء الرصيد الافتتاحي');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
      {error && <p className="text-destructive text-sm sm:col-span-4">{error}</p>}
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground block">المديونية الافتتاحية</span>
        <input type="number" min={0} step="0.01" value={receivableAmount} onChange={(e) => setReceivableAmount(e.target.value)} className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm" />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground block">الرصيد الافتتاحي (Credit)</span>
        <input type="number" min={0} step="0.01" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm" />
      </label>
      <input placeholder="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} className="border-input bg-background rounded-md border px-3 py-2 text-sm sm:col-span-2" />
      <Button type="submit" disabled={saving} className="sm:col-span-4">
        {saving ? 'جارٍ الحفظ…' : 'إنشاء'}
      </Button>
    </form>
  );
}

/**
 * Owner decision (Cutover-revision-round) — a real dialog with two
 * clearly separated, labeled fields (amount + reason) and a visible
 * current-balance reference before confirming, replacing an earlier
 * `window.prompt`-based design the owner explicitly rejected for a
 * financial correction: "عملية بتلمس مبلغ مالي فعلي لازم تدي فرصة
 * مراجعة بصرية قبل التأكيد".
 */
function CorrectCreditDialog({
  opening,
  onClose,
  onCorrected,
}: {
  opening: CustomerOpening;
  onClose: () => void;
  onCorrected: () => void;
}) {
  const [creditAmount, setCreditAmount] = useState(String(opening.creditAmount));
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!reason.trim()) {
      setError('سبب التصحيح إجباري');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await apiPut(`/api/opening-state/customer/${opening.id}/correct-credit`, {
        creditAmount: Number(creditAmount),
        reason: reason.trim(),
      });
      onCorrected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تصحيح الرصيد');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تصحيح الرصيد الافتتاحي — إجراء استثنائي</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <p className="text-muted-foreground text-sm">
            الرصيد المسجل حاليًا: <span dir="ltr" className="font-bold">{fmt(opening.creditAmount)}</span> ج.م
          </p>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">المبلغ الصحيح الجديد</span>
            <input
              autoFocus
              required
              type="number"
              min={0}
              step="0.01"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">سبب التصحيح (إجباري)</span>
            <Textarea required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اشرح ليه الرصيد المسجل كان غلط..." />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'تأكيد التصحيح'}
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
