import type { LeadForm } from "./adLeadForms";

// A drafted Instant Form (Paid Ads > Ad Builder > Lead Form) as the body of
// POST /{page_id}/leadgen_forms. Pure, so every rule is tested.
//
// What Meta's API takes was proven on Willis's Page on 2026-10-06 (two test
// forms, both archived): name, locale, is_optimized_for_quality, context_card
// (LIST_STYLE / PARAGRAPH_STYLE), CUSTOM questions with options, the prefill
// types, privacy_policy, custom_disclaimer with checkboxes, tracking_parameters,
// and one thank_you_page (CALL_BUSINESS needs "+1 313-766-2171" plus
// country_code "US"; VIEW_WEBSITE needs website_url).
//
// What it does not take without a separate upload, so it comes back as a list
// Jake sets by hand in Ads Manager after: conditional questions (showIf), an
// answer that closes the form (disqualify), multi-select answers, the intro
// image, appointment and store-locator questions, a second end page.

// The editor's prefill names -> Meta's question types. Anything not here is
// sent as a typed (CUSTOM) question and named in the manual list.
const PREFILL_TYPES: Record<string, string> = {
  "email": "EMAIL",
  "phone number": "PHONE",
  "full name": "FULL_NAME",
  "first name": "FIRST_NAME",
  "last name": "LAST_NAME",
  "street address": "STREET_ADDRESS",
  "city": "CITY",
  "state": "STATE",
  "province": "PROVINCE",
  "zip code": "ZIP",
  "post code": "POST_CODE",
  "country": "COUNTRY",
  "date of birth": "DOB",
  "gender": "GENDER",
  "marital status": "MARITIAL_STATUS",
  "relationship status": "RELATIONSHIP_STATUS",
  "military status": "MILITARY_STATUS",
  "job title": "JOB_TITLE",
  "work email": "WORK_EMAIL",
  "work phone number": "WORK_PHONE_NUMBER",
  "company name": "COMPANY_NAME",
};

const CTA_TYPES: Record<string, string> = {
  view_website: "VIEW_WEBSITE",
  download: "DOWNLOAD",
  call_business: "CALL_BUSINESS",
  message_business: "MESSAGE_BUSINESS",
  view_on_facebook: "VIEW_ON_FACEBOOK",
};

/** "(313) 766-2171" / "+13137662171" -> "+1 313-766-2171", the only shape Meta took. */
export function metaUsPhone(raw: string): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  const ten = d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
  if (ten.length !== 10) return null;
  return `+1 ${ten.slice(0, 3)}-${ten.slice(3, 6)}-${ten.slice(6)}`;
}

/** A Meta question key: lowercase, underscores, max 60. */
function metaKey(source: string, fallback: string): string {
  const k = source.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return k || fallback;
}

/** List-layout intro lines, without the bullets people type ("✅ Licensed" -> "Licensed"). */
function introLines(text: string): string[] {
  return text
    .split(/\r?\n|,(?=\s*✅)/)
    .map((l) => l.replace(/^[\s✅•\-*]+/u, "").trim())
    .filter(Boolean);
}

export interface MetaFormPayload {
  body: Record<string, unknown>;
  manual: string[];
  errors: string[];
}

export function toMetaPayload(form: LeadForm): MetaFormPayload {
  const manual: string[] = [];
  const errors: string[] = [];
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    locale: (form.locale || "en_US").replace("-", "_"),
    is_optimized_for_quality: form.intent === "higher_intent",
  };
  if (!body.name) errors.push("Give the form a name");
  if (form.intent === "rich_creative") manual.push("Form type Rich creative (sent as More volume)");

  if (form.introHeadline.trim() || form.introDescription.trim()) {
    const list = form.introLayout === "list";
    const content = list ? introLines(form.introDescription) : [form.introDescription.trim()].filter(Boolean);
    body.context_card = {
      title: form.introHeadline.trim(),
      style: list ? "LIST_STYLE" : "PARAGRAPH_STYLE",
      content,
    };
  }
  if (form.introImageUrl.trim()) manual.push("Intro background image");

  const usedKeys = new Set<string>();
  const questions: Record<string, unknown>[] = [];
  form.questions.forEach((q, i) => {
    const label = q.label.trim();
    if (q.showIf) manual.push(`"${label || "Question " + (i + 1)}" only shows after "${q.showIf.optionLabel}"`);
    for (const o of q.options) if (o.disqualify) manual.push(`"${o.label}" on "${label}" closes the form`);

    if (q.kind === "prefill") {
      const type = PREFILL_TYPES[(q.prefill || label).trim().toLowerCase()];
      if (type) {
        questions.push({ type });
        return;
      }
      manual.push(`Prefill "${q.prefill || label}" (sent as a typed question)`);
    }
    if (q.kind === "appointment" || q.kind === "store_locator") {
      manual.push(`${q.kind === "appointment" ? "Appointment request" : "Store locator"} "${label}"`);
      return;
    }
    let key = metaKey(q.fieldName || label, `q${i + 1}`);
    while (usedKeys.has(key)) key = `${key}_${i + 1}`;
    usedKeys.add(key);
    const out: Record<string, unknown> = { type: "CUSTOM", key, label: label || `Question ${i + 1}` };
    if (q.kind === "choice") {
      if (q.multiSelect) manual.push(`"${label}" allows more than one answer`);
      out.options = q.options
        .filter((o) => o.label.trim())
        .map((o, j) => ({ value: o.label.trim(), key: metaKey(o.label, `o${j + 1}`) }));
    }
    questions.push(out);
  });
  if (questions.length === 0) errors.push("Add at least one question");
  body.questions = questions;

  if (!form.privacyUrl.trim()) errors.push("Add the privacy policy link");
  body.privacy_policy = { url: form.privacyUrl.trim(), link_text: form.privacyLinkText.trim() || "Privacy Policy" };

  if (form.disclaimerTitle.trim() || form.privacyDisclaimer.trim() || form.consents.length) {
    body.custom_disclaimer = {
      title: form.disclaimerTitle.trim() || "Terms",
      body: { text: form.privacyDisclaimer.trim() },
      checkboxes: form.consents.map((c, i) => ({ text: c.text, is_required: !c.optional, key: `consent_${i + 1}` })),
    };
  }

  if (form.trackingParams.length) {
    body.tracking_parameters = Object.fromEntries(form.trackingParams.map((t) => [t.key, t.value]));
  }

  const cta = CTA_TYPES[form.completionCtaType] ?? "VIEW_WEBSITE";
  const thanks: Record<string, unknown> = {
    title: form.completionHeadline.trim() || "Thanks",
    body: form.completionBody.trim() || " ",
    button_type: cta,
    button_text: form.completionCta.trim() || "View Website",
  };
  if (cta === "CALL_BUSINESS") {
    const phone = metaUsPhone(form.completionPhone);
    if (!phone) errors.push("The end page needs a US phone number");
    thanks.business_phone_number = phone ?? "";
    thanks.country_code = "US";
  } else if (cta === "VIEW_WEBSITE" || cta === "DOWNLOAD") {
    if (!form.completionUrl.trim()) errors.push("The end page needs a link");
    thanks.website_url = form.completionUrl.trim();
  }
  body.thank_you_page = thanks;

  return { body, manual, errors };
}

/** Meta refuses a second form with the same name. "Name" -> "Name (2)" -> "Name (3)". */
export function nextFormName(name: string): string {
  const m = /^(.*) \((\d+)\)$/.exec(name);
  return m ? `${m[1]} (${Number(m[2]) + 1})` : `${name} (2)`;
}
