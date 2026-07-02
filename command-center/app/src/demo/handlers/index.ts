// Auto-registered demo routes. Each file in this folder exports `route:
// DemoRoute` (or `routes: DemoRoute[]`); dropping a new file here wires a new
// demo endpoint with ZERO edits to handler.ts. That is what lets parallel
// feature builds run without colliding on the shared demo router: each feature
// owns its own file under src/demo/handlers/.
//
// See reactivation.ts for the canonical one-liner example.

export type DemoStore = ReturnType<typeof import("../store").getStore>;

export interface DemoContext {
  clean: string; // path without query, e.g. "/api/social/posts"
  seg: string[]; // clean split on "/", filtered, e.g. ["api","social","posts"]
  body: Record<string, unknown>; // parsed JSON body for writes
  method: string; // "GET" | "POST" | ...
  store: DemoStore; // the in-memory demo store snapshot
}

export interface DemoRoute {
  // Return true when this route owns the request. Match your OWN specific paths
  // only (e.g. clean === "/api/social/posts"), never a broad prefix that could
  // shadow another feature.
  match: (clean: string, seg: string[]) => boolean;
  // Return the raw payload; the handler wraps it for react-query.
  respond: (ctx: DemoContext) => unknown;
}

const modules = import.meta.glob<{ route?: DemoRoute; routes?: DemoRoute[] }>(
  "./*.ts",
  { eager: true },
);

export const demoRoutes: DemoRoute[] = Object.entries(modules)
  // Skip the registry itself and any test/story files that happen to sit here,
  // so a *.test.ts never bundles vitest into the app.
  .filter(([path]) => !/\/(index|.*\.(test|spec|stories))\.ts$/.test(path))
  .flatMap(([, mod]) => mod.routes ?? (mod.route ? [mod.route] : []));
