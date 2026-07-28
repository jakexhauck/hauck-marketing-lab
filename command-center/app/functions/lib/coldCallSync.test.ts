import { describe, it, expect } from "vitest";
import {
  pickColdCallPipeline,
  planLeadSync,
  phoneKey,
  splitName,
  type ExistingLead,
} from "./coldCallSync";
import type { RawOpportunity } from "./agencyPipelines";

// The console's six statuses, as migration 0055 defines them.
const STATUSES = [
  "New Lead",
  "1st Dial (Day 1)",
  "2nd Dial (Day 2)",
  "Call Back",
  "Booked",
  "Not Interested",
];

// The live board, pulled from location wbrjjHYzznyEHx9wumSr on 2026-07-28.
const COLD_CALLING = {
  id: "LwznFibQdlfvzPDYn7e6",
  name: "Cold Calling",
  stages: [
    { id: "s-new", name: "New Lead" },
    { id: "s-d1", name: "1st Dial (Day 1)" },
    { id: "s-d2", name: "2nd Dial (Day 2)" },
    { id: "s-cb", name: "Call Back" },
    { id: "s-bk", name: "Booked" },
    { id: "s-ni", name: "Not Interested" },
  ],
};

const COLD_SMS = {
  id: "Hr5i23Azgp1gfVXqbQuZ",
  name: "Cold SMS",
  stages: [
    { id: "x1", name: "New Prospect 👥" },
    { id: "x2", name: "Hot Lead 🔥" },
  ],
};

const stageMap = new Map(COLD_CALLING.stages.map((s) => [s.id, s.name]));

// A board card as GoHighLevel actually returns it: the person lives on the
// nested contact, and the opportunity carries the card's own title.
function card(
  over: Partial<RawOpportunity> & { phone?: string; contactId?: string; stageId?: string } = {},
): RawOpportunity {
  const { phone, contactId, stageId, ...rest } = over;
  return {
    id: "o1",
    name: "Ana Diaz",
    pipelineStageId: stageId ?? "s-new",
    status: "open",
    updatedAt: "2026-07-27T17:49:14.101Z",
    contact: {
      id: contactId ?? "c1",
      name: "Ana Diaz",
      phone: phone ?? "+13135550177",
      email: "",
    },
    ...rest,
  };
}

const NOW = "2026-07-28T12:00:00.000Z";

describe("pickColdCallPipeline", () => {
  it("picks the board whose stages match the console", () => {
    expect(pickColdCallPipeline([COLD_SMS, COLD_CALLING], STATUSES)?.id).toBe(COLD_CALLING.id);
  });

  // The whole point of matching on overlap: the board can be renamed.
  it("still finds it after a rename", () => {
    const renamed = { ...COLD_CALLING, name: "Outbound Q3" };
    expect(pickColdCallPipeline([COLD_SMS, renamed], STATUSES)?.name).toBe("Outbound Q3");
  });

  it("refuses to guess when nothing matches", () => {
    expect(pickColdCallPipeline([{ name: "Referrals", stages: [{ id: "z", name: "Sent" }] }], STATUSES)).toBeNull();
  });

  it("returns null for an empty account", () => {
    expect(pickColdCallPipeline([], STATUSES)).toBeNull();
  });
});

describe("phoneKey", () => {
  it("reduces every format of one number to the same key", () => {
    expect(phoneKey("(313) 555-0177")).toBe("3135550177");
    expect(phoneKey("313.555.0177")).toBe("3135550177");
    expect(phoneKey("")).toBe("");
  });

  // The case that actually bites: GoHighLevel hands back E.164 and the book
  // holds what a human typed. These are one prospect, not two.
  it("treats the E.164 form and the typed form as the same number", () => {
    expect(phoneKey("+13135550177")).toBe(phoneKey("(313) 555-0177"));
  });

  // An international number keeps its country code: dropping a leading digit
  // from a number that is not North American would merge two real prospects.
  it("leaves a non-US number alone", () => {
    expect(phoneKey("+447700900123")).toBe("447700900123");
  });
});

describe("splitName", () => {
  it("keeps a multi-word surname whole", () => {
    expect(splitName("Ana Maria Del Toro")).toEqual({ first: "Ana", last: "Maria Del Toro" });
  });
  it("survives an empty name", () => {
    expect(splitName("")).toEqual({ first: "", last: "" });
  });
});

