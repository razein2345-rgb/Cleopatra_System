import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';
import { supabase } from '@/lib/supabase';

type PageState =
  | 'verifying'
  | 'ready'
  | 'submitting'
  | 'success'
  | 'expired'
  | 'already-accepted'
  | 'no-context';

type FlowType = 'invite' | 'recovery' | null;

/**
 * Reads Supabase's email-link callback params from wherever they may land:
 * the hash fragment (implicit flow, e.g. `#access_token=...&type=invite`) or
 * the query string (PKCE flow, e.g. `?code=...&type=invite`). Both formats
 * are supported and auto-detected — which one actually arrives depends on
 * the Supabase project's configured auth flow type, which isn't visible
 * from this codebase (see FEATURE-001-IAM's 02_PLAN.md §4/§8).
 */
function readCallbackParams() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return {
    code: query.get('code'),
    accessToken: hash.get('access_token'),
    errorCode: hash.get('error_code') ?? query.get('error_code'),
    error: hash.get('error') ?? query.get('error'),
    type: (hash.get('type') ?? query.get('type')) as 'invite' | 'recovery' | null,
  };
}

/** Friendly Arabic messages for this page's own error cases, same pattern as LoginPage's translateAuthError. */
function translateSetupError(message: string): string {
  const normalized = message.toLowerCase();
  if (
    normalized.includes('password') &&
    (normalized.includes('short') || normalized.includes('character') || normalized.includes('weak'))
  ) {
    return 'كلمة المرور لا تحقق الحد الأدنى من المتطلبات، جرّب كلمة مرور أقوى';
  }
  if (
    normalized.includes('failed to fetch') ||
    normalized.includes('load failed') ||
    normalized.includes('networkerror')
  ) {
    return 'تعذر الاتصال بالخادم';
  }
  // FEATURE-001.2 fix (2026-08-13) — found live: an unmatched error used to
  // collapse into a fully opaque "حدث خطأ غير متوقع" with the real cause
  // visible only in the browser console, making a real failure here
  // undiagnosable from the owner's own report alone. Now the raw message
  // rides along (still in a friendly Arabic sentence) so a screenshot is
  // enough to actually debug it next time.
  return message ? `حدث خطأ غير متوقع: ${message}` : 'حدث خطأ غير متوقع، حاول مرة أخرى';
}

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const { refreshAuthContext } = useAuth();
  const [state, setState] = useState<PageState>('verifying');
  const [flowType, setFlowType] = useState<FlowType>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      // Supabase's SDK only emits a distinct event for recovery links; invite
      // links are detected via the `type` URL param instead (below).
      if (event === 'PASSWORD_RECOVERY' && mounted) setFlowType('recovery');
    });

    async function resolveCallback() {
      const params = readCallbackParams();
      if (params.type === 'invite' || params.type === 'recovery') {
        if (mounted) setFlowType(params.type);
      }

      // Supabase redirects with an error instead of a session when a link is
      // invalid, already used, or past its expiry — both "expired" and
      // "already accepted" collapse to the same error family on Supabase's
      // side, so they're surfaced as one state here (see 02_PLAN.md §5).
      if (params.errorCode || params.error) {
        if (mounted) setState('expired');
        return;
      }

      if (params.code) {
        // PKCE flow: the session must be exchanged for explicitly.
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
        if (!mounted) return;
        setState(exchangeError ? 'expired' : 'ready');
        return;
      }

      // Implicit flow: with `detectSessionInUrl` (default true, not
      // overridden in apps/web/src/lib/supabase.ts), the SDK has already
      // parsed the hash fragment and established a session by the time this
      // effect runs.
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      if (data.session && (params.accessToken || params.type)) {
        setState('ready');
        return;
      }

      if (data.session) {
        // A session exists, but nothing in the URL indicates a fresh
        // invite/recovery redirect — most likely this link was already used
        // in this browser (Supabase's session persisted afterward).
        setState('already-accepted');
        return;
      }

      // No code, no recognized hash, no error, no existing session: this
      // page was reached without a valid invite/recovery link at all.
      setState('no-context');
    }

    void resolveCallback();

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === 'submitting' || settledRef.current) return;
    setError(null);

    if (password.length < 8) {
      setError('كلمة المرور يجب ألا تقل عن 8 أحرف');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    setState('submitting');
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);

      // Required sequence: refresh the Supabase session, then AuthContext,
      // then the authenticated StaffProfile — reusing the existing login
      // endpoint/flow rather than duplicating it.
      await supabase.auth.refreshSession();
      await refreshAuthContext();

      settledRef.current = true;
      setState('success');
      setTimeout(() => navigate('/', { replace: true }), 1200);
    } catch (err) {
      setError(translateSetupError(err instanceof Error ? err.message : ''));
      setState('ready');
    }
  };

  const heading =
    flowType === 'recovery' ? 'إعادة تعيين كلمة المرور' : 'إنشاء كلمة المرور';

  return (
    <main className="bg-muted/30 flex min-h-svh items-center justify-center p-4 sm:p-8">
      <div className="border-border bg-card w-full max-w-sm rounded-2xl border p-6 shadow-sm sm:p-8">
        <h1 className="mb-1 text-center text-2xl font-bold tracking-tight sm:text-start">
          Cleopatra System
        </h1>

        {state === 'verifying' && (
          <div className="text-muted-foreground flex flex-col items-center gap-3 py-8 text-sm">
            <Loader2 className="size-6 animate-spin" />
            جارٍ التحقق من الدعوة…
          </div>
        )}

        {(state === 'ready' || state === 'submitting') && (
          <form onSubmit={handleSubmit}>
            <p className="text-muted-foreground mb-6 text-center text-sm sm:text-start">
              {heading}
            </p>

            {error && (
              <div
                role="alert"
                className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3 text-center text-sm leading-relaxed"
              >
                {error}
              </div>
            )}

            <div className="mb-4 flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                كلمة المرور الجديدة
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="new-password"
                  disabled={state === 'submitting'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  dir="ltr"
                  className="border-input bg-background focus:border-ring w-full rounded-md border px-3 py-2.5 pl-10 text-right text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={state === 'submitting'}
                  tabIndex={-1}
                  aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  className="text-muted-foreground hover:text-foreground absolute inset-y-0 left-0 flex items-center px-3 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-1.5">
              <label htmlFor="confirmPassword" className="text-sm font-medium">
                تأكيد كلمة المرور
              </label>
              <input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                disabled={state === 'submitting'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                dir="ltr"
                className="border-input bg-background focus:border-ring w-full rounded-md border px-3 py-2.5 text-right text-sm outline-none transition-colors focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={state === 'submitting'}
              className="w-full font-medium"
            >
              {state === 'submitting' ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  جارٍ الحفظ…
                </>
              ) : (
                'حفظ كلمة المرور والدخول'
              )}
            </Button>
          </form>
        )}

        {state === 'success' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center text-sm">
            <CheckCircle2 className="text-primary size-8" />
            <p>تم تعيين كلمة المرور بنجاح، جارٍ تحويلك…</p>
          </div>
        )}

        {state === 'expired' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center text-sm">
            <p className="text-destructive">
              انتهت صلاحية هذا الرابط أو أنه غير صالح. اطلب من المسؤول إرسال دعوة جديدة، أو استخدم
              خيار "نسيت كلمة المرور؟" من صفحة تسجيل الدخول.
            </p>
            <Button variant="secondary" onClick={() => navigate('/login')}>
              العودة لتسجيل الدخول
            </Button>
          </div>
        )}

        {state === 'already-accepted' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center text-sm">
            <p>تم قبول هذه الدعوة بالفعل. يمكنك تسجيل الدخول مباشرة.</p>
            <Button variant="secondary" onClick={() => navigate('/login')}>
              الذهاب لتسجيل الدخول
            </Button>
          </div>
        )}

        {state === 'no-context' && (
          <div className="flex flex-col items-center gap-4 py-6 text-center text-sm">
            <p className="text-destructive">هذا الرابط غير صالح لهذه الصفحة.</p>
            <Button variant="secondary" onClick={() => navigate('/login')}>
              العودة لتسجيل الدخول
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
