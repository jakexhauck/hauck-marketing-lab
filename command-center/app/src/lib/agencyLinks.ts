// The agency-wide links handed to a new client, declared as data.
//
// Two of them today. They live in the agency_links table (0071) rather than in
// code because Jake swaps a Google Doc without wanting a deploy, and rather than
// in Doppler because a share link handed to every client is not a secret.
//
// The funnel link is NOT here: it is FUNNEL_URL, configured where the app is
// deployed, so the link Jake hands out and the origin CORS lets post to
// /api/intake cannot drift apart. See functions/lib/funnelUrl.ts.

export interface AgencyLinkDef {
  key: string;
  label: string;
  /** What this is for, in the words Jake would use to a client. */
  blurb: string;
  placeholder: string;
}

export const AGENCY_LINKS: AgencyLinkDef[] = [
  {
    key: "welcome_doc",
    label: "Welcome doc",
    blurb: "What happens next, sent the moment they sign.",
    placeholder: "https://docs.google.com/document/d/...",
  },
  {
    key: "contract",
    label: "Contract",
    blurb: "The agreement they sign before anything starts.",
    placeholder: "https://docs.google.com/document/d/...",
  },
];

export const AGENCY_LINK_KEYS: string[] = AGENCY_LINKS.map((l) => l.key);

/** Keep only the keys we ship, so a stale row cannot appear on the page. */
export function knownLinks(rows: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of AGENCY_LINK_KEYS) {
    const value = (rows[key] ?? "").trim();
    if (value) out[key] = value;
  }
  return out;
}

/**
 * Is this something we are willing to put behind a button?
 *
 * http(s) only. A link pasted into an admin field ends up as an href on a page,
 * and `javascript:` in an href is a script that runs on click. Refusing anything
 * that is not a web address costs nothing here and closes that off.
 */
export function isSafeLink(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

/** How many of the links are filled in, for the page's own progress line. */
export function linksReady(rows: Record<string, string>): number {
  return AGENCY_LINK_KEYS.filter((k) => isSafeLink(rows[k] ?? "")).length;
}
