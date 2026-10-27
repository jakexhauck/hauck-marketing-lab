import { CHECKLIST_TASKS } from "../../src/lib/onboarding";
import { createTenantWithOwner, seedOnboardingRecord } from "./clientCreate";
import { runChecks } from "./clientAccountsRun";
import { agencyHealth, clientHealth } from "./connectionsHealth";
import { writeCustomValues } from "./customValuesProvision";
import { appMinter, resolveTenantGhl } from "./ghlCreds";
import { provisionOwnerLinks } from "./ghlProvision";
import { newPassword } from "./ghlSetup";
import { audited, botName, findClient, listClients, type GrokDeps, type ToolDef } from "./grokMcp";
import { hashPassword } from "./password";
import { CAPABILITIES, type GrantInput } from "./permissions";
import { isNotAClient } from "./retiredTenant";
import { MAX_SCRIPT_HTML, sanitizeScriptHtml, scriptColumn, textToScriptHtml } from "./setterScript";
import { normalizeEmail, type StaffRole } from "./staff";
import { createStaffLogin } from "./staffCreate";
import { linkSubaccount, type LinkResult } from "./subaccountLinkRun";
import { isPlaceholder } from "./tenantGhl";
import { loadTenantById } from "./tenantResolve";

// The Software connector: the Command Center itself, for the bot that stands
// clients up and keeps their app healthy (Jake, 2026-10-26: "create new client
// sub accounts inside of the software, make sure the client's software is always
// up and running"). Every tool here is a path the app already has, never a
// second copy of one:
//
//   - a new client is the Add Client form (lib/clientCreate.ts), held at setup;
//   - a link is the Link button (lib/subaccountLinkRun.ts);
//   - a login is the Team screen's add (lib/staffCreate.ts);
//   - health is Client > Accounts (lib/clientAccountsRun.ts) and the control
//     room snapshot (lib/connectionsHealth.ts);
//   - a fix is Provision (custom values and owner links into GHL);
//   - Go Live is the Onboarding page's button (Jake, 2026-10-27: "the connector
//     needs to have access to make the client software go live").
//
// Every change is an admin_audit_log row `grok:<tool>` before it is made. A
// password is made inside that change, so it can never be in the log row, and
// is handed back once for the bot to pass on. Not here, on purpose: deleting a
// client and password resets.

type Row = Record<string, unknown>;

const json = (v: unknown) => JSON.stringify(v, null, 1);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The pages a team login can be given, by key. Retired pages are never offered. */
export const LOGIN_PAGES = CAPABILITIES.filter((c) => !c.retired).map((c) => c.key);

const ROLES: StaffRole[] = ["owner", "manager", "rep"];

export function loginRole(v: unknown): StaffRole {
  const r = text(v).toLowerCase() || "rep";
  if (!(ROLES as string[]).includes(r)) throw new Error(`role is one of ${ROLES.join(", ")}`);
  return r as StaffRole;
}

/** Full use of each page named; none named means every page. An unknown key is an error, never dropped. */
export function pageGrants(pages: unknown): GrantInput[] {
  if (pages === undefined || pages === null) return LOGIN_PAGES.map((capability) => ({ capability, view: true, edit: true }));
  if (!Array.isArray(pages)) throw new Error(`pages is a list of: ${LOGIN_PAGES.join(", ")}`);
  const bad = pages.filter((p) => !LOGIN_PAGES.includes(String(p) as (typeof LOGIN_PAGES)[number]));
  if (bad.length) throw new Error(`Unknown page ${bad.join(", ")}. Pages: ${LOGIN_PAGES.join(", ")}`);
  return pages.map((p) => ({ capability: String(p), view: true, edit: true }));
}

export function loginEmail(v: unknown): string {
  const email = normalizeEmail(text(v));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("a valid email is required");
  return email;
}

/** Only what needs a look: green rows are counted, not listed. */
export function problemsOnly<T extends { state: string }>(checks: T[]): { ok: number; problems: T[] } {
  const problems = checks.filter((c) => c.state !== "ok");
  return { ok: checks.length - problems.length, problems };
}

/**
 * The control room's connections in two piles: failing is a credential the
 * vendor refused just now; not set up is a feature whose keys were never added
 * (Telegram, in-app deploys), which is a decision, not an outage.
 */
