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
    /** Verified Meta Ad Library URL for this competitor's FB page (when the
     *  agent could confirm the page). When absent/null, the UI falls back to a
     *  keyword search of the Ad Library scoped to the competitor's name. */
    ad_library_url?: string | null;
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

/* ── Ad copy ──────────────────────────────────────────────────────────────
 * Ad copy outputs are pure markdown (no JSON payload). Two shapes are
 * accepted — the historical strict layout (framework on its own line +
 * separate hookRef + word-count lines) and the looser lesson-3.8 layout
 * ("Label each ad with: [Framework] [Angle] [Length] [Word count]"):
 *
 *   Loose (lesson 3.8):
 *     ## Short Copy (under 50 words) · Feed & Story ads
 *     PAS · Pain · short · 38 words
 *     <body>
 *
 *   Strict (legacy):
 *     ## Short Copy (under 50 words) · Feed & Story ads
 *     PAS\
 *     HOOK #7 · urgency\
 *     38 words
 *     <body>
 *
 * `parseAdCopyMarkdown` walks either shape and returns a structured list so
 * the UI can render each ad as its own editable card. Returns null only when
 * no framework-anchored blocks are found. Section H2 headers are also
 * optional — if the agent skipped them, everything lands in a single
 * "Ad copy variations" section. */

export type AdCopyFramework = "PAS" | "AIDA" | "BAB" | "STORY" | "PERFORM";
export type AdCopyLength = "short" | "medium" | "long";

export interface AdCopyVariation {
  framework: AdCopyFramework | string;
  hookRef: string;
  wordCount: string;
  body: string;
  length: AdCopyLength;
}

export interface AdCopyPayload {
  sections: Array<{
    length: AdCopyLength;
    title: string;
    ads: AdCopyVariation[];
  }>;
}

const AD_COPY_SECTION_RE = /^##\s+(Short|Medium|Long)\s+Copy[^\n]*$/i;
/** Matches lines whose FIRST token is a framework name. The framework may
 *  stand alone ("PAS" / "PAS\") or be followed by an inline label
 *  ("PAS · Pain · 38 words"). */
const AD_COPY_FRAMEWORK_RE = /^(PAS|AIDA|BAB|STORY|PERFORM)\b(.*)$/;
/** Pipe-delimited "table" format used by the Aurelius Prompt Builder:
 *    **Ad 1** | PAS | DIY streaks | Short | 38 words
 *  Followed by the ad body on subsequent lines until `---` or the next `**Ad N**`.
 *  Optional bold wrapping on the "Ad N" prefix; tolerant of extra spaces. */
const AD_COPY_PIPE_RE =
  /^\s*\*{0,2}\s*Ad\s+\d+\s*\*{0,2}\s*\|\s*(PAS|AIDA|BAB|STORY|PERFORM)\b\s*\|\s*([^|]*?)\s*\|\s*(Short|Medium|Long)\b\s*\|\s*(.*)$/i;
/** Bracket-delimited variant the model sometimes emits when it reads the
 *  prompt's `[Framework] [Angle] [Length] [Word count]` placeholders literally:
 *    **Ad 1** [PAS] [Hard water stains] [Short] [46 words]
 *  Same body-collection rules as the pipe form. */
const AD_COPY_BRACKET_RE =
  /^\s*\*{0,2}\s*Ad\s+\d+\s*\*{0,2}\s*\[\s*(PAS|AIDA|BAB|STORY|PERFORM)\s*\]\s*\[\s*([^\]]*?)\s*\]\s*\[\s*(Short|Medium|Long)\s*\]\s*\[\s*([^\]]*?)\s*\]\s*$/i;
/** Best-effort word-count extractor: "38 words", "100-150 words", "100 word". */
const WORD_COUNT_RE = /(\d+(?:[-–]\d+)?\s*words?)/i;
/** Horizontal rule used as inter-ad separator in the pipe format. */
const AD_COPY_HR_RE = /^\s*-{3,}\s*$/;

function stripTrailingBackslash(s: string): string {
  return s.replace(/\\?\s*$/, "").trim();
}

