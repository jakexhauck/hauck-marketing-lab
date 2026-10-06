import { GRAPH } from "./metaGraph";

// The Facebook Pages the agency's Meta system user can act on, with their Page
// tokens. A lead form is created on a Page with that Page's own token; the
// system user token alone is refused. Giving the system user a client's Page
// is done once in Meta Business Settings.

export interface ReachablePage {
  id: string;
  name: string;
  accessToken: string;
}

export async function listReachablePages(token: string): Promise<ReachablePage[]> {
  const out: ReachablePage[] = [];
  let url: string | null = `${GRAPH}/me/accounts?fields=id,name,access_token&limit=100&access_token=${encodeURIComponent(token)}`;
  while (url) {
    const res: Response = await fetch(url);
    const body = (await res.json().catch(() => ({}))) as {
      data?: { id?: string; name?: string; access_token?: string }[];
      paging?: { next?: string };
      error?: { message?: string };
    };
    if (!res.ok || body.error) throw new Error(body.error?.message ?? `Meta answered ${res.status}`);
    for (const p of body.data ?? []) {
      if (p.id && p.access_token) out.push({ id: p.id, name: p.name ?? p.id, accessToken: p.access_token });
    }
    url = body.paging?.next ?? null;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
