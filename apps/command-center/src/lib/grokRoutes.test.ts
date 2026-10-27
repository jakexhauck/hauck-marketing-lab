import { describe, expect, it } from "vitest";
import { routeDoc, routePath, routesFrom } from "../../functions/lib/grokRoutesParse";
import { ROUTES } from "../../functions/lib/grokRoutes.generated";

// The Software connector's route catalogue (software_routes) is generated from
// the route files. Lives in src/ because ?raw globbing needs Vite's types,
// which the Workers tsconfig in functions/ does not carry.
const SOURCES = import.meta.glob(["../../functions/api/**/*.ts", "!../../functions/api/**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("routePath", () => {
  it("turns a route file into the path it serves", () => {
    expect(routePath("admin/clients/[tenantId]/mission-control.ts")).toBe("/api/admin/clients/:tenantId/mission-control");
    expect(routePath("admin/clients/[tenantId]/ads/creative-files/index.ts")).toBe("/api/admin/clients/:tenantId/ads/creative-files");
    expect(routePath("leads/index.ts")).toBe("/api/leads");
    expect(routePath("health.ts")).toBe("/api/health");
  });

  it("skips what is not a route the bots call", () => {
    for (const rel of ["_middleware.ts", "admin/_middleware.ts", "admin/audit.test.ts", "lib/writes.ts", "grok/[connector]/[key].ts"]) {
      expect(routePath(rel)).toBeNull();
    }
  });
});

describe("routeDoc", () => {
  it("lists the methods a file exports, in a fixed order", () => {
    const src = "export const onRequestPost = 1;\nexport const onRequestGet = 2;\nexport const onRequestDelete = 3;";
    expect(routeDoc("x.ts", src)?.methods).toEqual(["GET", "POST", "DELETE"]);
    expect(routeDoc("y.ts", "export const { onRequestGet, onRequestPost } = make();")?.methods).toEqual(["GET", "POST"]);
    expect(routeDoc("z.ts", "export const onRequest: PagesFunction = async () => x;")?.methods).toEqual(["ANY"]);
    expect(routeDoc("w.ts", "export function helper() {}")).toBeNull();
  });

  it("reads the comment at the top of the file, after the imports, before the first export", () => {
    const src = [
      'import type { Env } from "../lib/env";',
      "import {",
      "  a,",
      '} from "../lib/a";',
      "",
      "// GET /api/x -> { files }",
      "//",
      "// The files.",
      "",
      "/** Owner only. */",
      "export const onRequestGet = 1;",
      "// Not this one.",
      "export const onRequestPost = 2;",
    ].join("\n");
    expect(routeDoc("x.ts", src)?.about).toBe("GET /api/x -> { files } The files. Owner only.");
  });

  it("adds the body the handler reads: a named Body type, or the shape cast onto request.json()", () => {
    const named = [
      "interface CreateLeadBody {",
      "  name?: string;",
      "  phone?: string;",
      "}",
      "export const onRequestPost = async (ctx) => {",
      "  const body = (await readJsonBody(ctx.request)) as CreateLeadBody;",
      "};",
    ].join("\n");
    expect(routeDoc("leads/index.ts", named)?.about).toBe("Body: CreateLeadBody { name?: string; phone?: string; }");

    const inline = [
      "// POST /api/x { docId }",
      "export const onRequestPost = async (ctx) => {",
      "  const body = (await ctx.request.json().catch(() => ({}))) as { docId?: unknown };",
      "};",
    ].join("\n");
    expect(routeDoc("x.ts", inline)?.about).toBe("POST /api/x { docId } Body: { docId?: unknown }");
  });

  it("keeps a long comment to a readable length", () => {
    const src = `// ${"word ".repeat(1000)}\nexport const onRequestGet = 1;`;
    expect(routeDoc("x.ts", src)!.about.length).toBeLessThanOrEqual(1500);
  });
});

describe("the generated catalogue", () => {
  it("matches the route files (run: node scripts/grok-routes.mjs)", () => {
    const files = Object.fromEntries(
      Object.entries(SOURCES).map(([file, text]) => [file.replace("../../functions/api/", ""), text]),
    );
    expect(ROUTES).toEqual(routesFrom(files));
  });

  it("covers the pages the bots asked for", () => {
    const paths = ROUTES.map((r) => r.path);
    expect(paths).toContain("/api/admin/clients/:tenantId/mission-control");
    expect(paths).toContain("/api/admin/clients/:tenantId/ads/drive-creatives");
    expect(ROUTES.length).toBeGreaterThan(300);
  });
});
