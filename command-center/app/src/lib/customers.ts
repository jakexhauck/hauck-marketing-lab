// Customers page: shared types + the demo fixture.
//
// The types mirror functions/lib/customers.ts (the server derives every number;
// the page only renders). Money crosses the wire as integer CENTS, so the UI
// divides by 100 exactly once, at the formatter.

export type ServiceState = "booked" | "overdue" | "unplanned" | "none";

export interface ApiCustomer {
  contactId: string;
  opportunityId: string;
  name: string;
  phone: string;
  email: string;
  stageId: string;
  stageName: string;
  jobCount: number;
  totalCents: number;
  lastJobOn: string | null;
  firstJobOn: string | null;
  nextServiceAt: string | null;
  serviceState: ServiceState | null;
}

export interface ApiCustomerColumn {
  id: string;
  name: string;
  color: string | null;
  recurring: boolean;
  count: number;
  totalCents: number;
  customers: ApiCustomer[];
}

export interface CustomersResponse {
  columns: ApiCustomerColumn[];
  jobsUnavailable?: boolean;
  configError?: "pipeline_not_found";
}

export interface ApiCustomerJob {
  id: string;
  description: string;
  valueCents: number;
  completedOn: string;
  addedManually: boolean;
}

export interface CustomerDetailResponse {
  contactId: string;
  opportunityId: string;
  name: string;
  phone: string;
  email: string;
  type: "one-time" | "recurring";
  stageId: string;
  stageName: string;
  jobs: ApiCustomerJob[];
  totalCents: number;
  nextServiceAt: string | null;
  serviceState: ServiceState | null;
  appointmentMissing?: boolean;
  jobsUnavailable?: boolean;
}

export interface CustomerJobInput {
  description: string;
  valueCents: number;
  completedOn: string;
}

export interface ServicePlanInput {
  mode: "book" | "unplanned" | "none";
  at?: string;
}

