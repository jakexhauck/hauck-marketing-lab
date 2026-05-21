import { api } from "./tauri";

export type MemoryBucket =
  | "Goals & Offer"
  | "Numbers"
  | "Decisions & Commitments"
  | "Pain Points"
  | "Open Threads";

export const MEMORY_BUCKETS: MemoryBucket[] = [
  "Goals & Offer",
  "Numbers",
  "Decisions & Commitments",
  "Pain Points",
  "Open Threads",
];

export interface ExtractedFact {
  bucket: MemoryBucket;
  text: string;
}

export interface ExtractedUpdate {
  bucket: MemoryBucket;
  oldSnippet: string;
  newText: string;
  reason?: string;
}

export interface ProfileAddition {
  section: string;
  bullet: string;
  reason?: string;
}

export interface ExtractionResult {
  facts: ExtractedFact[];
  updates: ExtractedUpdate[];
  skipped: string[];
  profileAdditions: ProfileAddition[];
}

const EXTRACTOR_PROMPT = `You are reading a client call transcript (likely from Fathom) for a single marketing-agency client. You also have the client's current Memory.md and Profile.md as context. Decide what should be ADDED, what UPDATES an existing fact, what is a DUPLICATE of something already recorded, and whether the Profile needs structural updates.

Output VALID JSON ONLY. No prose, no markdown fences, no explanation. Schema:

{
  "facts": [ { "bucket": <bucket>, "text": "..." } ],
  "updates": [ { "bucket": <bucket>, "oldSnippet": "exact substring from an existing Memory line", "newText": "...", "reason": "why this supersedes" } ],
  "skipped": [ "short reason why this fact from the call was already in Memory and ignored" ],
  "profileAdditions": [ { "section": "Services | Target customer | Offers | Geography | Business | Voice / brand notes | What to avoid", "bullet": "...", "reason": "why this belongs in Profile not Memory" } ]
}

Where <bucket> is one of: "Goals & Offer", "Numbers", "Decisions & Commitments", "Pain Points", "Open Threads".

CLASSIFICATION RULES:

facts (new): Things stated in the call that are NOT already in Memory.md and are NOT structural Profile changes. Default destination.

updates: Use ONLY when a new statement directly contradicts or supersedes a specific existing Memory line. oldSnippet MUST be a unique substring (10+ chars) copied verbatim from a line in the existing Memory.md so it can be located. Example: client previously said close rate was 22%, now says 30%. oldSnippet = "close rate 22%", newText = "Close rate now 30% (up from 22%)". If you can't find a clear contradiction, do NOT use updates, just add as a fact.

skipped: When the call repeats something already plainly stated in Memory.md (same number, same goal, same pain point), record a one-line reason here and do NOT add it to facts. This prevents duplicate entries.

profileAdditions: Use when the call reveals a STRUCTURAL change to who the client is, what they sell, or where they operate. New service line, new target market, new geography, new offer, new brand-voice rule. These belong in Profile.md, not Memory.md. Pick the section closest to the content. DO NOT propose Profile additions for transient facts (single-call metrics, one-off decisions, open threads).

TEXT RULES (apply to facts.text, updates.newText, profileAdditions.bullet):
- Self-contained. No pronouns referring to other facts.
- Under 180 characters each.
- Plain English. No em dashes anywhere. Use commas, periods, parentheses, or colons.
- Skip small talk, scheduling chitchat, generic marketing knowledge.
- Quality over quantity. Aim 5-15 total entries across facts + updates + profileAdditions.

If nothing extractable, return { "facts": [], "updates": [], "skipped": [], "profileAdditions": [] }.`;

const tryParseJson = (raw: string): unknown => {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(fenced[1].trim());
      } catch {
        // fall through
      }
    }
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(trimmed.slice(first, last + 1));
      } catch {
        // fall through
      }
    }
    return null;
  }
};

const normaliseBucket = (raw: unknown): MemoryBucket | null => {
  if (typeof raw !== "string") return null;
  const lower = raw.trim().toLowerCase();
  return MEMORY_BUCKETS.find((b) => b.toLowerCase() === lower) ?? null;
};

const cleanText = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
};

const cleanReason = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") return undefined;
  const t = raw.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 200) : undefined;
};

const PROFILE_SECTIONS = [
  "Business",
  "Services",
  "Target customer",
  "Offers",
  "Voice / brand notes",
  "What to avoid",
  "Geography",
];

const normaliseSection = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const lower = raw.trim().toLowerCase();
  return PROFILE_SECTIONS.find((s) => s.toLowerCase() === lower) ?? null;
};

export const TRANSCRIPT_INGEST_ID_PREFIX = "transcript-extract-";

