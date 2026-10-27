// The route catalogue behind the Software connector's software_routes: every
// API route the app serves, its methods, and how this codebase documents a
// route, which is the comment at the top of its file plus the body type the
// handler reads. scripts/grok-routes.mjs writes it into grokRoutes.generated.ts;
// src/lib/grokRoutes.test.ts fails when that file is behind the routes.
//
// Pure, no imports: node runs this file directly from the script.

export interface RouteDoc {
  path: string;
  methods: string[];
  about: string;
}

const METHOD_ORDER = ["GET", "POST", "PUT", "PATCH", "DELETE"];
export const ABOUT_MAX = 1500;

/**
 * The path a file under functions/api serves, or null for what is not a route
 * a bot calls: middleware, tests, the api/lib helpers, and the Grok connectors
 * themselves.
 */
export function routePath(rel: string): string | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!clean.endsWith(".ts") || clean.endsWith(".test.ts")) return null;
  const parts = clean.split("/");
  if (parts[parts.length - 1].startsWith("_")) return null;
  if (parts[0] === "lib" || parts[0] === "grok") return null;
  const route = clean.replace(/\.ts$/, "").replace(/(^|\/)index$/, "").replace(/\[([^\]]+)\]/g, ":$1");
  return route ? `/api/${route}` : "/api";
}

function methodsOf(src: string): string[] {
  const found = new Set<string>();
  for (const m of src.matchAll(/export const (?:\{([^}]*)\}|onRequest(Get|Post|Put|Patch|Delete)?\b)/g)) {
    if (m[1] !== undefined) {
      for (const n of m[1].matchAll(/onRequest(Get|Post|Put|Patch|Delete)\b/g)) found.add(n[1].toUpperCase());
    } else {
      found.add(m[2] ? m[2].toUpperCase() : "ANY");
    }
  }
  return [...METHOD_ORDER, "ANY"].filter((m) => found.has(m));
}

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

/** Every comment above the first export, markers stripped. */
function headerComment(src: string): string {
  const firstExport = src.search(/^export /m);
  const head = firstExport >= 0 ? src.slice(0, firstExport) : src;
  const out: string[] = [];
  for (const m of head.matchAll(/\/\*([\s\S]*?)\*\/|^[ \t]*\/\/(.*)$/gm)) {
    const text = m[1] !== undefined ? m[1].replace(/^\s*\*+ ?/gm, "") : m[2];
    out.push(text);
  }
  return squash(out.join(" "));
}

/** The body the handler reads: a `...Body` type it declares, or a shape cast onto request.json(). */
function bodyShapes(src: string): string[] {
  const shapes: string[] = [];
  for (const m of src.matchAll(/^(?:export )?(?:interface (\w*Body)\s*|type (\w*Body)\s*=\s*)(\{[\s\S]*?^\})/gm)) {
    shapes.push(`${m[1] ?? m[2]} ${squash(m[3])}`);
  }
  for (const m of src.matchAll(/request\.json\(\)[^\n;]*?\)\)?\s*as\s*(\{[^\n]*?\})\s*(?:\|\s*null\s*)?;/g)) {
    shapes.push(squash(m[1]));
  }
  return shapes;
}

export function routeDoc(rel: string, src: string): RouteDoc | null {
  const path = routePath(rel);
  if (!path) return null;
  const methods = methodsOf(src);
  if (!methods.length) return null;
  const body = bodyShapes(src);
  const about = squash([headerComment(src), body.length ? `Body: ${body.join("; ")}` : ""].join(" "));
  return { path, methods, about: about.length > ABOUT_MAX ? `${about.slice(0, ABOUT_MAX - 3)}...` : about };
}

/** The whole catalogue from { "admin/x.ts": source }, sorted by path. */
export function routesFrom(files: Record<string, string>): RouteDoc[] {
  return Object.entries(files)
    .map(([rel, src]) => routeDoc(rel, src.replace(/\r\n/g, "\n")))
    .filter((r): r is RouteDoc => r !== null)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}
