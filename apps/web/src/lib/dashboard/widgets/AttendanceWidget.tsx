import { useEffect, useState } from 'react';
import { Clock, MapPin } from 'lucide-react';
import type { AttendanceEntry, FieldAssignment } from '@cleopatra/shared';
import { apiGet, apiPost } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { DashboardWidgetDefinition } from '../types';

function time(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/**
 * FEATURE-013 (2026-08-14, owner: "لما يفتح اللوكيشن ويأكد انه في المكان
 * ساعتها اسجله حضوره") — shown only when the employee has a PENDING field
 * assignment for today. Success/failure both come back from the same
 * `confirm` call — a `TOO_FAR` error carries the actual distance so the
 * message is concrete, not just "rejected".
 */
function FieldAssignmentCard({ assignment, onConfirmed }: { assignment: FieldAssignment; onConfirmed: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    setConfirming(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        apiPost(`/api/attendance/field-assignments/${assignment.id}/confirm`, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        })
          .then(onConfirmed)
          .catch((err: unknown) => setError(err instanceof Error ? err.message : 'تعذر تأكيد الموقع'))
          .finally(() => setConfirming(false));
      },
      () => {
        setError('لازم تسمح بمشاركة الموقع عشان تأكد وصولك');
        setConfirming(false);
      },
    );
  };

  return (
    <div className="border-border bg-muted/30 space-y-2 rounded-md border p-3 text-sm">
      <div className="flex items-center gap-1.5 font-medium">
        <MapPin className="size-4" />
        <span>عندك مهمة النهارده: {assignment.locationLabel}</span>
      </div>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button size="sm" disabled={confirming} onClick={confirm}>
        {confirming ? 'جارٍ التأكيد…' : 'تأكيد وصولي'}
      </Button>
    </div>
  );
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
  const [assignments, setAssignments] = useState<FieldAssignment[]>([]);

  const load = () => {
    apiGet<AttendanceEntry | null>('/api/attendance/my-today')
      .then(setEntry)
      .catch(() => setEntry(null));
    apiGet<FieldAssignment[]>('/api/attendance/field-assignments/my-today')
      .then(setAssignments)
      .catch(() => undefined);
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
      {assignments.length > 0 && (
        <div className="mb-3 space-y-2">
          {assignments.map((a) => (
            <FieldAssignmentCard key={a.id} assignment={a} onConfirmed={load} />
          ))}
        </div>
      )}
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
