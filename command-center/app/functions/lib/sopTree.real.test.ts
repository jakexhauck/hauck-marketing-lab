import { describe, it, expect } from "vitest";
import { buildCategory, parseOrderPrefix } from "./sopTree";
import type { DriveFile } from "./driveDirect";

// Fixtures taken verbatim from the real agency folder
// (My Drive / 🌟 Hauck Marketing 🌟 / SOPs Templates) on 2026-07-21.
//
// The synthetic tests next door pin the rules; these pin the rules against the
// actual filenames, including the misspelled "Fullfillment", the numbering that
// skips, and the video/doc pairing convention as Jake actually types it.

const DOC = "application/vnd.google-apps.document";
const SHEET = "application/vnd.google-apps.spreadsheet";

function f(name: string, mimeType: string, id = name): DriveFile {
  return {
    id, name, mimeType,
    isFolder: false,
    webViewLink: null, iconLink: null, thumbnailLink: null,
    modifiedTime: null, size: null,
  };
}

describe("real folder: Fullfillment / Facebook Ads", () => {
  const children = [
    f("1. Meta Ads Post-Andromeda", DOC),
    f("2. Winning B2C FB Ads Copy Funnels", DOC),
    f("3. Static AD Creation SOP", DOC),
    f("4. AI Voiceover + B-Roll AD Creation SOP", DOC),
    f("5. AD Copy Creation SOP", DOC),
    f("6. AD Campaign Setup SOP", DOC),
    f("7. Facebook Pixel SOP", DOC),
    f("8. B2C Setting Script", DOC),
    f("9. Media Buying Matrix.PNG", "image/png"),
  ];

  it("keeps the eight Docs in their numbered order", () => {
    const cat = buildCategory("Facebook Ads", "fullfillment/facebook-ads", children);
    expect(cat.sops.map((s) => s.title)).toEqual([
      "Meta Ads Post-Andromeda",
      "Winning B2C FB Ads Copy Funnels",
      "Static AD Creation SOP",
      "AI Voiceover + B-Roll AD Creation SOP",
      "AD Copy Creation SOP",
      "AD Campaign Setup SOP",
      "Facebook Pixel SOP",
      "B2C Setting Script",
    ]);
  });

  it("treats the PNG as an attachment, not an SOP", () => {
    const cat = buildCategory("Facebook Ads", "fullfillment/facebook-ads", children);
    expect(cat.attachments.map((a) => a.name)).toEqual(["9. Media Buying Matrix.PNG"]);
  });

  it("survives the + in a filename", () => {
    expect(parseOrderPrefix("4. AI Voiceover + B-Roll AD Creation SOP").title).toBe(
      "AI Voiceover + B-Roll AD Creation SOP",
    );
  });
});

describe("real folder: Cold Email / Day 2 Find The Right People", () => {
  // The real folder pairs "N. <name>.mp4" with "N.1 <name>.gdoc", and item 7 has
  // a Doc with no video while item 2 has a video with no Doc.
  const children = [
    f("1. The 1 Method to build a list.mp4", "video/mp4", "v1"),
    f("1.1 The 1 Method to build a list.gdoc", DOC, "d1"),
    f("2. All lead list guides ⬇️ .mp4", "video/mp4", "v2"),
    f("3. LinkedIn Sales Navigator.mp4", "video/mp4", "v3"),
    f("3.1 LinkedIn Sales Navigator.gdoc", DOC, "d3"),
    f("7. Enrich Any Lead List.gdoc", DOC, "d7"),
    f("8. Verify Audit Leads.mp4", "video/mp4", "v8"),
    f("8.1 Verify Audit Leads.gdoc", DOC, "d8"),
  ];

  const cat = buildCategory("Day 2  Find The Right People", "cold-email/day-2-find-the-right-people", children);

  it("pairs each video to the Doc sharing its number", () => {
    const byTitle = Object.fromEntries(cat.sops.map((s) => [s.title, s.videoId]));
    expect(byTitle["The 1 Method to build a list"]).toBe("v1");
    expect(byTitle["LinkedIn Sales Navigator"]).toBe("v3");
    expect(byTitle["Verify Audit Leads"]).toBe("v8");
  });

  it("leaves a Doc with no matching video unpaired rather than guessing", () => {
    const enrich = cat.sops.find((s) => s.title === "Enrich Any Lead List");
    expect(enrich?.videoId).toBeNull();
  });

  it("keeps the orphan video as an attachment so it is not lost", () => {
    expect(cat.attachments.map((a) => a.id)).toEqual(["v2"]);
  });

  it("strips the .gdoc extension from titles", () => {
    expect(cat.sops.every((s) => !s.title.includes(".gdoc"))).toBe(true);
  });
});

describe("real folder: Sales", () => {
  const children = [
    f("Client Dialing Setting   SOP.gdoc", DOC, "s1"),
    f("Client Dialing Voicemail Objection Handling   TEMPLATE.gdoc", DOC, "s2"),
    f("Estimate Notes   TEMPLATE.gdoc", DOC, "s3"),
    f("General Company Information   TEMPLATE.gdoc", DOC, "s4"),
    f("How To Add Lead To Group Chat With Company.gdoc", DOC, "s5"),
    f("Dialing Setter Hub.gsheet", SHEET, "s6"),
  ];

  const cat = buildCategory("Sales", "sales", children);

  it("sorts unprefixed Docs alphabetically", () => {
    expect(cat.sops.map((s) => s.title)).toEqual([
      "Client Dialing Setting   SOP",
      "Client Dialing Voicemail Objection Handling   TEMPLATE",
      "Estimate Notes   TEMPLATE",
      "General Company Information   TEMPLATE",
      "How To Add Lead To Group Chat With Company",
    ]);
  });

  it("collapses the run of spaces from the original title into one slug separator", () => {
    expect(cat.sops[0].slug).toBe("client-dialing-setting-sop");
  });

  it("lists the Sheet as an attachment", () => {
    expect(cat.attachments.map((a) => a.name)).toEqual(["Dialing Setter Hub.gsheet"]);
  });
});

describe("real folder: Company (templates, no SOPs)", () => {
  it("reports no SOPs but keeps every template reachable", () => {
    const cat = buildCategory("Company", "company", [
      f("AD Creation Prompts.gdoc", DOC, "c1"),
      f("AD's Planner   Template.gsheet", SHEET, "c2"),
      f("Company Scorecard   Template.gsheet", SHEET, "c3"),
      f("Local Offer's   Swipe File.gsheet", SHEET, "c4"),
    ]);
    expect(cat.sops.map((s) => s.title)).toEqual(["AD Creation Prompts"]);
    expect(cat.attachments).toHaveLength(3);
  });
});
