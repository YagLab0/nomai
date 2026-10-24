import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")])
);

const email = process.env.TU_EMAIL ?? "viajero@nomai.dev";
const password = process.env.TU_PASS ?? "NomaiViajero#2026";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { role: "traveler", test: true },
});
if (error) { console.error("ERROR:", error.message); process.exit(1); }
console.log(JSON.stringify({ id: data.user.id, email: data.user.email, confirmed: data.user.email_confirmed_at != null }));
