import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ID, type Models } from 'react-native-appwrite';
import { account, teams } from '@/lib/appwrite';
import { config } from '@/lib/config';
import { clearDek, getDek } from '@/lib/keyring';
import { cleanEmail } from '@/lib/sanitize';

type User = Models.User<Models.Preferences>;

type AuthValue = {
  user: User | null;
  /** Member of the Appwrite "admins" team. UI hint only; Appwrite permissions enforce it server-side. */
  isAdmin: boolean;
  /** Signed in with the first factor, but Appwrite requires a second one before anything else works. */
  mfaRequired: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ isAdmin: boolean; mfaRequired: boolean }>;
  /** Email one-time code (passwordless). Returns the userId to verify against and the anti-phishing phrase. */
  sendEmailCode: (email: string) => Promise<{ userId: string; phrase: string }>;
  verifyEmailCode: (userId: string, code: string) => Promise<{ isAdmin: boolean; mfaRequired: boolean }>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<{ isAdmin: boolean; mfaRequired: boolean }>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const u = await account.get();
      const myTeams = await teams.list().catch(() => ({ teams: [] as { $id: string }[] }));
      const admin = myTeams.teams.some((t) => t.$id === config.adminTeamId);
      setUser(u);
      setIsAdmin(admin);
      setMfaRequired(false);
      getDek(u.$id).catch(() => {}); // warm the encryption key in the background
      return { isAdmin: admin, mfaRequired: false };
    } catch (e: any) {
      // Appwrite blocks the whole account API until the second factor is completed.
      const needsMfa = e?.type === 'user_more_factors_required';
      setUser(null);
      setIsAdmin(false);
      setMfaRequired(needsMfa);
      return { isAdmin: false, mfaRequired: needsMfa };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await account.createEmailPasswordSession({ email: cleanEmail(email), password });
      return load();
    },
    [load],
  );

  const sendEmailCode = useCallback(async (email: string) => {
    // ID.unique() is ignored for an existing email: Appwrite returns that user's id.
    const token = await account.createEmailToken({ userId: ID.unique(), email: cleanEmail(email), phrase: true });
    return { userId: token.userId, phrase: token.phrase };
  }, []);

  const verifyEmailCode = useCallback(
    async (userId: string, code: string) => {
      await account.createSession({ userId, secret: code.replace(/\D/g, '') });
      return load();
    },
    [load],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string) => {
      await account.create({ userId: ID.unique(), email: cleanEmail(email), password, name: name.trim().slice(0, 128) });
      await signIn(email, password);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    if (user) await clearDek(user.$id);
    await account.deleteSession({ sessionId: 'current' }).catch(() => {});
    setUser(null);
    setIsAdmin(false);
    setMfaRequired(false);
  }, [user]);

  const value = useMemo(
    () => ({ user, isAdmin, mfaRequired, loading, signIn, sendEmailCode, verifyEmailCode, signUp, signOut, refresh: load }),
    [user, isAdmin, mfaRequired, loading, signIn, sendEmailCode, verifyEmailCode, signUp, signOut, load],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Turns Appwrite errors into something a shopper can act on. */
export function authErrorMessage(e: unknown): string {
  const err = e as { code?: number; type?: string; message?: string };
  switch (err?.type) {
    case 'user_invalid_credentials':
      return 'That email and password don’t match.';
    case 'user_invalid_token':
      return 'That code is wrong or has expired. Request a new one.';
    case 'user_already_exists':
      return 'An account with that email already exists. Try signing in.';
    case 'general_rate_limit_exceeded':
      return 'Too many attempts. Wait a minute and try again.';
    case 'user_session_already_exists':
      return 'You’re already signed in on this device.';
    case 'user_challenge_required':
    case 'user_more_factors_required':
      return 'Finish two-step verification to continue.';
  }
  if (err?.code === 401) return 'That didn’t work. Check your details and try again.';
  if (err?.code === 429) return 'Too many attempts. Wait a minute and try again.';
  return err?.message ?? 'Something went wrong. Please try again.';
}