export function parseAdCopyMarkdown(markdown: string): AdCopyPayload | null {
  if (!markdown) return null;

  const lines = markdown.split(/\r?\n/);
  const sections: AdCopyPayload["sections"] = [];
  let currentSection: AdCopyPayload["sections"][number] | null = null;

  const ensureSection = (): AdCopyPayload["sections"][number] => {
    if (currentSection) return currentSection;
    currentSection = {
      length: "medium",
      title: "Ad copy variations",
      ads: [],
    };
    sections.push(currentSection);
    return currentSection;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    const sectionMatch = line.match(AD_COPY_SECTION_RE);
    if (sectionMatch) {
      const lengthKey = sectionMatch[1].toLowerCase() as AdCopyLength;
      currentSection = {
        length: lengthKey,
        title: line.replace(/^##\s+/, "").trim(),
        ads: [],
      };
      sections.push(currentSection);
      i += 1;
      continue;
    }

    const pipeMatch = line.match(AD_COPY_PIPE_RE);
    const bracketMatch = pipeMatch ? null : line.match(AD_COPY_BRACKET_RE);
    const tableMatch = pipeMatch ?? bracketMatch;
    if (tableMatch) {
      const framework = tableMatch[1].toUpperCase() as AdCopyFramework;
      const hookRef = (tableMatch[2] ?? "").trim();
      const lengthKey = tableMatch[3].toLowerCase() as AdCopyLength;
      const wcTail = (tableMatch[4] ?? "").trim();
      const wcMatch = wcTail.match(WORD_COUNT_RE);
      const wordCount = wcMatch ? wcMatch[0].trim() : wcTail;

      // Find or create the section for this ad's length. Reuses an existing
      // section so Short/Medium/Long groups stay consolidated even when the
      // source doc interleaves them (typical of the pipe-table format).
      let targetSection = sections.find((s) => s.length === lengthKey);
      if (!targetSection) {
        targetSection = {
          length: lengthKey,
          title:
            lengthKey === "short"
              ? "Short Copy"
              : lengthKey === "medium"
                ? "Medium Copy"
                : "Long Copy",
          ads: [],
        };
        sections.push(targetSection);
      }
      currentSection = targetSection;

      // Collect body until the next table-format line, framework line, section
      // header, or horizontal rule (which is the standard ad separator).
      const bodyLines: string[] = [];
      let j = i + 1;
      while (j < lines.length) {
        const peek = lines[j];
        if (AD_COPY_PIPE_RE.test(peek)) break;
        if (AD_COPY_BRACKET_RE.test(peek)) break;
        if (AD_COPY_FRAMEWORK_RE.test(peek)) break;
        if (/^##\s+/.test(peek)) break;
        if (AD_COPY_HR_RE.test(peek)) {
          j += 1;
          break;
        }
        bodyLines.push(peek);
        j += 1;
      }
      const body = bodyLines.join("\n").trim();
      if (body.length > 0) {
        currentSection.ads.push({
          framework,
          hookRef,
          wordCount,
          body,
          length: lengthKey,
        });
      }
      i = j;
      continue;
    }

    const fwMatch = line.match(AD_COPY_FRAMEWORK_RE);
    if (fwMatch) {
      const framework = fwMatch[1] as AdCopyFramework;
      const rawTrailing = fwMatch[2] ?? "";
      const inlineLabel = stripTrailingBackslash(rawTrailing);
      // Legacy strict format ends the framework line with a backslash to force
      // a markdown line break; we use that as a hint that the next 1-2 lines
      // are continuation label rather than body.
      const hasStrictMarker = /\\\s*$/.test(rawTrailing);
      let hookRef = "";
      let wordCount = "";
      let j = i + 1;

      if (inlineLabel) {
        // Loose form: label sits on the framework line.
        const wcInline = inlineLabel.match(WORD_COUNT_RE);
        if (wcInline) {
          wordCount = wcInline[0].trim();
          hookRef = inlineLabel
            .replace(wcInline[0], "")
            .replace(/^[·\-–\s,]+|[·\-–\s,]+$/g, "")
            .trim();
        } else {
          hookRef = inlineLabel.replace(/^[·\-–\s,]+|[·\-–\s,]+$/g, "").trim();
        }
      } else if (hasStrictMarker) {
        // Strict form: scan up to 2 lookahead lines for hookRef + wordCount.
        for (let k = 0; k < 2 && j < lines.length; k += 1) {
          const peek = lines[j];
          if (!peek.trim()) {
            j += 1;
            continue;
          }
          if (AD_COPY_FRAMEWORK_RE.test(peek) || /^##\s+/.test(peek)) break;
          const stripped = stripTrailingBackslash(peek);
          if (!wordCount && WORD_COUNT_RE.test(stripped)) {
            const wcMatch = stripped.match(WORD_COUNT_RE);
            wordCount = wcMatch ? wcMatch[0].trim() : "";
            const remainder = stripped.replace(WORD_COUNT_RE, "").trim();
            if (remainder && !hookRef) hookRef = remainder;
            j += 1;
          } else if (!hookRef && stripped.length <= 80) {
            // Short, label-shaped line — treat as hookRef.
            hookRef = stripped;
            j += 1;
          } else {
            // Looks like body; stop trying to scoop more label lines.
            break;
          }
        }
      }
      // else: framework alone, no inline label, no strict marker — body
      // collection starts at the next line. Leave hookRef/wordCount empty.

      // Collect body until the next framework or section header.
      const bodyLines: string[] = [];
      while (j < lines.length) {
        const peek = lines[j];
        if (AD_COPY_FRAMEWORK_RE.test(peek)) break;
        if (/^##\s+/.test(peek)) break;
        bodyLines.push(peek);
        j += 1;
      }
      const body = bodyLines.join("\n").trim();
      if (body.length > 0) {
        const section = ensureSection();
        section.ads.push({
          framework,
          hookRef,
          wordCount,
          body,
          length: section.length,
        });
      }
      i = j;
      continue;
    }

    i += 1;
  }

  // Require at least one ad to consider this a valid ad-copy doc.
  const total = sections.reduce((n, s) => n + s.ads.length, 0);
  if (total === 0) return null;
  return { sections };
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
