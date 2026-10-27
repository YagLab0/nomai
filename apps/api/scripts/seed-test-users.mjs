// Test users for e2e — creates them via the Auth Admin API so GoTrue stores
// well-formed rows (SQL inserts into auth.users can't log in on hosted
// projects — works on local `db reset` only). Idempotent: existing users get
// their password reset instead. Also links the seeded business biz_test to
// the owner account.
//
//   TU_* overrides optional.   node scripts/seed-test-users.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => [l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim().replace(/^"|"$/g, "")])
);

const USERS = [
  { email: process.env.TU_TRAVELER_EMAIL ?? "viajera@nomai.dev", role: "traveler", name: "Viajera Test" },
  { email: process.env.TU_OWNER_EMAIL ?? "duena@nomai.dev", role: "owner", name: "Dueña Test" },
];
const PASSWORD = process.env.TU_PASS ?? "nomai123";

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const ids = {};
for (const u of USERS) {
  const { data: created, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: u.name, name: u.name, country_code: "AR", test: true, role: u.role },
  });
  if (error) {
    // Already exists → reset password so the credentials stay usable.
    const { data: list } = await admin.auth.admin.listUsers();
    const found = list?.users?.find((x) => x.email === u.email);
    if (!found) { console.error("ERROR", u.email, error.message); process.exit(1); }
    const { error: upErr } = await admin.auth.admin.updateUserById(found.id, { password: PASSWORD });
    if (upErr) { console.error("UPDATE ERROR", u.email, upErr.message); process.exit(1); }
    ids[u.role] = found.id;
    console.log(`${u.email} exists — password reset (${found.id})`);
    continue;
  }
  ids[u.role] = created.user.id;
  console.log(`${u.email} created (${created.user.id})`);
}

// Link the seeded business to the owner account (seed.sql sets a placeholder).
if (ids.owner) {
  const { error } = await admin
    .from("businesses")
    .update({ user_id: ids.owner })
    .eq("id", "biz_test");
  if (error) console.error("business link error:", error.message);
  else console.log("biz_test →", ids.owner);
}
