import { describe, it, expect } from "vitest";
import { parseOrderPrefix, isExcludedFolder, slugify, buildCategory } from "./sopTree";
import type { DriveFile } from "./driveDirect";

// The Drive folder already encodes ordering and video pairing in its filenames.
// These tests pin that convention, taken from the real folder:
//   "3. Static AD Creation SOP.gdoc"
//   "1. Launching our Campaign.mp4" + "1.1 Launching our Campaign.gdoc"

function file(name: string, mimeType: string, id = name): DriveFile {
  return {
    id,
    name,
    mimeType,
    isFolder: mimeType === "application/vnd.google-apps.folder",
    webViewLink: `https://drive.google.com/file/d/${id}`,
    iconLink: null,
    thumbnailLink: null,
    modifiedTime: "2026-07-20T00:00:00Z",
    size: null,
  };
}

const DOC = "application/vnd.google-apps.document";
const SHEET = "application/vnd.google-apps.spreadsheet";
const MP4 = "video/mp4";
const PDF = "application/pdf";

describe("parseOrderPrefix", () => {
  it("reads a whole-number prefix", () => {
    expect(parseOrderPrefix("3. Static AD Creation SOP")).toEqual({ major: 3, minor: 0, title: "Static AD Creation SOP" });
  });

  it("reads a dotted prefix as major and minor", () => {
    expect(parseOrderPrefix("1.1 Launching our Campaign")).toEqual({ major: 1, minor: 1, title: "Launching our Campaign" });
  });

  it("handles a double-digit prefix", () => {
    expect(parseOrderPrefix("10. Reporting")).toEqual({ major: 10, minor: 0, title: "Reporting" });
  });

  it("sorts unprefixed names last and keeps the full name as the title", () => {
    expect(parseOrderPrefix("GHL SOP")).toEqual({ major: Number.MAX_SAFE_INTEGER, minor: 0, title: "GHL SOP" });
  });

  it("does not mistake a decimal inside a title for a prefix", () => {
    expect(parseOrderPrefix("Meta Ads 2.0 Playbook")).toEqual({ major: Number.MAX_SAFE_INTEGER, minor: 0, title: "Meta Ads 2.0 Playbook" });
  });

  it("tolerates missing space after the dot", () => {
    expect(parseOrderPrefix("7.Facebook Pixel SOP")).toEqual({ major: 7, minor: 0, title: "Facebook Pixel SOP" });
  });
});

describe("isExcludedFolder", () => {
  it("excludes the empty client scaffolding folder", () => {
    expect(isExcludedFolder("EXAMPLE CLIENT FOLDER")).toBe(true);
  });

  it("is case insensitive", () => {
    expect(isExcludedFolder("Example Client Folder")).toBe(true);
  });

  it("keeps real categories", () => {
    expect(isExcludedFolder("Sales")).toBe(false);
    expect(isExcludedFolder("Fullfillment")).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Static AD Creation SOP")).toBe("static-ad-creation-sop");
  });

  it("collapses punctuation and repeated separators", () => {
    expect(slugify("Client Dialing/Setting  |  SOP")).toBe("client-dialing-setting-sop");
  });

  it("strips emoji and leading or trailing separators", () => {
    expect(slugify("🌟 Hauck Marketing 🌟")).toBe("hauck-marketing");
  });

  it("never returns an empty slug", () => {
    expect(slugify("???")).toBe("untitled");
  });
});

describe("buildCategory", () => {
  it("turns Docs into ordered SOPs and non-Docs into attachments", () => {
    const cat = buildCategory("Facebook Ads", "fullfillment/facebook-ads", [
      file("3. Static AD Creation SOP", DOC, "d3"),
      file("1. Meta Ads Post-Andromeda", DOC, "d1"),
      file("9. Media Buying Matrix.PNG", "image/png", "p9"),
      file("META Lingo.pdf", PDF, "pdf1"),
    ]);

    expect(cat.sops.map((s) => s.title)).toEqual(["Meta Ads Post-Andromeda", "Static AD Creation SOP"]);
    expect(cat.attachments.map((a) => a.name)).toEqual(["9. Media Buying Matrix.PNG", "META Lingo.pdf"]);
  });

  it("pairs a video to the Doc that shares its major number", () => {
    const cat = buildCategory("Day 6", "cold-email/day-6", [
      file("1. Launching our Campaign", MP4, "vid1"),
      file("1.1 Launching our Campaign", DOC, "doc1"),
    ]);

    expect(cat.sops).toHaveLength(1);
    expect(cat.sops[0].title).toBe("Launching our Campaign");
    expect(cat.sops[0].videoId).toBe("vid1");
    // A paired video is consumed, not also listed as a loose attachment.
    expect(cat.attachments).toHaveLength(0);
  });

  it("leaves a video unpaired when no Doc shares its number", () => {
    const cat = buildCategory("Day 2", "cold-email/day-2", [
      file("2. All lead list guides", MP4, "vid2"),
      file("1.1 The 1 Method to build a list", DOC, "doc1"),
    ]);

    expect(cat.sops[0].videoId).toBeNull();
    expect(cat.attachments.map((a) => a.id)).toEqual(["vid2"]);
  });

  it("does not pair a video across differing major numbers", () => {
    const cat = buildCategory("Mixed", "mixed", [
      file("1. Intro", MP4, "vid1"),
      file("2.1 Something else", DOC, "doc2"),
    ]);
    expect(cat.sops[0].videoId).toBeNull();
  });

  it("gives every SOP a slug unique within its category", () => {
    const cat = buildCategory("Sales", "sales", [
      file("1. Follow Up", DOC, "a"),
      file("2. Follow Up", DOC, "b"),
    ]);
    const slugs = cat.sops.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(2);
  });

  it("sorts unprefixed Docs after prefixed ones, alphabetically", () => {
    const cat = buildCategory("Fullfillment", "fullfillment", [
      file("GHL SOP", DOC, "g"),
      file("Before and After prompt", DOC, "b"),
      file("1. First", DOC, "f"),
    ]);
    expect(cat.sops.map((s) => s.title)).toEqual(["First", "Before and After prompt", "GHL SOP"]);
  });

  it("reports a category with no Docs as empty rather than dropping its attachments", () => {
    const cat = buildCategory("Company", "company", [file("Scorecard Template", SHEET, "s1")]);
    expect(cat.sops).toHaveLength(0);
    expect(cat.attachments).toHaveLength(1);
  });
});