export async function extractFromTranscript(args: {
  clientName: string;
  transcript: string;
  existingMemory: string;
  existingProfile: string;
}): Promise<ExtractionResult> {
  const prompt = `${EXTRACTOR_PROMPT}

Client: ${args.clientName}

--- BEGIN EXISTING MEMORY.MD ---
${args.existingMemory || "(empty)"}
--- END EXISTING MEMORY.MD ---

--- BEGIN EXISTING PROFILE.MD ---
${args.existingProfile || "(empty)"}
--- END EXISTING PROFILE.MD ---

--- BEGIN NEW TRANSCRIPT ---
${args.transcript}
--- END NEW TRANSCRIPT ---`;

  const id = `${TRANSCRIPT_INGEST_ID_PREFIX}${crypto.randomUUID()}`;
  const raw = await api.invokeClaude(id, prompt);

  const parsed = tryParseJson(raw);
  const empty: ExtractionResult = {
    facts: [],
    updates: [],
    skipped: [],
    profileAdditions: [],
  };
  if (!parsed || typeof parsed !== "object") return empty;
  const obj = parsed as Record<string, unknown>;

  const facts: ExtractedFact[] = [];
  if (Array.isArray(obj.facts)) {
    for (const item of obj.facts) {
      if (!item || typeof item !== "object") continue;
      const bucket = normaliseBucket((item as { bucket?: unknown }).bucket);
      const text = cleanText((item as { text?: unknown }).text);
      if (!bucket || !text) continue;
      facts.push({ bucket, text });
    }
  }

  const updates: ExtractedUpdate[] = [];
  if (Array.isArray(obj.updates)) {
    for (const item of obj.updates) {
      if (!item || typeof item !== "object") continue;
      const i = item as Record<string, unknown>;
      const bucket = normaliseBucket(i.bucket);
      const oldSnippet =
        typeof i.oldSnippet === "string" ? i.oldSnippet.trim().slice(0, 220) : "";
      const newText = cleanText(i.newText);
      const reason = cleanReason(i.reason);
      if (!bucket || !oldSnippet || !newText) continue;
      // Filter: snippet must actually appear in existing Memory.md, else
      // the strikethrough would no-op silently. Demote to plain fact.
      if (!args.existingMemory.includes(oldSnippet)) {
        facts.push({ bucket, text: newText });
        continue;
      }
      updates.push({ bucket, oldSnippet, newText, reason });
    }
  }

  const skipped: string[] = [];
  if (Array.isArray(obj.skipped)) {
    for (const item of obj.skipped) {
      if (typeof item !== "string") continue;
      const t = item.replace(/\s+/g, " ").trim().slice(0, 220);
      if (t) skipped.push(t);
    }
  }

  const profileAdditions: ProfileAddition[] = [];
  if (Array.isArray(obj.profileAdditions)) {
    for (const item of obj.profileAdditions) {
      if (!item || typeof item !== "object") continue;
      const i = item as Record<string, unknown>;
      const section = normaliseSection(i.section);
      const bullet = cleanText(i.bullet);
      const reason = cleanReason(i.reason);
      if (!section || !bullet) continue;
      profileAdditions.push({ section, bullet, reason });
    }
  }

  return { facts, updates, skipped, profileAdditions };
}

export interface CommitArgs {
  root: string;
  clientSlug: string;
  source?: string;
  facts: ExtractedFact[];
  updates: ExtractedUpdate[];
  profileAdditions: ProfileAddition[];
}

export interface CommitResult {
  memoryAppended: number;
  memorySuperseded: number;
  profileAppended: number;
}

/** Append `bullet` under `## section` heading inside Profile.md body. */
function appendBulletUnderSection(
  profileBody: string,
  section: string,
  bullet: string,
  dateStamp: string,
  source: string | undefined,
): string {
  const dated = `- ${dateStamp}, ${bullet}${source ? ` (source: ${source})` : ""}`;
  const heading = `## ${section}`;
  const idx = profileBody.indexOf(heading);
  if (idx < 0) {
    // Section missing — append a new section at end of body.
    const suffix = profileBody.endsWith("\n") ? "" : "\n";
    return `${profileBody}${suffix}\n${heading}\n\n${dated}\n`;
  }
  // Find the next heading or end of body.
  const after = idx + heading.length;
  const nextHeadingMatch = profileBody.slice(after).match(/\n## /);
  const insertEnd = nextHeadingMatch
    ? after + (nextHeadingMatch.index ?? 0)
    : profileBody.length;
  const before = profileBody.slice(0, insertEnd).trimEnd();
  const tail = profileBody.slice(insertEnd);
  return `${before}\n${dated}\n${tail.startsWith("\n") ? tail : "\n" + tail}`;
}

export async function commitExtraction(args: CommitArgs): Promise<CommitResult> {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const sourceTag = args.source;

  let memoryAppended = 0;
  let memorySuperseded = 0;
  let profileAppended = 0;

  // Memory: combined commit (atomic in Rust).
  const additions = args.facts
    .filter((f) => f.text.trim().length > 0)
    .map((f) => ({ bucket: f.bucket, text: f.text.trim(), source: sourceTag }));
  const supersedes = args.updates
    .filter((u) => u.newText.trim().length > 0 && u.oldSnippet.trim().length > 0)
    .map((u) => ({
      oldSnippet: u.oldSnippet,
      newText: u.newText.trim(),
      bucket: u.bucket,
      source: sourceTag,
    }));

  if (additions.length > 0 || supersedes.length > 0) {
    await api.commitMemoryChanges(
      args.root,
      args.clientSlug,
      additions,
      supersedes,
    );
    memoryAppended = additions.length;
    memorySuperseded = supersedes.length;
  }

  // Profile: read, mutate, write back via existing vault commands.
  const validProfile = args.profileAdditions.filter(
    (p) => p.bullet.trim().length > 0,
  );
  if (validProfile.length > 0) {
    const notes = await api.readClientNotes(args.root, args.clientSlug);
    const profile = notes.find((n) =>
      n.path.toLowerCase().endsWith("profile.md"),
    );
    if (profile) {
      let body = profile.body;
      for (const p of validProfile) {
        body = appendBulletUnderSection(
          body,
          p.section,
          p.bullet.trim(),
          dateStamp,
          sourceTag,
        );
        profileAppended++;
      }
      // Use writeVaultNote with the same front-matter.
      await api.writeVaultNote(args.root, profile.path, profile.front, body);
    }
  }

  return { memoryAppended, memorySuperseded, profileAppended };
}
