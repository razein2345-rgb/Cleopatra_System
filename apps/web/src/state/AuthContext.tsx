import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthContext as AuthContextData } from '@cleopatra/shared';
import { buildInternalLoginEmail, hasPermission } from '@cleopatra/shared';
import { supabase, setRememberMe } from '@/lib/supabase';
import { apiGet, apiPost } from '@/lib/api';

type AuthState = {
  loading: boolean;
  authContext: AuthContextData | null;
  signIn: (identifier: string, password: string, rememberMe: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permissionKey: string) => boolean;
  /**
   * Registers the current Supabase session with the backend (lastLoginAt +
   * audit log) and loads the resulting StaffProfile/permissions. Used by
   * `signIn()` after a fresh sign-in, and by the invite-acceptance/password
   * setup flow after a brand-new session's password is set for the first
   * time — same endpoint, same result shape, no duplicate logic.
   */
  refreshAuthContext: () => Promise<void>;
};

const AuthReactContext = createContext<AuthState | null>(null);

// Egyptian mobile format, e.g. "01012345678" — the shape the login UI's example uses.
const EGYPT_MOBILE_PATTERN = /^0\d{10}$/;

/** Normalizes a bare local mobile number to E.164 so Supabase's phone-based sign-in accepts it. */
function normalizePhone(value: string): string {
  const digitsOnly = value.replace(/[\s-]/g, '');
  if (digitsOnly.startsWith('+')) return digitsOnly;
  if (EGYPT_MOBILE_PATTERN.test(digitsOnly)) return `+20${digitsOnly.slice(1)}`;
  return digitsOnly;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authContext, setAuthContext] = useState<AuthContextData | null>(null);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        try {
          const ctx = await apiGet<AuthContextData>('/api/auth/me');
          if (mounted) setAuthContext(ctx);
        } catch {
          if (mounted) setAuthContext(null);
        }
      }
      if (mounted) setLoading(false);
    }

    void bootstrap();

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) setAuthContext(null);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  // Registers the login (lastLoginAt + audit log) and loads profile/permissions.
  const refreshAuthContext = async () => {
    const ctx = await apiPost<AuthContextData>('/api/auth/login');
    setAuthContext(ctx);
  };

  const signIn = async (identifier: string, password: string, rememberMe: boolean) => {
    setRememberMe(rememberMe);
    const trimmed = identifier.trim();
    // FEATURE-015 — an employee with no real email logs in with the short
    // ID the owner assigned them (see buildInternalLoginEmail); anything
    // that isn't an email and doesn't look like a phone number is treated
    // as one of those IDs rather than falling through to a doomed
    // phone-format sign-in attempt.
    const isPhone = !trimmed.includes('@') && (trimmed.startsWith('+') || EGYPT_MOBILE_PATTERN.test(trimmed.replace(/[\s-]/g, '')));
    const email = trimmed.includes('@')
      ? trimmed
      : isPhone
        ? null
        : buildInternalLoginEmail(trimmed);
    const { error } = email
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signInWithPassword({ phone: normalizePhone(trimmed), password });
    if (error) throw new Error(error.message);
    await refreshAuthContext();
  };

  const signOut = async () => {
    try {
      // Must run before supabase.auth.signOut() — that call invalidates the
      // token this request needs to authenticate itself.
      await apiPost('/api/auth/logout');
    } finally {
      await supabase.auth.signOut();
      setAuthContext(null);
    }
  };

  const can = (permissionKey: string) => {
    if (!authContext) return false;
    return hasPermission(authContext.permissions, permissionKey);
  };

  return (
    <AuthReactContext.Provider
      value={{ loading, authContext, signIn, signOut, can, refreshAuthContext }}
    >
      {children}
    </AuthReactContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthReactContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
