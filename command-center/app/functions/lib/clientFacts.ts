import type { SupabaseClient } from "@supabase/supabase-js";

// What every Claude prompt for a client is written from: one plain object,
// gathered from the tenant row, the client's intake answers and the setup
// fields. Pure mapper (toFacts) plus a thin loader, so the mapping is tested
// and the prompts never reach into the database themselves.
//
// Blank is blank: a missing answer is an empty string, never a guess. The
// prompts are told to leave out what they are not given.

export interface ClientFacts {
  businessName: string;
  trade: string;
  ownerFirstName: string;
  ownerFullName: string;
  city: string;
  state: string;
  serviceArea: string;
  services: string[];
  usp: string;
  website: string;
}

type Rec = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function toFacts(input: { tenant: Rec | null; answers: Rec | null; fields: Rec | null }): ClientFacts {
  const t = input.tenant ?? {};
  const a = input.answers ?? {};
  const f = input.fields ?? {};
  const fullName = str(a.contactName) || str(f.user_full_name);
  const services = ["service1", "service2", "service3", "service4", "service5", "service6"]
    .map((k) => str(a[k]))
    .filter(Boolean);
  return {
    businessName: str(t.name) || str(a.name) || str(f.company_name),
    trade: str(t.niche) || str(a.niche),
    ownerFirstName: str(f.user_first_name) || fullName.split(/\s+/)[0] || "",
    ownerFullName: fullName,
    city: str(a.addressCity),
    state: str(a.addressState),
    serviceArea: str(a.areaCallout),
    services,
    usp: str(a.usp),
    website: str(t.website_url) || str(a.websiteUrl),
  };
}

/** The facts as a short block for a prompt. Blank lines are dropped. */
export function factsBlock(f: ClientFacts): string {
  const lines: [string, string][] = [
    ["Business", f.businessName],
    ["Trade", f.trade],
    ["Owner", f.ownerFullName || f.ownerFirstName],
    ["City", [f.city, f.state].filter(Boolean).join(", ")],
    ["Service area", f.serviceArea],
    ["Services", f.services.join(", ")],
    ["What makes them different", f.usp],
    ["Website", f.website],
  ];
  return lines.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("\n");
}

export async function loadClientFacts(client: SupabaseClient, tenantId: string): Promise<ClientFacts | null> {
  const [tenantRes, intakeRes, obRes] = await Promise.all([
    client.from("tenants").select("name, niche, website_url").eq("id", tenantId).maybeSingle(),
    client
      .from("intake_submissions")
      .select("answers")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    client.from("onboarding").select("fields").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (tenantRes.error || !tenantRes.data) return null;
  return toFacts({
    tenant: tenantRes.data as Rec,
    answers: (intakeRes.data as { answers?: Rec } | null)?.answers ?? null,
    fields: (obRes.data as { fields?: Rec } | null)?.fields ?? null,
  });
}
