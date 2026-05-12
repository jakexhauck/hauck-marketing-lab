import type { ClientEntry, NoteFront } from "./types";

export type ProfileFormValues = {
  business: string;
  services: string;
  target: string;
  offers: string;
  voice: string;
  avoid: string;
  geography: string;
};

export const emptyProfileFormValues = (): ProfileFormValues => ({
  business: "",
  services: "",
  target: "",
  offers: "",
  voice: "",
  avoid: "",
  geography: "",
});

/** Convert blank-line / newline separated text into markdown bullets. */
const bulletize = (text: string): string =>
  text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith("- ") ? s : `- ${s}`))
    .join("\n");

/** Strip leading "- " from each line of a list section to get back form values. */
const debulletize = (text: string): string =>
  text
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/^[-*]\s+/, ""))
    .join("\n");

/** Build a Profile.md body from form values. */
export function buildProfileBody(client: ClientEntry, form: ProfileFormValues): string {
  return [
    `# ${client.name} — Profile`,
    "",
    "## Business",
    form.business.trim(),
    "",
    "## Services",
    bulletize(form.services),
    "",
    "## Target customer",
    form.target.trim(),
    "",
    "## Offers",
    bulletize(form.offers),
    "",
    "## Voice / brand notes",
    form.voice.trim(),
    "",
    "## What to avoid",
    bulletize(form.avoid),
    "",
    "## Geography",
    form.geography.trim(),
    "",
  ].join("\n");
}

/** Build the frontmatter for a client profile. */
export function buildProfileFront(client: ClientEntry): NoteFront {
  return {
    type: "profile",
    client: client.slug,
    agent: "all",
    tags: ["client", "profile"],
    status: client.status,
  };
}

/** Vault path for a client's Profile.md (relative to root). Uses human name. */
export function profilePathFor(root: string, client: ClientEntry): string {
  return `${root}/vault/Clients/${client.name}/Profile.md`;
}

/** Heading aliases — accept variants on parse, write canonical on save. */
const SECTION_ALIASES: Record<string, keyof ProfileFormValues> = {
  business: "business",
  services: "services",
  "target customer": "target",
  target: "target",
  offers: "offers",
  "voice / brand notes": "voice",
  "voice/brand notes": "voice",
  voice: "voice",
  "what to avoid": "avoid",
  "what they want us to avoid": "avoid",
  avoid: "avoid",
  geography: "geography",
};

/** Fields treated as bulleted lists. */
const LIST_FIELDS: ReadonlySet<keyof ProfileFormValues> = new Set([
  "services",
  "offers",
  "avoid",
]);

/** Sniff out the placeholder italics blocks like _(fill in — ...)_ */
const isPlaceholder = (text: string): boolean => {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return /^_\(.*\)_$/.test(trimmed);
};

/** Parse a Profile.md body back into form values. Inverse of buildProfileBody. */
export function parseProfileBody(body: string): ProfileFormValues {
  const result = emptyProfileFormValues();
  // Strip the H1 title line at the top
  const lines = body.replace(/^#\s+[^\n]*\n+/, "").split("\n");

  let currentField: keyof ProfileFormValues | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (!currentField) return;
    const text = buffer.join("\n").replace(/\s+$/g, "");
    if (isPlaceholder(text)) {
      // leave field as empty default
    } else if (LIST_FIELDS.has(currentField)) {
      result[currentField] = debulletize(text);
    } else {
      result[currentField] = text.trim();
    }
    buffer = [];
  };

  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      flush();
      const heading = h2[1].trim().toLowerCase();
      currentField = SECTION_ALIASES[heading] ?? null;
      continue;
    }
    if (currentField) {
      buffer.push(line);
    }
  }
  flush();

  return result;
}
