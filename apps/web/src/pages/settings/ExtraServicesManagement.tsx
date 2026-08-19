import { useEffect, useState } from 'react';
import type { CreateExtraServiceOptionInput, ExtraServiceOption, ProductionTrack, UpdateExtraServiceOptionInput } from '@cleopatra/shared';
import { PRODUCTION_TRACK_LABELS } from '@cleopatra/shared';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableCheckboxCell, EditableTextCell, useConfirm } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

const ALL_TRACKS = Object.keys(PRODUCTION_TRACK_LABELS) as ProductionTrack[];

/** Owner ("عايز الخدمات الإضافية دي على حسب القسم") — toggle chips for which tracks an option applies to; empty = every track. Shared between the table row and the create form. */
function TrackChips({
  value,
  onChange,
}: {
  value: ProductionTrack[];
  onChange: (next: ProductionTrack[]) => void;
}) {
  const toggle = (track: ProductionTrack) => {
    onChange(value.includes(track) ? value.filter((t) => t !== track) : [...value, track]);
  };
  return (
    <div className="flex flex-wrap gap-1">
      {ALL_TRACKS.map((track) => (
        <button
          key={track}
          type="button"
          onClick={() => toggle(track)}
          className={
            value.includes(track)
              ? 'bg-primary text-primary-foreground rounded-full px-2 py-0.5 text-xs'
              : 'bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs'
          }
        >
          {PRODUCTION_TRACK_LABELS[track]}
        </button>
      ))}
    </div>
  );
}

/** Owner (2026-08-17, "عايز في الإعدادات أقدر أضيف على الخدمات الإضافية خدمة") — admin-managed catalog for the order composer's "الخدمات الإضافية" checklist. */
export function ExtraServicesManagement() {
  const { can } = useAuth();
  const confirm = useConfirm();
  const canManage = can('settings.edit');
  const [options, setOptions] = useState<ExtraServiceOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    apiGet<ExtraServiceOption[]>('/api/extra-service-options')
      .then(setOptions)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الخدمات الإضافية'));
  };

  useEffect(load, []);

  const remove = async (option: ExtraServiceOption) => {
    if (!(await confirm({ title: `حذف "${option.label}"؟`, destructive: true }))) return;
    setError(null);
    try {
      await apiDelete(`/api/extra-service-options/${option.id}`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحذف');
    }
  };

  const updateOptionField = async (option: ExtraServiceOption, patch: UpdateExtraServiceOptionInput) => {
    const updated = await apiPut<ExtraServiceOption>(`/api/extra-service-options/${option.id}`, patch);
    setOptions((prev) => prev?.map((o) => (o.id === option.id ? updated : o)) ?? prev);
  };

  if (error) return <div className="text-destructive text-sm">{error}</div>;
  if (!options) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <div className="space-y-3">
      {canManage && (
        <Button onClick={() => setShowCreate((v) => !v)}>{showCreate ? 'إلغاء' : '+ خدمة إضافية جديدة'}</Button>
      )}

      {showCreate && (
        <ExtraServiceOptionForm
          nextSortOrder={options.length}
          onSaved={() => {
            setShowCreate(false);
            load();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-border text-muted-foreground border-b text-xs *:text-start">
              <th className="p-2">الاسم</th>
              <th className="p-2">الحالة</th>
              <th className="p-2">الأقسام (فاضي = كل الأقسام)</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {options.map((option) => (
              <tr key={option.id} className="border-border border-b last:border-0">
                <td className="p-2 font-medium">
                  {canManage ? (
                    <EditableTextCell value={option.label} onSave={(next) => updateOptionField(option, { label: next })} />
                  ) : (
                    option.label
                  )}
                </td>
                <td className="p-2">
                  {canManage ? (
                    <div className="flex items-center gap-1.5">
                      <EditableCheckboxCell
                        value={option.isActive}
                        onSave={(next) => updateOptionField(option, { isActive: next })}
                      />
                      <span className={option.isActive ? 'text-success' : 'text-muted-foreground'}>
                        {option.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </div>
                  ) : (
                    <span className={option.isActive ? 'text-success' : 'text-muted-foreground'}>
                      {option.isActive ? 'نشط' : 'غير نشط'}
                    </span>
                  )}
                </td>
                <td className="p-2">
                  {canManage ? (
                    <TrackChips
                      value={option.applicableTracks}
                      onChange={(next) => void updateOptionField(option, { applicableTracks: next })}
                    />
                  ) : option.applicableTracks.length === 0 ? (
                    <span className="text-muted-foreground text-xs">كل الأقسام</span>
                  ) : (
                    <span className="text-xs">{option.applicableTracks.map((t) => PRODUCTION_TRACK_LABELS[t]).join('، ')}</span>
                  )}
                </td>
                <td className="p-2">
                  {canManage && (
                    <Button variant="ghost" size="sm" onClick={() => void remove(option)}>
                      حذف
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {options.length === 0 && (
              <tr>
                <td className="text-muted-foreground p-2" colSpan={4}>
                  لا توجد خدمات إضافية بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ExtraServiceOptionForm({
  nextSortOrder,
  onSaved,
  onCancel,
}: {
  nextSortOrder: number;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [applicableTracks, setApplicableTracks] = useState<ProductionTrack[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const input: CreateExtraServiceOptionInput = { label, sortOrder: nextSortOrder, applicableTracks };
      await apiPost('/api/extra-service-options', input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحفظ');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-card space-y-3 rounded-xl border p-3">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">الاسم — مثال: تكسير ولزق، فورمة تكسير</span>
        <input
          required
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm sm:w-64"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">الأقسام (اختياري — فاضي يعني تظهر لكل الأقسام)</span>
        <TrackChips value={applicableTracks} onChange={setApplicableTracks} />
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
