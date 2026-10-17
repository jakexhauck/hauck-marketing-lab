// The Client section of the brief, first written from the onboarding form
// (Brief v2, Jake, 2026-10-17). Once written it is Jake's to edit; it is only
// seeded while the section is still empty (functions/lib/clientBriefs.ts).
//
// Every form question has a heading. A key the form no longer asks (or never
// did) lands under Other, so nothing the client told us is lost.
//
// The brief is in every agent's prompt and copied to Google Drive, so a secret
// never goes in: anything whose name reads like one is "on file" instead. The
// client's chosen password is never in the answers at all (the funnel strips
// it); `hasPassword` says only that one is saved.

import { INTAKE_FIELDS, type IntakeField } from "./intake";
import { displayAnswer } from "./onboardingSheet";

const HEADINGS = [
  "Business",
  "Owner & contact",
  "Services & pricing",
  "Service area",
  "Offer",
  "Branding",
  "Logins",
  "Other",
] as const;
type Heading = (typeof HEADINGS)[number];

// Form key -> heading and the label the brief uses. The address is one line,
// built from its five parts.
const PLACE: Record<string, [Heading, string]> = {
  name: ["Business", "Business name"],
  niche: ["Business", "What they do"],
  websiteUrl: ["Business", "Website"],
  timezone: ["Business", "Timezone"],
  hoursMonday: ["Business", "Monday"],
  hoursTuesday: ["Business", "Tuesday"],
  hoursWednesday: ["Business", "Wednesday"],
  hoursThursday: ["Business", "Thursday"],
  hoursFriday: ["Business", "Friday"],
  hoursSaturday: ["Business", "Saturday"],
  hoursSunday: ["Business", "Sunday"],
  contactName: ["Owner & contact", "Name"],
  contactEmail: ["Owner & contact", "Email"],
  contactPhone: ["Owner & contact", "Phone"],
  whySignedUp: ["Owner & contact", "Why they signed up"],
  service1: ["Services & pricing", "Service 1"],
  service2: ["Services & pricing", "Service 2"],
  service3: ["Services & pricing", "Service 3"],
  service4: ["Services & pricing", "Service 4"],
  service5: ["Services & pricing", "Service 5"],
  service6: ["Services & pricing", "Service 6"],
  targetZips: ["Service area", "Target ZIP codes"],
  areaCallout: ["Service area", "Area call-out"],
  usp: ["Offer", "Unique selling point"],
  logoUrl: ["Branding", "Logo"],
  headshotUrl: ["Branding", "Headshot"],
  pastWorkUrl: ["Branding", "Past work photos"],
  loginEmail: ["Logins", "Login email"],
  notes: ["Other", "Notes"],
};

const ADDRESS = ["addressStreet", "addressUnit", "addressCity", "addressState", "addressZip"];
// The funnel's own password boxes: never shown, even as "on file" twice.
const PASSWORD_KEYS = new Set(["password", "passwordConfirm"]);

const SECRET = /passw|passcode|token|secret|api[\s_-]?key|apikey|\bpin\b|credential/i;

export function isSecretField(key: string, label: string): boolean {
  return SECRET.test(key) || SECRET.test(label);
}

function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// One line of markdown text: the answer's own line breaks become commas.
const oneLine = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(", ");

const FIELDS = new Map<string, IntakeField>(INTAKE_FIELDS.map((f) => [f.key, f]));

function valueOf(key: string, raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "boolean" && typeof raw !== "number") return null;
  const field = FIELDS.get(key);
  const shown = field ? displayAnswer(field, typeof raw === "number" ? String(raw) : raw) : String(raw).trim() || null;
  return shown ? oneLine(shown) || null : null;
}

export function clientSeed(answers: Record<string, unknown>, opts: { hasPassword: boolean }): string {
  const lines = new Map<Heading, string[]>(HEADINGS.map((h) => [h, []]));
  const add = (h: Heading, label: string, value: string) => lines.get(h)!.push(`- ${label}: ${value}`);

  const addr = ADDRESS.map((k) => valueOf(k, answers[k]));
  if (addr.some(Boolean)) {
    const [street, unit, city, state, zip] = addr;
    const stateZip = [state, zip].filter(Boolean).join(" ");
    add("Business", "Address", [street, unit, city, stateZip].filter(Boolean).join(", "));
  }

  // Known questions first, in the brief's order; then whatever else was saved.
  const keys = [
    ...Object.keys(PLACE).filter((k) => k in answers),
    ...Object.keys(answers).filter((k) => !(k in PLACE) && !ADDRESS.includes(k) && !PASSWORD_KEYS.has(k)),
  ];
  for (const key of keys) {
    const [heading, label] = PLACE[key] ?? ["Other", humanize(key)];
    const value = valueOf(key, answers[key]);
    if (!value) continue;
    add(heading, label, isSecretField(key, FIELDS.get(key)?.label ?? label) ? "on file" : value);
  }
  const hasPassword =
    opts.hasPassword || [...PASSWORD_KEYS].some((k) => typeof answers[k] === "string" && (answers[k] as string).trim());
  if (hasPassword) add("Logins", "Password", "on file");

  return HEADINGS.filter((h) => lines.get(h)!.length)
    .map((h) => [`### ${h}`, ...lines.get(h)!].join("\n"))
    .join("\n\n");
}
