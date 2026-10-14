import type { Env } from "./env";
import { listChildrenOfMany, replaceDocText } from "./driveComposio";

// Filling a client's copied Client Setup docs with their company name (Jake,
// 2026-10-06: the company name is the only thing that changes per client).
// Runs on the client's own folder only, right after the folder button copies
// the templates, and again from the Fill in docs button. Safe to run twice: a
// filled spot is gone, so a second run changes nothing.
//
// Every other [SPOT] in the docs ([First Name], [Your Name], [Option A] ...) is
// filled in live on a call or by hand, and is left exactly as it is.

const GOOGLE_DOC = "application/vnd.google-apps.document";

/** The spellings of the company-name spot, all case-insensitive in Google. */
export const COMPANY_SPOTS = ["[Company Name]", "{{Company Name}}", "[Client Name]", "[Business Name]"];

export function companyPairs(businessName: string): { find: string; replace: string }[] {
  const name = businessName.trim();
  if (!name) return [];
  return COMPANY_SPOTS.map((find) => ({ find, replace: name }));
}

export interface FillResult {
  docs: number;
  spots: number;
  problems: string[];
}

/** Fill these docs. One at a time: the Composio quota answers bursts with 429. */
export async function fillDocs(
  env: Env,
  accountId: string,
  docs: { id: string; name: string }[],
  businessName: string,
): Promise<FillResult> {
  const pairs = companyPairs(businessName);
  const out: FillResult = { docs: 0, spots: 0, problems: [] };
  if (pairs.length === 0) return out;
  for (const d of docs) {
    try {
      const counts = await replaceDocText(env, accountId, d.id, pairs);
      const n = counts.reduce((a, b) => a + b, 0);
      if (n > 0) out.docs += 1;
      out.spots += n;
    } catch (err) {
      out.problems.push(`${d.name} was not filled (${err instanceof Error ? err.message : String(err)})`);
    }
  }
  return out;
}

/** Every Google Doc directly inside the client's folder. */
export async function fillClientFolderDocs(
  env: Env,
  accountId: string,
  folderId: string,
  businessName: string,
): Promise<FillResult> {
  const children = (await listChildrenOfMany(env, accountId, [folderId])).get(folderId) ?? [];
  const docs = children.filter((c) => c.mimeType === GOOGLE_DOC).map((c) => ({ id: c.id, name: c.name }));
  return fillDocs(env, accountId, docs, businessName);
}
