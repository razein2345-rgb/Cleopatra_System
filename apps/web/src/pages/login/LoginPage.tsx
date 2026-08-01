import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/state/AuthContext';
import { supabase } from '@/lib/supabase';

export function LoginPage() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email, password, rememberMe);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setNotice(null);
    if (!email) {
      setError('Enter your email above first, then click "Forgot password".');
      return;
    }
    // Self-service reset goes straight to Supabase — the backend is not
    // involved (see ARCHITECTURE.md's Phase 2 section).
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
    if (resetError) {
      setError(resetError.message);
    } else {
      setNotice('If that email has an account, a reset link has been sent.');
    }
  };

  return (
    <main className="flex min-h-svh items-center justify-center p-8">
      <form
        onSubmit={handleSubmit}
        className="border-border bg-card w-full max-w-sm rounded-2xl border p-8 shadow-sm"
      >
        <h1 className="mb-1 text-2xl font-bold">Cleopatra System</h1>
        <p className="text-muted-foreground mb-6 text-sm">Sign in to continue</p>

        {error && (
          <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 rounded-lg border p-3 text-sm">
            {error}
          </div>
        )}
        {notice && (
          <div className="border-border bg-secondary mb-4 rounded-lg border p-3 text-sm">
            {notice}
          </div>
        )}

        <div className="mb-4 flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-input bg-background focus:border-ring rounded-md border px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="mb-4 flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-input bg-background focus:border-ring rounded-md border px-3 py-2 text-sm outline-none"
          />
        </div>

        <div className="mb-6 flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="size-4"
            />
            Remember me
          </label>
          <button
            type="button"
            onClick={handleForgotPassword}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            Forgot password?
          </button>
        </div>

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  );
}
