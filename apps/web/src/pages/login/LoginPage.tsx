import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';
import { supabase } from '@/lib/supabase';

/** Maps raw Supabase/backend error text to a friendly Arabic message for display. */
function translateAuthError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials') || normalized.includes('invalid_credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  }
  if (normalized.includes('invalid or expired token') || normalized.includes('jwt expired')) {
    return 'انتهت صلاحية الجلسة';
  }
  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('load failed') ||
    normalized.includes('networkerror')
  ) {
    return 'تعذر الاتصال بالخادم';
  }
  if (normalized.includes('no staff profile exists')) {
    return 'هذا الحساب غير مصرح له بالدخول إلى النظام';
  }
  if (normalized.includes('deactivated')) {
    return 'تم تعطيل هذا الحساب، يرجى مراجعة الإدارة';
  }
  if (normalized.includes('email not confirmed')) {
    return 'لم يتم تأكيد البريد الإلكتروني بعد';
  }
  return 'حدث خطأ غير متوقع، حاول مرة أخرى';
}

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // Guards against duplicate submits (e.g. double Enter).
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      await signIn(identifier, password, rememberMe);
      navigate('/', { replace: true });
    } catch (err) {
      setError(translateAuthError(err instanceof Error ? err.message : ''));
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    const trimmed = identifier.trim();
    if (!trimmed) {
      setError('يرجى إدخال البريد الإلكتروني أولاً');
      return;
    }
    if (!trimmed.includes('@')) {
      setError('إعادة تعيين كلمة المرور متاحة عبر البريد الإلكتروني فقط');
      return;
    }
    // Self-service reset goes straight to Supabase — the backend is not
    // involved (see ARCHITECTURE.md's Phase 2 section). redirectTo sends the
    // user to the same invite/password-setup completion page used for new
    // employee invitations (FEATURE-001.2).
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: `${window.location.origin}/accept-invite`,
    });
    if (resetError) {
      setError(translateAuthError(resetError.message));
    } else {
      setNotice('في حال وجود حساب بهذا البريد الإلكتروني، تم إرسال رابط إعادة التعيين.');
    }
  };

  return (
    <main
      dir="rtl"
      className="bg-muted/30 flex min-h-svh items-center justify-center p-4 sm:p-8"
    >
      <form
        onSubmit={handleSubmit}
        className="border-border bg-card w-full max-w-sm rounded-2xl border p-6 shadow-sm sm:p-8"
      >
        <h1 className="mb-1 text-center text-2xl font-bold tracking-tight sm:text-right">
          Cleopatra System
        </h1>
        <p className="text-muted-foreground mb-6 text-center text-sm sm:text-right">
          سجّل الدخول للمتابعة
        </p>

        {error && (
          <div
            role="alert"
            className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3 text-center text-sm leading-relaxed"
          >
            {error}
          </div>
        )}
        {notice && (
          <div className="border-border bg-secondary mb-4 rounded-lg border p-3 text-center text-sm leading-relaxed">
            {notice}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-1.5">
          <label htmlFor="identifier" className="text-sm font-medium">
            البريد الإلكتروني أو رقم الهاتف
          </label>
          <input
            id="identifier"
            type="text"
            inputMode="email"
            required
            autoComplete="username"
            disabled={submitting}
            placeholder="omar@gmail.com أو 01012345678"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            dir="ltr"
            className="border-input bg-background focus:border-ring w-full rounded-md border px-3 py-2.5 text-right text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="mb-4 flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            كلمة المرور
          </label>
          <div className="relative">
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              autoComplete="current-password"
              disabled={submitting}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="border-input bg-background focus:border-ring w-full rounded-md border px-3 py-2.5 pl-10 text-right text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={submitting}
              tabIndex={-1}
              aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 left-0 flex items-center px-3 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={submitting}
              className="size-4 disabled:cursor-not-allowed disabled:opacity-60"
            />
            تذكرني
          </label>
          <button
            type="button"
            onClick={handleForgotPassword}
            disabled={submitting}
            className="text-primary text-sm underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            نسيت كلمة المرور؟
          </button>
        </div>

        <Button type="submit" size="lg" disabled={submitting} className="w-full font-medium">
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              جارٍ تسجيل الدخول…
            </>
          ) : (
            'تسجيل الدخول'
          )}
        </Button>
      </form>
    </main>
  );
}
