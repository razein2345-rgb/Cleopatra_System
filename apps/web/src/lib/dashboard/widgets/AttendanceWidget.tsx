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
 * system_specifications_v2.md §3.1.2 (2026-08-16, owner correction — see
 * CLAUDE.md §7) — the self-service check-in/check-out buttons this widget
 * used to show (FEATURE-008, before a Kiosk device existed for either
 * branch) are retired: the Kiosk (PIN, per-branch device) is now the sole
 * official way to record daily attendance for both كليوباترا and بيت
 * الطباعة/برينتنج هاوس. This widget now only shows today's status
 * (read-only) plus any pending field-assignment GPS confirmation
 * (`FieldAssignmentCard`, untouched — a completely different concept, an
 * external one-off task location check, not daily branch attendance).
 */
function AttendanceWidgetComponent() {
  const [entry, setEntry] = useState<AttendanceEntry | null | undefined>(undefined);
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
          <p className="text-muted-foreground">
            {entry?.checkInAt ? `وقت الحضور: ${time(entry.checkInAt)}` : 'لم يتم تسجيل الحضور اليوم بعد — سجّل من كشك الفرع'}
          </p>
          {entry?.checkOutAt && <p className="text-muted-foreground">وقت الانصراف: {time(entry.checkOutAt)}</p>}
          {entry?.checkInAt && entry.checkOutAt && <p className="text-green-600">تم تسجيل الحضور والانصراف اليوم</p>}
        </div>
      )}
    </Card>
  );
}

export const attendanceWidget: DashboardWidgetDefinition = {
  id: 'attendance',
  Component: AttendanceWidgetComponent,
};
