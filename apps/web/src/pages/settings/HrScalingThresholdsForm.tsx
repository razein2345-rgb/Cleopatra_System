import { useEffect, useState } from 'react';
import type { Setting } from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';

/**
 * system_specifications_v2.md §16.2 (HR Scaling Alert, 2026-09-09) —
 * "مراقبة Queue Time، عدد Jobs المنتظرة... يمكن إطلاق تنبيه إداري عند
 * تجاوز الحدود المحددة." Same "checkbox enables a value" shape as
 * `AutoCloseTimeForm.tsx` (رول 5) — فاضي/متوقف = التنبيه ده مقفول، مفيش
 * حد ثابت بالكود (رول 15).
 */
export function HrScalingThresholdsForm() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [waitingEnabled, setWaitingEnabled] = useState(false);
  const [waitingValue, setWaitingValue] = useState('10');
  const [delayedEnabled, setDelayedEnabled] = useState(false);
  const [delayedValue, setDelayedValue] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () => {
    apiGet<Setting>('/api/settings')
      .then((s) => {
        setSetting(s);
        setWaitingEnabled(s.hrScalingWaitingThreshold != null);
        setWaitingValue(s.hrScalingWaitingThreshold != null ? String(s.hrScalingWaitingThreshold) : '10');
        setDelayedEnabled(s.hrScalingDelayedThreshold != null);
        setDelayedValue(s.hrScalingDelayedThreshold != null ? String(s.hrScalingDelayedThreshold) : '5');
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تحميل الإعداد'));
  };

  useEffect(load, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      await apiPut<Setting>('/api/settings', {
        hrScalingWaitingThreshold: waitingEnabled ? Number(waitingValue) : null,
        hrScalingDelayedThreshold: delayedEnabled ? Number(delayedValue) : null,
      });
      setSaved(true);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الحفظ');
    } finally {
      setSaving(false);
    }
  };

  if (!setting) return <div className="text-muted-foreground text-sm">جارٍ التحميل…</div>;

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {saved && !error && <p className="text-success text-sm">تم الحفظ.</p>}

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={waitingEnabled} onChange={(e) => setWaitingEnabled(e.target.checked)} />
          <span>تنبيه لو عدد المهام المنتظرة في أي قسم تجاوز حد معين</span>
        </label>
        {waitingEnabled && (
          <label className="block max-w-xs space-y-1 text-sm">
            <span className="text-muted-foreground">الحد الأقصى (مهمة)</span>
            <input
              type="number"
              min={1}
              dir="ltr"
              required
              value={waitingValue}
              onChange={(e) => setWaitingValue(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={delayedEnabled} onChange={(e) => setDelayedEnabled(e.target.checked)} />
          <span>تنبيه لو عدد المهام المتأخرة في أي قسم تجاوز حد معين</span>
        </label>
        {delayedEnabled && (
          <label className="block max-w-xs space-y-1 text-sm">
            <span className="text-muted-foreground">الحد الأقصى (مهمة)</span>
            <input
              type="number"
              min={1}
              dir="ltr"
              required
              value={delayedValue}
              onChange={(e) => setDelayedValue(e.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
          </label>
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        لو مفعّل، هيظهر تنبيه في لوحة التحكم الرئيسية لأي قسم إنتاجي يتجاوز الحد ده — علامة على
        إن القسم محتاج تعزيز بموظفين أو موارد زيادة.
      </p>
      <Button type="submit" disabled={saving}>
        {saving ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
    </form>
  );
}
