// The Custom Values sheet (client > GHL > Custom Values): every custom value the
// app pushes into a client's GHL sub-account, the app's value beside what GHL
// actually holds, row by row. Pure, so the server builds it and the tests pin it.
//
// The values themselves still come from ONBOARDING_FIELDS and still go out
// through writeCustomValues; this only lays them side by side so a mismatch is
// visible before anybody presses Push.
//
// One rule lives here rather than in the seed: Company Phone Number is the
// sub-account's own bought GHL number when there is one (Client Setup SOP:
// "Company Phone Number - Local GHL Number"). Intake seeds it with the client's
// personal phone, which is what leads would then be told to call.

import { LOCATION_TOKEN_CV, ONBOARDING_FIELDS, type FieldGroup, type GhlCustomValue } from "./onboarding";

export type RowState = "match" | "differs" | "missing-in-ghl" | "empty" | "unknown";

export interface SheetRow {
  key: string;
  label: string;
  customValue: string;
  appValue: string;
  // null when GHL could not be read (sub-account not linked).
  ghlValue: string | null;
  state: RowState;
}

export interface SheetGroup {
  id: FieldGroup;
  label: string;
  rows: SheetRow[];
}

export interface Sheet {
  groups: SheetGroup[];
  // The Location API Token is never sent to the browser; only whether GHL has it.
  token: "set" | "missing" | "unknown";
  ghlNumber: string | null;
}

const GROUP_LABELS: Partial<Record<FieldGroup, string>> = {
  business: "Business",
  rep: "Owner and notifications",
  calendars: "Calendars",
};

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

export function buildSheet(input: {
  fields: Record<string, string>;
  live: GhlCustomValue[];
  ghlNumber: string | null;
  linked: boolean;
}): Sheet {
  const fields = effectiveFields(input.fields, input.ghlNumber);
  const byName = new Map(input.live.map((cv) => [cv.name.trim().toLowerCase(), cv]));

  const groups: SheetGroup[] = [];
  for (const f of ONBOARDING_FIELDS) {
    if (!f.customValue) continue;
    const appValue = (fields[f.key] ?? "").trim();
    let ghlValue: string | null = null;
    let state: RowState = "unknown";
    if (input.linked) {
      const cv = byName.get(f.customValue.toLowerCase());
      if (!cv) {
        state = "missing-in-ghl";
      } else {
        ghlValue = (cv.value ?? "").trim();
        if (!appValue && !ghlValue) state = "empty";
        else state = appValue === ghlValue ? "match" : "differs";
      }
    }
    let group = groups.find((g) => g.id === f.group);
    if (!group) {
      group = { id: f.group, label: GROUP_LABELS[f.group] ?? f.group, rows: [] };
      groups.push(group);
    }
    group.rows.push({ key: f.key, label: f.label, customValue: f.customValue, appValue, ghlValue, state });
  }

  let token: Sheet["token"] = "unknown";
  if (input.linked) {
    const cv = byName.get(LOCATION_TOKEN_CV.toLowerCase());
    token = cv && (cv.value ?? "").trim() ? "set" : "missing";
  }

  return { groups, token, ghlNumber: input.ghlNumber };
}
