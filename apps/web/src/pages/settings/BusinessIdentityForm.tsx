import { useState } from 'react';
import type { Setting, UpdateSettingInput } from '@cleopatra/shared';
import { apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';

const TEXT_FIELDS: Array<{ key: keyof UpdateSettingInput; label: string }> = [
  { key: 'businessNameAr', label: 'اسم المنشأة (عربي)' },
  { key: 'businessNameEn', label: 'اسم المنشأة (إنجليزي)' },
  { key: 'address', label: 'العنوان' },
  { key: 'phone', label: 'الهاتف' },
  { key: 'email', label: 'البريد الإلكتروني' },
  { key: 'website', label: 'الموقع الإلكتروني' },
  { key: 'taxNumber', label: 'الرقم الضريبي' },
  { key: 'commercialRegisterNumber', label: 'رقم السجل التجاري' },
  { key: 'logoUrl', label: 'رابط الشعار' },
];

/**
 * FEATURE-006 M6 — business identity fields (Setting, M1) surfaced for
 * editing for the first time. `logoUrl` stays a plain URL field — no
 * upload endpoint exists anywhere in this codebase (confirmed by
 * inspection before M1), so this doesn't invent one.
 */
export function BusinessIdentityForm({ setting, onSaved }: { setting: Setting; onSaved: () => void }) {
  const { can } = useAuth();
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, (setting[f.key] as string | null) ?? ''])),
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!editing) {
    return (
      <div className="space-y-3">
        {can('settings.edit') && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setValues(Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, (setting[f.key] as string | null) ?? ''])));
              setEditing(true);
            }}
          >
            تعديل الهوية التجارية
          </Button>
        )}
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {TEXT_FIELDS.map((f) => (
            <div key={f.key} className="border-border flex flex-col gap-1 border-b border-dashed py-2 text-sm">
              <span className="text-muted-foreground">{f.label}</span>
              <span className="font-medium">{(setting[f.key] as string | null) || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const payload = Object.fromEntries(
        TEXT_FIELDS.map((f) => [f.key, values[f.key].trim() === '' ? null : values[f.key].trim()]),
      ) satisfies UpdateSettingInput;
      await apiPut('/api/settings', payload);
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الهوية التجارية');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <div className="text-destructive text-sm">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TEXT_FIELDS.map((f) => (
          <label key={f.key} className="space-y-1 text-sm">
            <span className="text-muted-foreground">{f.label}</span>
            <input
              value={values[f.key]}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? 'جارٍ الحفظ…' : 'حفظ'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setEditing(false)}>
          إلغاء
        </Button>
      </div>
    </form>
  );
}
