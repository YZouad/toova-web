import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthCtxValue {
  loading: boolean;
  user: User | null;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtxValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = not yet resolved; null = logged out; User = logged in
  const [user, setUser] = useState<User | null | undefined>(undefined);

  useEffect(() => {
    // Fetch the current session on mount
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
    });

    // Keep state in sync with Supabase auth changes (login, logout, token refresh)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    // setUser is handled by onAuthStateChange
  }, []);

  const value = useMemo(
    (): AuthCtxValue => ({
      loading: user === undefined,
      user: user === undefined ? null : user,
      logout,
    }),
    [user, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtxValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
