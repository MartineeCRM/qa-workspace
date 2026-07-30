import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

const AUTO_LOGIN_USER_ID = "a1d797c1-9d47-4bc3-a9cf-f56a400c63e7";

/**
 * Signs the visitor into the shared workspace account without a login screen.
 * The password lives only in server-side secrets and is never sent to the browser.
 */
export const autoLogin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.admin.getUserById(AUTO_LOGIN_USER_ID);
  if (userError || !userData.user?.email) {
    throw new Error("Shared account is unavailable");
  }

  // Mint a session via a magic-link token. Unlike a password reset this does
  // not revoke sessions that other tabs/visitors already hold.
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (linkError || !linkData.properties?.hashed_token) {
    throw new Error(linkError?.message ?? "Could not create a session");
  }

  const authClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await authClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: linkData.properties.hashed_token,
  });
  if (error || !data.session) throw new Error(error?.message ?? "Sign-in failed");

  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
});

