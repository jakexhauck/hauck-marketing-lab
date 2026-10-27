import { describe, it, expect } from "vitest";
import type { Env } from "./env";
import { boardGhl } from "./boardGhl";
import boardSrc from "../api/admin/cold-sms/board.ts?raw";
import moveSrc from "../api/admin/cold-sms/move.ts?raw";
import prospectSrc from "../api/admin/cold-sms/prospect/[contactId]/index.ts?raw";
import sendSrc from "../api/admin/cold-sms/prospect/[contactId]/send.ts?raw";
import phoneSrc from "../api/admin/cold-sms/prospect/[contactId]/phone.ts?raw";
import tagSrc from "../api/admin/cold-sms/prospect/[contactId]/tag.ts?raw";
import followupSrc from "../api/admin/cold-sms/prospect/[contactId]/followup.ts?raw";
import callSrc from "../api/admin/cold-sms/prospect/[contactId]/call.ts?raw";

const req = (qs = "") => new Request(`https://app.hauckmarketing.com/api/admin/cold-sms/board${qs}`);

describe("boardGhl", () => {
  it("is the agency's GHL with no tenant, and null when that is not connected", async () => {
    expect(await boardGhl({} as Env, req())).toBeNull();
    const on = await boardGhl({ AGENCY_GHL_TOKEN: "t", AGENCY_GHL_LOCATION_ID: "L" } as unknown as Env, req());
    expect(on).toMatchObject({ tenantId: null, ghl: { locationId: "L" } });
  });

  it("refuses a tenant that is not a client id before touching anything", async () => {
    const r = await boardGhl({} as Env, req("?tenant=../../etc"));
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(400);
  });
});

describe("the board endpoints a client's Setting board calls", () => {
  // Every one resolves its GHL through boardGhl, so on a client's board none of
  // them can quietly act on the agency's own sub-account.
  const endpoints = { boardSrc, moveSrc, prospectSrc, sendSrc, phoneSrc, tagSrc, followupSrc, callSrc };

  it("all go through boardGhl and never take the agency's GHL themselves", () => {
    for (const [name, src] of Object.entries(endpoints)) {
      expect(src, name).toMatch(/await boardGhl\(ctx\.env, ctx\.request\)/);
      expect(src, name).not.toMatch(/getAgencyGhlContext\(/);
    }
  });

  it("Call on a client's board is their App Call workflow, not the agency's call now tag", () => {
    const client = callSrc.slice(callSrc.indexOf("if (board.tenantId)"), callSrc.indexOf("const agency = board.ghl"));
    expect(client).toMatch(/startAppCall\(board\.ghl, contactId\)/);
    expect(client).not.toMatch(/fireCallTag/);
  });
});
