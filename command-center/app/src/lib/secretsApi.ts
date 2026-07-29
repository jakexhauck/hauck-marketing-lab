// Response shapes for the two secret endpoints. Both the Pages Functions and
// the admin page import from here, so the wire format has one definition.
import type { ClientSecretView } from "./clientSecrets";

export interface AgencySecretRow {
  name: string;
  /** Which integrations need it, for context in the table. */
  usedBy: string[];
  optional: boolean;
  inDoppler: boolean;
  inRuntime: boolean;
  /** Masked tail only. A raw agency secret never crosses the wire. */
  masked: string | null;
  /**
   * Doppler and the running deploy hold different values. null means we cannot
   * tell (one side is empty), which is deliberately not the same as false.
   */
  drift: boolean | null;
}

export interface AgencySecretsResponse {
  project: string;
  config: string;
  canRead: boolean;
  /** False unless DOPPLER_WRITE_TOKEN is set. Editing is opt-in. */
  canEdit: boolean;
  readError: string | null;
  rows: AgencySecretRow[];
  /** Doppler keys no integration in the registry claims. */
  unclaimed: string[];
}

export interface ClientSecretsResponse {
  tenantId: string;
  name: string;
  slug: string;
  fields: ClientSecretView[];
}

/** How many agency keys need a human: absent, or drifted from the deploy. */
export function agencyAttention(rows: AgencySecretRow[]): number {
  return rows.filter((r) => r.drift === true || (!r.optional && !r.inDoppler && !r.inRuntime))
    .length;
}
