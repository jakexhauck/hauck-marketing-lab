import { api } from "./tauri";
import { logActivity } from "./activity";

interface WriteBackArgs {
  root: string | null;
  clientSlug: string | null;
  clientName: string;
  outputPath: string;
  formTitle: string;
  /** Body that was just saved. Embedded directly in the extraction prompt so
   *  we don't depend on claude -p re-reading the file. */
  body: string;
}

const EXTRACTION_PROMPT = `You are reading a freshly-saved marketing-ops form output for a single client.

Extract 1-3 DURABLE FACTS about this specific client that should persist in their long-term Memory.md. A durable fact is something that would still be true and useful in 3 months: preferences, constraints, decisions made, results observed, audience or product specifics.

Do NOT extract:
- Generic marketing knowledge.
- The fact that the form was run, or when.
- The output itself.
- Anything obvious from the client's Profile.md.

Output ONLY a markdown bulleted list. Each bullet must stand alone (no pronouns referencing prior bullets). Each bullet under 200 characters. No em dashes anywhere (use commas, periods, parentheses, or colons instead). If there are no durable facts, output the single word: NONE.`;

const parseBullets = (raw: string): string[] => {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE") return [];
  const bullets: string[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const m = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (m && m[1]) {
      const fact = m[1].replace(/\s*—\s*/g, ", ").trim();
      if (fact.length > 0 && fact.toUpperCase() !== "NONE") {
        bullets.push(fact);
      }
    }
  }
  return bullets.slice(0, 3);
};

/**
 * Fire-and-forget. Failures log to console; the calling surface never blocks.
 * Runs `claude -p` against a focused extraction prompt and appends any returned
 * facts to the client's Memory.md, then drops a `memory.updated` activity event.
 */
export async function writeBackMemory(args: WriteBackArgs): Promise<void> {
  const { root, clientSlug, clientName, outputPath, formTitle, body } = args;
  if (!root || !clientSlug) return;

  const prompt = `${EXTRACTION_PROMPT}

Client: ${clientName}
Form: ${formTitle}
Output path: ${outputPath}

--- BEGIN FORM OUTPUT ---
${body}
--- END FORM OUTPUT ---`;

  const id = `memwriteback-${crypto.randomUUID()}`;
  let extracted: string;
  try {
    extracted = await api.invokeClaude(id, prompt);
  } catch (e) {
    console.warn("memory write-back: claude -p failed", e);
    return;
  }

  const bullets = parseBullets(extracted);
  if (bullets.length === 0) return;

  let appended = 0;
  for (const fact of bullets) {
    try {
      await api.appendToMemory(root, clientSlug, fact);
      appended++;
    } catch (e) {
      console.warn("memory write-back: append failed", e);
    }
  }

  if (appended > 0) {
    await logActivity(root, {
      type: "memory.updated",
      clientSlug,
      summary: `Added ${appended} fact${appended === 1 ? "" : "s"} to Memory.md (${formTitle})`,
    });
  }
}

/** Prefix used so consuming components can filter out stream events from
 *  background memory-writeback calls. */
export const MEMORY_WRITEBACK_ID_PREFIX = "memwriteback-";
