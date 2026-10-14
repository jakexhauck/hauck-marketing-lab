import { describe, it, expect } from "vitest";
import { SOP_FALLBACK_LINES, sopLeadFormPatch } from "./sopLeadForm";
import { toMetaPayload } from "./metaLeadForm";
import type { LeadForm } from "./adLeadForms";

describe("sopLeadFormPatch", () => {
  const patch = sopLeadFormPatch({
    businessName: "Willis Windows",
    ghlPhone: "(313) 766-2171",
    lines: ["Licensed & insured", "✅ Streak free", "Clear price"],
  });

  it("names the form the SOP way", () => {
    expect(patch.name).toBe("Willis Windows | OG Form");
  });

  it("writes the three ticks once each", () => {
    expect(patch.introDescription).toBe("✅ Licensed & insured\n✅ Streak free\n✅ Clear price");
  });

  it("falls back to plain lines when Claude gave fewer than three", () => {
    const p = sopLeadFormPatch({ businessName: "AAG", ghlPhone: "", lines: [] });
    expect(p.introDescription).toBe(SOP_FALLBACK_LINES.map((l) => `✅ ${l}`).join("\n"));
  });

  it("asks the two SOP questions and closes the form on No and 30 Days+", () => {
    expect(patch.questions!.map((q) => q.label)).toEqual([
      "Are you the homeowner?",
      "How soon are you looking for our services?",
      "Full name",
      "Phone number",
    ]);
    expect(patch.questions![0].options.find((o) => o.label === "No")?.disqualify).toBe(true);
    expect(patch.questions![1].showIf).toEqual({ questionId: "q1", optionLabel: "Yes" });
  });

  it("ends on Call Now with the GHL number, and maps cleanly to Meta once a privacy link is added", () => {
    const form = {
      id: "f", tenantId: "t", introImageUrl: "", privacyUrl: "https://williswindows.com/privacy-policy",
      disclaimerTitle: "", privacyDisclaimer: "", consents: [], completionUrl: "", sharing: "restricted",
      trackingParams: [], metaFormId: null, metaCreatedAt: null, createdAt: "", updatedAt: "",
      ...patch,
    } as unknown as LeadForm;
    const out = toMetaPayload(form);
    expect(out.errors).toEqual([]);
    expect(out.body.thank_you_page).toMatchObject({ button_type: "CALL_BUSINESS", business_phone_number: "+1 313-766-2171" });
  });
});