export function splitConnections<T extends { id: string; configured: boolean; missing: string[]; probe: { state: string; detail: string } }>(connections: T[]) {
  const failing = connections.filter((c) => c.probe.state === "failed");
  const notSetUp = connections.filter((c) => c.probe.state !== "failed" && !c.configured);
  return {
    ok: connections.length - failing.length - notSetUp.length,
    failing: failing.map((c) => ({ id: c.id, detail: c.probe.detail })),
    notSetUp: notSetUp.map((c) => ({ id: c.id, missing: c.missing })),
  };
}

function linkSummary(r: LinkResult) {
  const failed = [
    ...r.provision.filter((p) => p.outcome.startsWith("failed")).map((p) => `${p.name}: ${p.outcome}`),
    ...r.customValues.failed.map((f) => `${f.name} (${f.status})`),
  ];
  return { linked: true, locationId: r.locationId, setupFailed: failed, customValuesNotFound: r.customValues.notFound };
}

/** An email is one login across every client; say whose it is rather than half-make a client. */
async function assertEmailFree(d: GrokDeps, email: string): Promise<void> {
  const { data, error } = await d.client.from("staff_accounts").select("tenant_id").eq("email", email).limit(1);
  if (error) throw new Error(`logins: ${error.message}`);
  const holder = ((data ?? []) as Row[])[0];
  if (!holder) return;
  const { data: t } = await d.client.from("tenants").select("name").eq("id", String(holder.tenant_id)).maybeSingle();
  throw new Error(`${email} already has a login (${String((t as Row | null)?.name ?? "another client")}).`);
}

const bot = { type: "string", description: "Your name, for the change log." };
const clientArg = { type: "string", description: "Client name or slug." };

const softwareClients: ToolDef<GrokDeps> = {
  name: "software_clients",
  description: "Every client in the software: setup or live, GHL linked, Meta ad account, and each login (email, role).",
  inputSchema: { type: "object", properties: {}, required: [] },
  run: async (d) => {
    const [clients, tenants, staff] = await Promise.all([
      listClients(d.client),
      d.client.from("tenants").select("id, onboarding_status, ghl_location_id, ghl_token, meta_ad_account_id"),
      d.client.from("staff_accounts").select("tenant_id, email, role, status"),
    ]);
    if (tenants.error) throw new Error(`clients: ${tenants.error.message}`);
    if (staff.error) throw new Error(`logins: ${staff.error.message}`);
    const byId = new Map(((tenants.data ?? []) as Row[]).map((t) => [String(t.id), t]));
    const logins = new Map<string, { email: string; role: string; active: boolean }[]>();
    for (const s of (staff.data ?? []) as Row[]) {
      const list = logins.get(String(s.tenant_id)) ?? [];
      list.push({ email: String(s.email), role: String(s.role), active: s.status === "active" });
      logins.set(String(s.tenant_id), list);
    }
    return json(
      clients.map((c) => {
        const t = byId.get(c.id) ?? {};
        const loc = t.ghl_location_id as string | null;
        return {
          client: c.name,
          slug: c.slug,
          status: t.onboarding_status === "setup" ? "setup" : "live",
          ghlLinked: !isPlaceholder(loc) && !isPlaceholder(t.ghl_token as string | null),
          locationId: isPlaceholder(loc) ? null : loc,
          metaAdAccountId: (t.meta_ad_account_id as string | null) || null,
          logins: logins.get(c.id) ?? [],
        };
      }),
    );
  },
};

