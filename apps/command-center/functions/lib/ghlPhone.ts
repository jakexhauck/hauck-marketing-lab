import { ghlFetch, type GhlContext } from "./ghl";
import { pickGhlNumber } from "../../src/lib/customValuesSheet";

// The sub-account's own bought number, formatted for a custom value, or null.
//
// Null on any failure (no number bought yet, or a token without the phone
// scope): the caller then keeps whatever Company Phone Number was typed, which
// is what happened before this existed. Never throws.
export async function fetchGhlNumber(gctx: GhlContext): Promise<string | null> {
  try {
    const res = await ghlFetch(
      gctx,
      `/phone-system/numbers/location/${encodeURIComponent(gctx.locationId)}`,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { numbers?: { phoneNumber?: string; isDefaultNumber?: boolean }[] };
    return pickGhlNumber(body.numbers ?? []);
  } catch {
    return null;
  }
}