describe("planLeadSync", () => {
  const none: ExistingLead[] = [];

  it("turns a board card into a lead row", () => {
    const plan = planLeadSync([card()], stageMap, STATUSES, none, NOW);
    expect(plan.insert).toHaveLength(1);
    expect(plan.insert[0]).toMatchObject({
      first_name: "Ana",
      last_name: "Diaz",
      phone: "+13135550177",
      status: "New Lead",
      source: "GoHighLevel",
      ghl_contact_id: "c1",
      ghl_synced_at: NOW,
      assigned_to: null,
      no_answer: 0,
    });
  });

  // Our first dial has not happened. Stamping today would tell a caller the
  // prospect was contacted when nobody has spoken to them.
  it("leaves the contact dates empty", () => {
    const [row] = planLeadSync([card()], stageMap, STATUSES, none, NOW).insert;
    expect(row.first_contact_date).toBeNull();
    expect(row.last_contact).toBeNull();
  });

  it("skips a prospect whose number is already in the book", () => {
    const plan = planLeadSync([card()], stageMap, STATUSES, [{ phone: "(313) 555-0177" }], NOW);
    expect(plan.insert).toHaveLength(0);
    expect(plan.skippedExisting).toBe(1);
  });

  it("skips a prospect already linked by contact id, even on a different number", () => {
    const plan = planLeadSync(
      [card({ phone: "+15555550000" })],
      stageMap,
      STATUSES,
      [{ phone: "", ghl_contact_id: "c1" }],
      NOW,
    );
    expect(plan.skippedExisting).toBe(1);
  });

  // Running the sync twice must not double the book. This is the property that
  // makes it safe to fire on every visit to the section.
  it("is idempotent against its own output", () => {
    const first = planLeadSync([card(), card({ id: "o2", contactId: "c2", phone: "+13135550198", name: "Sam Cole" })], stageMap, STATUSES, none, NOW);
    expect(first.insert).toHaveLength(2);

    const existing = first.insert.map((r) => ({
      phone: r.phone as string,
      ghl_contact_id: r.ghl_contact_id as string,
    }));
    const second = planLeadSync([card(), card({ id: "o2", contactId: "c2", phone: "+13135550198" })], stageMap, STATUSES, existing, NOW);
    expect(second.insert).toHaveLength(0);
    expect(second.skippedExisting).toBe(2);
  });

  it("dedupes a prospect listed twice on the same board", () => {
    const plan = planLeadSync([card(), card({ id: "o2" })], stageMap, STATUSES, none, NOW);
    expect(plan.insert).toHaveLength(1);
    expect(plan.skippedExisting).toBe(1);
  });

  it("rejects a card with no phone number", () => {
    const plan = planLeadSync([card({ phone: "" })], stageMap, STATUSES, none, NOW);
    expect(plan.insert).toHaveLength(0);
    expect(plan.skippedNoPhone).toBe(1);
  });

  // Importing an unknown stage would break the status CHECK constraint, and
  // guessing the nearest one would move somebody's prospect unasked.
  it("names the stages it had no page for instead of guessing", () => {
    const withExtra = new Map(stageMap);
    withExtra.set("s-vm", "Voicemail Left");
    const plan = planLeadSync(
      [card(), card({ id: "o2", contactId: "c2", phone: "+13135550111", stageId: "s-vm" })],
      withExtra,
      STATUSES,
      none,
      NOW,
    );
    expect(plan.insert).toHaveLength(1);
    expect(plan.skippedStages).toEqual(["Voicemail Left"]);
  });

  it("carries the dial count the stage implies", () => {
    const plan = planLeadSync(
      [
        card({ id: "a", contactId: "ca", phone: "+13130000001", stageId: "s-d1" }),
        card({ id: "b", contactId: "cb", phone: "+13130000002", stageId: "s-d2" }),
        card({ id: "c", contactId: "cc", phone: "+13130000003", stageId: "s-bk" }),
      ],
      stageMap,
      STATUSES,
      none,
      NOW,
    );
    expect(plan.insert.map((r) => r.no_answer)).toEqual([1, 2, 0]);
  });

  it("does not import a card whose stage id is unknown entirely", () => {
    const plan = planLeadSync([card({ stageId: "gone" })], stageMap, STATUSES, none, NOW);
    expect(plan.insert).toHaveLength(0);
    expect(plan.skippedStages).toEqual([]);
  });

  // shapeOpportunity() writes "Unnamed" when GHL gives it nothing to work with.
  // Storing that as a first name would put it on a call screen.
  it("does not store the Unnamed placeholder as a name", () => {
    const [row] = planLeadSync(
      [card({ name: "", contact: { id: "c1", phone: "+13135550177" } })],
      stageMap,
      STATUSES,
      none,
      NOW,
    ).insert;
    expect(row.first_name).toBe("");
    expect(row.last_name).toBe("");
  });

  // The real shape of a booked card: GoHighLevel appends the appointment time
  // to the opportunity name. That is a card title, and storing it would give a
  // caller a prospect surnamed "Petrov - Tuesday, July 28, 2026 1:30 AM EDT".
  it("takes the person from the contact, not the card title", () => {
    const [row] = planLeadSync(
      [
        card({
          name: "Rosa Petrov - Tuesday, July 28, 2026 1:30 AM EDT",
          stageId: "s-bk",
          contact: { id: "c9", name: "Rosa Petrov", phone: "+15550261112" },
        }),
      ],
      stageMap,
      STATUSES,
      none,
      NOW,
    ).insert;
    expect(row.first_name).toBe("Rosa");
    expect(row.last_name).toBe("Petrov");
  });

  // ...but the card title is still better than nothing when the contact has no
  // name on it at all.
  it("falls back to the card title when the contact is nameless", () => {
    const [row] = planLeadSync(
      [card({ name: "Sam Cole", contact: { id: "c2", phone: "+13135550198" } })],
      stageMap,
      STATUSES,
      none,
      NOW,
    ).insert;
    expect(row.first_name).toBe("Sam");
    expect(row.last_name).toBe("Cole");
  });
});
