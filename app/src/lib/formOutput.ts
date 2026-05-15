/**
 * Parsing helpers for form-generator output bodies.
 *
 * Agents (Vortex, Stratos, Nexus, Zenith) tend to emit a body that looks like:
 *
 *     <optional narration like "On it, Sir.">
 *     ```json
 *     {"headline": "...", "summary": "...", ...payload...}
 *     ```
 *
 *     ---
 *
 *     <human-readable markdown rendering of the same content>
 *
 * The raw body is great for downstream automation (the JSON is canonical) but
 * dumping all of it on the user produces an ugly, JSON-heavy wall of text.
 * These helpers split it into structured data + clean markdown so the UI can
 * render either, depending on whether we recognize the payload shape.
 */

/** Match a single ```json ... ``` fenced block. Captures the inner JSON. */
const JSON_FENCE = /```json\s*\n([\s\S]*?)```/i;

/** Trims a few common narration patterns that agents tack on before the payload. */
const LEADING_NARRATION = [
  /^On it,? Sir\.?\s*/i,
  /^Sir[ ,—-]+/i,
  /^Brief below\.?\s*/i,
  /^Data gathered\.?\s*/i,
];

export interface FormOutputBlocks {
  /** The parsed JSON payload, or null if none was found / parseable. */
  payload: unknown | null;
  /**
   * The body with the JSON block stripped, whitespace normalized, and leading
   * narration trimmed. Safe to feed to a markdown renderer.
   */
  markdown: string;
}

/**
 * Split a body into its JSON payload (if any) and a cleaned markdown remainder.
 * Idempotent — calling it on already-clean text is a no-op.
 */
export function splitFormBody(body: string): FormOutputBlocks {
  if (!body) return { payload: null, markdown: "" };

  let text = body;

  // 1. Pull out the first ```json``` block.
  let payload: unknown | null = null;
  const fenceMatch = text.match(JSON_FENCE);
  if (fenceMatch) {
    try {
      payload = JSON.parse(fenceMatch[1].trim());
    } catch {
      payload = null;
    }
    text = text.replace(fenceMatch[0], "");
  }

  // 2. Drop the `---` separators that bracket the JSON block in the canonical
  //    layout, and squash the resulting triple-blank gaps.
  text = text
    .replace(/(^|\n)\s*---\s*(?=\n|$)/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 3. Strip recognizable narration that always precedes the payload.
  for (const pattern of LEADING_NARRATION) {
    text = text.replace(pattern, "");
  }
  text = text.trim();

  return { payload, markdown: text };
}

/**
 * For live streaming: if an unclosed ```json fence is in flight, hide
 * everything from the fence onward so the user doesn't watch the JSON tick by.
 * Once the closing fence arrives, the regular {@link splitFormBody} takes over.
 */
export function cleanStreamingText(text: string): string {
  if (!text) return text;
  const openIdx = text.search(/```json\b/i);
  if (openIdx === -1) {
    // No JSON started — strip preamble narration so the stream feels cleaner.
    let out = text;
    for (const pattern of LEADING_NARRATION) {
      out = out.replace(pattern, "");
    }
    return out;
  }
  // If the closing fence hasn't arrived yet, hide everything from the open
  // onward; otherwise let splitFormBody do its thing.
  const after = text.slice(openIdx);
  if (!/```\s*$|```[^`]/.test(after.slice(6))) {
    // No close fence yet — keep just the prefix
    return text.slice(0, openIdx).trim();
  }
  return splitFormBody(text).markdown;
}

/* ----------------------------- Payload shapes ----------------------------- */

export interface EmailPayload {
  headline?: string;
  summary?: string;
  subject_lines?: string[];
  email_body?: string;
}

export interface MessagePayload {
  headline?: string;
  summary?: string;
  message_body?: string;
  body?: string;
}

export interface HooksPayload {
  headline?: string;
  summary?: string;
  angles?: Array<{
    name: string;
    category?: string;
    hooks: string[];
  }>;
  top_picks?: Array<{
    hook: string;
    why?: string;
  }>;
}

export interface CompetitorPayload {
  headline?: string;
  summary?: string;
  competitors?: Array<{
    name: string;
    angle?: string;
    offer?: string;
    weakness?: string;
    [k: string]: unknown;
  }>;
  white_space?: string;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asEmailPayload(p: unknown): EmailPayload | null {
  if (!isPlainObject(p)) return null;
  if (typeof p.email_body !== "string" && !Array.isArray(p.subject_lines)) return null;
  return p as EmailPayload;
}

export function asMessagePayload(p: unknown): MessagePayload | null {
  if (!isPlainObject(p)) return null;
  const body = typeof p.message_body === "string" ? p.message_body : typeof p.body === "string" ? p.body : null;
  if (!body) return null;
  return p as MessagePayload;
}

export function asHooksPayload(p: unknown): HooksPayload | null {
  if (!isPlainObject(p) || !Array.isArray(p.angles)) return null;
  return p as HooksPayload;
}

export function asCompetitorPayload(p: unknown): CompetitorPayload | null {
  if (!isPlainObject(p) || !Array.isArray(p.competitors)) return null;
  return p as CompetitorPayload;
}

/**
 * Pull the headline/summary off any payload so the wrapping panel can show
 * them above the layout. Both are optional.
 */
export function payloadHeader(p: unknown): { headline?: string; summary?: string } {
  if (!isPlainObject(p)) return {};
  return {
    headline: typeof p.headline === "string" ? p.headline : undefined,
    summary: typeof p.summary === "string" ? p.summary : undefined,
  };
}
