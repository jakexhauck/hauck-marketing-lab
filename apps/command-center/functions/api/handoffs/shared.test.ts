import { describe, it, expect } from "vitest";
import {
  normalizeStageName,
  stageNameToStatus,
  shapeHandoff,
  sortHandoffs,
  STATUS_STAGE_NAME,
  OUTCOME_TAG,
  type ApiHandoff,
  type HandoffStatus,
} from "./shared";
import type { GhlOpportunity } from "../../lib/ghl";

describe("normalizeStageName", () => {
  it("lowercases, strips emoji/punctuation, collapses spaces", () => {
    expect(normalizeStageName("🤝 Handed Off")).toBe("handed off");
    expect(normalizeStageName("Estimate-Booked")).toBe("estimate booked");
    expect(normalizeStageName("  Follow   Up  ")).toBe("follow up");
  });
});

describe("stageNameToStatus", () => {
  it("maps the six canonical handoff stages", () => {
    expect(stageNameToStatus("Handed Off")).toBe("new");
    expect(stageNameToStatus("Estimate Booked")).toBe("estimate_set");
    expect(stageNameToStatus("Job Booked")).toBe("job_booked");
    expect(stageNameToStatus("Won")).toBe("won");
    expect(stageNameToStatus("Lost")).toBe("lost");
    expect(stageNameToStatus("Follow Up")).toBe("later");
  });

  it("survives emoji and minor renames", () => {
    expect(stageNameToStatus("🤝 Handed Off")).toBe("new");
    expect(stageNameToStatus("follow-up")).toBe("later");
  });

  it("does NOT mislabel Job Completed as a handoff", () => {
    expect(stageNameToStatus("Job Completed")).toBeNull();
  });

  it("returns null for unrelated stages", () => {
    expect(stageNameToStatus("Needs Dialing")).toBeNull();
    expect(stageNameToStatus("")).toBeNull();
  });

  it("round-trips every status through its canonical name", () => {
    (Object.keys(STATUS_STAGE_NAME) as HandoffStatus[]).forEach((status) => {
      expect(stageNameToStatus(STATUS_STAGE_NAME[status])).toBe(status);
    });
  });
});

describe("OUTCOME_TAG", () => {
  it("tags only the direct owner outcomes; bookings add no tag", () => {
    expect(OUTCOME_TAG.won).toBe("owner won");
    expect(OUTCOME_TAG.lost).toBe("owner lost");
    expect(OUTCOME_TAG.later).toBe("owner follow up");
    expect(OUTCOME_TAG.estimate_set).toBeNull();
    expect(OUTCOME_TAG.job_booked).toBeNull();
    expect(OUTCOME_TAG.new).toBeNull();
  });
});

function opp(over: Partial<GhlOpportunity> = {}): GhlOpportunity {
  return {
    id: "opp1",
    name: "Marcus Bell",
    monetaryValue: 8400,
    pipelineId: "pipe1",
    pipelineStageId: "stage1",
    createdAt: "2026-07-20T10:00:00.000Z",
    contact: { id: "c1", name: "Marcus Bell", phone: "(555) 812-4471" },
    ...over,
  };
}

describe("shapeHandoff", () => {
  it("shapes an opportunity into the handoff wire shape", () => {
    const h = shapeHandoff(opp(), "new");
    expect(h.id).toBe("opp1");
    expect(h.contactId).toBe("c1");
    expect(h.name).toBe("Marcus Bell");
    expect(h.phone).toBe("(555) 812-4471");
    expect(h.status).toBe("new");
    expect(h.value).toBe(8400);
    expect(h.handedAt).toBe("2026-07-20T10:00:00.000Z");
    // Inert chat fields.
    expect(h.unread).toBe(0);
    expect(h.lastMessage).toBeNull();
    expect(h.firstOwnerReplyAt).toBeNull();
  });

  it("falls back to the opp name when the contact has none", () => {
    const h = shapeHandoff(
      opp({
        contact: { id: "c2" },
        name: "Backyard job",
        lastStatusChangeAt: "2026-07-23T15:00:00.000Z",
      }),
      "won",
    );
    expect(h.name).toBe("Backyard job");
    // Terminal outcomes carry a closedAt from the stage-change timestamp.
    expect(h.closedAt).toBe("2026-07-23T15:00:00.000Z");
  });

  it("carries address/service enrichment through", () => {
    const h = shapeHandoff(opp(), "job_booked", {
      address: "17 Beechwood Dr, Garden City MI",
      service: "6 windows",
    });
    expect(h.address).toBe("17 Beechwood Dr, Garden City MI");
    expect(h.service).toBe("6 windows");
  });
});

describe("sortHandoffs", () => {
  it("keeps active leads above closed, each newest-first", () => {
    const mk = (id: string, status: HandoffStatus, handedAt: string): ApiHandoff =>
      shapeHandoff(opp({ id, createdAt: handedAt }), status);
    const sorted = sortHandoffs([
      mk("won-old", "won", "2026-07-19T10:00:00.000Z"),
      mk("new-old", "new", "2026-07-18T10:00:00.000Z"),
      mk("new-new", "new", "2026-07-22T10:00:00.000Z"),
      mk("lost-new", "lost", "2026-07-23T10:00:00.000Z"),
    ]);
    expect(sorted.map((h) => h.id)).toEqual(["new-new", "new-old", "lost-new", "won-old"]);
  });
});
