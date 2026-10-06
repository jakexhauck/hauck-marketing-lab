// Cold SMS > Leads: the leads cold-sms-pipeline/ uploads (0139), filtered,
// counted and turned into the GHL import CSV. Shared by the page and the
// Worker so the count on screen, the file and the stamp all agree.

export interface ColdSmsLeadGroup {
  city: string;
  state: string;
  lineType: string;
  service: string;
  available: number;
}

export interface ColdSmsLead {
  phone: string;
  companyName: string;
  city: string;
  state: string;
  timezone: string | null;
  website: string | null;
  service: string;
  lineType: string;
  trade: string;
  exportBatch: string | null;
  exportedAt: string | null;
}

export interface ColdSmsLeadBatch {
  batch: string;
  exportedAt: string;
  leads: number;
}

export interface ColdSmsLeadFilters {
  cities: string[];
  lineTypes: string[];
  services: string[];
  limit: number;
}

// Only what the pipeline uploads (it sends nothing it would not text).
export const LINE_TYPES = [
  { value: "mobile", label: "Mobile" },
  { value: "nonFixedVoip", label: "Phone app" },
] as const;

export const MAX_EXPORT = 5000;

// Two states share city names, so a city is always "City|ST".
export function cityKey(city: string, state: string): string {
  return `${city}|${state}`;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
}

export function normalizeFilters(raw: Record<string, unknown>): ColdSmsLeadFilters {
  const known = new Set<string>(LINE_TYPES.map((t) => t.value));
  const n = Math.floor(Number(raw.limit ?? 0));
  return {
    cities: strings(raw.cities),
    lineTypes: strings(raw.lineTypes).filter((t) => known.has(t)),
    services: strings(raw.services),
    limit: Number.isFinite(n) ? Math.min(Math.max(n, 0), MAX_EXPORT) : 0,
  };
}

function matches(group: ColdSmsLeadGroup, f: ColdSmsLeadFilters): boolean {
  return (
    (f.cities.length === 0 || f.cities.includes(cityKey(group.city, group.state))) &&
    (f.lineTypes.length === 0 || f.lineTypes.includes(group.lineType)) &&
    (f.services.length === 0 || f.services.includes(group.service))
  );
}

export function availableCount(groups: ColdSmsLeadGroup[], f: ColdSmsLeadFilters): number {
  return groups.reduce((sum, g) => (matches(g, f) ? sum + g.available : sum), 0);
}

export function cityOptions(groups: ColdSmsLeadGroup[]) {
  const byCity = new Map<string, { value: string; label: string; count: number }>();
  for (const g of groups) {
    const value = cityKey(g.city, g.state);
    const row = byCity.get(value) ?? { value, label: `${g.city}, ${g.state}`, count: 0 };
    row.count += g.available;
    byCity.set(value, row);
  }
  return [...byCity.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export function serviceOptions(groups: ColdSmsLeadGroup[]): string[] {
  return [...new Set(groups.map((g) => g.service))].sort();
}

// The same file cold-sms-pipeline's `export` writes (pipeline/export.py), so
// one GHL import mapping serves both: Python's csv module quoting, CRLF lines.
const COLUMNS = ["business_name", "Phone", "City", "State", "service", "Timezone", "Website", "Tags"];

function cell(value: string | null): string {
  const s = value ?? "";
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// day is YYYYMMDD, the day the batch was taken: it becomes the batch tag.
export function leadsCsv(leads: ColdSmsLead[], day: string): string {
  const lines = [COLUMNS.join(",")];
  for (const l of leads) {
    lines.push(
      [
        l.companyName,
        l.phone,
        l.city,
        l.state,
        l.service,
        l.timezone,
        l.website,
        `cold-sms-${l.trade},${l.trade}-batch-${day}`,
      ]
        .map(cell)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

// Jake's clock, to the second, so two downloads a minute apart stay two batches.
export function batchLabel(now: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Detroit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return `cold-sms_${parts.year}${parts.month}${parts.day}_${parts.hour}${parts.minute}${parts.second}`;
}

// "cold-sms_20261006_131502" -> "20261006", for the batch tag on a re-download.
export function batchDay(batch: string): string {
  return /_(\d{8})_/.exec(batch)?.[1] ?? "";
}
