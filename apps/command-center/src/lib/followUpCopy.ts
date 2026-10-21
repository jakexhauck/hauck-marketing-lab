// The texts on client > GHL > Follow-up Texts, in the order the GHL workflows
// send them (Client Setup SOP). Shared by the server (what Claude must write,
// what is saved) and the page (labels, waits, which cards can be rewritten).
//
// Long Term Nurture: all four per client.
// Lead form: only the first text, SMS 3 and the Hail Mary are per client (Jake,
// 2026-10-06). The enquiry confirmation and outside-hours text are universal and
// live in the GHL snapshot, so they are not here (the Recent Work and Owner
// Story texts went with conversion assets, 2026-10-20). The new-lead alerts
// left this page 2026-10-10 (Jake: not needed).

export type CopyKind = "ltn" | "lead_fu";

export function isCopyKind(v: unknown): v is CopyKind {
  return v === "ltn" || v === "lead_fu";
}

export interface CopyItemDef {
  key: string;
  label: string;
  // When GHL sends it, as the SOP's workflow reads.
  when: string;
  // Written by Claude (true) or filled from a template (false).
  ai: boolean;
  // Not a text message: a note for Jake (the photo idea).
  note?: boolean;
}

export const COPY_ITEMS: Record<CopyKind, CopyItemDef[]> = {
  ltn: [
    { key: "sms1", label: "SMS 1", when: "10 days after joining", ai: true },
    { key: "sms2", label: "SMS 2", when: "14 days later", ai: true },
    { key: "sms3", label: "SMS 3", when: "10 days later", ai: true },
    { key: "sms4", label: "SMS 4", when: "15 days later", ai: true },
  ],
  lead_fu: [
    { key: "first", label: "First text", when: "2 minutes after the form, inside working hours", ai: true },
    { key: "sms3", label: "SMS 3", when: "A few days after the first text, if no reply", ai: true },
    { key: "sms3Photo", label: "SMS 3 photo", when: "Sent with SMS 3", ai: true, note: true },
    { key: "hailMary", label: "Hail Mary", when: "2 days after SMS 3", ai: true },
  ],
};

export type LeadPhoto = "owner" | "crew";

export interface CopyItem {
  key: string;
  text: string;
}

export interface CopySettings {
  photo?: LeadPhoto;
}

export interface CopyRecord {
  kind: CopyKind;
  items: CopyItem[];
  settings: CopySettings;
  writtenAt: string | null;
  editedAt: string | null;
}

/** Keys Claude writes for a kind (everything marked ai). */
export function aiKeys(kind: CopyKind): string[] {
  return COPY_ITEMS[kind].filter((i) => i.ai).map((i) => i.key);
}

/** Put items in the defined order and keep only known keys. */
export function normaliseItems(kind: CopyKind, items: CopyItem[]): CopyItem[] {
  const byKey = new Map(items.map((i) => [i.key, i.text]));
  return COPY_ITEMS[kind].map((def) => ({ key: def.key, text: byKey.get(def.key) ?? "" }));
}
