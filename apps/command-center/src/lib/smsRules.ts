// Checks run on every text Claude writes for a client (Follow-up Texts page),
// and again as Jake edits one. They warn; they never block. Pure, shared by the
// server (which stores the warnings) and the page (which re-checks on edit).
//
// The address rule is from the Client Setup SOP: the lead form takes a name and
// a phone number only, so a text that says "we finished some jobs near you"
// claims something we cannot know.

// GSM-7 basic set plus the extension table. Anything outside forces UCS-2,
// which cuts a segment from 160 characters to 70.
const GSM =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXT = "^{}\\[~]|€";

export interface SegmentInfo {
  chars: number;
  segments: number;
  unicode: boolean;
}

export function segmentInfo(text: string): SegmentInfo {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM.includes(ch)) units += 1;
    else if (GSM_EXT.includes(ch)) units += 2;
    else unicode = true;
  }
  const chars = [...text].length;
  if (unicode) {
    return { chars, segments: chars <= 70 ? 1 : Math.ceil(chars / 67), unicode };
  }
  return { chars, segments: units <= 160 ? 1 : Math.ceil(units / 153), unicode };
}

// Merge fields the follow-up texts may use. Anything else is a typo GHL would
// send to a lead as literal braces.
export const ALLOWED_MERGE_FIELDS = [
  "contact.first_name",
  "contact.name",
  "contact.phone",
  "contact.email",
  "custom_values.user_first_name",
  "custom_values.company_name",
];

const ADDRESS_CLAIMS = /\b(near you|in your (area|neighbou?rhood|street)|on your street|down the street|your neighbou?rs?)\b/i;

// Merge fields are sent as the lead's real details, and a literal "{{" costs
// double in GSM, so length is judged on the text as a lead would receive it.
const SAMPLE_VALUES: Record<string, string> = {
  "contact.first_name": "Jennifer",
  "contact.name": "Jennifer Smith",
  "contact.phone": "(313) 555-0100",
  "contact.email": "jennifer.smith@gmail.com",
  "custom_values.user_first_name": "Chris",
  "custom_values.company_name": "Willis Windows",
};

/** The text with typical values in place of its merge fields. */
export function withSampleValues(text: string): string {
  return text.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (m, key: string) => SAMPLE_VALUES[key] ?? m);
}

export function checkSms(text: string, opts: { maxSegments?: number } = {}): string[] {
  const problems: string[] = [];
  if (/[\u2014\u2013]/.test(text)) problems.push("Has a dash; use a comma or full stop");
  const seg = segmentInfo(withSampleValues(text));
  const max = opts.maxSegments ?? 2;
  if (seg.segments > max) problems.push(`${seg.segments} texts long; keep it to ${max}`);
  for (const m of text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
    if (!ALLOWED_MERGE_FIELDS.includes(m[1])) problems.push(`Unknown merge field {{${m[1]}}}`);
  }
  if (/\{\{[^}]*$|^[^{]*\}\}/.test(text)) problems.push("Broken merge field");
  if (ADDRESS_CLAIMS.test(text)) problems.push("Claims to know where they live");
  return problems;
}
