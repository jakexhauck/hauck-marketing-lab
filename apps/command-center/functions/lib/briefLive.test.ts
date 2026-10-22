import { describe, expect, it } from "vitest";
import { adsManagerUrl, buildBriefLive, ghlLocationUrl, shapeCalendars, shapePipelines, shapeWorkflows, type BriefLiveDeps } from "./briefLive";
import { clientAnswerGroups } from "../../src/lib/briefClientSeed";

describe("shapers", () => {
  it("workflows keep drafts, default a missing status to draft, skip nameless", () => {
    expect(shapeWorkflows({ workflows: [{ name: "New lead", status: "published" }, { name: "Nurture" }, { status: "draft" }] })).toEqual([
      { name: "New lead", status: "published" },
      { name: "Nurture", status: "draft" },
    ]);
  });

  it("pipeline stages come in position order", () => {
    const raw = { pipelines: [{ name: "Sales", stages: [{ name: "B", position: 2 }, { name: "A", position: 1 }] }, { stages: [] }] };
    expect(shapePipelines(raw)).toEqual([{ name: "Sales", stages: ["A", "B"] }]);
  });

  it("calendars are active unless GHL says not", () => {
    expect(shapeCalendars({ calendars: [{ name: "Estimate" }, { name: "Job", isActive: false }] })).toEqual([
      { name: "Estimate", active: true },
      { name: "Job", active: false },
    ]);
  });

  it("links", () => {
    expect(adsManagerUrl("act_123")).toContain("act=123");
    expect(adsManagerUrl("123")).toContain("act=123");
    expect(ghlLocationUrl("abc")).toBe("https://app.gohighlevel.com/v2/location/abc/dashboard");
  });
});

describe("clientAnswerGroups", () => {
  it("groups answers, secrets on file, unknown keys under Other", () => {
    const groups = clientAnswerGroups({ name: "Clear Choice", apiKey: "sk-1", favouriteColour: "blue" }, { hasPassword: true });
    expect(groups.find((g) => g.heading === "Business")?.rows).toEqual([{ label: "Business name", value: "Clear Choice" }]);
    const other = groups.find((g) => g.heading === "Other")!.rows;
    expect(other).toContainEqual({ label: "Api key", value: "on file" });
    expect(other).toContainEqual({ label: "Favourite colour", value: "blue" });
    expect(groups.find((g) => g.heading === "Logins")?.rows).toEqual([{ label: "Password", value: "on file" }]);
  });
});

function deps(over: Partial<BriefLiveDeps> = {}): BriefLiveDeps {
  return {
    answers: async () => ({ groups: [{ heading: "Business", rows: [{ label: "Business name", value: "CC" }] }], website: "https://cc.com" }),
    tenant: async () => ({ metaAdAccountId: "act_9", ghlLocationId: "loc1" }),
    folder: async () => ({ folderId: "f1", url: "https://drive/f1" }),
    images: async () => [{ id: "i1", name: "Logo.png", mimeType: "image/png", size: 1, thumbnailLink: "https://t", folder: "" }],
    ghl: async () => ({
      values: [{ id: "v1", name: "Open Lead", value: "https://app/o/1", merge: "{{custom_values.open_lead}}", locked: true }],
      pipelines: { pipelines: [] },
      calendars: { calendars: [] },
      workflows: { workflows: [] },
    }),
    ...over,
  };
}

describe("buildBriefLive", () => {
  it("fills links from every part, the outcome link from the Open Lead value", async () => {
    const live = await buildBriefLive(deps());
    expect(Object.fromEntries(live.links.map((l) => [l.id, l.url]))).toMatchObject({
      drive: "https://drive/f1",
      website: "https://cc.com",
      outcome: "https://app/o/1",
      ghl: "https://app.gohighlevel.com/v2/location/loc1/dashboard",
    });
    expect(live.assets).toHaveLength(1);
    expect(live.ghl?.customValues).toEqual([{ name: "Open Lead", key: "{{custom_values.open_lead}}", value: "https://app/o/1" }]);
  });

  it("a GHL failure leaves the rest", async () => {
    const live = await buildBriefLive(deps({ ghl: async () => Promise.reject(new Error("ghl_not_connected")) }));
    expect(live.ghl).toBeNull();
    expect(live.ghlError).toBe("ghl_not_connected");
    expect(live.answers).toHaveLength(1);
    expect(live.links.find((l) => l.id === "outcome")?.url).toBeNull();
  });

  it("no Drive folder means no assets and no error; a Drive failure is reported", async () => {
    expect(await buildBriefLive(deps({ folder: async () => null }))).toMatchObject({ assets: null, assetsError: null });
    const bad = await buildBriefLive(deps({ images: async () => Promise.reject(new Error("composio down")) }));
    expect(bad).toMatchObject({ assets: null, assetsError: "composio down" });
  });
});
