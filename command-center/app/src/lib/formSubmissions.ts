// ===========================================================================
// Website estimate-form submissions, DEMO DATA.
//
// There is no forms integration wired into the backend yet. This module is the
// single seam where that data will eventually come from: today it synthesises a
// deterministic, internally-consistent set of estimate requests (keyed off the
// client name, so the figures are stable across renders) so the Form
// Submissions surface can be built and reviewed against realistic data. When a
// real source lands (GoHighLevel Forms submissions, via a `/api/forms/...`
// Function), replace `buildFormSubmissions` with a fetch and keep the exported
// shapes intact: the UI reads only these types.
//
// `DEMO` is true so the UI can label the figures honestly as sample data.
// ===========================================================================

export const DEMO = true;

// Where a submission is in the follow-up flow. "new" means nobody has touched it
// yet (the figure the client cares about most). The rest mirror a simple sales
// progression so the demo reads like a real inbox of estimate requests.
export type SubmissionStatus = "new" | "contacted" | "quoted" | "won" | "archived";

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  won: "Won",
  archived: "Archived",
};

export interface FormSubmission {
  id: string;
  name: string;
  email: string;
  phone: string;
  // What the prospect wants an estimate for.
  service: string;
  // The free-text details they typed into the form.
  message: string;
  // City / area they gave (estimate forms ask for a service address).
  location: string;
  // How soon they want the work done.
  timeline: string;
  // Ballpark budget if the form captured one, else null.
  budget: number | null;
  // The form / page the submission came from.
  source: string;
  status: SubmissionStatus;
  // ISO timestamp of when the form was submitted.
  submittedAt: string;
}

export interface FormSubmissionsSummary {
  total: number;
  // Untouched submissions (status === "new").
  newCount: number;
  // Submissions received in the last 7 days, regardless of status.
  newThisWeek: number;
  // Anyone who has been worked (contacted, quoted or won).
  worked: number;
  quoted: number;
  won: number;
  // won / total, as a fraction (null when there are no submissions).
  conversionRate: number | null;
}

export interface FormSubmissionsDataset {
  formName: string;
  // Newest first.
  submissions: FormSubmission[];
  summary: FormSubmissionsSummary;
  demo: boolean;
}

// --- Deterministic synthesis -------------------------------------------------

// Small string hash -> 32-bit seed, so the same client always gets the same set.
function seedFrom(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// mulberry32: tiny deterministic PRNG. No Math.random() so renders are stable.
function makeRng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  "James", "Maria", "Robert", "Linda", "David", "Patricia", "Michael", "Jennifer",
  "William", "Elizabeth", "Richard", "Susan", "Joseph", "Karen", "Thomas", "Nancy",
  "Daniel", "Sandra", "Anthony", "Ashley", "Marcus", "Priya", "Carlos", "Emily",
];
const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Nguyen", "Patel", "Reyes", "Cox", "Ward",
];
const LOCATIONS = [
  "Springfield", "Riverside", "Fairview", "Oakdale", "Madison", "Georgetown",
  "Franklin", "Clinton", "Arlington", "Bristol", "Salem", "Ashland", "Auburn",
  "Dayton", "Greenville", "Kingston",
];
const SERVICES = [
  "Full roof replacement",
  "Roof repair",
  "Kitchen remodel",
  "Bathroom remodel",
  "HVAC install",
  "Window replacement",
  "Deck build",
  "Fence install",
  "Exterior painting",
  "Gutter replacement",
  "Driveway / concrete",
  "Siding replacement",
];
const TIMELINES = ["ASAP", "Within 2 weeks", "1 to 3 months", "Just researching"];
const SOURCES = [
  "Website estimate form",
  "Estimate form (Home page)",
  "Estimate form (Services page)",
  "Estimate form (Landing page)",
];

