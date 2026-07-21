### Task 3: Metric derivation, pure and tested

The riskiest logic in the feature, and the cheapest to test because it touches nothing.

**Files:**
- Create: `command-center/app/functions/lib/setterMetrics.ts`
- Test: `command-center/app/functions/lib/setterMetrics.test.ts`

**Interfaces:**
- Produces: `rollUpByContact(dials): Map<string, ContactRollUp>`, `computeRates(leads, rollUps, appointments): Rates`
- `ContactRollUp = { attempts: number; firstDialedAt: string | null; contacted: boolean; lastOutcome: string | null }`
- `Rates = { totalLeads: number; contactRate: number | null; bookingRate: number | null; showRate: null; closeRate: null }`

`showRate` and `closeRate` are typed `null` deliberately. They cannot be computed until the close-out flows exist, and typing them `null` makes any attempt to fake them a type error.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from "vitest";
import { rollUpByContact, computeRates } from "./setterMetrics";

const dial = (contact: string, at: string, spoke: boolean, outcome: string) =>
  ({ contact_id: contact, dialed_at: at, spoke, outcome });

describe("rollUpByContact", () => {
  it("counts attempts and takes the earliest dial as first call", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T14:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
    ]);
    expect(r.get("c1")!.attempts).toBe(3);
    expect(r.get("c1")!.firstDialedAt).toBe("2026-07-20T09:00:00Z");
  });

  it("marks contacted when any dial spoke, regardless of order", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "not_interested"),
      dial("c1", "2026-07-20T10:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
  });

  it("takes the outcome of the most recent dial, not the last in the array", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T17:00:00Z", true, "booked"),
      dial("c1", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.lastOutcome).toBe("booked");
  });

  it("keeps contacts separate", () => {
    const r = rollUpByContact([
      dial("c1", "2026-07-20T09:00:00Z", true, "booked"),
      dial("c2", "2026-07-20T09:00:00Z", false, "no_answer"),
    ]);
    expect(r.get("c1")!.contacted).toBe(true);
    expect(r.get("c2")!.contacted).toBe(false);
  });
});

describe("computeRates", () => {
  it("returns null rates rather than NaN when there are no leads", () => {
    const r = computeRates([], new Map(), []);
    expect(r.totalLeads).toBe(0);
    expect(r.contactRate).toBeNull();
    expect(r.bookingRate).toBeNull();
  });

  it("counts a lead as contacted only via its own roll-up", () => {
    const leads = [{ contactId: "c1" }, { contactId: "c2" }];
    const rollUps = rollUpByContact([dial("c1", "2026-07-20T09:00:00Z", true, "booked")]);
    const r = computeRates(leads, rollUps, []);
    expect(r.totalLeads).toBe(2);
    expect(r.contactRate).toBeCloseTo(0.5);
  });

  it("never computes show or close rate", () => {
    const r = computeRates([{ contactId: "c1" }], new Map(), [{ contactId: "c1" }]);
    expect(r.showRate).toBeNull();
    expect(r.closeRate).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `npx vitest run functions/lib/setterMetrics.test.ts`
Expected: FAIL, cannot resolve `./setterMetrics`.

- [ ] **Step 3: Implement**

```ts
export type DialRow = {
  contact_id: string;
  dialed_at: string;
  spoke: boolean;
  outcome: string;
};

export type ContactRollUp = {
  attempts: number;
  firstDialedAt: string | null;
  contacted: boolean;
  lastOutcome: string | null;
};

export function rollUpByContact(dials: DialRow[]): Map<string, ContactRollUp> {
  const out = new Map<string, ContactRollUp>();
  // Input sort order is not trusted, so the latest timestamp per contact is
  // tracked alongside rather than assumed from array position.
  const latestAt = new Map<string, string>();

  for (const d of dials) {
    const cur = out.get(d.contact_id) ?? {
      attempts: 0, firstDialedAt: null, contacted: false, lastOutcome: null,
    };
    cur.attempts += 1;
    if (cur.firstDialedAt === null || d.dialed_at < cur.firstDialedAt) {
      cur.firstDialedAt = d.dialed_at;
    }
    const seen = latestAt.get(d.contact_id);
    if (seen === undefined || d.dialed_at >= seen) {
      cur.lastOutcome = d.outcome;
      latestAt.set(d.contact_id, d.dialed_at);
    }
    if (d.spoke) cur.contacted = true;
    out.set(d.contact_id, cur);
  }
  return out;
}

export type Rates = {
  totalLeads: number;
  contactRate: number | null;
  bookingRate: number | null;
  showRate: null;
  closeRate: null;
};

export function computeRates(
  leads: { contactId: string }[],
  rollUps: Map<string, ContactRollUp>,
  appointments: { contactId: string }[],
): Rates {
  const total = leads.length;
  if (total === 0) {
    return { totalLeads: 0, contactRate: null, bookingRate: null, showRate: null, closeRate: null };
  }
  const contacted = leads.filter((l) => rollUps.get(l.contactId)?.contacted).length;
  const booked = new Set(appointments.map((a) => a.contactId));
  const bookedLeads = leads.filter((l) => booked.has(l.contactId)).length;
  return {
    totalLeads: total,
    contactRate: contacted / total,
    bookingRate: bookedLeads / total,
    // Both require the Estimate and Job Close-out flows, which do not exist.
    showRate: null,
    closeRate: null,
  };
}
```

- [ ] **Step 4: Run, watch pass**

Run: `npx vitest run functions/lib/setterMetrics.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add command-center/app/functions/lib/setterMetrics.ts command-center/app/functions/lib/setterMetrics.test.ts
git commit -m "feat(setter): derive per-contact roll-ups and rates from dial events"
```

---

