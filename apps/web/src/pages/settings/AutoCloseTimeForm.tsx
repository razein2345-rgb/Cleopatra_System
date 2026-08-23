import { useEffect, useState } from 'react';
import type { Setting } from '@cleopatra/shared';
import { apiGet, apiPut } from '@/lib/api';
import { Button } from '@/components/ui/button';

/**
 * Owner (2026-08-23, "ان احدد وقت لما يجي الحساب بيتقفل دايركت والموظف
 * لو لسه موجود يكلمني افتحوله") — a single global HH:MM closing time
 * (`Setting.autoCloseDayTime`, null = feature off). `autoCloseDayJob.ts`
 * force-closes every branch's treasury day the moment this time passes;
 * reopening afterward stays SUPER_ADMIN/ADMIN-only, unchanged.
 */
export function AutoCloseTimeForm() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [time, setTime] = useState('20:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () => {
    apiGet<Setting>('/api/settings')
      .then((s) => {
        setSetting(s);
        setEnabled(!!s.autoCloseDayTime);
        setTime(s.autoCloseDayTime ?? '20:00');
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
      await apiPut<Setting>('/api/settings', { autoCloseDayTime: enabled ? time : null });
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
    <form onSubmit={submit} className="space-y-3">
      {error && <p className="text-destructive text-sm">{error}</p>}
      {saved && !error && <p className="text-success text-sm">تم الحفظ.</p>}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>تقفيل الحساب تلقائيًا كل يوم</span>
      </label>
      {enabled && (
        <label className="block max-w-xs space-y-1 text-sm">
          <span className="text-muted-foreground">الوقت</span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
            className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
          />
        </label>
      )}
      <p className="text-muted-foreground text-xs">
        لو مفعّل، هيتم تقفيل حساب كل فرع تلقائيًا في الوقت ده لو الموظف نسي يقفله بنفسه. فتح اليوم بعد كده مقصور على المسؤول العام.
      </p>
      <Button type="submit" disabled={saving}>
        {saving ? 'جارٍ الحفظ…' : 'حفظ'}
      </Button>
    </form>
  );
}
