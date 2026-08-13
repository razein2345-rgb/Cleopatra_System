import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import type { AttendanceEntry } from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { DashboardWidgetDefinition } from '../types';

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/**
 * FEATURE-008 (2026-08-13, owner: "هل قسم الموظفين هيبقى مربوط بجهاز
 * البصمة (لسه مجبتهوش) ولا في بديل وايه الأفضل؟"). Self-service check-in/
 * check-out — no permission gate, every staff member sees and uses this
 * for themself. Placeholder until a real fingerprint device is bought
 * (see attendanceService.ts's doc comment on how a device import would
 * plug into the same table).
 */
function AttendanceWidgetComponent() {
  const [entry, setEntry] = useState<AttendanceEntry | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    apiGet<AttendanceEntry | null>('/api/attendance/my-today')
      .then(setEntry)
      .catch(() => setEntry(null));
  };

  useEffect(load, []);

  const doCheckIn = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/attendance/check-in');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الحضور');
    } finally {
      setSubmitting(false);
    }
  };

  const doCheckOut = async () => {
    setError(null);
    setSubmitting(true);
    try {
      await apiPost('/api/attendance/check-out');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تسجيل الانصراف');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="text-muted-foreground size-4" />
        <span className="text-sm font-bold">الحضور والانصراف</span>
      </div>
      {entry === undefined ? (
        <p className="text-muted-foreground text-sm">جارٍ التحميل…</p>
      ) : (
        <div className="space-y-2 text-sm">
          {error && <p className="text-destructive text-xs">{error}</p>}
          <p className="text-muted-foreground">
            {entry?.checkInAt ? `وقت الحضور: ${time(entry.checkInAt)}` : 'لم يتم تسجيل الحضور اليوم بعد'}
          </p>
          {entry?.checkOutAt && <p className="text-muted-foreground">وقت الانصراف: {time(entry.checkOutAt)}</p>}
          <div className="flex gap-2">
            {!entry?.checkInAt && (
              <Button size="sm" disabled={submitting} onClick={() => void doCheckIn()}>
                تسجيل حضور
              </Button>
            )}
            {entry?.checkInAt && !entry.checkOutAt && (
              <Button size="sm" variant="secondary" disabled={submitting} onClick={() => void doCheckOut()}>
                تسجيل انصراف
              </Button>
            )}
            {entry?.checkInAt && entry.checkOutAt && <p className="text-green-600">تم تسجيل الحضور والانصراف اليوم</p>}
          </div>
        </div>
      )}
    </Card>
  );
}

export const attendanceWidget: DashboardWidgetDefinition = {
  id: 'attendance',
  Component: AttendanceWidgetComponent,
};
