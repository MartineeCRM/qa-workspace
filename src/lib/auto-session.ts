import { supabase } from "@/integrations/supabase/client";
import { autoLogin } from "./auto-login.functions";

let pending: Promise<boolean> | null = null;

/** Ensures a Supabase session exists, signing in automatically when it doesn't. */
export async function ensureSession(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    // The stored token may reference a revoked session; verify it server-side.
    const { error } = await supabase.auth.getUser();
    if (!error) return true;
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
  if (!pending) {

    pending = (async () => {
      try {
        const tokens = await autoLogin();
        const { error } = await supabase.auth.setSession(tokens);
        return !error;
      } catch (e) {
        console.error("Auto sign-in failed", e);
        return false;
      } finally {
        pending = null;
      }
    })();
  }
  return pending;
}
