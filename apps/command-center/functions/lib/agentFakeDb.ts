import type { SupabaseClient } from "@supabase/supabase-js";

// A small in-memory stand-in for the supabase-js query builder, for the Agents
// tests only (agentRunner.test.ts, agentItems.test.ts). It understands exactly
// the calls those libs make: select / insert / update / delete, the eq, is,
// lt, in filters, order, limit and maybeSingle, and a `meta->>key` column for
// one level of jsonb. Every filter is applied for real against the rows, so a
// test that says "only this host's rows" is checked against data, not against
// a recorded list of calls.
//
// Not a test file itself (no .test.ts), so vitest never runs it; it is
// type-checked with the rest of functions/.

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let seq = 0;
function nextId(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
}

function read(r: Row, column: string): unknown {
  const [col, key] = column.split("->>");
  const v = r[col];
  if (key === undefined) return v;
  if (!v || typeof v !== "object") return null;
  const inner = (v as Row)[key];
  return inner === undefined || inner === null ? null : String(inner);
}

class Query implements PromiseLike<{ data: unknown; error: null; count?: number }> {
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;
  private single = false;
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private conflict: string[] = ["id"];
  private ignoreDuplicates = false;
  private payload: Row | Row[] | null = null;
  private returning = false;

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string) {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = "upsert";
    this.payload = rows;
    this.ignoreDuplicates = !!opts.ignoreDuplicates;
    if (opts.onConflict) this.conflict = opts.onConflict.split(",").map((c) => c.trim());
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => read(r, column) === value);
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((r) => (read(r, column) ?? null) === value);
    return this;
  }
  lt(column: string, value: string) {
    this.filters.push((r) => String(read(r, column) ?? "") < value);
    return this;
  }
  gte(column: string, value: string) {
    this.filters.push((r) => String(read(r, column) ?? "") >= value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(read(r, column)));
    return this;
  }
  order(column: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: opts.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run(): { data: unknown; error: null } {
    const rows = this.db.rows(this.table);
    const match = (r: Row) => this.filters.every((f) => f(r));
    const now = this.db.now();
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const made = list.map((p) => {
        const row: Row = { id: nextId(), created_at: now, updated_at: now, ...this.db.defaults(this.table), ...p };
        rows.push(row);
        return { ...row };
      });
      return { data: this.single ? made[0] ?? null : this.returning ? made : null, error: null };
    }
    if (this.op === "upsert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const out: Row[] = [];
      for (const p of list) {
        const hit = rows.find((r) => this.conflict.every((c) => r[c] === p[c]));
        if (hit && this.ignoreDuplicates) continue;
        if (hit) Object.assign(hit, p, { updated_at: now });
        else rows.push({ id: nextId(), created_at: now, updated_at: now, ...this.db.defaults(this.table), ...p });
        out.push({ ...(hit ?? rows[rows.length - 1]) });
      }
      return { data: this.returning ? out : null, error: null };
    }
    if (this.op === "update") {
      const hit = rows.filter(match);
      for (const r of hit) Object.assign(r, this.payload, { updated_at: now });
      const out = hit.map((r) => ({ ...r }));
      return { data: this.single ? out[0] ?? null : this.returning ? out : null, error: null };
    }
    if (this.op === "delete") {
      const keep = rows.filter((r) => !match(r));
      rows.splice(0, rows.length, ...keep);
      return { data: null, error: null };
    }
    let out = rows.filter(match).map((r) => ({ ...r }));
    for (const o of [...this.orders].reverse()) {
      out.sort((a, b) => {
        const x = String(a[o.column] ?? "");
        const y = String(b[o.column] ?? "");
        return o.ascending ? x.localeCompare(y) : y.localeCompare(x);
      });
    }
    if (this.max !== null) out = out.slice(0, this.max);
    return { data: this.single ? out[0] ?? null : out, error: null };
  }

  then<A = { data: unknown; error: null }, B = never>(
    ok?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}

export class FakeDb {
  private tables = new Map<string, Row[]>();
  private clock = "2026-10-17T12:00:00.000Z";

  rows(table: string): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  seed(table: string, rows: Row[]): this {
    this.rows(table).push(...rows.map((r) => ({ ...r })));
    return this;
  }

  setNow(iso: string): this {
    this.clock = iso;
    return this;
  }

  now(): string {
    return this.clock;
  }

  // Column defaults the real tables (0166) fill in, so an insert reads back
  // like a real row.
  defaults(table: string): Row {
    if (table === "agent_messages") return { meta: {}, status: "done", body: "", host: null, error: null };
    if (table === "agent_chats") {
      return { title: "New chat", auto: false, started: false, claude_session_id: nextId(), user_id: null };
    }
    if (table === "agent_items") return { payload: {}, status: "building", approved_at: null, chat_id: null, from_agent: null };
    if (table === "agent_lesson_edits") return { status: "queued", text: null };
    if (table === "agent_ops_commands") return { status: "queued", result: null, done_at: null, created_at: this.clock };
    if (table === "client_tasks") {
      return { steps: [], position: 0, source_node: null, sop_key: null, state: "todo", change: "kept", reason: null, evidence: null, note: null, done_by: null, done_at: null, created_by: null };
    }
    return {};
  }

  client(): SupabaseClient {
    return { from: (table: string) => new Query(this, table) } as unknown as SupabaseClient;
  }
}
