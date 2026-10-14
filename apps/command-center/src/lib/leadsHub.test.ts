import { describe, it, expect } from "vitest";
import { organicLeads, paidAdsLeads, type HubLead } from "./leadsHub";

// Minimal HubLead factory: only the fields the filters read.
function lead(id: string, source: HubLead["source"]): HubLead {
  return {
    id,
    name: id,
    source,
    status: "new",
    intent: "",
    preview: "",
    when: "",
    wait: "",
    phone: "",
    location: "",
    zip: "",
    ad: "",
    sms: [],
  };
}

const sample: HubLead[] = [
  lead("a1", "ad"),
  lead("f1", "form"),
  lead("c1", "chat"),
  lead("a2", "ad"),
  lead("f2", "form"),
];

describe("organicLeads", () => {
  it("keeps only form and chat leads, in original order", () => {
    expect(organicLeads(sample).map((l) => l.id)).toEqual(["f1", "c1", "f2"]);
  });
  it("returns empty when there are no organic leads", () => {
    expect(organicLeads([lead("a1", "ad")])).toEqual([]);
  });
});

describe("paidAdsLeads", () => {
  it("keeps only ad leads, in original order", () => {
    expect(paidAdsLeads(sample).map((l) => l.id)).toEqual(["a1", "a2"]);
  });
  it("returns empty when there are no ad leads", () => {
    expect(paidAdsLeads([lead("f1", "form")])).toEqual([]);
  });
});