// A column's client-facing label. GHL stage names carry emoji and the word
// "Customer" ("Recurring Customer 🔁"), which is noise inside a page already
// titled Customers and under a column already holding customers.
export function columnLabel(stageName: string): string {
  const stripped = stageName
    // Keycaps FIRST, and as a whole unit: "1️⃣" is U+0031 U+FE0F U+20E3, an
    // ASCII digit plus two invisible modifiers. Stripping the modifiers alone
    // strands the digit and the live column reads "One-Time 1".
    .replace(/[0-9#*]️?⃣/g, "")
    // Then any pictographic emoji, by Unicode property rather than hand-picked
    // ranges: a client can put any emoji on a stage, and "⭐" (U+2B50) already
    // falls outside the blocks one would think to list.
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
    .replace(/\bcustomers?\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  // A stage literally named "Customers" strips to nothing. An empty column
  // header is worse than a redundant one.
  return stripped || stageName.trim();
}

// Matches the live Willis shape (Customers pipeline XYjBgpRZ5mTiTfJNQP8M).
export const DEMO_CUSTOMERS: CustomersResponse = {
  columns: [
    {
      id: "st_rec",
      name: "Recurring Customer 🔁",
      color: "#059669",
      recurring: true,
      count: 4,
      totalCents: 4_225_000,
      customers: [
        {
          contactId: "c_hale",
          opportunityId: "o_hale",
          name: "Hale & Sons",
          phone: "(555) 118-2043",
          email: "office@haleandsons.com",
          stageId: "st_rec",
          stageName: "Recurring Customer 🔁",
          jobCount: 5,
          totalCents: 1_875_000,
          lastJobOn: "2026-06-25",
          firstJobOn: "2024-03-12",
          nextServiceAt: "2026-07-12T13:00:00.000Z",
          serviceState: "overdue",
        },
        {
          contactId: "c_willisco",
          opportunityId: "o_willisco",
          name: "Willis Property Co.",
          phone: "(555) 442-9930",
          email: "maint@willisproperty.com",
          stageId: "st_rec",
          stageName: "Recurring Customer 🔁",
          jobCount: 4,
          totalCents: 1_200_000,
          lastJobOn: "2026-07-08",
          firstJobOn: "2024-08-02",
          nextServiceAt: "2026-10-08T14:00:00.000Z",
          serviceState: "booked",
        },
        {
          contactId: "c_kim",
          opportunityId: "o_kim",
          name: "Kim Talbot",
          phone: "(555) 771-0084",
          email: "kim.talbot@gmail.com",
          stageId: "st_rec",
          stageName: "Recurring Customer 🔁",
          jobCount: 3,
          totalCents: 910_000,
          lastJobOn: "2026-07-02",
          firstJobOn: "2025-01-08",
          nextServiceAt: "2026-10-02T13:00:00.000Z",
          serviceState: "booked",
        },
        {
          contactId: "c_ron",
          opportunityId: "o_ron",
          name: "Ron Keeler",
          phone: "(555) 229-5503",
          email: "rkeeler@outlook.com",
          stageId: "st_rec",
          stageName: "Recurring Customer 🔁",
          jobCount: 2,
          totalCents: 240_000,
          lastJobOn: "2026-06-30",
          firstJobOn: "2025-05-19",
          nextServiceAt: null,
          serviceState: "unplanned",
        },
      ],
    },
    {
      id: "st_one",
      name: "One-Time Customer 1️⃣",
      color: "#2563EB",
      recurring: false,
      count: 5,
      totalCents: 1_679_000,
      customers: [
        {
          contactId: "c_sarah",
          opportunityId: "o_sarah",
          name: "Sarah Mills",
          phone: "(555) 014-2231",
          email: "sarah.mills@gmail.com",
          stageId: "st_one",
          stageName: "One-Time Customer 1️⃣",
          jobCount: 1,
          totalCents: 420_000,
          lastJobOn: "2026-07-02",
          firstJobOn: "2026-07-02",
          nextServiceAt: null,
          serviceState: null,
        },
        {
          contactId: "c_dave",
          opportunityId: "o_dave",
          name: "Dave Reyes",
          phone: "(555) 771-3390",
          email: "dreyes@gmail.com",
          stageId: "st_one",
          stageName: "One-Time Customer 1️⃣",
          jobCount: 1,
          totalCents: 185_000,
          lastJobOn: "2026-06-28",
          firstJobOn: "2026-06-28",
          nextServiceAt: null,
          serviceState: null,
        },
        {
          contactId: "c_ana",
          opportunityId: "o_ana",
          name: "Ana Cruz",
          phone: "(555) 302-9917",
          email: "ana.cruz@yahoo.com",
          stageId: "st_one",
          stageName: "One-Time Customer 1️⃣",
          jobCount: 1,
          totalCents: 300_000,
          lastJobOn: "2026-06-21",
          firstJobOn: "2026-06-21",
          nextServiceAt: null,
          serviceState: null,
        },
        {
          contactId: "c_marcus",
          opportunityId: "o_marcus",
          name: "Marcus Webb",
          phone: "(555) 448-1120",
          email: "mwebb@gmail.com",
          stageId: "st_one",
          stageName: "One-Time Customer 1️⃣",
          jobCount: 1,
          totalCents: 264_000,
          lastJobOn: "2026-06-14",
          firstJobOn: "2026-06-14",
          nextServiceAt: null,
          serviceState: null,
        },
        {
          contactId: "c_lena",
          opportunityId: "o_lena",
          name: "Lena Ortiz",
          phone: "(555) 229-1174",
          email: "lena.ortiz@gmail.com",
          stageId: "st_one",
          stageName: "One-Time Customer 1️⃣",
          jobCount: 1,
          totalCents: 510_000,
          lastJobOn: "2026-06-09",
          firstJobOn: "2026-06-09",
          nextServiceAt: null,
          serviceState: null,
        },
      ],
    },
  ],
};
