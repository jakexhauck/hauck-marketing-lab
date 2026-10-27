import { describe, expect, it } from "vitest";
import { sheetSections, sheetText } from "./onboardingSheet";
import type { ClientSecretView } from "./clientSecrets";

const ANSWERS = {
  name: "Made Better Landscaping Co",
  niche: "Hardscaping",
  contactName: "Sam",
  contactEmail: "owner@example.com",
  contactPhone: "3135550142",
};

const WIRING: ClientSecretView[] = [
  { column: "ghl_location_id", display: "loc_abc123", configured: true },
  { column: "ghl_token", display: "••••7963", configured: true },
  { column: "meta_ad_account_id", display: null, configured: false },
];

const login = (sections: ReturnType<typeof sheetSections>) =>
  sections.find((s) => s.key === "login");

const fieldNamed = (sections: ReturnType<typeof sheetSections>, label: string) =>
  sections.flatMap((s) => s.fields).find((f) => f.label === label);

describe("sheetSections", () => {
  // The form no longer has a Login step (Jake, 2026-10-27): they sign in with
  // their contact email and a password made for them, which Jake hands over.
  it("shows the login straight after Contact: their email, then the password", () => {
    const sections = sheetSections(ANSWERS, [], "Kx7m-Pq4t-Wz9h");
    expect(sections.map((s) => s.key).slice(0, 3)).toEqual(["business", "contact", "login"]);
    expect(login(sections)!.fields.map((f) => [f.label, f.value])).toEqual([
      ["Login email", "owner@example.com"],
      ["Password", "Kx7m-Pq4t-Wz9h"],
    ]);
  });

  it("shows an older form's separate login email over the contact one", () => {
    const sections = sheetSections({ ...ANSWERS, loginEmail: "signin@example.com" }, [], null);
    expect(fieldNamed(sections, "Login email")!.value).toBe("signin@example.com");
  });

  it("says the password was not saved rather than not answered", () => {
    // A client who signed up before migration 0081 did choose one; we simply
    // never kept it. That is a different fact from skipping a question.
    const field = fieldNamed(sheetSections(ANSWERS, [], null), "Password");
    expect(field!.value).toBeNull();
    expect(field!.placeholder).toBe("Not saved, reset it instead");
  });

  it("keeps the login section for a client whose only login row is the password", () => {
    const sections = sheetSections({}, [], "Correct-Horse-9!");
    expect(login(sections)).toBeDefined();
  });

  it("drops a section nobody answered anything in", () => {
    // ANSWERS says nothing about their story or their assets, so those sections
    // are absent rather than present and empty.
    const sections = sheetSections(ANSWERS, []);
    expect(sections.some((s) => s.key === "story")).toBe(false);
    expect(sections.some((s) => s.key === "assets")).toBe(false);
  });

  it("drops the login section when there is no email and no password", () => {
    const { contactEmail: _dropped, ...noLogin } = ANSWERS;
    expect(login(sheetSections(noLogin, []))).toBeUndefined();
  });

  it("omits Wiring for a form that never became a client", () => {
    expect(sheetSections(ANSWERS, []).some((s) => s.key === "wiring")).toBe(false);
  });

  it("shows the ad account and marks an unset one as not set up", () => {
    const sections = sheetSections(ANSWERS, WIRING);
    const wiring = sections.find((s) => s.key === "wiring")!;
    expect(wiring.fields.map((f) => f.value)).toEqual([null]);
    expect(wiring.fields.every((f) => f.mono)).toBe(true);
    expect(wiring.fields[0].placeholder).toBe("Not set up yet");
  });

  // The GoHighLevel pair is named by the Sub-account card above the sheet, so
  // it must not be repeated here.
  it("leaves the GoHighLevel location and token off the sheet", () => {
    const wiring = sheetSections(ANSWERS, WIRING).find((s) => s.key === "wiring")!;
    expect(wiring.fields.map((f) => f.key)).toEqual(["meta_ad_account_id"]);
  });

  it("treats a blank answer as unanswered rather than as an empty string", () => {
    const sections = sheetSections({ ...ANSWERS, niche: "   " }, []);
    expect(fieldNamed(sections, "What do you do?")!.value).toBeNull();
  });
});

describe("sheetText", () => {
  it("writes every row, with a dash where there is no answer", () => {
    const text = sheetText(sheetSections(ANSWERS, WIRING, "Correct-Horse-9!"));
    expect(text).toContain("WIRING");
    expect(text).not.toContain("GoHighLevel location id");
    expect(text).toContain("Password: Correct-Horse-9!");
    expect(text).toContain("Meta ad account: -");
  });
});
