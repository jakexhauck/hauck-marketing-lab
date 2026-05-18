export interface PaneInit {
  kind: "main" | "detached";
  slug: string | null;
}

const HASH_PREFIX = "#/pane?";

export function decodePaneStateFromHash(): PaneInit {
  if (typeof window === "undefined") return { kind: "main", slug: null };
  const hash = window.location.hash || "";
  if (!hash.startsWith(HASH_PREFIX)) {
    // Also accept query-string form when the hash isn't used by Tauri router.
    const search = window.location.search || "";
    if (search) {
      const params = new URLSearchParams(search);
      if (params.get("pane") === "detached") {
        return { kind: "detached", slug: params.get("slug") };
      }
    }
    return { kind: "main", slug: null };
  }
  const qs = hash.slice(HASH_PREFIX.length);
  const params = new URLSearchParams(qs);
  if (params.get("pane") === "detached") {
    return { kind: "detached", slug: params.get("slug") };
  }
  return { kind: "main", slug: null };
}

export function encodePaneStateToUrl(init: PaneInit): string {
  const params = new URLSearchParams();
  if (init.kind === "detached") {
    params.set("pane", "detached");
    if (init.slug) params.set("slug", init.slug);
  }
  return `index.html#/pane?${params.toString()}`;
}

export function popoutWindowLabel(): string {
  const id = Math.random().toString(36).slice(2, 8);
  return `pane-${id}`;
}
