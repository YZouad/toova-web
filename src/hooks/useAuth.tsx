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
import { trackLogin, trackSignUp } from '../lib/analytics';
import { supabase } from '../lib/supabase';
import { clearSignedUrlCache } from '../lib/signedUrlCache';
import {
  fetchOwnProfile,
  signAvatarPath,
  type Profile,
} from '../lib/profiles';

interface AuthCtxValue {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  profileLoading: boolean;
  avatarUrl: string | null;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtxValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setAvatarUrl(null);
      setProfileLoading(false);
      return;
    }
    setProfileLoading(true);
    try {
      const p = await fetchOwnProfile();
      setProfile(p);
      const signed = await signAvatarPath(p?.avatar_path);
      setAvatarUrl(signed);
    } catch {
      setProfile(null);
      setAvatarUrl(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const next = data.session?.user ?? null;
      setUser(next);
      void loadProfile(next?.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user ?? null;
      if (event === 'SIGNED_OUT') {
        clearSignedUrlCache();
      }
      setUser(next);
      void loadProfile(next?.id);

      // Email auth is tracked in AuthPage; OAuth completes after redirect.
      if (event === 'SIGNED_IN' && next) {
        const provider = String(next.app_metadata?.provider ?? '');
        if (provider && provider !== 'email') {
          const createdAt = new Date(next.created_at).getTime();
          const isNew = Number.isFinite(createdAt) && Date.now() - createdAt < 60_000;
          if (isNew) trackSignUp(provider);
          else trackLogin(provider);
        }
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(async () => {
    await loadProfile(user === undefined ? undefined : user?.id);
  }, [loadProfile, user]);

  const logout = useCallback(async () => {
    clearSignedUrlCache();
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    (): AuthCtxValue => ({
      loading: user === undefined,
      user: user === undefined ? null : user,
      profile,
      profileLoading,
      avatarUrl,
      refreshProfile,
      logout,
    }),
    [user, profile, profileLoading, avatarUrl, refreshProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtxValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