const softwareCreateClient: ToolDef<GrokDeps> = {
  name: "software_create_client",
  description:
    "Create a new client in the software, held at setup until software_go_live: the client, the owner's login and the onboarding record. Pass ghl_location_id to link their GHL sub-account too. Returns the login with a new password, shown once.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Business name." },
      trade: { type: "string", description: "e.g. windows, hvac, roofing." },
      owner_name: { type: "string" },
      owner_email: { type: "string", description: "The owner's login email." },
      ghl_location_id: { type: "string", description: "Their GHL sub-account id, if it exists yet." },
      bot,
    },
    required: ["name", "owner_email"],
  },
  run: async (d, a) => {
    const name = text(a.name);
    if (!name) throw new Error("name is required");
    const email = loginEmail(a.owner_email);
    const locationId = text(a.ghl_location_id);
    await assertEmailFree(d, email);
    const payload = { bot: botName(a.bot), name, trade: text(a.trade) || null, owner_email: email, ghl_location_id: locationId || null };
    return audited(d.client, "software_create_client", null, payload, async () => {
      const password = newPassword();
      const created = await createTenantWithOwner(d.client, {
        name,
        niche: text(a.trade) || undefined,
        ownerEmail: email,
        ownerName: text(a.owner_name) || undefined,
        ownerPasswordHash: await hashPassword(password),
        onboardingStatus: "setup",
      });
      const warnings: string[] = [];
      if (created.ownerWarning) warnings.push(`The owner login was not made: ${created.ownerWarning}`);
      const onboarding = await seedOnboardingRecord(d.client, created.tenantId, { name }, CHECKLIST_TASKS.map((t) => t.key));
      if (onboarding) warnings.push(onboarding);
      let ghl: unknown = null;
      if (locationId) {
        const r = await linkSubaccount(d.client, d.env, created.tenantId, locationId, d.origin, null);
        ghl = r.ok ? linkSummary(r) : { linked: false, error: r.error };
      }
      return json({
        client: name,
        slug: created.slug,
        status: "setup",
        login: created.ownerWarning ? null : { url: `${d.origin}/login`, email, password },
        ghl,
        warnings,
      });
    });
  },
};

const softwareLinkGhl: ToolDef<GrokDeps> = {
  name: "software_link_ghl",
  description:
    "Link a client to their GHL sub-account through the Marketplace app, then write the setup values into it. Same as the Link button. Refused if another client holds that sub-account or the app is not installed on it.",
  inputSchema: {
    type: "object",
    properties: { client: clientArg, location_id: { type: "string", description: "The GHL sub-account id." }, bot },
    required: ["client", "location_id"],
  },
  run: async (d, a) => {
    const locationId = text(a.location_id);
    if (!locationId) throw new Error("location_id is required");
    const c = await findClient(d.client, a.client);
    const payload = { bot: botName(a.bot), location_id: locationId };
    return audited(d.client, "software_link_ghl", c.id, payload, async () => {
      const r = await linkSubaccount(d.client, d.env, c.id, locationId, d.origin, null);
      if (!r.ok) throw new Error(r.error);
      return json({ client: c.name, ...linkSummary(r) });
    });
  },
};

const softwareAddLogin: ToolDef<GrokDeps> = {
  name: "software_add_login",
  description: `Add a login to a client's software. Role owner, manager or rep (default rep). pages limits a manager or rep to those pages; leave it out for every page. Pages: ${LOGIN_PAGES.join(", ")}. Returns a new password, shown once.`,
  inputSchema: {
    type: "object",
    properties: {
      client: clientArg,
      name: { type: "string", description: "The person's name." },
      email: { type: "string" },
      role: { type: "string", enum: ROLES },
      pages: { type: "array", items: { type: "string", enum: LOGIN_PAGES } },
      bot,
    },
    required: ["client", "name", "email"],
  },
  run: async (d, a) => {
    const name = text(a.name);
    if (!name) throw new Error("name is required");
    const email = loginEmail(a.email);
    const role = loginRole(a.role);
    const permissions = pageGrants(a.pages);
    const c = await findClient(d.client, a.client);
    await assertEmailFree(d, email);
    const payload = { bot: botName(a.bot), name, email, role, pages: permissions.map((p) => p.capability) };
    return audited(d.client, "software_add_login", c.id, payload, async () => {
      const password = newPassword();
      const r = await createStaffLogin(d.client, c.id, { name, email, role, password, permissions });
      if (!r.ok) throw new Error(r.error);
      return json({ client: c.name, login: { url: `${d.origin}/login`, name, email, role, password, pages: payload.pages } });
    });
  },
};