// Loose budget bands per service so the ballpark figure tracks the job size.
function budgetFor(service: string, r: number): number | null {
  // ~1 in 5 leave budget blank.
  if (r < 0.2) return null;
  const big = /roof replacement|kitchen|hvac|siding|remodel/i.test(service);
  const mid = /window|deck|driveway|fence|painting/i.test(service);
  const base = big ? 12000 : mid ? 5000 : 1500;
  const spread = big ? 18000 : mid ? 6000 : 2500;
  const raw = base + r * spread;
  return Math.round(raw / 250) * 250;
}

function messageFor(service: string, location: string, timeline: string): string {
  const lead = service.toLowerCase();
  const when =
    timeline === "ASAP"
      ? "We need this handled as soon as possible."
      : timeline === "Just researching"
        ? "Still gathering quotes, no rush yet."
        : `Hoping to get it done ${timeline.toLowerCase()}.`;
  return `Looking for a quote on a ${lead} at our place in ${location}. ${when} What would the next step be?`;
}

const pick = <T,>(arr: T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];

export function buildFormSubmissions(appName: string, now: Date): FormSubmissionsDataset {
  const rng = makeRng(seedFrom(appName || "demo"));
  const count = 18 + Math.floor(rng() * 8); // 18-25 submissions
  const nowMs = now.getTime();
  const DAY = 24 * 60 * 60 * 1000;

  const submissions: FormSubmission[] = [];
  for (let i = 0; i < count; i++) {
    const first = pick(FIRST_NAMES, rng());
    const last = pick(LAST_NAMES, rng());
    const name = `${first} ${last}`;
    const service = pick(SERVICES, rng());
    const location = pick(LOCATIONS, rng());
    const timeline = pick(TIMELINES, rng());

    // Spread submissions across the last ~45 days, newest cluster densest.
    const ageDays = Math.floor(Math.pow(rng(), 1.7) * 45);
    const submittedAt = new Date(
      nowMs - ageDays * DAY - Math.floor(rng() * DAY),
    ).toISOString();

    // Status correlates with age: fresh leads are untouched, older ones have
    // moved down the funnel. Keeps the inbox believable.
    const sr = rng();
    let status: SubmissionStatus;
    if (ageDays <= 2) status = sr < 0.85 ? "new" : "contacted";
    else if (ageDays <= 7) status = sr < 0.35 ? "new" : sr < 0.8 ? "contacted" : "quoted";
    else if (ageDays <= 21) status = sr < 0.15 ? "contacted" : sr < 0.55 ? "quoted" : sr < 0.85 ? "won" : "archived";
    else status = sr < 0.4 ? "won" : sr < 0.7 ? "quoted" : "archived";

    const handle = `${first}.${last}`.toLowerCase();
    submissions.push({
      id: `fs_${seedFrom(`${appName}:${i}`).toString(36)}`,
      name,
      email: `${handle}@example.com`,
      phone: `(${200 + Math.floor(rng() * 700)}) ${100 + Math.floor(rng() * 900)}-${1000 + Math.floor(rng() * 9000)}`,
      service,
      message: messageFor(service, location, timeline),
      location,
      timeline,
      budget: budgetFor(service, rng()),
      source: pick(SOURCES, rng()),
      status,
      submittedAt,
    });
  }

  submissions.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const weekAgo = nowMs - 7 * DAY;
  const won = submissions.filter((s) => s.status === "won").length;
  const quoted = submissions.filter((s) => s.status === "quoted").length;
  const summary: FormSubmissionsSummary = {
    total: submissions.length,
    newCount: submissions.filter((s) => s.status === "new").length,
    newThisWeek: submissions.filter((s) => new Date(s.submittedAt).getTime() >= weekAgo).length,
    worked: submissions.filter((s) => s.status !== "new" && s.status !== "archived").length,
    quoted,
    won,
    conversionRate: submissions.length ? won / submissions.length : null,
  };

  return {
    formName: "Estimate Request",
    submissions,
    summary,
    demo: DEMO,
  };
}
