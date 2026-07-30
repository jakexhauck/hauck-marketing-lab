// Wizard answers -> the setup values pushed into a client's GHL sub-account.
//
// The wizard already asks for things the provisioner needs under different
// names: "Business name" is the Company Name custom value, the contact's phone
// is both the rep's number and where internal alerts go. Copying them across at
// creation means the record's "Push values to GHL" arrives half-filled instead
// of blank, and Jake fills the gaps rather than retyping what he just typed.
//
// The target keys are the `key` values in src/lib/onboarding.ts's
// ONBOARDING_FIELDS. Nothing here may invent a key: buildProvisionPlan only
// writes fields it recognises, so an invented one is silently dropped, which
// looks like a value that saved and did not.

/** wizard field key -> onboarding.fields keys it seeds. */
export const SEED_MAP: Record<string, string[]> = {
  // Step 1
  name: ["company_name"],
  // Step 4 (contact & legal)
  contactName: ["user_full_name"],
  contactEmail: ["from_email", "notif_from_email", "to_custom_email"],
  contactPhone: ["company_phone", "user_phone", "notif_sms", "to_custom_number"],
};

/** The first word of a full name, which is what GHL's "user first name" holds. */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/**
 * Build the initial onboarding.fields from what the wizard collected.
 *
 * Blanks are skipped rather than written: an empty custom value in GHL is not
 * the same as one nobody has filled in yet, and the readiness check counts
 * blanks. Values already present in `existing` win, so this can never overwrite
 * something typed on the record itself.
 */
export function seedOnboardingFields(
  answers: Record<string, unknown>,
  existing: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = { ...existing };

  const put = (key: string, value: string): void => {
    const clean = value.trim();
    if (!clean) return;
    if ((out[key] ?? "").trim()) return;
    out[key] = clean;
  };

  for (const [source, targets] of Object.entries(SEED_MAP)) {
    const raw = answers[source];
    if (typeof raw !== "string") continue;
    for (const target of targets) put(target, raw);
  }

  // The two that are derived rather than copied.
  const contactName = typeof answers.contactName === "string" ? answers.contactName : "";
  put("user_first_name", firstName(contactName));
  const businessName = typeof answers.name === "string" ? answers.name : "";
  // Marketing email goes out as the business, not as the person who signed.
  put("from_name", businessName);
  put("notif_from_name", businessName);

  return out;
}
