import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { AuthError, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  email: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ data: { session: Session | null }; error: AuthError | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setProfile(null);
    });
    supabase.auth
      .getSession()
      .then(({ data: d }) => setSession(d.session))
      .finally(() => setLoading(false));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const fallbackName =
      (session?.user.user_metadata?.display_name as string | undefined) ??
      session?.user.email?.split("@")[0] ??
      "New user";
    supabase
      .rpc("ensure_profile", { _display_name: fallbackName })
      .then(({ data }) => {
        if (!cancelled && data) setProfile(data as unknown as Profile);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, session?.user.email, session?.user.user_metadata?.display_name]);

  async function refreshProfile() {
    if (!userId) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, email")
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile(data);
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    return { data, error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        loading,
        refreshProfile,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
