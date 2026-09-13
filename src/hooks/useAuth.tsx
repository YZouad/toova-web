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
import { trackLoggedIn, trackSignedUp, type AuthMethod } from '../lib/analytics';
import { startLastActiveHeartbeat } from '../lib/lastActive';
import { supabase } from '../lib/supabase';
import { clearSignedUrlCache } from '../lib/signedUrlCache';
import { loadGuestDesignSnapshot } from '../lib/guestDesignSnapshot';
import {
  fetchOwnProfile,
  signAvatarPath,
  type Profile,
} from '../lib/profiles';
import {
  clearPendingLegalAcceptance,
  flushPendingLegalAcceptance,
  loadPendingLegalAcceptance,
} from '../lib/legalAcceptance';
import {
  clearPasswordRecoveryFlag,
  markPasswordRecovery,
  readPasswordRecoveryFlag,
} from '../lib/passwordRecovery';

interface AuthCtxValue {
  loading: boolean;
  user: User | null;
  profile: Profile | null;
  profileLoading: boolean;
  avatarUrl: string | null;
  /** True after a recovery email link until the password is updated or the user signs out. */
  passwordRecovery: boolean;
  endPasswordRecovery: () => void;
  refreshProfile: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthCtxValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(readPasswordRecoveryFlag);

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
    if (!user?.id) return;
    return startLastActiveHeartbeat();
  }, [user?.id]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const next = data.session?.user ?? null;
      setUser(next);
      void loadProfile(next?.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const next = session?.user ?? null;
      if (event === 'PASSWORD_RECOVERY') {
        markPasswordRecovery();
        setPasswordRecovery(true);
      }
      if (event === 'USER_UPDATED' || event === 'SIGNED_OUT') {
        clearPasswordRecoveryFlag();
        setPasswordRecovery(false);
      }
      if (event === 'SIGNED_OUT') {
        clearSignedUrlCache();
      }
      setUser(next);
      void loadProfile(next?.id);

      // Email auth is tracked in AuthPage; OAuth completes after redirect.
      if (event === 'SIGNED_IN' && next) {
        const rawProvider = String(next.app_metadata?.provider ?? '');
        if (rawProvider && rawProvider !== 'email') {
          const method: AuthMethod = rawProvider === 'google' ? 'google' : rawProvider === 'facebook' ? 'facebook' : 'email';
          const createdAt = new Date(next.created_at).getTime();
          const isNew = Number.isFinite(createdAt) && Date.now() - createdAt < 60_000;
          if (isNew) {
            trackSignedUp({
              user_id: next.id,
              method,
              converted_from_guest: loadGuestDesignSnapshot() != null,
            });
          } else {
            trackLoggedIn({ user_id: next.id, method });
          }
        }

        // Flush clickwrap + DOB stashed before OAuth redirect (or email confirm).
        if (loadPendingLegalAcceptance()) {
          void flushPendingLegalAcceptance().catch((err) => {
            console.error('flushPendingLegalAcceptance failed', err);
            const msg = err instanceof Error ? err.message : '';
            if (/at least 13/i.test(msg)) {
              clearPendingLegalAcceptance();
              void supabase.auth.signOut();
            }
          });
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

  const endPasswordRecovery = useCallback(() => {
    clearPasswordRecoveryFlag();
    setPasswordRecovery(false);
  }, []);

  const logout = useCallback(async () => {
    clearSignedUrlCache();
    endPasswordRecovery();
    await supabase.auth.signOut();
  }, [endPasswordRecovery]);

  const value = useMemo(
    (): AuthCtxValue => ({
      loading: user === undefined,
      user: user === undefined ? null : user,
      profile,
      profileLoading,
      avatarUrl,
      passwordRecovery,
      endPasswordRecovery,
      refreshProfile,
      logout,
    }),
    [user, profile, profileLoading, avatarUrl, passwordRecovery, endPasswordRecovery, refreshProfile, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtxValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
