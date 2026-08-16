import { useState } from 'react';
import type { SizeFamily, SizeFamilyEntry, UpdateSizeFamilyEntryInput } from '@cleopatra/shared';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableNumberCell, EditableTextCell } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * Sprint 1 §3 — Size Guide, editable. Entries render in the order the API
 * returns them (`sortOrder` ascending) — no reorder controls, since the
 * existing `updateSizeFamilyEntrySchema` doesn't accept `sortOrder`
 * (01_ANALYSIS.md Critical Finding #8 correction).
 */
export function SizeFamiliesEditor({
  sizeFamilies,
  onChanged,
}: {
  sizeFamilies: SizeFamily[];
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const canManage = can('settings.edit');

  return (
    <div className="space-y-3">
      {sizeFamilies.map((family) => (
        <FamilyCard key={family.id} family={family} canManage={canManage} onChanged={onChanged} />
      ))}
    </div>
  );
}

function FamilyCard({
  family,
  canManage,
  onChanged,
}: {
  family: SizeFamily;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const removeEntry = async (entry: SizeFamilyEntry) => {
    if (!confirm(`حذف المقاس "${entry.label}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/size-families/${family.id}/entries/${entry.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف المقاس');
    }
  };

  const updateEntryField = async (entry: SizeFamilyEntry, patch: UpdateSizeFamilyEntryInput) => {
    setError(null);
    try {
      await apiPut(`/api/size-families/${family.id}/entries/${entry.id}`, patch);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ المقاس');
      throw err;
    }
  };

  return (
    <div className="border-border rounded-xl border p-3">
      <div className="flex items-center justify-between">
        <b>{family.label}</b>
        <span className="bg-primary/10 text-primary rounded-full px-2.5 py-1 text-xs font-bold">
          {family.base === 'GAYER' ? 'جاير ٦٦×٨٨' : 'عادي ٧٠×١٠٠'}
        </span>
      </div>
      {error && <div className="text-destructive mt-2 text-sm">{error}</div>}
      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="text-muted-foreground text-xs *:text-start">
            <th className="py-1">المقاس</th>
            <th className="py-1">عدد القطع في الفرخ الكامل</th>
            <th className="py-1"></th>
          </tr>
        </thead>
        <tbody>
          {family.entries.map((entry) => (
            <tr key={entry.id} className="border-border border-t">
              <td className="py-1.5">
                {canManage ? (
                  <EditableTextCell
                    value={entry.label}
                    onSave={(next) => updateEntryField(entry, { label: next })}
                  />
                ) : (
                  entry.label
                )}
              </td>
              <td className="py-1.5">
                {canManage ? (
                  <EditableNumberCell
                    value={entry.piecesPerSheet}
                    min={0}
                    step={0.001}
                    onSave={(next) => updateEntryField(entry, { piecesPerSheet: next })}
                  />
                ) : (
                  entry.piecesPerSheet
                )}
              </td>
              {canManage && (
                <td className="py-1.5 text-end">
                  <Button variant="ghost" size="sm" onClick={() => void removeEntry(entry)}>
                    حذف
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && (
        <div className="mt-2">
          {showAddEntry ? (
            <EntryForm
              familyId={family.id}
              onSaved={() => {
                setShowAddEntry(false);
                onChanged();
              }}
              onCancel={() => setShowAddEntry(false)}
            />
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setShowAddEntry(true)}>
              + إضافة مقاس
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function EntryForm({
  familyId,
  entry,
  onSaved,
  onCancel,
}: {
  familyId: string;
  entry?: SizeFamilyEntry;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(entry?.label ?? '');
  const [piecesPerSheet, setPiecesPerSheet] = useState(entry?.piecesPerSheet ?? 1);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (entry) {
        await apiPut(`/api/size-families/${familyId}/entries/${entry.id}`, { label, piecesPerSheet });
      } else {
        await apiPost(`/api/size-families/${familyId}/entries`, { label, piecesPerSheet });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ المقاس');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-muted/30 flex flex-wrap items-end gap-2 rounded-lg border p-2">
      {error && <div className="text-destructive w-full text-xs">{error}</div>}
      <label className="flex-1 space-y-1 text-xs">
        <span className="text-muted-foreground">المقاس</span>
        <input
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="w-40 space-y-1 text-xs">
        <span className="text-muted-foreground">عدد القطع في الفرخ</span>
        <input
          type="number"
          step="0.001"
          min={0}
          required
          value={piecesPerSheet}
          onChange={(e) => setPiecesPerSheet(Number(e.target.value))}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <Button type="submit" size="sm" disabled={submitting}>
        {submitting ? '...' : 'حفظ'}
      </Button>
      <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
        إلغاء
      </Button>
    </form>
  );
}
