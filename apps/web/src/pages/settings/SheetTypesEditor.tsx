import { useState } from 'react';
import type { SheetBase, SheetType, UpdateSheetTypeInput } from '@cleopatra/shared';
import { apiDelete, apiPost, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EditableNumberCell, EditableTextCell } from '@/components/cleopatra';
import { useAuth } from '@/state/AuthContext';

/**
 * Sprint 1 §3 — Sheet Types (paper stock name + price), editable via the
 * existing `/api/sheet-types` CRUD (Phase 1, previously read-only in the
 * UI). No width/height/active/notes/reorder fields — `SheetType` doesn't
 * store them (01_ANALYSIS.md Critical Finding #8), not shown here.
 */
export function SheetTypesEditor({
  title,
  base,
  sheetTypes,
  onChanged,
}: {
  title: string;
  base: SheetBase;
  sheetTypes: SheetType[];
  onChanged: () => void;
}) {
  const { can } = useAuth();
  const canManage = can('settings.edit');
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (sheetType: SheetType) => {
    if (!confirm(`حذف "${sheetType.name}"؟`)) return;
    setError(null);
    try {
      await apiDelete(`/api/sheet-types/${sheetType.id}`);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حذف نوع الورق');
    }
  };

  const updateSheetTypeField = async (sheetType: SheetType, patch: UpdateSheetTypeInput) => {
    setError(null);
    try {
      await apiPut(`/api/sheet-types/${sheetType.id}`, patch);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ نوع الورق');
      throw err;
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-muted-foreground text-sm font-bold">{title}</h3>
        {canManage && (
          <Button variant="secondary" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'إلغاء' : '+ إضافة'}
          </Button>
        )}
      </div>
      {error && <div className="text-destructive mb-2 text-sm">{error}</div>}
      {showCreate && (
        <SheetTypeForm
          base={base}
          onSaved={() => {
            setShowCreate(false);
            onChanged();
          }}
          onCancel={() => setShowCreate(false)}
        />
      )}
      <table className="w-full text-sm">
        <tbody>
          {sheetTypes.map((s) => (
            <tr key={s.id} className="border-border border-b">
              <td className="py-1.5">
                {canManage ? (
                  <EditableTextCell value={s.name} onSave={(next) => updateSheetTypeField(s, { name: next })} />
                ) : (
                  s.name
                )}
              </td>
              <td className="py-1.5 text-end">
                {canManage ? (
                  <EditableNumberCell
                    value={s.price}
                    min={0}
                    step={0.01}
                    onSave={(next) => updateSheetTypeField(s, { price: next })}
                    className="text-end"
                  />
                ) : (
                  `${s.price.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج`
                )}
              </td>
              {canManage && (
                <td className="py-1.5 text-end">
                  <Button variant="ghost" size="sm" onClick={() => void remove(s)}>
                    حذف
                  </Button>
                </td>
              )}
            </tr>
          ))}
          {sheetTypes.length === 0 && (
            <tr>
              <td className="text-muted-foreground py-2" colSpan={3}>
                لا توجد أنواع ورق بعد.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SheetTypeForm({
  base,
  sheetType,
  onSaved,
  onCancel,
}: {
  base: SheetBase;
  sheetType?: SheetType;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(sheetType?.name ?? '');
  const [price, setPrice] = useState(sheetType?.price ?? 0);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (sheetType) {
        await apiPut(`/api/sheet-types/${sheetType.id}`, { name, price });
      } else {
        await apiPost('/api/sheet-types', { base, name, price });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ نوع الورق');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="border-border bg-muted/30 flex flex-wrap items-end gap-2 rounded-lg border p-2">
      {error && <div className="text-destructive w-full text-xs">{error}</div>}
      <label className="flex-1 space-y-1 text-xs">
        <span className="text-muted-foreground">الاسم</span>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-input bg-background w-full rounded-md border px-2 py-1.5 text-sm"
        />
      </label>
      <label className="w-28 space-y-1 text-xs">
        <span className="text-muted-foreground">السعر</span>
        <input
          type="number"
          step="0.01"
          min={0}
          required
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
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
