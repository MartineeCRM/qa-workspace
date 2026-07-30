import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureSession } from "@/lib/auto-session";


export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
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
    ensureSession()
      .then(() => supabase.auth.getSession())
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
      .select("id, display_name, avatar_url")
      .eq("id", userId)
      .maybeSingle();
    if (data) setProfile(data);
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
