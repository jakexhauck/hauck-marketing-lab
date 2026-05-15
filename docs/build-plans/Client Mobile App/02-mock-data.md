# Section 02: Mock Data Layer

## Goal

Define TypeScript types for the core domain (Client, User, Role, Lead, Outcome) and ship realistic fixture data: 3 mock clients across different niches with ~20 leads each spread across pipeline stages.

## Depends on

Section 01 (project scaffold).

## Acceptance criteria

- `src/types/` exports `Client`, `User`, `Role`, `Lead`, `LeadStage`, `Outcome`, `Stats` interfaces with full TypeScript types (no `any`)
- `src/mock/clients.ts` exports 3 clients with distinct brands (color, logo URL, app name, pipeline stage labels, won-label override)
- `src/mock/users.ts` exports users per client covering all three roles (Owner, Manager, Rep), at least 4 users per client
- `src/mock/leads.ts` exports ~20 leads per client, realistic mix across stages: ~30% New, ~25% Contacted, ~20% Booked, ~10% Won, ~10% Lost, ~5% No-Show
- Lead data is realistic, names, plausible phone numbers (use 555 area code), source ad labels ("Spring Roof Promo", "Free Estimate Lead Form"), timestamps spread across the last 30 days
- Each lead in Won state has a `value` (USD amount) realistic for that niche (roofer $4k–$25k, med-spa $300–$2k, auto detailer $150–$800)
- A `src/mock/index.ts` barrel re-exports everything with a simple `getMockData()` helper that returns the active client's data given a `clientId`
- `pnpm typecheck` passes

## Types (locked shape)

```ts
type Role = 'owner' | 'manager' | 'rep';

interface Client {
  id: string;
  name: string;
  niche: string;
  brand: {
    color: string;       // hex, becomes --brand-primary
    logoUrl: string;     // or initials fallback
    appName: string;     // e.g. "Smith Leads"
  };
  pipeline: {
    stages: LeadStage[];
    wonLabel: string;    // "Sold" / "Closed" / "Won"
    valueLabel: string;  // "Job Value" / "Treatment Value"
  };
  tier: 'core' | 'pro' | 'premium';
}

interface User {
  id: string;
  clientId: string;
  name: string;
  email: string;
  role: Role;
}

type LeadStage = 'new' | 'contacted' | 'booked' | 'won' | 'lost' | 'no-show';

interface Lead {
  id: string;
  clientId: string;
  assignedUserId: string | null;
  name: string;
  phone: string;
  email: string;
  sourceAd: string;        // "Spring Roof Promo"
  sourceCampaign: string;  // "FB-Lead-Form-2026-Q2"
  stage: LeadStage;
  value: number | null;    // only when stage === 'won'
  createdAt: string;       // ISO
  lastActivityAt: string;  // ISO
  notes: string | null;
}

interface Stats {
  leadsMtd: number;
  bookedMtd: number;
  wonMtd: number;
  revenueMtd: number;
  spendMtd: number;        // mock ad spend
  cpa: number;             // spend / wonMtd
  roas: number;            // revenue / spend
}
```

## The 3 mock clients (locked)

| ID | Name | Niche | Brand color | Won-label |
|---|---|---|---|---|
| `smiths-roofing` | Smith's Roofing | Roofing | `#1a4d8f` (navy) | Sold |
| `glow-medspa` | Glow Med Spa | Med-spa | `#c47ab4` (rose) | Booked & Paid |
| `apex-detailing` | Apex Auto Detailing | Auto detailing | `#d97706` (amber) | Closed |

Each client gets a distinct pipeline stage order to demonstrate per-client config working (e.g. roofer adds "Estimate Sent", med-spa adds "Consultation").

## Files created

```
client-dashboard/src/
  types/
    index.ts
  mock/
    clients.ts
    users.ts
    leads.ts
    stats.ts
    index.ts
```

## Steps

1. Create `src/types/index.ts` with the interfaces above
2. Write `clients.ts` with the 3 locked clients
3. Write `users.ts`, 4–6 users per client, all roles represented
4. Write `leads.ts`, use a small generator function inside the file so the fixtures don't become 600 lines of literal data. Seed deterministically so the demo is stable across reloads.
5. Write `stats.ts`, pure function `computeStats(leads, spend) → Stats`, plus a mock `spendByClient` map
6. Write `index.ts` barrel + `getMockData(clientId)` helper
7. Run `pnpm typecheck`

## Stop condition

Commit when types compile clean, all 3 clients return ~20 leads each via `getMockData()`, and `computeStats()` returns sensible numbers for each.

**Commit message:** `client-dashboard: mock data layer with 3 clients and realistic leads (section 02)`

## Token weight

Light. Generation work, mostly straightforward. No UI.

## Notes

- Make Won-deal values realistic for the niche. Roofing $4k–$25k. Med-spa $300–$2k. Detailing $150–$800. This matters when the stats strip lights up in Section 06.
- Don't go overboard on data variety. ~20 leads per client is plenty for a demo. More than that and the list view in Section 04 gets unwieldy.
- Phone numbers should all be in the 555 area code (e.g. `(555) 014-7XXX`) so they're obviously fake and safe to put in screenshots.
