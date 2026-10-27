import { Client } from "eve/client";
const client = new Client({ host: "http://localhost:3000" });
const { session } = await client.sessions.create();
const msgs = process.argv.slice(2);
let lastText = "";
for (const m of msgs) {
  lastText = "";
  for await (const ev of await session.send(m)) {
    if (ev.type === "message.appended") lastText += ev.data?.messageDelta ?? "";
    if (ev.type === "action.result") console.log(`  [tool] ${ev.data?.result?.toolName}`);
    if (ev.type === "turn.failed" || ev.type === "session.failed") console.log(`  [FAIL] ${JSON.stringify(ev.data)}`);
  }
  console.log(`\n=== "${m}" ===`);
  const programs = [...lastText.matchAll(/```openui-lang([\s\S]*?)```/g)].map((x) => x[1].trim());
  const components = new Set();
  for (const p of programs) for (const mm of p.matchAll(/([A-Z][A-Za-z]+)\(/g)) components.add(mm[1]);
  console.log("programs:", programs.length, "| components:", [...components].join(", "));
  console.log(lastText.slice(0, 2500));
}
