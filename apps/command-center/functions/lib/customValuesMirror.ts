import { ghlFetch, ghlJson, type GhlContext } from "./ghl";
import { mergeTag } from "./ghlProvision";

// Client > GHL > Custom Values: a live mirror of the sub-account's own Custom
// Values settings page (Jake, 2026-10-14: "I change them out a lot"). Nothing
// is stored on our side. Every read goes to GHL, every save goes straight back.

export interface MirrorValue {
  id: string;
  name: string;
  value: string;
  // What a workflow pastes, e.g. {{custom_values.open_lead}}.
  merge: string;
}

interface RawValue {
  id?: string;
  name?: string;
  value?: string;
  fieldKey?: string;
}

export function shapeValues(raw: RawValue[]): MirrorValue[] {
  return raw
    .filter((v) => v.id && v.name)
    .map((v) => ({
      id: String(v.id),
      name: String(v.name),
      value: String(v.value ?? ""),
      // GHL sends the real key; derive it only if a row comes back without one.
      merge: v.fieldKey?.trim() || mergeTag(String(v.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

// Name and value as the save body. A blank name is refused: GHL would accept
// it and leave a row nobody can merge.
export function parseValueBody(body: unknown): { name: string; value: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const value = typeof b.value === "string" ? b.value : "";
  if (!name || name.length > 200 || value.length > 10000) return null;
  return { name, value };
}

const base = (g: GhlContext) => `/locations/${encodeURIComponent(g.locationId)}/customValues`;

export async function listValues(g: GhlContext): Promise<MirrorValue[]> {
  const data = await ghlJson<{ customValues?: RawValue[] }>(g, base(g));
  return shapeValues(data.customValues ?? []);
}

export async function createValue(g: GhlContext, input: { name: string; value: string }) {
  await ghlJson(g, base(g), { method: "POST", body: JSON.stringify(input) });
}

export async function updateValue(g: GhlContext, id: string, input: { name: string; value: string }) {
  await ghlJson(g, `${base(g)}/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function deleteValue(g: GhlContext, id: string) {
  const res = await ghlFetch(g, `${base(g)}/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`GHL ${res.status}`);
}
