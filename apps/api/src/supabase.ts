import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.js";

/**
 * Admin client — authenticates with the secret key and bypasses RLS.
 * Server-side only: never import this from anything that ships to a browser.
 */
export function createSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set");
  }
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * User-scoped client — the publishable key plus the caller's verified
 * access token forwarded as Authorization, so RLS applies exactly as it
 * did to the browser session. For writes the platform allows users to
 * make under RLS (e.g. Owner onboarding inserts); anything RLS denies
 * must go through the admin client instead.
 */
export function createSupabaseUser(accessToken: string) {
  const url = process.env.SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set");
  }
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