const softwareClientHealth: ToolDef<GrokDeps> = {
  name: "software_client_health",
  description:
    "The Client > Accounts checks: GHL app, texting, pipeline, calendars, owner links, owner phone, Meta ad account, Facebook Page, client login, phone notifications. One client lists every check; leave client out for every client's problems only. status setup means onboarding is not finished, so red there is expected.",
  inputSchema: { type: "object", properties: { client: clientArg }, required: [] },
  run: async (d, a) => {
    const one = async (id: string) => {
      const r = await runChecks(d.env, id, d.origin);
      if ("error" in r) throw new Error(r.error);
      return r.body.checks;
    };
    const { data: rows, error } = await d.client.from("tenants").select("id, onboarding_status");
    if (error) throw new Error(`clients: ${error.message}`);
    const setup = new Set(((rows ?? []) as Row[]).filter((t) => t.onboarding_status === "setup").map((t) => String(t.id)));
    const status = (id: string) => (setup.has(id) ? "setup" : "live");
    if (text(a.client)) {
      const c = await findClient(d.client, a.client);
      const checks = await one(c.id);
      return json({ client: c.name, status: status(c.id), red: problemsOnly(checks).problems.length, checks });
    }
    // A few at a time: each client is a handful of GHL reads.
    const clients = await listClients(d.client);
    const out: unknown[] = [];
    for (let i = 0; i < clients.length; i += 3) {
      const batch = clients.slice(i, i + 3);
      out.push(
        ...(await Promise.all(
          batch.map(async (c) => {
            try {
              return { client: c.name, status: status(c.id), ...problemsOnly(await one(c.id)) };
            } catch (err) {
              return { client: c.name, status: status(c.id), error: (err as Error).message };
            }
          }),
        )),
      );
    }
    return json(out);
  },
};

const softwareSystemHealth: ToolDef<GrokDeps> = {
  name: "software_system_health",
  description:
    "Is the software itself up: the app answering, the database, Meta token, Drive, GitHub, the scheduled jobs, the background error rate, and each client's GHL key. failing is broken now; notSetUp is a feature never switched on; green is counted.",
  inputSchema: { type: "object", properties: {}, required: [] },
  run: async (d) => {
    const site = fetch(`${d.origin}/`, { signal: AbortSignal.timeout(6000) })
      .then((r) => ({ state: r.ok ? "ok" : "failed", detail: `Returned ${r.status}` }))
      .catch((e: Error) => ({ state: "failed", detail: e.message }));
    const [app, connections, clients] = await Promise.all([site, agencyHealth(d.env), clientHealth(d.env)]);
    return json({
      checkedAt: new Date().toISOString(),
      app,
      connections: splitConnections(connections),
      clientGhl: clients
        .filter((c) => !isNotAClient({ name: c.name, slug: c.slug }))
        .map((c) => ({ client: c.name, state: c.ghlProbe.state, detail: c.ghlProbe.detail })),
    });
  },
};

const softwareFix: ToolDef<GrokDeps> = {
  name: "software_fix",
  description:
    "Re-run a client's setup writes into GHL: the mapped custom values and the owner links (Open Lead and the rest). Same as Provision. The client must be linked to GHL.",
  inputSchema: { type: "object", properties: { client: clientArg, bot }, required: ["client"] },
  run: async (d, a) => {
    const c = await findClient(d.client, a.client);
    const tenant = await loadTenantById(d.client, c.id);
    const creds = tenant ? await resolveTenantGhl(tenant, appMinter(d.client, d.env)) : null;
    if (!creds) throw new Error(`${c.name} is not linked to a GHL sub-account. Link it first.`);
    return audited(d.client, "software_fix", c.id, { bot: botName(a.bot) }, async () => {
      const values = await writeCustomValues(d.client, c.id, creds, null);
      const links = await provisionOwnerLinks(creds, d.origin, (d.env.SESSION_SECRET ?? "").trim());
      const linkFailed = links.filter((l) => l.outcome.startsWith("failed"));
      return json({
        client: c.name,
        ok: values.ok && linkFailed.length === 0,
        written: [...values.written, ...links.filter((l) => !l.outcome.startsWith("failed")).map((l) => l.name)],
        failed: [...values.failed, ...linkFailed.map((l) => ({ name: l.name, outcome: l.outcome }))],
        notFound: values.notFound,
        ...(values.preflight ? { preflight: values.preflight } : {}),
      });
    });
  },
};

