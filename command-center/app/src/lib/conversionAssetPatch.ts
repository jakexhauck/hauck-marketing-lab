import type { ConversionAsset, ConversionAssetPatch } from "../../functions/lib/conversionAssets";

// What the wizard sends back when it saves.
//
// This used to be an object literal written by hand inside ConversionAssetPanel,
// and it silently lost fields. Every key on ConversionAssetPatch is optional,
// because the server is a real patch endpoint and leaves an absent column
// alone. That is correct on the server and lethal on the client: a key left out
// of the literal type-checked perfectly, saved without an error, and left the
// column at its default forever. Migration 0098 added the mechanism and coupon
// columns, the literal was never updated, and for as long as that lasted an
// operator could type a page of steering notes, watch the save succeed, and get
// a prompt that said "none given".
//
// So the list of keys is written once, checked against the server's own type at
// compile time, and the object is built from that list rather than by hand.
// Adding a column to ConversionAssetPatch now breaks the build here until it is
// added below.

// pageSource is the built page's whole file body. The server writes it and
// never sends it to the browser, so the wizard has nothing to send back and
// must not blank it by returning an empty string.
type WizardPatchKey = Exclude<keyof ConversionAssetPatch, "pageSource">;

// -? drops the optionality, so every key has to be present on the result.
export type WizardPatch = { [K in WizardPatchKey]-?: ConversionAsset[K] };

export const PATCH_KEYS = [
  "kind",
  "slug",
  "designSource",
  "designRef",
  "colorSource",
  "colors",
  "designKitUrl",
  "logoUrl",
  "ownerName",
  "ownerPhotoUrl",
  "storyNotes",
  "couponOffer",
  "couponCode",
  "couponTerms",
  "mechanismName",
  "mechanismNotes",
  "jobs",
  "reviews",
  "trust",
  "appointmentType",
  "calendarEmbed",
  "status",
] as const satisfies readonly WizardPatchKey[];

// The guard. If a writable key is not in PATCH_KEYS above, Missing stops being
// never and this line fails to compile, naming the key it wants.
type Missing = Exclude<WizardPatchKey, (typeof PATCH_KEYS)[number]>;
const _everyWritableKeyIsListed: [Missing] extends [never] ? true : ["missing from PATCH_KEYS", Missing] =
  true;
void _everyWritableKeyIsListed;

// Everything the row carries, sent whole. One operator drives one wizard, so
// there is no second writer to race, and sending the full set means a step that
// quietly changed something upstream cannot be left behind.
export function asPatch(asset: ConversionAsset): WizardPatch {
  const out = {} as Record<WizardPatchKey, unknown>;
  // Copied by key rather than spread: a spread would carry id, tenantId,
  // hasSource and the timestamps, which the server does not accept.
  for (const key of PATCH_KEYS) out[key] = asset[key];
  return out as WizardPatch;
}
