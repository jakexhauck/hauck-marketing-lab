import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentId } from "../../src/lib/agents";
import type { AgentMessage } from "../../src/lib/agentWire";
import { logAdminAction } from "./adminAuth";
import { isUuid } from "./agentItems";
import { messageFromRow } from "./agentRunner";
import { isAppValue } from "./customValuesMirror";
import { ghlFetch, ghlJson, type GhlContext } from "./ghl";

// What the GHL Agent can do in a client's sub-account, and when
// (docs/build-plans/agents.md, Phase 4).
//
// The agent reaches GHL only through the runner's bin/ghl.mjs, which posts
// here (api/agent-runner/ghl.ts). Everything that matters is enforced in this
// file, never in the agent's instructions:
//
//   - An op is a name from GHL_OPS or a 400. There is no raw path, method or
//     body from the agent; each op builds its own request.
//   - Every op, read or write, must come from a RUNNING `me` message in a GHL
//     Agent chat at the same client the call names. A finished message, or
//     one from another agent's chat, gets a 403.
//   - A write also needs writeAllowed: Jake asked for it himself in that chat,
//     or Jake approved a card that carried a ghl grant. Under an approval the
//     write must be one of the card's own payload.ops, op and args exactly.
//   - A write is logged in admin_audit_log as `agent:ghl.<op>` BEFORE it is
//     sent. If the log cannot be saved, nothing is sent.
//
// What the API cannot do, checked against GHL's own OpenAPI specs on
// 2026-10-17: there is no endpoint to create a pipeline or a stage
// (opportunities only lists pipelines), and none to create a funnel or a
// funnel page (funnels only lists funnels and pages, plus redirects, and the
// app has no funnels scope). The agent hands Jake a click-by-click checklist
// for those instead.

type Row = Record<string, unknown>;

export type GhlOpName =
  | "read.pipelines"
  | "read.customValues"
  | "read.customFields"
  | "read.calendars"
  | "write.customValue"
  | "write.customField"
  | "write.tag"
  | "write.moveOpportunity";

// A refusal with its own status, raised from inside an op before it writes.
export class GhlOpRefused extends Error {
  constructor(
    readonly status: 400 | 409,
    message: string,
  ) {
    super(message);
  }
}

type Parsed<A> = { ok: true; args: A } | { ok: false; error: string };

interface Op<A> {
  write: boolean;
  parse(args: Row): Parsed<A>;
  run(g: GhlContext, args: A): Promise<unknown>;
}

// GHL ids are short alphanumeric strings. Anything else (a slash, a dot) could
// steer the path, so it never reaches one.
const GHL_ID = /^[A-Za-z0-9_-]{1,64}$/;

const text = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() && v.length <= max ? v.trim() : null;
const id = (v: unknown): string | null => (typeof v === "string" && GHL_ID.test(v) ? v : null);

const noArgs = (): Parsed<Record<string, never>> => ({ ok: true, args: {} });

