import { describe, it, expect } from "vitest";
import { clientSeed, isSecretField } from "./briefClientSeed";
import { INTAKE_FIELDS } from "./intake";

const full = {
  name: "Willis Windows",
  niche: "Window replacement",
  websiteUrl: "https://willis.example",
  contactName: "Bill Willis",
  contactEmail: "bill@willis.example",
  contactPhone: "555-0100",
  timezone: "America/Detroit",
  addressStreet: "1 Main St",
  addressCity: "Troy",
  addressState: "MI",
  addressZip: "48083",
  loginEmail: "bill@willis.example",
  targetZips: "48083\n48084",
  areaCallout: "Troy",
  hoursMonday: "9am - 5pm",
  service1: "Windows",
  service2: "Doors",
  jobType1: "Full window replacement",
  jobTicket1: "$14,000",
  jobMargin1: "35%",
  jobType2: "Entry door",
  jobTicket2: "$3,500",
  closeRate: "4",
  bestCustomer: "Retirees in older Troy homes",
  competitors: "Renewal by Andersen, Window Nation",
  pastOffers: "Free storm door with 8+ windows",
  usp: "Lifetime warranty",
  whySignedUp: "Referral",
  notes: "Busy in spring",
  logoUrl: "https://drive/logo",
  headshotUrl: "https://drive/head",
  pastWorkUrl: "https://drive/work",
  fbAccessToken: "EAAB-secret-value",
  favouriteColour: "Green",
};

describe("clientSeed", () => {
  it("organises the answers under the brief's headings, in order", () => {
    const md = clientSeed(full, { hasPassword: true });
    const headings = md.split("\n").filter((l) => l.startsWith("### "));
    expect(headings).toEqual([
      "### Business",
      "### Owner & contact",
      "### Services & pricing",
      "### Service area",
      "### Offer",
      "### Market",
      "### Branding",
      "### Logins",
      "### Other",
    ]);
    expect(md).toContain("- Job 1: Full window replacement, $14,000 average ticket, 35% margin");
    expect(md).toContain("- Job 2: Entry door, $3,500 average ticket");
    expect(md).toContain("- Close rate: 4 out of 10");
    expect(md).toContain("- Offers run before: Free storm door with 8+ windows");
    expect(md).toContain("- Best customer: Retirees in older Troy homes");
    expect(md).toContain("- Top local competitors: Renewal by Andersen, Window Nation");
    // The numbers follow the services they price, in the order the form asks them.
    const at = (line: string) => md.indexOf(line);
    expect(at("- Service 2:")).toBeLessThan(at("- Job 1:"));
    expect(at("- Job 2:")).toBeLessThan(at("- Close rate:"));
    expect(md).toContain("- Business name: Willis Windows");
    expect(md).toContain("- Address: 1 Main St, Troy, MI 48083");
    expect(md).toContain("- Monday: 9am - 5pm");
    expect(md).toContain("- Name: Bill Willis");
    expect(md).toContain("- Service 2: Doors");
    expect(md).toContain("- Target ZIP codes: 48083, 48084");
    expect(md).toContain("- Unique selling point: Lifetime warranty");
    expect(md).toContain("- Logo: https://drive/logo");
    expect(md).toContain("- Login email: bill@willis.example");
    expect(md).toContain("- Password: on file");
    expect(md).toContain("- Notes: Busy in spring");
    expect(md).toContain("- Favourite colour: Green");
  });

  it("never writes a secret's value: it is on file", () => {
    const md = clientSeed({ ...full, password: "hunter2!", passwordConfirm: "hunter2!", apiKey: "sk_live_1" }, { hasPassword: false });
    expect(md).not.toContain("EAAB-secret-value");
    expect(md).not.toContain("hunter2");
    expect(md).not.toContain("sk_live_1");
    expect(md).toContain("- Fb access token: on file");
    expect(md).toContain("- Password: on file");
  });

  it("places every form question under a heading other than Other, except notes", () => {
    const md = clientSeed(Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, f.type === "checkbox" ? "yes" : "x"])), {
      hasPassword: false,
    });
    const other = md.split("### Other")[1] ?? "";
    expect(other.trim()).toBe("- Notes: x");
  });

  it("drops blanks and empty headings, and is empty for no answers", () => {
    const md = clientSeed({ name: "Willis", niche: "  " }, { hasPassword: false });
    expect(md).toBe("### Business\n- Business name: Willis");
    expect(clientSeed({}, { hasPassword: false })).toBe("");
  });

  it("shows a select's label and skips anything that is not a plain value", () => {
    const md = clientSeed({ name: "W", weird: { a: 1 } as never }, { hasPassword: false });
    expect(md).not.toContain("weird");
  });
});

describe("isSecretField", () => {
  it("knows a secret by its name", () => {
    expect(isSecretField("password", "Choose a password")).toBe(true);
    expect(isSecretField("ghl_token", "")).toBe(true);
    expect(isSecretField("x", "API key")).toBe(true);
    expect(isSecretField("clientSecret", "")).toBe(true);
    expect(isSecretField("loginEmail", "Login email")).toBe(false);
    expect(isSecretField("keywords", "Keywords")).toBe(false);
  });
});
