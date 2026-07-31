// Generating the keys nobody pastes.
//
// Four of the agency keys are not obtained from a vendor at all, they are
// invented: the session signing secret, the two cron secrets, and the VAPID
// pair. Until now that meant a shell command and a copy-paste, which is how
// HEALTH_CRON_SECRET ended up never being set at all.
//
// Web Crypto only, so this runs unchanged in the Worker.

/** Bytes to base64url, the encoding VAPID and JWK both use. */
function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * A 32-byte random secret as 64 hex characters.
 *
 * Hex rather than base64 because both cron gates check a minimum LENGTH, and
 * hex gives a predictable one. 64 clears the 32-character floor with no room
 * for an unlucky short encoding.
 */
export function hex32(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface VapidPair {
  publicKey: string;
  privateKey: string;
}

/**
 * A VAPID application-server key pair, P-256, base64url.
 *
 * The public half is the raw uncompressed point (65 bytes, leading 0x04), which
 * is the form browsers expect in applicationServerKey. The private half is the
 * JWK `d` component, already base64url, which is what the push signer reads.
 * Exporting the private key any other way produces something that looks right
 * and fails at sign time.
 */
export async function vapidPair(): Promise<VapidPair> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;

  // exportKey's return type is a union across every format, so the raw case
  // needs narrowing before it can be read as bytes.
  const rawBuffer = (await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer;
  const raw = new Uint8Array(rawBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  if (!jwk.d) throw new Error("private key export carried no d component");

  return { publicKey: base64url(raw), privateKey: jwk.d };
}

/** What the generate endpoint accepts. Anything else is refused. */
export type GeneratorName = "hex32" | "vapid";

export interface GeneratedSecrets {
  /** Key name to value. A pair generator returns both halves at once. */
  values: Record<string, string>;
}

/**
 * Generate for one key, returning every key the operation writes.
 *
 * The VAPID case returns BOTH halves deliberately: generating them separately
 * produces a public key that does not match the private one, and the failure
 * only shows up later as pushes that silently never arrive.
 */
export async function generateFor(
  name: string,
  generator: GeneratorName,
  pairedWith?: string,
): Promise<GeneratedSecrets> {
  if (generator === "hex32") {
    return { values: { [name]: hex32() } };
  }

  const pair = await vapidPair();
  const publicName = name.includes("PRIVATE") ? (pairedWith ?? "VAPID_PUBLIC_KEY") : name;
  const privateName = name.includes("PRIVATE") ? name : (pairedWith ?? "VAPID_PRIVATE_KEY");
  return { values: { [publicName]: pair.publicKey, [privateName]: pair.privateKey } };
}
