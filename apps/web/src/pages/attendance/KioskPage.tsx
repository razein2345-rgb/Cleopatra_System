import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';
import { Button } from '@/components/ui/button';

type KioskStaff = { id: string; name: string };
type KioskResult = { action: 'CHECK_IN' | 'CHECK_OUT'; staffName: string; entry: { checkInAt: string | null; checkOutAt: string | null } };

/**
 * FEATURE-013 (2026-08-14, owner: "الموظف يكتب اسمه ورقمه السري") — the
 * shared-tablet Kiosk screen for فرع كليوباترا. This route intentionally
 * renders standalone, outside `<AppShell />` (no sidebar/nav) — the device
 * stays on this one screen all day, logged into a dedicated Kiosk account
 * (see the route's `attendance.kiosk`-gated `ProtectedRoute` in App.tsx).
 */
export function KioskPage() {
  const [staffList, setStaffList] = useState<KioskStaff[]>([]);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<KioskResult | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<KioskStaff[]>('/api/attendance/kiosk/staff')
      .then(setStaffList)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, [result]);

  const reset = () => {
    setName('');
    setPin('');
    setError(null);
    setResult(null);
  };

  const submit = async () => {
    if (!name.trim() || pin.length !== 4) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await apiPost<KioskResult>('/api/attendance/kiosk/submit', { name, pin });
      setResult(data);
      setTimeout(reset, 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حصل خطأ، حاول تاني');
      setPin('');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const time = new Date(result.action === 'CHECK_IN' ? result.entry.checkInAt! : result.entry.checkOutAt!);
    return (
      <div className="bg-background flex min-h-svh items-center justify-center p-8">
        <div className="text-center">
          <div className="text-success mb-4 text-6xl">✓</div>
          <h1 className="mb-2 text-3xl font-bold">
            {result.action === 'CHECK_IN' ? 'تم تسجيل حضورك' : 'تم تسجيل انصرافك'} يا {result.staffName}
          </h1>
          <p className="text-muted-foreground text-xl">
            الساعة {time.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background flex min-h-svh items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">تسجيل حضور وانصراف</h1>

        <div className="space-y-2 text-start">
          <label className="text-muted-foreground block text-sm">الاسم</label>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            list="kiosk-staff-names"
            placeholder="اكتب اسمك"
            className="border-input bg-background w-full rounded-md border px-4 py-3 text-lg"
            autoComplete="off"
          />
          <datalist id="kiosk-staff-names">
            {staffList.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </div>

        <div className="space-y-2 text-start">
          <label className="text-muted-foreground block text-sm">الرقم السري</label>
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            onKeyDown={(e) => e.key === 'Enter' && void submit()}
            placeholder="••••"
            className="border-input bg-background w-full rounded-md border px-4 py-3 text-center text-2xl tracking-[0.5em]"
            autoComplete="off"
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <Button
          type="button"
          className="w-full py-6 text-lg"
          disabled={submitting || !name.trim() || pin.length !== 4}
          onClick={() => void submit()}
        >
          {submitting ? 'جارٍ التسجيل…' : 'تسجيل'}
        </Button>
      </div>
    </div>
  );
}
