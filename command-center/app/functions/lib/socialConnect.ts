import { ghlFetch, ghlJson, type GhlContext } from "./ghl";

// Connecting a client's own Facebook page / Instagram account into THEIR GHL
// sub-account, driven from our app.
//
// GHL's Social Planner OAuth is a three-legged flow and every leg is a separate
// call. Verified against the live API on 2026-08-09:
//
//   1. GET  /social-media-posting/oauth/{platform}/start?locationId=&userId=
//        302s to Meta. The sub-account rides in a SIGNED `state` parameter
//        (base64url of "locationId,userId,..." plus a signature), so the
//        connection cannot be steered into another client's account in flight.
//   2. GET  /social-media-posting/oauth/{locationId}/{platform}/accounts/{accountId}
//        the pages that account manages. `accountId` is minted by GHL's finish
//        page and reaches us only by postMessage; see the note below.
//   3. POST /social-media-posting/oauth/{locationId}/{platform}/accounts/{accountId}
//        attaches the chosen page to the location.
//
// THE LOCATION ID IS NEVER TAKEN FROM THE BROWSER. Every call here reads it off
// the GhlContext the middleware resolved from the caller's session, which is
// what makes it impossible for one client to attach a page into another's
// sub-account. The same rule that fixed the cross-tenant fulfillment leak.
//
// WHAT IS UNVERIFIED, and why the shapers are loose: leg 2's response was never
// seen with real data (proving it needs a human to finish a Facebook consent
// screen), so field names are guesses drawn from GHL's other social payloads.
// Every reader below accepts several candidate names and drops what it cannot
// understand, exactly as api/social/_lib.ts does for the same reason.

export type ConnectPlatform = "facebook" | "instagram";

export const CONNECT_PLATFORMS: readonly ConnectPlatform[] = ["facebook", "instagram"];

export function isConnectPlatform(value: unknown): value is ConnectPlatform {
  return value === "facebook" || value === "instagram";
}

// GHL ids are opaque alphanumerics. These go straight into a URL PATH, so they
// are validated rather than escaped: a value that is not an id is a bug or an
// attack, and neither deserves a request.
const ID_SHAPE = /^[A-Za-z0-9_-]{1,64}$/;

export function isGhlId(value: unknown): value is string {
  return typeof value === "string" && ID_SHAPE.test(value);
}

// One page/account the client could attach. `raw` is GHL's own record, kept so
// the attach call can hand back exactly what it was given rather than a shape
// we invented from a payload nobody has seen yet.
export interface ConnectablePage {
  id: string;
  name: string;
  avatar: string | null;
  raw: Record<string, unknown>;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

// Leg 1. Returns the URL to open in a popup.
//
// `redirect: "manual"` is the whole point: GHL answers 302 and we want the
// Location, not to follow it. Following it would fetch Facebook's HTML with our
// server's IP and give the client nothing to consent on.
export async function startOAuth(
  ctx: GhlContext,
  platform: ConnectPlatform,
  userId: string,
): Promise<string> {
  const path =
    `/social-media-posting/oauth/${platform}/start` +
    `?locationId=${encodeURIComponent(ctx.locationId)}&userId=${encodeURIComponent(userId)}`;

  const res = await ghlFetch(ctx, path, { redirect: "manual" });
  const location = res.headers.get("location");

  // A 200 here means GHL answered with a body instead of a redirect, which has
  // only ever meant the token lacks the socialplanner scope.
  if (!location) {
    throw new Error(`no redirect from GHL (http ${res.status})`);
  }
  return location;
}

// GHL stamps the connection with a `userId` as well as the location. Passing
// the location id for it "works" (the 302 comes back signed either way), but it
// records a user that does not exist, so the connection shows up in GHL owned by
// nobody. Resolve a real one where we can.
//
// BEST EFFORT ON PURPOSE. This needs the users scope, which not every tenant
// token carries, and a client being unable to connect their page because we
// could not read a staff list would be a worse bug than a scruffy owner field.
export async function resolveGhlUserId(ctx: GhlContext): Promise<string> {
  try {
    const payload = await ghlJson<{ users?: { id?: unknown; roles?: { role?: unknown } }[] }>(
      ctx,
      `/users/?locationId=${encodeURIComponent(ctx.locationId)}`,
    );
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const admin = users.find((u) => String(u?.roles?.role ?? "") === "admin") ?? users[0];
    const id = admin?.id;
    if (isGhlId(id)) return id;
  } catch {
    // No users scope, or GHL having a moment. Fall through.
  }
  return ctx.locationId;
}

// GHL wraps most social answers in { results: ... }, and has used both `pages`
// and `accounts` for this list across versions. Accept either, at either depth.
function extractPages(payload: unknown): unknown[] {
  const body = (payload ?? {}) as Record<string, unknown>;
  const results = (body.results ?? body) as Record<string, unknown>;
  for (const key of ["pages", "accounts", "data"]) {
    const found = results?.[key];
    if (Array.isArray(found)) return found;
  }
  return Array.isArray(results) ? (results as unknown[]) : [];
}

export function shapePages(payload: unknown): ConnectablePage[] {
  return extractPages(payload)
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      // originId is what GHL calls the platform's own id on an attached
      // account, so it is the most likely name and is checked first.
      const id = firstString(row.originId, row.id, row.pageId, row.accountId);
      const name = firstString(row.name, row.pageName, row.title, row.username);
      if (!id || !name) return null;
      return {
        id,
        name,
        avatar: firstString(row.avatar, row.picture, row.image, row.profilePicture),
        raw: row,
      };
    })
    .filter((p): p is ConnectablePage => p !== null);
}

// Leg 2.
export async function listPages(
  ctx: GhlContext,
  platform: ConnectPlatform,
  accountId: string,
): Promise<ConnectablePage[]> {
  const payload = await ghlJson<unknown>(
    ctx,
    `/social-media-posting/oauth/${ctx.locationId}/${platform}/accounts/${accountId}`,
  );
  return shapePages(payload);
}

// Leg 3.
//
// The page is looked up again SERVER-SIDE rather than posted back by the
// browser. GHL's attach body wants the whole account record and nobody has seen
// a real one, so echoing what GHL just gave us is the only shape guaranteed to
// be right, and it means a tampered body cannot attach something unlisted.
export async function attachPage(
  ctx: GhlContext,
  platform: ConnectPlatform,
  accountId: string,
  pageId: string,
): Promise<ConnectablePage> {
  const pages = await listPages(ctx, platform, accountId);
  const page = pages.find((p) => p.id === pageId);
  if (!page) throw new Error("that page is no longer available to connect");

  await ghlJson<unknown>(
    ctx,
    `/social-media-posting/oauth/${ctx.locationId}/${platform}/accounts/${accountId}`,
    {
      method: "POST",
      body: JSON.stringify({
        ...page.raw,
        type: "page",
        originId: page.id,
        name: page.name,
        avatar: page.avatar ?? undefined,
      }),
    },
  );

  return page;
}
