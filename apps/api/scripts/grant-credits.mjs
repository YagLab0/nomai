import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>[l.split("=")[0].trim(), l.split("=").slice(1).join("=").trim().replace(/^"|"$/g,"")]));
const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const email = process.env.TU_EMAIL ?? "viajero@nomai.dev";
const amount = Number(process.env.AMOUNT ?? "500");

const { data: list, error: e1 } = await admin.auth.admin.listUsers();
if (e1) throw e1;
const user = list.users.find((u) => u.email === email);
if (!user) throw new Error(`no auth user ${email}`);

// travelers row (app creates it on signup; backfill for admin-created user)
const { error: e2 } = await admin.from("travelers").upsert({ id: user.id }, { onConflict: "id" });
if (e2) throw e2;

const { error: e3 } = await admin.from("credit_ledger").insert({
  traveler_id: user.id,
  amount,
  kind: "free_grant",
  reference: "dev-admin-grant",
  meta: { via: "scripts/grant-credits.mjs" },
});
if (e3) throw e3;

const { data: rows, error: e4 } = await admin.from("credit_ledger").select("amount").eq("traveler_id", user.id);
if (e4) throw e4;
const balance = rows.reduce((s, r) => s + Number(r.amount), 0);
console.log(JSON.stringify({ traveler: user.id, email, granted: amount, balance }));
