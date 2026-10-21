// Read-only row counts for migration 0174 (docs/build-plans/four-agents-and-handoffs.md).
// Run before and after the migration: every table's total must match, the old
// agent ids must be gone, and only the agency keeps the Manager.
//
// Usage: node scripts/agents-regroup-counts.mjs
//   HML_ENV_FILE=<path to .env.local> when running from a worktree without one.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnv() {
  const env = { ...process.env };
  try {
    const text = readFileSync(process.env.HML_ENV_FILE || join(APP_DIR, ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 1 || line.trimStart().startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      if (!(k in env)) env[k] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // No file: rely on process env.
  }
  return env;
}

const env = loadEnv();
const token = env.SUPABASE_ACCESS_TOKEN;
const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
if (!token || !url) {
  console.error("SUPABASE_ACCESS_TOKEN and SUPABASE_URL are needed");
  process.exit(1);
}
const ref = new URL(url).hostname.split(".")[0];

const SQL = `
select 'agent_chats.agent' as col, agent as val, (tenant_id is null) as agency, count(*)::int as n from public.agent_chats group by 2, 3
union all select 'agent_items.agent', agent, (tenant_id is null), count(*)::int from public.agent_items group by 2, 3
union all select 'agent_items.from_agent', coalesce(from_agent, '-'), (tenant_id is null), count(*)::int from public.agent_items group by 2, 3
union all select 'agent_lessons.agent', agent, (tenant_id is null), count(*)::int from public.agent_lessons group by 2, 3
union all select 'client_briefs.section', section, false, count(*)::int from public.client_briefs group by 2
union all select 'client_briefs.updated_by', updated_by, false, count(*)::int from public.client_briefs group by 2
union all select 'client_tasks.owner', owner, false, count(*)::int from public.client_tasks group by 2
union all select 'client_tasks.done_by', coalesce(done_by, '-'), false, count(*)::int from public.client_tasks where done_by is null or done_by like 'agent:%' group by 2
union all select 'agent_messages.fromAgent', m.meta->>'fromAgent', (c.tenant_id is null), count(*)::int
  from public.agent_messages m join public.agent_chats c on c.id = m.chat_id where m.meta ? 'fromAgent' group by 2, 3
order by 1, 2, 3`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: SQL }),
});
if (!res.ok) {
  console.error(`query failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const rows = await res.json();
const totals = {};
for (const r of rows) {
  totals[r.col] = (totals[r.col] ?? 0) + r.n;
  console.log(`${r.col.padEnd(26)} ${String(r.val).padEnd(16)} ${r.agency ? "agency" : "client"} ${r.n}`);
}
console.log("\ntotals");
for (const [k, v] of Object.entries(totals)) console.log(`${k.padEnd(26)} ${v}`);
