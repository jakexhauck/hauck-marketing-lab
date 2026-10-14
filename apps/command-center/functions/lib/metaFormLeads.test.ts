import { describe, expect, it } from "vitest";
import { mergeMetaLeads, parseMetaLead, type MetaFormLead } from "./metaFormLeads";
import type { TrackerLead } from "./adTrackerMetrics";

// Flossie as Meta's /{form}/leads returns her (AAG, 2026-10-10).
const FLOSSIE_RAW = {
  id: "2231018760800998",
  created_time: "2026-10-10T07:37:17+0000",
  field_data: [
    { name: "full_name", values: ["Flossie carter"] },
    { name: "phone_number", values: ["+19136331955"] },
    { name: "are_you_the_homeowner?", values: ["yes"] },
    { name: "how_soon_are_you_looking_for_our_services?", values: ["asap"] },
  ],
  ad_id: "120251462037370748",
  ad_name: "Callout 2",
  adset_id: "120251401284090748",
  adset_name: "LF | 10/7/26 | $30/Day",
  campaign_id: "120251401284100748",
  campaign_name: "LF | 10/7/26 | CBO",
  form_id: "1135948532295302",
};

function lead(over: Partial<MetaFormLead> = {}): MetaFormLead {
  return { ...parseMetaLead(FLOSSIE_RAW)!, ...over };
}

function ghlLead(contactId: string): TrackerLead {
  return { contactId, createdAt: "2026-10-01T00:00:00Z", level: "lead", status: "new", value: 0, adId: null };
}

describe("parseMetaLead", () => {
  it("reads the name, phone, ad and answers off a lead", () => {
    const l = parseMetaLead(FLOSSIE_RAW)!;
    expect(l).toMatchObject({
      id: "2231018760800998",
      formId: "1135948532295302",
      createdAt: "2026-10-10T07:37:17.000Z",
      name: "Flossie Carter",
      phone: "+19136331955",
      email: "",
      adId: "120251462037370748",
      adName: "Callout 2",
      adsetName: "LF | 10/7/26 | $30/Day",
      campaignId: "120251401284100748",
      campaignName: "LF | 10/7/26 | CBO",
    });
    expect(l.answers["are_you_the_homeowner?"]).toBe("yes");
  });

  it("takes split first and last names and a plain phone field", () => {
    const l = parseMetaLead({
      id: "1",
      created_time: "2026-10-10T00:00:00+0000",
      field_data: [
        { name: "first_name", values: ["edith"] },
        { name: "last_name", values: ["kinangs"] },
        { name: "phone", values: ["+19139728040"] },
        { name: "email", values: ["E@X.com"] },
      ],
    })!;
    expect(l.name).toBe("Edith Kinangs");
    expect(l.phone).toBe("+19139728040");
    expect(l.email).toBe("e@x.com");
    expect(l.adId).toBeNull();
  });

  it("drops a lead with no id or no time", () => {
    expect(parseMetaLead({ created_time: "2026-10-10T00:00:00+0000" })).toBeNull();
    expect(parseMetaLead({ id: "1" })).toBeNull();
  });
});

describe("mergeMetaLeads", () => {
  it("adds a lead GHL never got, under its own id, with its ad", () => {
    const out = mergeMetaLeads({ leads: [ghlLead("g1")], contacts: [{ id: "g1", phone: "+15550001111" }], metaLeads: [lead()] });
    expect(out.leads).toHaveLength(1);
    expect(out.leads[0]).toMatchObject({
      contactId: "meta:2231018760800998",
      createdAt: "2026-10-10T07:37:17.000Z",
      status: "new",
      level: "lead",
      adId: "120251462037370748",
    });
    expect(out.contacts[0]).toMatchObject({ id: "meta:2231018760800998", contactName: "Flossie Carter", phone: "+19136331955" });
    expect(out.attribution.get("meta:2231018760800998")).toMatchObject({ adName: "Callout 2", campaignName: "LF | 10/7/26 | CBO" });
  });

  it("skips a lead whose GHL contact already has a tracker row, by phone", () => {
    const out = mergeMetaLeads({
      leads: [ghlLead("g1")],
      contacts: [{ id: "g1", phone: "(913) 633-1955" }],
      metaLeads: [lead()],
    });
    expect(out.leads).toHaveLength(0);
  });

  it("skips one matched by email", () => {
    const out = mergeMetaLeads({
      leads: [ghlLead("g1")],
      contacts: [{ id: "g1", email: "F@X.com" }],
      metaLeads: [lead({ phone: "", email: "f@x.com" })],
    });
    expect(out.leads).toHaveLength(0);
  });

  // Flossie's real case: GHL made a bare contact off her phone and no
  // opportunity. Her row borrows that contact id, so anything keyed on the
  // contact (typed status, job value) lines up with GHL if she lands there.
  it("borrows the id of a GHL contact that has no tracker row", () => {
    const out = mergeMetaLeads({
      leads: [],
      contacts: [{ id: "cBBeppRR46hA5IuMzdOb", phone: "+19136331955" }],
      metaLeads: [lead()],
    });
    expect(out.leads[0].contactId).toBe("cBBeppRR46hA5IuMzdOb");
    expect(out.contacts[0]).toMatchObject({ id: "cBBeppRR46hA5IuMzdOb", contactName: "Flossie Carter" });
  });

  it("lists a person who filled in two forms once", () => {
    const out = mergeMetaLeads({
      leads: [],
      contacts: [],
      metaLeads: [lead(), lead({ id: "999", createdAt: "2026-10-11T00:00:00.000Z" })],
    });
    expect(out.leads).toHaveLength(1);
    expect(out.leads[0].createdAt).toBe("2026-10-10T07:37:17.000Z");
  });
});
