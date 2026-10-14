// The custom value helpers the Link and Provision writes share (the Custom
// Values page that once drew these side by side went 2026-10-10).
//
// One rule lives here rather than in the seed: Company Phone Number is the
// sub-account's own bought GHL number when there is one (Client Setup SOP:
// "Company Phone Number - Local GHL Number"). Intake seeds it with the client's
// personal phone, which is what leads would then be told to call.

/** "+13137662171" -> "(313) 766-2171". Anything that is not a US number is left alone. */
export function formatUsPhone(raw: string): string {
  const m = /^\+?1?(\d{3})(\d{3})(\d{4})$/.exec((raw ?? "").replace(/[^\d+]/g, ""));
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : raw ?? "";
}

/** The sub-account's number to give out: the default one, else the first. */
export function pickGhlNumber(
  numbers: { phoneNumber?: string; isDefaultNumber?: boolean }[],
): string | null {
  const pick = numbers.find((n) => n.isDefaultNumber) ?? numbers[0];
  return pick?.phoneNumber ? formatUsPhone(pick.phoneNumber) : null;
}

/** The fields as they should be pushed: the stored ones, with the GHL number as Company Phone. */
export function effectiveFields(
  fields: Record<string, string>,
  ghlNumber: string | null,
): Record<string, string> {
  return ghlNumber ? { ...fields, company_phone: ghlNumber } : { ...fields };
}
