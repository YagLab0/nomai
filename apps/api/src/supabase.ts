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
