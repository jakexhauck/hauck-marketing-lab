import { describe, it, expect } from "vitest";
import { FakeDb } from "./agentFakeDb";
import { briefDocText, docRewriteRequests, syncBriefToDrive, type BriefDriveOps, type DocText } from "./briefDrive";
import { fullBrief } from "../../src/lib/clientBrief";

const T1 = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-10-17T12:00:00.000Z");

describe("briefDocText", () => {
  it("is a title, then each written section under its heading", () => {
    const doc = briefDocText(
      "Willis Windows",
      fullBrief([
        { section: "ads", body: "- Cap $40/day\n- Never say affordable", version: 2, updatedBy: "jake", updatedAt: null },
        { section: "manager", body: "Live.", version: 1, updatedBy: "manager", updatedAt: null },
      ]),
    );
    expect(doc.text).toBe("Brief: Willis Windows\nStatus\nLive.\nAds\n• Cap $40/day\n• Never say affordable\n");
    // Docs counts from 1 (index 0 is the body's own start).
    expect(doc.headings).toEqual([
      { start: 1, end: 23, style: "TITLE" },
      { start: 23, end: 30, style: "HEADING_2" },
      { start: 36, end: 40, style: "HEADING_2" },
    ]);
    const at = (h: { start: number; end: number }) => doc.text.slice(h.start - 1, h.end - 1);
    expect(doc.headings.map(at)).toEqual(["Brief: Willis Windows\n", "Status\n", "Ads\n"]);
  });

  it("still has a title when nothing is written", () => {
    expect(briefDocText("AAG", fullBrief([])).text).toBe("Brief: AAG\n");
  });
});

describe("docRewriteRequests", () => {
  const doc: DocText = { text: "Brief: X\n", headings: [{ start: 1, end: 10, style: "TITLE" }] };

  it("clears the old body, writes the new one, then styles it", () => {
    expect(docRewriteRequests(40, doc)).toEqual([
      { deleteContentRange: { range: { startIndex: 1, endIndex: 39 } } },
      { insertText: { location: { index: 1 }, text: "Brief: X\n" } },
      { updateParagraphStyle: { range: { startIndex: 1, endIndex: 10 }, paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, fields: "namedStyleType" } },
      { updateParagraphStyle: { range: { startIndex: 1, endIndex: 10 }, paragraphStyle: { namedStyleType: "TITLE" }, fields: "namedStyleType" } },
    ]);
  });

  it("skips the delete on an empty Doc (only its final newline)", () => {
    expect(docRewriteRequests(2, doc)[0]).toEqual({ insertText: { location: { index: 1 }, text: "Brief: X\n" } });
  });
});

function fakeOps(over: Partial<BriefDriveOps> = {}) {
  const calls: string[] = [];
  const writes: { docId: string; text: string }[] = [];
  const ops: BriefDriveOps = {
    account: async () => "acct",
    findDoc: async () => null,
    createDoc: async (_a, folderId, name) => {
      calls.push(`create ${folderId} ${name}`);
      return { id: "doc1", url: "https://docs.google.com/document/d/doc1/edit" };
    },
    writeDoc: async (_a, docId, doc) => {
      writes.push({ docId, text: doc.text });
    },
    ...over,
  };
  return { ops, calls, writes };
}

function world() {
  return new FakeDb()
    .seed("tenants", [{ id: T1, name: "Willis Windows", slug: "willis" }])
    .seed("client_folders", [{ tenant_id: T1, folder_id: "folder1", name: "Willis Windows" }])
    .seed("client_briefs", [{ tenant_id: T1, section: "ads", body: "Cap", version: 2, updated_by: "jake", updated_at: now.toISOString() }]);
}

describe("syncBriefToDrive", () => {
  it("makes the Doc in the client's folder once, then rewrites the same one", async () => {
    const db = world();
    const f = fakeOps();
    await syncBriefToDrive(db.client(), T1, f.ops, now);
    expect(f.calls).toEqual(["create folder1 Brief"]);
    expect(db.rows("client_brief_drive")[0]).toMatchObject({ doc_id: "doc1", doc_url: "https://docs.google.com/document/d/doc1/edit", revision: 2, error: null });

    db.rows("client_briefs")[0].version = 3;
    db.rows("client_briefs")[0].body = "Cap $50";
    await syncBriefToDrive(db.client(), T1, f.ops, now);
    expect(f.calls).toHaveLength(1);
    expect(f.writes.map((w) => w.docId)).toEqual(["doc1", "doc1"]);
    expect(f.writes[1].text).toContain("Cap $50");
    expect(db.rows("client_brief_drive")[0]).toMatchObject({ revision: 3 });
  });

  it("finds a Brief already in the folder rather than making a second", async () => {
    const db = world();
    const f = fakeOps({ findDoc: async () => ({ id: "old", url: "https://docs.google.com/document/d/old/edit" }) });
    await syncBriefToDrive(db.client(), T1, f.ops, now);
    expect(f.calls).toEqual([]);
    expect(f.writes[0].docId).toBe("old");
  });

  it("writes again when the brief moved while it was writing", async () => {
    const db = world();
    let first = true;
    const f = fakeOps({
      writeDoc: async () => {
        if (first) {
          first = false;
          const r = db.rows("client_briefs")[0];
          r.version = 3;
          r.body = "newer";
        }
      },
    });
    const spy: string[] = [];
    const ops = { ...f.ops, writeDoc: async (a: string, id: string, d: DocText) => (spy.push(d.text), f.ops.writeDoc(a, id, d)) };
    await syncBriefToDrive(db.client(), T1, ops, now);
    expect(spy).toHaveLength(2);
    expect(spy[1]).toContain("newer");
    expect(db.rows("client_brief_drive")[0]).toMatchObject({ revision: 3 });
  });

  it("makes a new Doc when the saved one is gone", async () => {
    const db = world().seed("client_brief_drive", [{ tenant_id: T1, doc_id: "gone", doc_url: "u", revision: 1, error: null }]);
    const written: string[] = [];
    const f = fakeOps({
      writeDoc: async (_a, docId) => {
        if (docId === "gone") throw new Error("Drive x: not found (404).");
        written.push(docId);
      },
    });
    await syncBriefToDrive(db.client(), T1, f.ops, now);
    expect(written).toEqual(["doc1"]);
    expect(db.rows("client_brief_drive")[0]).toMatchObject({ doc_id: "doc1", error: null });
  });

  it("records a failure for the chip and never throws", async () => {
    const db = world();
    const f = fakeOps({ writeDoc: async () => Promise.reject(new Error("Drive is rate limited")) });
    await expect(syncBriefToDrive(db.client(), T1, f.ops, now)).resolves.toBeUndefined();
    expect(db.rows("client_brief_drive")[0]).toMatchObject({ error: "Drive is rate limited" });
  });

  it("says so when the client has no Drive folder", async () => {
    const db = world();
    db.rows("client_folders").splice(0);
    const f = fakeOps();
    await syncBriefToDrive(db.client(), T1, f.ops, now);
    expect(f.calls).toEqual([]);
    expect(db.rows("client_brief_drive")[0]).toMatchObject({ error: "This client has no Drive folder." });
  });
});
