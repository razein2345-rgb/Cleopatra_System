import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AuthContext as AuthContextData } from '@cleopatra/shared';
import { hasPermission } from '@cleopatra/shared';
import { supabase, setRememberMe } from '@/lib/supabase';
import { apiGet, apiPost } from '@/lib/api';

type AuthState = {
  loading: boolean;
  authContext: AuthContextData | null;
  signIn: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  signOut: () => Promise<void>;
  can: (permissionKey: string) => boolean;
};

const AuthReactContext = createContext<AuthState | null>(null);

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

  const signIn = async (email: string, password: string, rememberMe: boolean) => {
    setRememberMe(rememberMe);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    // Registers the login (lastLoginAt + audit log) and returns profile/permissions.
    const ctx = await apiPost<AuthContextData>('/api/auth/login');
    setAuthContext(ctx);
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
    <AuthReactContext.Provider value={{ loading, authContext, signIn, signOut, can }}>
      {children}
    </AuthReactContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthReactContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
