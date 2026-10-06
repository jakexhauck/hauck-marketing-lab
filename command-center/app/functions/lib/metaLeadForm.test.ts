import { describe, it, expect } from "vitest";
import { metaUsPhone, nextFormName, toMetaPayload } from "./metaLeadForm";
import type { LeadForm, LeadQuestion } from "./adLeadForms";

const q = (over: Partial<LeadQuestion>): LeadQuestion => ({
  id: "q1",
  kind: "choice",
  label: "",
  fieldName: "",
  prefill: "",
  optional: false,
  multiSelect: false,
  minLength: 0,
  maxLength: 0,
  inlineContext: "",
  options: [],
  showIf: null,
  ...over,
});

const sop: LeadForm = {
  id: "f1",
  tenantId: "t1",
  name: "Willis Windows | OG Form",
  intent: "more_volume",
  introImageUrl: "",
  introHeadline: "Answer 2 Quick Questions For Your Free Estimate!",
  introDescription: "✅ Licensed & insured\n✅ Streak free\n✅ Clear price",
  introLayout: "list",
  questions: [
    q({
      id: "q1",
      label: "Are you the homeowner?",
      options: [
        { label: "Yes", disqualify: false },
        { label: "No", disqualify: true },
      ],
    }),
    q({
      id: "q2",
      label: "How soon are you looking for our services?",
      showIf: { questionId: "q1", optionLabel: "Yes" },
      options: [
        { label: "ASAP", disqualify: false },
        { label: "30 Days+", disqualify: true },
      ],
    }),
    q({ id: "q3", kind: "prefill", prefill: "Full name", label: "Full name" }),
    q({ id: "q4", kind: "prefill", prefill: "Phone number", label: "Phone" }),
  ],
  privacyUrl: "https://williswindows.com/privacy-policy",
  privacyLinkText: "",
  disclaimerTitle: "",
  privacyDisclaimer: "",
  consents: [],
  completionHeadline: "Last Step!",
  completionBody: "We'll text you in 60 seconds.",
  completionCtaType: "call_business",
  completionCta: "Call Now",
  completionUrl: "",
  completionPhone: "(313) 766-2171",
  locale: "en_US",
  sharing: "restricted",
  trackingParams: [],
  createdAt: "",
  updatedAt: "",
  metaFormId: null,
  metaCreatedAt: null,
};

describe("toMetaPayload", () => {
  const { body, manual, errors } = toMetaPayload(sop);

  it("has no errors for the SOP form", () => {
    expect(errors).toEqual([]);
  });

  it("builds the intro as a list without the ticks", () => {
    expect(body.context_card).toEqual({
      title: "Answer 2 Quick Questions For Your Free Estimate!",
      style: "LIST_STYLE",
      content: ["Licensed & insured", "Streak free", "Clear price"],
    });
  });

  it("maps choice and prefill questions", () => {
    const qs = body.questions as Record<string, unknown>[];
    expect(qs[0]).toEqual({
      type: "CUSTOM",
      key: "are_you_the_homeowner",
      label: "Are you the homeowner?",
      options: [
        { value: "Yes", key: "yes" },
        { value: "No", key: "no" },
      ],
    });
    expect(qs.slice(2)).toEqual([{ type: "FULL_NAME" }, { type: "PHONE" }]);
  });

  it("formats the call button phone the way Meta took it", () => {
    expect(body.thank_you_page).toMatchObject({
      button_type: "CALL_BUSINESS",
      business_phone_number: "+1 313-766-2171",
      country_code: "US",
    });
  });

  it("lists what has to be set by hand", () => {
    expect(manual).toEqual([
      '"No" on "Are you the homeowner?" closes the form',
      '"How soon are you looking for our services?" only shows after "Yes"',
      '"30 Days+" on "How soon are you looking for our services?" closes the form',
    ]);
  });

  it("defaults the privacy link text", () => {
    expect(body.privacy_policy).toEqual({ url: "https://williswindows.com/privacy-policy", link_text: "Privacy Policy" });
  });

  it("reports missing essentials as errors", () => {
    const bad = toMetaPayload({ ...sop, name: " ", privacyUrl: "", questions: [], completionPhone: "12" });
    expect(bad.errors).toEqual([
      "Give the form a name",
      "Add at least one question",
      "Add the privacy policy link",
      "The end page needs a US phone number",
    ]);
  });

  it("sends a website end page with its link", () => {
    const web = toMetaPayload({ ...sop, completionCtaType: "view_website", completionCta: "", completionUrl: "https://x.com" });
    expect(web.body.thank_you_page).toMatchObject({ button_type: "VIEW_WEBSITE", button_text: "View Website", website_url: "https://x.com" });
  });
});

describe("metaUsPhone", () => {
  it("accepts 10 or 11 digit US numbers", () => {
    expect(metaUsPhone("+13137662171")).toBe("+1 313-766-2171");
    expect(metaUsPhone("313.766.2171")).toBe("+1 313-766-2171");
    expect(metaUsPhone("766-2171")).toBeNull();
  });
});

describe("nextFormName", () => {
  it("numbers a repeat", () => {
    expect(nextFormName("AAG | OG Form")).toBe("AAG | OG Form (2)");
    expect(nextFormName("AAG | OG Form (2)")).toBe("AAG | OG Form (3)");
  });
});