// Values that hold credentials (the Location API Token, a Facebook Access
// Token, a webhook's key). The agent's chat is stored and shown, so it never
// sees them, and it cannot overwrite what it cannot see. "auth" also catches
// OAuth and Authorization; "key" counts only as a word of its own, so
// Keyword and Monkey stay visible. Hiding too much is the safe mistake.
const SECRET_NAME = /token|secret|password|passcode|credential|auth(?:oriz|[^o]|$)|api[\s_-]*key|private[\s_-]*key|(?:^|[^a-z])key(?:[^a-z]|$)/i;
// A link that carries its own credential: ?token=, &api_key=, ?sig=,
// X-Amz-Signature and the like, in any query parameter name.
const SECRET_URL = /^https?:\/\/[^\s?#]*\?(?:[^#\s]*&)?[^=&#\s]*(?:token|key|sig)[^=&#\s]*=/i;

export function isSecretValueName(name: string): boolean {
  return SECRET_NAME.test(name);
}

/** A value to keep from the agent: by its name, or because it is a signed link. */
export function isSecretValue(name: string, value: string): boolean {
  return isSecretValueName(name) || SECRET_URL.test(value.trim());
}

const HIDDEN = "(hidden)";

interface RawValue {
  id?: string;
  name?: string;
  value?: string;
  fieldKey?: string;
}

// "{{ custom_values.winter_page }}" and "custom_values.winter_page" both come
// down to "winter_page". Exact match only: a near miss must create, never
// overwrite some other value.
const mergeKey = (s: string) =>
  s.replace(/[{}\s]/g, "").toLowerCase().replace(/^custom_values\./, "");

const valuesPath = (g: GhlContext) => `/locations/${encodeURIComponent(g.locationId)}/customValues`;

async function rawValues(g: GhlContext): Promise<RawValue[]> {
  const data = await ghlJson<{ customValues?: RawValue[] }>(g, valuesPath(g));
  return (data.customValues ?? []).filter((v) => v.id && v.name);
}

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

async function pipelines(g: GhlContext): Promise<Pipeline[]> {
  const data = await ghlJson<{ pipelines?: { id?: string; name?: string; stages?: { id?: string; name?: string }[] }[] }>(
    g,
    `/opportunities/pipelines?locationId=${encodeURIComponent(g.locationId)}`,
  );
  return (data.pipelines ?? [])
    .filter((p) => p.id)
    .map((p) => ({
      id: String(p.id),
      name: String(p.name ?? ""),
      stages: (p.stages ?? []).filter((s) => s.id).map((s) => ({ id: String(s.id), name: String(s.name ?? "") })),
    }));
}

// Custom field types that need nothing beyond a name. Option lists and file
// uploads take more set-up than a one-line ask should carry; Jake adds those.
const FIELD_TYPES = ["TEXT", "LARGE_TEXT", "NUMERICAL", "PHONE", "MONETORY", "DATE"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

const ops = {
  "read.pipelines": {
    write: false,
    parse: noArgs,
    run: (g) => pipelines(g),
  } satisfies Op<Record<string, never>>,

  "read.customValues": {
    write: false,
    parse: noArgs,
    run: async (g) =>
      (await rawValues(g)).map((v) => ({
        id: String(v.id),
        name: String(v.name),
        value: isSecretValue(String(v.name), String(v.value ?? "")) ? HIDDEN : String(v.value ?? ""),
        merge: v.fieldKey ?? null,
        appOwned: isAppValue(String(v.name)),
      })),
  } satisfies Op<Record<string, never>>,

  "read.customFields": {
    write: false,
    parse: noArgs,
    run: async (g) => {
      const data = await ghlJson<{ customFields?: Row[] }>(
        g,
        `/locations/${encodeURIComponent(g.locationId)}/customFields`,
      );
      return (data.customFields ?? [])
        .filter((f) => f.id)
        .map((f) => ({ id: f.id, name: f.name ?? null, fieldKey: f.fieldKey ?? null, dataType: f.dataType ?? null, model: f.model ?? null }));
    },
  } satisfies Op<Record<string, never>>,

  "read.calendars": {
    write: false,
    parse: noArgs,
    run: async (g) => {
      const data = await ghlJson<{ calendars?: Row[] }>(g, `/calendars/?locationId=${encodeURIComponent(g.locationId)}`);
      return (data.calendars ?? [])
        .filter((c) => c.id)
        .map((c) => ({ id: c.id, name: c.name ?? null, active: c.isActive !== false, kind: c.calendarType ?? null }));
    },
  } satisfies Op<Record<string, never>>,

  // key is the value's name as GHL shows it (case does not matter), or its
  // merge key. An existing value is rewritten in place; a new name is added.
  "write.customValue": {
    write: true,
    parse: (a) => {
      const key = text(a.key, 200);
      if (!key) return { ok: false, error: "key is the custom value's name" };
      if (typeof a.value !== "string" || a.value.length > 10000) return { ok: false, error: "value is a string" };
      return { ok: true, args: { key, value: a.value } };
    },
    run: async (g, a) => {
      const want = a.key.toLowerCase();
      const wantKey = mergeKey(a.key);
      const hit = (await rawValues(g)).find(
        (v) => String(v.name).trim().toLowerCase() === want || (!!v.fieldKey && mergeKey(v.fieldKey) === wantKey),
      );
      const name = hit ? String(hit.name) : a.key;
      if (isAppValue(name)) throw new GhlOpRefused(409, `${name} is written by the app`);
      if (isSecretValue(name, String(hit?.value ?? ""))) throw new GhlOpRefused(409, `${name} holds a credential; Jake changes it himself`);
      if (hit) {
        await ghlJson(g, `${valuesPath(g)}/${encodeURIComponent(String(hit.id))}`, {
          method: "PUT",
          body: JSON.stringify({ name, value: a.value }),
        });
        return { action: "updated", name, before: String(hit.value ?? ""), after: a.value };
      }
      await ghlJson(g, valuesPath(g), { method: "POST", body: JSON.stringify({ name, value: a.value }) });
      return { action: "created", name, before: null, after: a.value };
    },
  } satisfies Op<{ key: string; value: string }>,

  "write.customField": {
    write: true,
    parse: (a) => {
      const name = text(a.name, 100);
      if (!name) return { ok: false, error: "name required" };
      if (!FIELD_TYPES.includes(a.type as FieldType)) return { ok: false, error: `type is one of ${FIELD_TYPES.join(", ")}` };
      const model = a.model ?? "contact";
      if (model !== "contact" && model !== "opportunity") return { ok: false, error: "model is contact or opportunity" };
      return { ok: true, args: { name, type: a.type as FieldType, model } };
    },
    run: async (g, a) => {
      const path = `/locations/${encodeURIComponent(g.locationId)}/customFields`;
      const data = await ghlJson<{ customFields?: Row[] }>(g, path);
      const same = (data.customFields ?? []).find((f) => String(f.name ?? "").trim().toLowerCase() === a.name.toLowerCase());
      if (same) throw new GhlOpRefused(409, `a custom field called ${String(same.name)} already exists`);
      const made = await ghlJson<{ customField?: Row }>(g, path, {
        method: "POST",
        body: JSON.stringify({ name: a.name, dataType: a.type, model: a.model }),
      });
      return { action: "created", id: made.customField?.id ?? null, fieldKey: made.customField?.fieldKey ?? null };
    },
  } satisfies Op<{ name: string; type: FieldType; model: "contact" | "opportunity" }>,

  // Adding a tag a contact already has is a no-op at GHL, so this is safe to
  // retry. A tag can fire a workflow, which is why it is a gated write.
  "write.tag": {
    write: true,
    parse: (a) => {
      const contactId = id(a.contactId);
      const tag = text(a.tag, 100);
      if (!contactId || !tag) return { ok: false, error: "contactId and tag required" };
      return { ok: true, args: { contactId, tag } };
    },
    run: async (g, a) => {
      const res = await ghlFetch(
        g,
        `/contacts/${encodeURIComponent(a.contactId)}/tags`,
        { method: "POST", body: JSON.stringify({ tags: [a.tag] }) },
        { idempotentPost: true },
      );
      if (!res.ok) throw new Error(`GHL ${res.status}`);
      return { action: "tagged", contactId: a.contactId, tag: a.tag };
    },
  } satisfies Op<{ contactId: string; tag: string }>,

  "write.moveOpportunity": {
    write: true,
    parse: (a) => {
      const opportunityId = id(a.opportunityId);
      const pipelineId = id(a.pipelineId);
      const stageId = id(a.stageId);
      if (!opportunityId || !pipelineId || !stageId) return { ok: false, error: "opportunityId, pipelineId and stageId required" };
      return { ok: true, args: { opportunityId, pipelineId, stageId } };
    },
    run: async (g, a) => {
      const p = (await pipelines(g)).find((x) => x.id === a.pipelineId);
      const stage = p?.stages.find((s) => s.id === a.stageId);
      if (!p || !stage) throw new GhlOpRefused(400, "no such stage in that pipeline");
      await ghlJson(g, `/opportunities/${encodeURIComponent(a.opportunityId)}`, {
        method: "PUT",
        body: JSON.stringify({ pipelineId: a.pipelineId, pipelineStageId: a.stageId }),
      });
      return { action: "moved", opportunityId: a.opportunityId, pipeline: p.name, stage: stage.name };
    },
  } satisfies Op<{ opportunityId: string; pipelineId: string; stageId: string }>,
};

/** The allowlist. Nothing outside it reaches GHL from an agent. */
export const GHL_OPS: Readonly<Record<GhlOpName, Op<never>>> = ops as unknown as Record<GhlOpName, Op<never>>;

export function isGhlOp(op: unknown): op is GhlOpName {
  return typeof op === "string" && Object.prototype.hasOwnProperty.call(GHL_OPS, op);
}

export function isWriteOp(op: string): boolean {
  return isGhlOp(op) && GHL_OPS[op].write;
}

export function parseOpArgs(op: string, args: unknown): Parsed<Row> {
  if (!isGhlOp(op)) return { ok: false, error: "unknown op" };
  const a = args && typeof args === "object" && !Array.isArray(args) ? (args as Row) : {};
  return (GHL_OPS[op] as unknown as Op<Row>).parse(a);
}

export interface GhlCallerChat {
  agent: AgentId;
  tenantId: string | null;
  auto: boolean;
}

/** The card a grant points at, as the server read it. */
export interface GhlGrantItem {
  id: string;
  agent: AgentId;
  tenantId: string | null;
  approvedAt: string | null;
  // payload.ops: the exact changes the card asked Jake to approve.
  ops?: unknown;
}

/**
 * Is this exact change on the approved card? The card lists its changes as
 * payload.ops: [{ op, args }]. Both sides go through the op's own parser, so
 * "same" means the same request to GHL, not the same spelling. A card with no
 * ops approves no write.
 */
export function opOnCard(ops: unknown, op: GhlOpName, args: Row): boolean {
  if (!Array.isArray(ops)) return false;
  const want = JSON.stringify(args);
  return ops.some((o) => {
    if (!o || typeof o !== "object" || (o as Row).op !== op) return false;
    const p = parseOpArgs(op, (o as Row).args);
    return p.ok && JSON.stringify(p.args) === want;
  });
}

/**
 * May this turn change the client's GHL? Pure; the endpoint reads the rows.
 *
 * Only a running `me` message in a GHL Agent chat, and then one of:
 *   - a direct ask: Jake typed it (no followUpOf, so not a click on a card)
 *     in a chat that is not an Auto startup check;
 *   - an approval: the message carries a ghl grant, it is the follow-up to
 *     that same card, and the card on the server is a GHL Agent card at this
 *     client that Jake approved.
 * A request from another agent is never a direct ask: it arrives as a
 * `request` message, and Jake's answer to it is a follow-up.
 *
 * A Director trigger (lib/taskHandoffs.ts) writes only when every task it
 * carries is set to Acts live; on Needs your OK it goes through a card like
 * anything else (Jake, 2026-10-20). Never Meta, spend or deploys.
 */
export function writeAllowed(message: AgentMessage, chat: GhlCallerChat, item: GhlGrantItem | null = null): boolean {
  if (message.role === "trigger") return message.status === "running" && chat.agent === "ghl" && message.live === true;
  if (message.role !== "me" || message.status !== "running" || chat.agent !== "ghl") return false;
  if (message.followUpOf === null && message.grant === null) return !chat.auto;
  const g = message.grant;
  if (!g || g.kind !== "ghl" || message.followUpOf !== g.itemId) return false;
  return !!item && item.id === g.itemId && item.agent === "ghl" && item.tenantId === chat.tenantId && !!item.approvedAt;
}

export interface GhlCallBody {
  messageId?: unknown;
  tenantId?: unknown;
  op?: unknown;
  args?: unknown;
}

export interface GhlCallDeps {
  ghl(tenantId: string): Promise<GhlContext>;
}

export type GhlCallResult = { status: number; body: Row };

const out = (status: number, body: Row): GhlCallResult => ({ status, body });

function fail(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

// Who the audit row is filed under: Jake, who owns the chat, or for an Auto
// chat (no user) the owner account. admin_id is a real admin by schema.
async function auditAdmin(client: SupabaseClient, chatUser: string | null): Promise<string | null> {
  if (chatUser) return chatUser;
  const { data, error } = await client
    .from("admin_accounts")
    .select("id")
    .eq("role", "owner")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);
  fail("owner", error);
  return (((data ?? [])[0] as Row | undefined)?.id as string | undefined) ?? null;
}

/**
 * POST /api/agent-runner/ghl, minus the HTTP. Every check above happens here,
 * in order, before GHL is called at all.
 */
export async function callGhlOp(client: SupabaseClient, body: GhlCallBody, deps: GhlCallDeps): Promise<GhlCallResult> {
  const op = body.op;
  if (!isGhlOp(op)) return out(400, { error: "unknown op" });
  const parsed = parseOpArgs(op, body.args);
  if (!parsed.ok) return out(400, { error: parsed.error });
  if (!isUuid(body.messageId) || !isUuid(body.tenantId)) return out(400, { error: "messageId and tenantId required" });
  const tenantId = body.tenantId;

  const { data: mRow, error: mErr } = await client.from("agent_messages").select("*").eq("id", body.messageId).maybeSingle();
  fail("message", mErr);
  if (!mRow) return out(403, { error: "not a GHL Agent turn" });
  const message = messageFromRow(mRow as Row);

  const { data: cRow, error: cErr } = await client
    .from("agent_chats")
    .select("id, tenant_id, agent, auto, user_id")
    .eq("id", message.chatId)
    .maybeSingle();
  fail("chat", cErr);
  const c = cRow as Row | null;
  const chat: GhlCallerChat | null = c
    ? { agent: c.agent as AgentId, tenantId: (c.tenant_id as string | null) ?? null, auto: c.auto === true }
    : null;
  // Jake's turn or a Director trigger turn; writeAllowed below decides writes.
  // Reads also for the CSM at its own client and the agency Manager at any
  // client (hermes-agent-ops follow-up, 2026-10-22: every agent on the
  // platforms we use). Writes stay the GHL Agent's alone.
  const ghlChat = !!chat && chat.agent === "ghl" && chat.tenantId === tenantId;
  const readChat =
    !!chat && !GHL_OPS[op].write && ((chat.agent === "csm" && chat.tenantId === tenantId) || (chat.agent === "manager" && chat.tenantId === null));
  const roleOk = message.role === "me" || message.role === "trigger" || (readChat && message.role === "request");
  if (!chat || !(ghlChat || readChat) || !roleOk || message.status !== "running") {
    return out(403, { error: "not a GHL Agent turn for this client" });
  }

  const write = GHL_OPS[op].write;
  let item: GhlGrantItem | null = null;
  if (write) {
    if (message.grant) {
      const { data: iRow, error: iErr } = await client
        .from("agent_items")
        .select("id, tenant_id, agent, approved_at, payload")
        .eq("id", message.grant.itemId)
        .maybeSingle();
      fail("item", iErr);
      const i = iRow as Row | null;
      item = i
        ? {
            id: i.id as string,
            agent: i.agent as AgentId,
            tenantId: (i.tenant_id as string | null) ?? null,
            approvedAt: (i.approved_at as string | null) ?? null,
            ops: ((i.payload as Row | null) ?? {}).ops,
          }
        : null;
    }
    if (!writeAllowed(message, chat, item)) {
      return out(403, { error: "GHL changes need Jake's ask in this chat or his Approve on a card" });
    }
    // A trigger's live was set when it was queued; Jake may have switched a
    // task back, cut or deleted it since. Every task it carries must still be
    // a GHL task in Doing that acts live, read now, or nothing is written.
    if (message.role === "trigger") {
      const keys = ((mRow as Row).meta as Row | null)?.taskKeys;
      const list = Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : [];
      const { data: tRows, error: tErr } = list.length
        ? await client.from("client_tasks").select("key, owner, state, mode").eq("tenant_id", tenantId).in("key", list)
        : { data: [], error: null };
      fail("tasks", tErr);
      const rows = (tRows ?? []) as Row[];
      const stillLive =
        list.length > 0 &&
        list.every((k) => rows.some((r) => r.key === k && r.owner === "ghl" && r.state === "doing" && r.mode === "live"));
      if (!stillLive) return out(403, { error: "these tasks no longer act live, so GHL changes need a card" });
    }
    // Under an approval, only what the card listed. Jake's direct ask in the
    // chat carries no grant and is not bound to a card (his call).
    if (message.grant && !opOnCard(item?.ops, op, parsed.args)) {
      return out(403, { error: "that change is not on the card Jake approved" });
    }
  }

  let g: GhlContext;
  try {
    g = await deps.ghl(tenantId);
  } catch (err) {
    const status = (err as { status?: number }).status;
    return out(typeof status === "number" ? status : 502, { error: (err as Error).message });
  }

  let adminId: string | null = null;
  const audit = { messageId: message.id, chatId: message.chatId, itemId: item?.id ?? null, op, args: parsed.args };
  if (write) {
    adminId = await auditAdmin(client, (c?.user_id as string | null) ?? null);
    const logged = adminId ? await logAdminAction(client, adminId, `agent:ghl.${op}`, tenantId, audit) : false;
    if (!logged) return out(500, { error: "could not record the change, so it was not made" });
  }

  try {
    const result = await (GHL_OPS[op] as unknown as Op<Row>).run(g, parsed.args);
    return out(200, { op, result });
  } catch (err) {
    if (write && adminId) {
      await logAdminAction(client, adminId, "agent:ghl.failed", tenantId, { ...audit, error: (err as Error).message });
    }
    if (err instanceof GhlOpRefused) return out(err.status, { error: err.message });
    return out(502, { error: `GHL said no: ${(err as Error).message}` });
  }
}
