import type { LeadFormPatch, LeadQuestion } from "./adLeadForms";

// "Start from SOP template" on a lead form: the Client Setup SOP's standard
// Instant Form, filled in for one client. Pure; the three checkmark lines come
// from Claude in the endpoint (with a plain fallback if Claude is down).
//
// SOP, Lead Form Creation:
//   name      "Company Name | OG Form", More volume
//   intro     "Answer [X] Quick Questions For Your Free Estimate!", list of 3 ✅ lines
//   Q1        Are you the homeowner?  Yes -> Q2, No -> close the form
//   Q2        How soon...?  ASAP / Within a week / Within a month -> submit, 30 Days+ -> close
//   contact   full name + phone
//   privacy   the client's privacy policy (left for Jake: we cannot know its URL)
//   end page  "Last Step!" ... Call Now on the GHL number
//
// "Close the form" and Q2-only-after-Yes are carried as disqualify / showIf,
// and Create in Meta lists them for setting by hand (Meta's API cannot).

export const SOP_FALLBACK_LINES = ["Licensed & insured", "Quality work that lasts", "Clear pricing before we start"];

const choice = (id: string, label: string, options: [string, boolean][], showIf: LeadQuestion["showIf"] = null): LeadQuestion => ({
  id,
  kind: "choice",
  label,
  fieldName: "",
  prefill: "",
  optional: false,
  multiSelect: false,
  minLength: 0,
  maxLength: 0,
  inlineContext: "",
  options: options.map(([l, disqualify]) => ({ label: l, disqualify })),
  showIf,
});

const prefill = (id: string, field: string): LeadQuestion => ({
  ...choice(id, field, []),
  kind: "prefill",
  prefill: field,
});

export function sopLeadFormPatch(input: { businessName: string; ghlPhone: string; lines: string[] }): LeadFormPatch {
  const lines = (input.lines.length >= 3 ? input.lines : SOP_FALLBACK_LINES).slice(0, 3);
  return {
    name: `${input.businessName.trim()} | OG Form`,
    intent: "more_volume",
    introImageUrl: "",
    introHeadline: "Answer 2 Quick Questions For Your Free Estimate! 🤝",
    introLayout: "list",
    introDescription: lines.map((l) => `✅ ${l.replace(/^[\s✅]+/u, "").trim()}`).join("\n"),
    questions: [
      choice("q1", "Are you the homeowner?", [
        ["Yes", false],
        ["No", true],
      ]),
      choice(
        "q2",
        "How soon are you looking for our services?",
        [
          ["ASAP", false],
          ["Within a week", false],
          ["Within a month", false],
          ["30 Days+", true],
        ],
        { questionId: "q1", optionLabel: "Yes" },
      ),
      prefill("q3", "Full name"),
      prefill("q4", "Phone number"),
    ],
    privacyLinkText: "Privacy Policy",
    completionHeadline: "Last Step!",
    completionBody:
      "We'll send you a text in the next 60 seconds and give you a call soon, please reply to lock in your free estimate! Or give us a call now to secure your estimate!",
    completionCtaType: "call_business",
    completionCta: "Call Now",
    completionPhone: input.ghlPhone,
    locale: "en_US",
  };
}
