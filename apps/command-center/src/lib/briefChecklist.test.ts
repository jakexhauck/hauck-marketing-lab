import { describe, it, expect } from "vitest";
import { SOP_LISTS, sopKeys, sopTaskKey } from "./sopChecklists";
import { BRIEF_SECTIONS } from "./clientBrief";
import {
  ACCOUNT_CHECK_SECTION,
  BRIEF_BOXES,
  accountChecksFor,
  claimBoxes,
  resolveTicks,
  sectionBoxKeys,
} from "./briefChecklist";
import { CHECK_ORDER } from "../../functions/lib/clientAccounts";

const labels = (id: keyof typeof BRIEF_BOXES) =>
  BRIEF_BOXES[id].map((g) => [g.label, g.items.map((i) => i.label)]);

describe("BRIEF_BOXES", () => {
  it("places every setup checklist box in exactly one section, under its old key", () => {
    const all = BRIEF_SECTIONS.flatMap((s) => sectionBoxKeys(s.id));
    expect(new Set(all).size).toBe(all.length);
    const old = [...sopKeys(SOP_LISTS["full-setup"]), ...sopKeys(SOP_LISTS["onboarding-call"]), ...sopKeys(SOP_LISTS["launch-call"])];
    expect([...all].sort()).toEqual([...old].sort());
  });

  it("gives Status the Operations / Onboarding Call items", () => {
    expect(labels("manager")).toEqual([
      [
        null,
        [
          "Invoice Paid",
          "Contract Signed",
          "Onboarding Call Done",
          "Marketing Assets Sent",
          "Ad Account Access",
          "Software Account Made",
          "Client Folder Made",
        ],
      ],
    ]);
    expect(BRIEF_BOXES.manager[0].items[0].key).toBe(
      sopTaskKey("full-setup", "Operations / Onboarding Call", "Invoice Paid"),
    );
  });

  it("splits Facebook Ads between Ads and Creative, and Conversion Assets to Landing Page", () => {
    expect(labels("ads")).toEqual([
      [null, ["Link Ad Account To Command Center", "Lead Form Setup", "Campaign Setup", "Ads LIVE"]],
    ]);
    expect(labels("creative")).toEqual([[null, ["Creatives Done/Added To Media Library"]]]);
    expect(labels("landing")).toEqual([[null, ["Conversion Assets Created/Placed Into Funnel"]]]);
    expect(BRIEF_BOXES.landing[0].items[0].key).toBe(
      sopTaskKey("full-setup", "GHL", "Conversion Assets Created/Placed Into Funnel"),
    );
  });

  it("gives GHL the rest of GHL, Phone and GHL Follow Ups, groups kept", () => {
    expect(BRIEF_BOXES.ghl.map((g) => g.label)).toEqual([
      "GHL",
      "Phone",
      "GHL Follow Ups: Appointments",
      "GHL Follow Ups: Attribution",
      "GHL Follow Ups: Follow Ups",
    ]);
    expect(BRIEF_BOXES.ghl[0].items.map((i) => i.label)).not.toContain("Conversion Assets Created/Placed Into Funnel");
    expect(BRIEF_BOXES.ghl[0].items).toHaveLength(8);
  });

  it("keeps the call checklists whole, with their groups and notes", () => {
    expect(BRIEF_BOXES["onboarding-call"].map((g) => g.label)).toEqual([
      "Before The Call: Finish Client Operational Setup",
      "Todo",
      "Setting Expectations",
    ]);
    expect(sectionBoxKeys("onboarding-call")).toEqual(sopKeys(SOP_LISTS["onboarding-call"]));
    expect(sectionBoxKeys("launch-call")).toEqual(sopKeys(SOP_LISTS["launch-call"]));
    expect(BRIEF_BOXES["onboarding-call"][1].items.find((i) => i.label === "Dialing Script")?.note).toBe("If needed");
  });

  it("has no boxes for Client, Market Research or Reporting", () => {
    expect(BRIEF_BOXES.client).toEqual([]);
    expect(BRIEF_BOXES.research).toEqual([]);
    expect(BRIEF_BOXES.reporting).toEqual([]);
  });
});

describe("ACCOUNT_CHECK_SECTION", () => {
  it("puts every Accounts check in a section", () => {
    expect(Object.keys(ACCOUNT_CHECK_SECTION).sort()).toEqual([...CHECK_ORDER].sort());
  });

  it("sends Meta to Ads, GHL pieces to GHL, the client app to Status", () => {
    expect(accountChecksFor("ads")).toEqual(["meta-ads", "meta-page"]);
    expect(accountChecksFor("ghl")).toEqual(["ghl", "pipeline", "calendars", "owner-links", "owner-phone"]);
    expect(accountChecksFor("manager")).toEqual(["login", "push"]);
    expect(accountChecksFor("research")).toEqual([]);
  });
});

describe("resolveTicks", () => {
  it("ticks the agent's own boxes by label, forgiving case, spaces and a list marker", () => {
    const res = resolveTicks("ads", ["Lead Form Setup", "  - [x] ads   live "]);
    expect(res.keys).toEqual([
      sopTaskKey("full-setup", "Facebook Ads", "Lead Form Setup"),
      sopTaskKey("full-setup", "Facebook Ads", "Ads LIVE"),
    ]);
    expect(res.ticked).toEqual(["Lead Form Setup", "Ads LIVE"]);
    expect(res.refused).toEqual([]);
  });

  it("refuses another section's box, an unknown label and an Accounts check", () => {
    const res = resolveTicks("ads", ["Creatives Done/Added To Media Library", "Invoice Paid", "Meta ad account", "Nope"]);
    expect(res.keys).toEqual([]);
    expect(res.refused).toEqual(["Creatives Done/Added To Media Library", "Invoice Paid", "Meta ad account", "Nope"]);
  });

  it("lets the Manager tick Status and both calls, nothing else", () => {
    const res = resolveTicks("manager", ["Invoice Paid", "Set Expectations", "Go Over Creatives", "Ads LIVE"]);
    expect(res.ticked).toEqual(["Invoice Paid", "Set Expectations", "Go Over Creatives"]);
    expect(res.refused).toEqual(["Ads LIVE"]);
  });

  it("ignores blanks and repeats", () => {
    const res = resolveTicks("creative", ["", "Creatives Done/Added To Media Library", "creatives done/added to media library"]);
    expect(res.keys).toHaveLength(1);
    expect(res.refused).toEqual([]);
  });
});

describe("claimBoxes", () => {
  it("lists a section's boxes with their state", () => {
    const done = new Set([sopTaskKey("full-setup", "Facebook Ads", "Ads LIVE")]);
    expect(claimBoxes("ads", done)).toEqual([
      { label: "Link Ad Account To Command Center", done: false },
      { label: "Lead Form Setup", done: false },
      { label: "Campaign Setup", done: false },
      { label: "Ads LIVE", done: true },
    ]);
    expect(claimBoxes("research", done)).toEqual([]);
  });
});
