// The Landing Page Agent's two runner steps (docs/build-plans/agents.md,
// Phase 2). The agent only writes files; everything that reaches the outside
// world happens here.
//
//   Draft    The agent writes a static site to site/<name>/ in its work folder
//            and files an item with payload.site = "<name>". The runner posts
//            the card first (the server refuses a decided card or another
//            chat's), then copies the site to
//            data/sites/<client slug>/<itemId>/ (snapshotSite), deploys
//            that copy to the d-<itemId8> branch, and posts the card as
//            needs_ok with { previewUrl, grant: { kind: "deploy" } }.
//   Live     Jake's Approve queues a follow-up carrying that grant. Before the
//            agent's turn the runner copies that snapshot once to
//            approved/<itemId>/ and promotes that copy to main, then
//            calls file-asset, which checks the grant on the server, files the
//            page into Conversion Assets and marks the card live. The agent is
//            then told the live URL, so it can say so and hand off to GHL.
//
// The snapshot is the point: the agent cannot write to data/sites, so the page
// that goes live is byte for byte the draft Jake approved.

import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RunnerApi } from "./api.ts";
import type { ItemDraft } from "./output.ts";
import { snapshotSite } from "./pages.ts";
import { UUID, within } from "./paths.ts";
import type { ClaimResponse, ClaimTenant } from "./wire.ts";

export interface LandingDeps {
  // data/sites: one folder per client slug, one snapshot per item.
  sitesRoot: string;
  deployDraft(slug: string, itemId: string, dir: string): Promise<{ previewUrl: string }>;
  promote(slug: string, dir: string): Promise<{ liveUrl: string }>;
}

// A folder name, nothing more: no dots, no slashes, so it cannot climb out of
// site/.
const SITE_NAME = /^[a-z0-9][a-z0-9-]{0,40}$/;

export const isSiteDraft = (item: ItemDraft): boolean => typeof item.payload?.site === "string";

// The card id and the slug name folders, so both are checked as what they
// are, and the joined path must still land inside sitesRoot.
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
function checked(slug: string, itemId: string): void {
  if (!SLUG.test(slug)) throw new Error(`${slug} is not inside the sites folder (not a client slug)`);
  if (!UUID.test(itemId)) throw new Error(`${itemId} is not inside the sites folder (not a card id)`);
}

export function snapshotDir(sitesRoot: string, slug: string, itemId: string): string {
  const dir = within(sitesRoot, slug, itemId);
  checked(slug, itemId);
  return dir;
}

// The copy that goes live, made on the approved turn and never written again.
// A draft of the same card later, had the server let it through, would only
// change the snapshot beside it, not this.
export function approvedDir(sitesRoot: string, slug: string, itemId: string): string {
  checked(slug, itemId);
  return within(sitesRoot, slug, "approved", itemId);
}

const recordFile = (sitesRoot: string, slug: string, itemId: string) => {
  checked(slug, itemId);
  return within(sitesRoot, slug, `${itemId}.json`);
};

/**
 * A deploy grant is the runner's to give: it is only ever set on a card the
 * runner deployed itself. One the agent wrote into a payload is dropped. Other
 * kinds pass through for the lanes that own them.
 */
export function withoutDeployGrant(payload: Record<string, unknown> | undefined): Record<string, unknown> {
  const p = { ...(payload ?? {}) };
  const g = p.grant as { kind?: unknown } | undefined;
  if (g && typeof g === "object" && g.kind === "deploy") delete p.grant;
  return p;
}

interface DraftContext {
  api: RunnerApi;
  landing: LandingDeps;
  tenant: ClaimTenant;
  chatId: string;
  workDir: string;
  log: (line: string) => void;
}

/**
 * Deploy one site draft and post its card. Returns a line for Jake when the
 * preview could not be made (the card then stays Building, with no grant).
 */
export async function draftSite(item: ItemDraft, c: DraftContext): Promise<string | null> {
  const name = String(item.payload?.site ?? "");
  const base = withoutDeployGrant(item.payload);
  const card = (id: string | undefined, status: "building" | "needs_ok", payload: Record<string, unknown>) =>
    c.api.item({
      ...(id ? { id } : {}),
      tenantId: c.tenant.id,
      agent: "landing",
      chatId: c.chatId,
      fromAgent: null,
      kind: item.kind,
      title: item.title,
      status,
      payload,
    });

  // Set only once the server has accepted the card. The server is what
  // refuses a rewrite of a decided card, or of one from another chat or
  // agent, so it is asked before anything on disk is touched.
  let id: string | undefined;
  try {
    if (!SITE_NAME.test(name)) throw new Error(`"${name}" is not a site folder name`);
    const made = (await card(item.id, "building", { ...base, steps: [{ label: "Preview", state: "now" }] })) as { id?: unknown };
    if (typeof made?.id !== "string" || !UUID.test(made.id)) throw new Error("the card was not saved");
    if (existsSync(approvedDir(c.landing.sitesRoot, c.tenant.slug, made.id))) throw new Error("that card is already approved");
    id = made.id;
    const dir = snapshotDir(c.landing.sitesRoot, c.tenant.slug, id);
    snapshotSite(within(c.workDir, "site", name), dir);
    const { previewUrl } = await c.landing.deployDraft(c.tenant.slug, id, dir);
    await card(id, "needs_ok", { ...base, previewUrl, grant: { kind: "deploy" } });
    writeFileSync(recordFile(c.landing.sitesRoot, c.tenant.slug, id), JSON.stringify({ title: item.title, previewUrl }));
    return null;
  } catch (e) {
    const why = (e as Error).message;
    c.log(`landing draft "${item.title}" failed: ${why}`);
    if (id) await card(id, "building", { ...base, error: why }).catch(() => {});
    return `Preview deploy failed for "${item.title}": ${why}`;
  }
}

/**
 * The approved turn. null when this message carries no deploy grant; else the
 * note the agent is handed with Jake's message. Throws when the page could not
 * go live, which fails the message where Jake can see it.
 */
export async function goLive(
  claim: ClaimResponse,
  c: { api: RunnerApi; landing: LandingDeps },
): Promise<string | null> {
  const grant = claim.message.grant;
  if (!grant || grant.kind !== "deploy" || claim.chat.agent !== "landing") return null;
  const tenant = claim.tenant;
  if (!tenant) throw new Error("a page can only go live for a client");
  const snap = snapshotDir(c.landing.sitesRoot, tenant.slug, grant.itemId);
  const dir = approvedDir(c.landing.sitesRoot, tenant.slug, grant.itemId);
  const rec = recordFile(c.landing.sitesRoot, tenant.slug, grant.itemId);
  if (!existsSync(join(dir, "index.html"))) {
    if (!existsSync(join(snap, "index.html")) || !existsSync(rec)) {
      throw new Error("the approved draft is not on this PC, so it cannot go live from here");
    }
    cpSync(snap, dir, { recursive: true });
  }
  const { title } = JSON.parse(readFileSync(rec, "utf8")) as { title: string };
  const { liveUrl } = await c.landing.promote(tenant.slug, dir);
  await c.api.fileAsset({ messageId: claim.message.id, tenantId: tenant.id, title, liveUrl });
  return `(Runner: "${title}" is live at ${liveUrl} and filed into Conversion Assets. Do not rebuild it.)`;
}
