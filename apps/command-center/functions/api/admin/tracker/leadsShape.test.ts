import { describe, it, expect } from "vitest";
import { LIST_SELECT, leadsEnvelope, listSelectKeys, toLead, type LeadRow } from "./leads";

// The lead book is handed to the browser WITHOUT being read row by row: Postgres
// is asked for the camelCase names the client already wants, and the answer is
// piped straight through. That only stays true while the names Postgres is asked
// for are exactly the names toLead produces for a single row after a write.
//
// Nothing else checks that. A column added to one and not the other would send
// the list one shape and every write another, and the table would render blanks
// for a field that is plainly there.

// Every column, as a fully migrated database returns them.
const ROW: LeadRow = {
  id: "lead-1",
  first_name: "Ada",
  last_name: "Lovelace",
  phone: "+15551234567",
  timezone: "Eastern",
  status: "New Lead",
  first_contact_date: "2026-08-01",
  source: "Lead scraper",
  appointment_date: null,
  no_answer: 0,
  last_contact: "2026-08-01",
  follow_up_date: null,
  email: "ada@example.com",
  notes: "",
  assigned_to: null,
  created_at: "2026-08-01T00:00:00Z",
  business_name: "Lovelace Doors",
  niche: "garage_doors",
  website: "",
  city: "Raleigh",
  state: "NC",
  follow_up_time: null,
  ghl_contact_id: null,
  ghl_synced_at: null,
  ghl_error: null,
};

describe("the shape the list is asked for", () => {
  it("asks Postgres for exactly the fields a written row comes back with", () => {
    expect(listSelectKeys(LIST_SELECT).sort()).toEqual(Object.keys(toLead(ROW)).sort());
  });

  it("aliases every snake_case column to the name the client reads", () => {
    // If this ever stopped aliasing, the browser would receive first_name and
    // render an empty contact column rather than fail loudly.
    expect(LIST_SELECT).toContain("firstName:first_name");
    expect(LIST_SELECT).toContain("businessName:business_name");
    expect(LIST_SELECT).toContain("ghlContactId:ghl_contact_id");
  });

  it("does not alias the columns already named what the client calls them", () => {
    // "id:id" is legal and pointless; it only makes the select harder to read.
    expect(LIST_SELECT).not.toContain("id:id");
    expect(LIST_SELECT).not.toContain("phone:phone");
  });
});

// The envelope is the only hand-rolled stream in this file, and a bug in it
// corrupts every list the app reads. PostgREST answers with a bare array and the
// browser has always been handed {leads:[...]}; these check that the wrapping is
// exactly that, across chunk boundaries, without the rows ever being parsed.
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function read(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

describe("the {leads:[...]} envelope", () => {
  it("wraps a whole array that arrived in one chunk", async () => {
    const out = await read(leadsEnvelope(streamOf(['[{"id":"a"}]'])));
    expect(JSON.parse(out)).toEqual({ leads: [{ id: "a" }] });
  });

  it("wraps an array split across chunks, which is how a real book arrives", async () => {
    // 460KB does not come back in one piece. A wrapper that only worked on the
    // first chunk would truncate every list in the app.
    const out = await read(leadsEnvelope(streamOf(['[{"id":"a"},', '{"id":', '"b"}]'])));
    expect(JSON.parse(out)).toEqual({ leads: [{ id: "a" }, { id: "b" }] });
  });

  it("wraps an empty book", async () => {
    const out = await read(leadsEnvelope(streamOf(["[]"])));
    expect(JSON.parse(out)).toEqual({ leads: [] });
  });
});