const softwareGoLive: ToolDef<GrokDeps> = {
  name: "software_go_live",
  description:
    "Take a client from setup to live, the Onboarding page's Go Live: it clears them off the Onboarding list. Their app already opens once GHL is linked, so this marks the setup finished.",
  inputSchema: { type: "object", properties: { client: clientArg, bot }, required: ["client"] },
  run: async (d, a) => {
    const c = await findClient(d.client, a.client);
    const { data, error } = await d.client.from("tenants").select("onboarding_status").eq("id", c.id).maybeSingle();
    if (error) throw new Error(`client: ${error.message}`);
    // Already live is not an error, the same as a second click on the button.
    if ((data as Row | null)?.onboarding_status === "live") return json({ client: c.name, status: "live", alreadyLive: true });
    return audited(d.client, "software_go_live", c.id, { bot: botName(a.bot) }, async () => {
      const { error: upErr } = await d.client.from("tenants").update({ onboarding_status: "live" }).eq("id", c.id);
      if (upErr) throw new Error(upErr.message);
      return json({ client: c.name, status: "live" });
    });
  },
};

// The dialing script and notes on Client Setting (setter_scripts, 0044 and
// 0185; Jake 2026-10-27: "so the grok bot can upload the dialing script from the
// mission control doc into the client setting page"). The bot reads the doc
// with its own Drive connector and hands the script over here.
const docArg = {
  type: "string",
  enum: ["script", "notes"],
  description: "script (default) is the dialing script; notes are the client's notes shown beside it.",
};
const docName = (col: "html" | "notes_html") => (col === "notes_html" ? "notes" : "script");

const softwareGetScript: ToolDef<GrokDeps> = {
  name: "software_get_script",
  description: "A client's dialing script, or their notes, as Client Setting shows them (HTML).",
  inputSchema: { type: "object", properties: { client: clientArg, doc: docArg }, required: ["client"] },
  run: async (d, a) => {
    const c = await findClient(d.client, a.client);
    const col = scriptColumn(a.doc);
    const { data, error } = await d.client.from("setter_scripts").select(`${col}, updated_at`).eq("tenant_id", c.id).maybeSingle();
    if (error) throw new Error(`script: ${error.message}`);
    const row = (data ?? {}) as Record<string, string | null>;
    return json({ client: c.name, doc: docName(col), html: row[col] ?? "", updatedAt: row.updated_at ?? null });
  },
};

const softwareSetScript: ToolDef<GrokDeps> = {
  name: "software_set_script",
  description:
    "Upload a client's dialing script (or notes) to Client Setting, e.g. the script in their Mission Control doc. Send text (blank lines between paragraphs, '# ' and '## ' headings, '- ' bullets) or html. Replaces what is there; the previous script is kept.",
  inputSchema: {
    type: "object",
    properties: {
      client: clientArg,
      doc: docArg,
      text: { type: "string", description: "The script as plain text." },
      html: { type: "string", description: "Or the script as HTML (headings, paragraphs, bold, lists)." },
      bot,
    },
    required: ["client"],
  },
  run: async (d, a) => {
    const raw = text(a.html) ? text(a.html) : text(a.text) ? textToScriptHtml(text(a.text)) : "";
    if (!raw) throw new Error("Send the script as text or html.");
    if (raw.length > MAX_SCRIPT_HTML) throw new Error("That script is too long.");
    const c = await findClient(d.client, a.client);
    const col = scriptColumn(a.doc);
    // The same sanitizer as a script typed in Settings: the column only ever
    // holds markup the page is safe to render as it is.
    const html = await sanitizeScriptHtml(raw);
    const payload = { bot: botName(a.bot), doc: docName(col), bytes: html.length };
    return audited(d.client, "software_set_script", c.id, payload, async () => {
      const now = new Date().toISOString();
      let row: Row = { tenant_id: c.id, notes_html: html, updated_at: now, updated_by: null };
      if (col === "html") {
        // The script being replaced is kept, as Settings' template button does.
        const { data: cur } = await d.client.from("setter_scripts").select("html").eq("tenant_id", c.id).maybeSingle();
        row = { tenant_id: c.id, html, previous_html: (cur as Row | null)?.html ?? "", updated_at: now, updated_by: null };
      }
      const { error } = await d.client.from("setter_scripts").upsert(row, { onConflict: "tenant_id" });
      if (error) throw new Error(error.message);
      return json({ client: c.name, doc: docName(col), saved: true, bytes: html.length });
    });
  },
};

export const SOFTWARE_TOOLS: ToolDef<GrokDeps>[] = [
  softwareClients,
  softwareCreateClient,
  softwareLinkGhl,
  softwareAddLogin,
  softwareClientHealth,
  softwareSystemHealth,
  softwareFix,
  softwareGoLive,
  softwareGetScript,
  softwareSetScript,
];
