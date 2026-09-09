import { useState } from 'react';
import type { BranchSummary, CallDirection, CallOutcome, CreateCallLogInput } from '@cleopatra/shared';
import { apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const PURPOSE_SUGGESTIONS = ['استفسار', 'متابعة طلب', 'شكوى', 'تأكيد أوردر', 'استفسار عن سعر'];

/**
 * Owner (2026-09-09, "ضيف زرار سجل مكالمة") — a quick-log dialog reachable
 * directly from a customer/Lead's own screen, target already fixed
 * (`partnerId`/`leadId`), unlike the full "+ سجل مكالمة جديدة" form on
 * `/call-center` which has to search for who the call was with. Both post
 * to the exact same `POST /api/call-logs` endpoint (rule 5 — no second
 * copy of the create logic), just a smaller form since the target is
 * already known here.
 */
export function LogCallDialog({
  targetName,
  partnerId,
  leadId,
  branches,
  defaultBranchId,
  onClose,
  onLogged,
}: {
  targetName: string;
  partnerId?: string;
  leadId?: string;
  branches: BranchSummary[];
  defaultBranchId?: string;
  onClose: () => void;
  onLogged?: () => void;
}) {
  const [direction, setDirection] = useState<CallDirection>('OUTBOUND');
  const [purpose, setPurpose] = useState('');
  const [outcome, setOutcome] = useState<CallOutcome>('RESOLVED');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateCallLogInput = {
        direction,
        purpose,
        outcome,
        notes: notes.trim() || undefined,
        branchId,
        followUpDate: followUpDate || undefined,
        partnerId,
        leadId,
      };
      await apiPost('/api/call-logs', input);
      onLogged?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل المكالمة');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>سجل مكالمة — {targetName}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          {error && <p className="text-destructive text-sm">{error}</p>}
          <div className="grid grid-cols-2 gap-2">
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as CallDirection)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              <option value="OUTBOUND">صادر</option>
              <option value="INBOUND">وارد</option>
            </select>
            <select
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as CallOutcome)}
              className="border-input bg-background rounded-md border px-3 py-2 text-sm"
            >
              <option value="RESOLVED">تم الحل</option>
              <option value="NEEDS_FOLLOWUP">محتاج متابعة</option>
            </select>
          </div>
          <input
            autoFocus
            required
            list="quick-call-purpose-suggestions"
            placeholder="الغرض من المكالمة"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
          <datalist id="quick-call-purpose-suggestions">
            {PURPOSE_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {branches.length > 1 && (
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm">
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {outcome === 'NEEDS_FOLLOWUP' && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">تاريخ المتابعة (اختياري)</span>
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>
          )}
          <textarea
            placeholder="ملاحظات (اختياري)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'جارٍ الحفظ…' : 'حفظ المكالمة'}
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
