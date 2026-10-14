import { describe, expect, it } from "vitest";
import {
  availableCount,
  batchLabel,
  cityKey,
  cityOptions,
  leadsCsv,
  normalizeFilters,
  type ColdSmsLead,
  type ColdSmsLeadGroup,
} from "./coldSmsLeads";

const groups: ColdSmsLeadGroup[] = [
  { city: "Detroit", state: "MI", lineType: "mobile", service: "AC and furnace", available: 10 },
  { city: "Detroit", state: "MI", lineType: "nonFixedVoip", service: "AC and furnace", available: 4 },
  { city: "Troy", state: "MI", lineType: "mobile", service: "boiler", available: 2 },
  { city: "Toledo", state: "OH", lineType: "mobile", service: "AC and furnace", available: 3 },
];

const lead: ColdSmsLead = {
  phone: "+12485550134",
  companyName: "Koz Heating, Cooling",
  city: "Troy",
  state: "MI",
  timezone: "America/Detroit",
  website: "https://k.com/",
  service: "AC and furnace",
  lineType: "mobile",
  trade: "hvac",
  exportBatch: null,
  exportedAt: null,
};

describe("availableCount", () => {
  it("counts everything with no filters", () => {
    expect(availableCount(groups, normalizeFilters({}))).toBe(19);
  });

  it("applies city, line type and service together", () => {
    const filters = normalizeFilters({ cities: [cityKey("Detroit", "MI")], lineTypes: ["mobile"] });
    expect(availableCount(groups, filters)).toBe(10);
    expect(availableCount(groups, normalizeFilters({ services: ["boiler"] }))).toBe(2);
  });

  it("keeps two states' cities apart", () => {
    const filters = normalizeFilters({ cities: [cityKey("Toledo", "OH"), cityKey("Troy", "MI")] });
    expect(availableCount(groups, filters)).toBe(5);
  });
});

describe("cityOptions", () => {
  it("one option per city, biggest first, with its count", () => {
    expect(cityOptions(groups)).toEqual([
      { value: "Detroit|MI", label: "Detroit, MI", count: 14 },
      { value: "Toledo|OH", label: "Toledo, OH", count: 3 },
      { value: "Troy|MI", label: "Troy, MI", count: 2 },
    ]);
  });
});

describe("normalizeFilters", () => {
  it("drops junk and caps the amount", () => {
    expect(
      normalizeFilters({ cities: ["Detroit|MI", 4, ""], lineTypes: ["mobile", "landline"], limit: 99999 }),
    ).toEqual({ cities: ["Detroit|MI"], lineTypes: ["mobile"], services: [], limit: 5000 });
    expect(normalizeFilters({ limit: -3 }).limit).toBe(0);
    expect(normalizeFilters({ limit: "250" }).limit).toBe(250);
  });
});

describe("leadsCsv", () => {
  it("is the pipeline's GHL import file, byte for byte", () => {
    expect(leadsCsv([lead], "20261006")).toBe(
      "business_name,Phone,City,State,service,Timezone,Website,Tags\r\n" +
        '"Koz Heating, Cooling",+12485550134,Troy,MI,AC and furnace,America/Detroit,https://k.com/,' +
        '"cold-sms-hvac,hvac-batch-20261006"\r\n',
    );
  });

  it("escapes quotes and leaves blanks blank", () => {
    const csv = leadsCsv([{ ...lead, companyName: 'Joe "The Furnace" Co', website: null }], "20261006");
    expect(csv).toContain('"Joe ""The Furnace"" Co",');
    expect(csv).toContain("America/Detroit,,");
  });
});

describe("batchLabel", () => {
  it("is Detroit time, to the second", () => {
    expect(batchLabel(new Date("2026-10-06T17:15:02Z"))).toBe("cold-sms_20261006_131502");
  });
});
