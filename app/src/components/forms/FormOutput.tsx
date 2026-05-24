import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GeneratorKind } from "../../lib/types";
import {
  asCompetitorPayload,
  asEmailPayload,
  asHooksPayload,
  asMessagePayload,
  cleanStreamingText,
  parseAdCopyMarkdown,
  payloadHeader,
  splitFormBody,
  type AdCopyPayload,
  type AdCopyVariation,
  type CompetitorPayload,
  type EmailPayload,
  type HooksPayload,
} from "../../lib/formOutput";
import "./form-output.css";

/** A snippet the user picked out of the doc to drop into the campaign tree.
 *  Currently only edited ad-copy variations can be sent — hooks and email
 *  subjects intentionally don't expose this affordance. */
export type SnippetSource = "ad_copy";

interface FormOutputProps {
  body: string;
  kind: GeneratorKind;
  /** When true, render in streaming mode (hide in-flight JSON, no card chrome). */
  streaming?: boolean;
  /** Show the parsed headline + summary above the layout (default true). */
  showHeader?: boolean;
  /** When provided, each pickable item (hook / top pick / subject line) gets a
   *  hover "+" button that calls this with the chosen snippet. The caller is
   *  responsible for routing it into the campaign tree. `angleLabel` is an
   *  optional short tag the caller can write into the destination ad's
   *  angleLabel field (e.g. "PAS · urgency"). */
  onSendToTree?: (snippet: string, source: SnippetSource, angleLabel?: string) => void;
  /** When set, ad-copy cards expose a "save" button that persists the user's
   *  edits to localStorage under this scope. On next mount the saved edits
   *  override the original ad.body / ad.hookRef so Jake can leave the step and
   *  come back to his work in progress. Typical value:
   *  `adcopy:<clientSlug>:<stepId>`. */
  editorScopeKey?: string;
  /** When set, each ad-copy card exposes a "send to drive" button that
   *  uploads the variation as a native Google Doc. The caller resolves the
   *  destination folder and shapes the title; this component just hands over
   *  the current edited body/hook/framework. Returns the Drive URL on
   *  success so the card can flip into a "open in Drive" state. */
  onSendVariationToDrive?: (variation: {
    body: string;
    hookRef: string;
    framework: string;
    wordCount: string;
  }) => Promise<{ driveUrl: string } | null>;
}

export function FormOutput({
  body,
  kind,
  streaming = false,
  showHeader = true,
  onSendToTree,
  editorScopeKey,
  onSendVariationToDrive,
}: FormOutputProps) {
  if (streaming) {
    const cleaned = cleanStreamingText(body);
    if (!cleaned.trim()) {
      return (
        <div className="form-out form-out-streaming">
          <div className="form-out-shimmer">Drafting structured output…</div>
        </div>
      );
    }
    return (
      <div className="form-out form-out-streaming">
        <MarkdownBody text={cleaned} />
      </div>
    );
  }

  const { payload, markdown } = splitFormBody(body);
  const { headline, summary } = payloadHeader(payload);

  // Route by recognized JSON shape first; ignore `kind` if the shape is clearer.
  const email = asEmailPayload(payload);
  if (email) {
    return (
      <div className="form-out">
        {showHeader && <PayloadHeader headline={headline} summary={summary} />}
        <EmailCard payload={email} />
        <Footnote markdown={extractFootnote(markdown)} />
      </div>
    );
  }

  const hooks = asHooksPayload(payload);
  if (hooks) {
    return (
      <div className="form-out">
        {showHeader && <PayloadHeader headline={headline} summary={summary} />}
        <HooksCard payload={hooks} />
        <Footnote markdown={extractFootnote(markdown)} />
      </div>
    );
  }

  const competitors = asCompetitorPayload(payload);
  if (competitors) {
    return (
      <div className="form-out">
        {showHeader && <PayloadHeader headline={headline} summary={summary} />}
        <CompetitorCards payload={competitors} />
        <Footnote markdown={extractFootnote(markdown)} />
      </div>
    );
  }

  const message = asMessagePayload(payload);
  if (message) {
    return (
      <div className="form-out">
        {showHeader && <PayloadHeader headline={headline} summary={summary} />}
        <MessageCard
          body={message.message_body ?? message.body ?? ""}
        />
        <Footnote markdown={extractFootnote(markdown)} />
      </div>
    );
  }

  // Ad copy is markdown-only (no JSON payload). Detect it via the section
  // headers + framework label blocks.
  const adCopy = parseAdCopyMarkdown(markdown);
  if (adCopy) {
    return (
      <div className="form-out">
        {showHeader && <PayloadHeader headline={headline} summary={summary} />}
        <AdCopyCards
          payload={adCopy}
          onSendToTree={onSendToTree}
          editorScopeKey={editorScopeKey}
          onSendVariationToDrive={onSendVariationToDrive}
        />
      </div>
    );
  }

  // Unknown JSON shape — render the cleaned markdown remainder.
  void kind; // reserved for future kind-specific layouts
  return (
    <div className="form-out">
      <PayloadHeader headline={headline} summary={summary} />
      <div className="form-out-card">
        <MarkdownBody text={markdown} />
      </div>
    </div>
  );
}

/** Build a short, tree-friendly angle label from an ad variation.
 *  Priority: framework + cleaned hookRef category ("PAS · urgency"), framework
 *  + "FRESH HOOK" tag, or just the framework alone. Designed to fit the
 *  single-line angleLabel input on a CampaignTreeView ad card. */
function deriveAngleLabel(
  framework: string,
  hookRef: string,
): string {
  const ref = (hookRef ?? "").trim();
  if (!ref) return framework;
  // hookRef is typically "HOOK #7 · urgency" or "FRESH HOOK · curiosity";
  // the actual angle category sits after the last "·".
  const lastDot = ref.lastIndexOf("·");
  const tail = lastDot >= 0 ? ref.slice(lastDot + 1).trim() : ref;
  if (!tail) return framework;
  return `${framework} · ${tail}`;
}

function AdCopyCards({
  payload,
  onSendToTree,
  editorScopeKey,
  onSendVariationToDrive,
}: {
  payload: AdCopyPayload;
  onSendToTree?: (snippet: string, source: SnippetSource, angleLabel?: string) => void;
  editorScopeKey?: string;
  onSendVariationToDrive?: (variation: {
    body: string;
    hookRef: string;
    framework: string;
    wordCount: string;
  }) => Promise<{ driveUrl: string } | null>;
}) {
  return (
    <div className="form-out-adcopy-stack">
      {payload.sections.map((section, si) => (
        <section key={si} className="form-out-adcopy-section">
          <header className="form-out-adcopy-section-head">
            <span className="form-out-label">{section.title}</span>
            <span className="form-out-adcopy-count">
              {section.ads.length} {section.ads.length === 1 ? "ad" : "ads"}
            </span>
          </header>
          <div className="form-out-adcopy-grid">
            {section.ads.map((ad, ai) => (
              <AdCopyCard
                key={ai}
                ad={ad}
                storageKey={
                  editorScopeKey
                    ? `${editorScopeKey}::${si}::${ai}`
                    : undefined
                }
                onSend={
                  onSendToTree
                    ? (currentBody, angleHint) =>
                        onSendToTree(currentBody, "ad_copy", angleHint)
                    : undefined
                }
                onSendToDrive={onSendVariationToDrive}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Editable ad-copy card. The body becomes a textarea Jake can hand-tune
 *  (paste in a different hook, rewrite the CTA, swap a line). The hook-ref
 *  badge is also editable so the label stays accurate after edits. Word count
 *  auto-recomputes from the body. "Send to tree" ships the CURRENT edited
 *  body, not the original.
 *
 *  When the parent passes a `storageKey`, the card persists Jake's edits to
 *  localStorage on Save so he can navigate away and come back to work-in-
 *  progress copy. Without a key, edits stay in memory only (the original
 *  behaviour). */
function AdCopyCard({
  ad,
  onSend,
  storageKey,
  onSendToDrive,
}: {
  ad: AdCopyVariation;
  onSend?: (currentBody: string, angleHint: string) => void;
  storageKey?: string;
  onSendToDrive?: (variation: {
    body: string;
    hookRef: string;
    framework: string;
    wordCount: string;
  }) => Promise<{ driveUrl: string } | null>;
}) {
  const readSaved = (): { body?: string; hookRef?: string } | null => {
    if (!storageKey || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // Corrupted entry — fall through to original.
    }
    return null;
  };

  const initial = readSaved();
  const [body, setBody] = useState<string>(initial?.body ?? ad.body ?? "");
  const [hookRef, setHookRef] = useState<string>(initial?.hookRef ?? ad.hookRef ?? "");
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(initial ? Date.now() : null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /** Drive-push lifecycle: idle → pushing → success (with URL) | error. */
  const [drivePushing, setDrivePushing] = useState(false);
  const [driveUrl, setDriveUrl] = useState<string | null>(null);
  const [driveError, setDriveError] = useState<string | null>(null);

  // Reset local state if the upstream ad changes (e.g. saved view reloads).
  // If a saved override exists in localStorage for this slot, prefer it over
  // the freshly loaded vault body — that's what "save it and come back" means.
  useEffect(() => {
    const saved = readSaved();
    setBody(saved?.body ?? ad.body ?? "");
    setHookRef(saved?.hookRef ?? ad.hookRef ?? "");
    setDirty(false);
    setSavedAt(saved ? Date.now() : null);
    // storageKey is intentionally omitted; readSaved closes over the current value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.body, ad.hookRef, storageKey]);

  // Auto-grow the textarea so multi-paragraph ads aren't trapped behind a
  // scrollbar. Runs on every body change.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const liveWords = body.trim().length === 0
    ? "0 words"
    : `${body.trim().split(/\s+/).length} words`;

  return (
    <article className={"form-out-adcopy-card" + (onSend ? " is-pickable" : "") + (dirty ? " is-dirty" : "")}>
      <header className="form-out-adcopy-card-head">
        <span className="form-out-adcopy-framework">{ad.framework}</span>
        <input
          type="text"
          className="form-out-adcopy-hookref-edit"
          value={hookRef}
          onChange={(e) => {
            setHookRef(e.target.value);
            setDirty(true);
          }}
          placeholder="HOOK # · category"
          spellCheck={false}
        />
        <span className="form-out-adcopy-words">{liveWords}</span>
        {(dirty || savedAt !== null) && (
          <button
            type="button"
            className="form-out-adcopy-reset"
            onClick={() => {
              if (storageKey && typeof window !== "undefined") {
                window.localStorage.removeItem(storageKey);
              }
              setBody(ad.body);
              setHookRef(ad.hookRef);
              setDirty(false);
              setSavedAt(null);
            }}
            title={
              savedAt !== null
                ? "Discard your saved edits and revert to the agent's original draft"
                : "Revert to the agent's original draft"
            }
          >
            ↺ reset
          </button>
        )}
        {storageKey && (
          <button
            type="button"
            className={
              "form-out-adcopy-save" + (dirty ? " is-dirty" : savedAt !== null ? " is-saved" : "")
            }
            onClick={() => {
              try {
                window.localStorage.setItem(
                  storageKey,
                  JSON.stringify({ body, hookRef }),
                );
                setDirty(false);
                setSavedAt(Date.now());
              } catch (e) {
                console.warn("AdCopyCard: save failed", e);
              }
            }}
            disabled={!dirty && savedAt !== null}
            title={
              dirty
                ? "Save these edits so they survive navigating away"
                : savedAt !== null
                  ? "Saved — leave the step and come back, the edits are still here"
                  : "Make a change to enable save"
            }
          >
            {dirty ? "save" : savedAt !== null ? "✓ saved" : "save"}
          </button>
        )}
        {onSend && (
          <button
            type="button"
            className="form-out-send-tree"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSend(body, deriveAngleLabel(ad.framework, hookRef));
            }}
            title="Send this ad to the campaign tree"
            aria-label="Send to campaign tree"
          >
            <span className="form-out-send-tree-glyph">→</span>
            <span className="form-out-send-tree-text">send to tree</span>
          </button>
        )}
        {onSendToDrive && (
          driveUrl ? (
            <a
              href={driveUrl}
              target="_blank"
              rel="noreferrer"
              className="form-out-send-drive is-saved"
              title="Open the Doc in Drive (click send to drive again to push the latest edits as a new Doc)"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="form-out-send-drive-glyph">✓</span>
              <span className="form-out-send-drive-text">open in drive</span>
            </a>
          ) : (
            <button
              type="button"
              className={"form-out-send-drive" + (drivePushing ? " is-pushing" : "") + (driveError ? " is-error" : "")}
              disabled={drivePushing}
              onClick={async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (drivePushing) return;
                setDrivePushing(true);
                setDriveError(null);
                try {
                  const result = await onSendToDrive({
                    body,
                    hookRef,
                    framework: ad.framework,
                    wordCount: ad.wordCount,
                  });
                  if (result?.driveUrl) {
                    setDriveUrl(result.driveUrl);
                  }
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  setDriveError(msg);
                } finally {
                  setDrivePushing(false);
                }
              }}
              title={
                driveError
                  ? `Last push failed: ${driveError}. Click to retry.`
                  : "Upload this variation to Drive as a Google Doc in the client's ad-copy folder."
              }
              aria-label="Send to Drive"
            >
              <span className="form-out-send-drive-glyph">{drivePushing ? "…" : driveError ? "!" : "↑"}</span>
              <span className="form-out-send-drive-text">
                {drivePushing ? "pushing…" : driveError ? "retry drive" : "send to drive"}
              </span>
            </button>
          )
        )}
      </header>
      <textarea
        ref={textareaRef}
        className="form-out-adcopy-body-edit"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setDirty(true);
        }}
        spellCheck
      />
    </article>
  );
}

/* ------------------------------ Subcomponents ----------------------------- */

function PayloadHeader({
  headline,
  summary,
}: {
  headline?: string;
  summary?: string;
}) {
  if (!headline && !summary) return null;
  return (
    <header className="form-out-header">
      {headline && <h2 className="form-out-headline">{headline}</h2>}
      {summary && <p className="form-out-summary">{summary}</p>}
    </header>
  );
}

function EmailCard({ payload }: { payload: EmailPayload }) {
  const subjects = payload.subject_lines ?? [];
  const body = payload.email_body ?? "";
  return (
    <div className="form-out-card">
      {subjects.length > 0 && (
        <section className="form-out-section">
          <div className="form-out-label">Subject lines</div>
          <ul className="form-out-subjects">
            {subjects.map((s, i) => (
              <li key={i}>
                <span className="form-out-subject-index">{String(i + 1).padStart(2, "0")}</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {body && (
        <section className="form-out-section">
          <div className="form-out-label">Body</div>
          <div className="form-out-email-body">
            <MarkdownBody text={body} />
          </div>
        </section>
      )}
    </div>
  );
}

function MessageCard({ body }: { body: string }) {
  if (!body.trim()) return null;
  return (
    <div className="form-out-card">
      <section className="form-out-section">
        <div className="form-out-label">Message</div>
        <div className="form-out-email-body">
          <MarkdownBody text={body} />
        </div>
      </section>
    </div>
  );
}

function HooksCard({ payload }: { payload: HooksPayload }) {
  const angles = payload.angles ?? [];
  const picks = payload.top_picks ?? [];
  let counter = 0;
  return (
    <div className="form-out-card">
      {angles.map((angle, i) => (
        <section key={i} className="form-out-section">
          <div className="form-out-angle-head">
            <span className="form-out-angle-num">Angle {i + 1}</span>
            <span className="form-out-angle-name">{angle.name}</span>
            {angle.category && (
              <span className="form-out-tag">{angle.category.replace(/_/g, " ")}</span>
            )}
          </div>
          <ol className="form-out-hooks" start={counter + 1}>
            {angle.hooks.map((h, j) => {
              counter += 1;
              return (
                <li key={j}>
                  <span className="form-out-hook-index">{counter}.</span>
                  <span>{h}</span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      {picks.length > 0 && (
        <section className="form-out-section form-out-picks">
          <div className="form-out-label">Recommended top picks</div>
          <ul className="form-out-pick-list">
            {picks.map((pick, i) => (
              <li key={i}>
                <div className="form-out-pick-hook">"{pick.hook}"</div>
                {pick.why && <div className="form-out-pick-why">{pick.why}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Build a Meta Ad Library search URL for a competitor name. We don't have
 *  the FB page ID, so this is a keyword search across all advertisers — the
 *  user lands in the library scoped to ads matching this name and can click
 *  through to the actual page. country=ALL keeps the search global since the
 *  agent doesn't always know the client's market. */
function adLibraryUrl(name: string): string {
  const q = encodeURIComponent(name.trim());
  return `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${q}&search_type=keyword_unordered&media_type=all`;
}

function CompetitorCards({ payload }: { payload: CompetitorPayload }) {
  const competitors = payload.competitors ?? [];
  return (
    <div className="form-out-card">
      <div className="form-out-competitor-grid">
        {competitors.map((c, i) => (
          <article key={i} className="form-out-competitor">
            <header className="form-out-competitor-head">
              <span className="form-out-competitor-num">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="form-out-competitor-name">{c.name}</h3>
            </header>
            {c.angle && (
              <div className="form-out-competitor-row">
                <span className="form-out-label-inline">Angle</span>
                <span>{c.angle}</span>
              </div>
            )}
            {c.offer && (
              <div className="form-out-competitor-row">
                <span className="form-out-label-inline">Offer</span>
                <span>{c.offer}</span>
              </div>
            )}
            {c.weakness && (
              <div className="form-out-competitor-row form-out-competitor-weakness">
                <span className="form-out-label-inline">Weakness</span>
                <span>{c.weakness}</span>
              </div>
            )}
            {c.name && (() => {
              // Prefer the agent-verified direct page link; fall back to a
              // keyword search of the Ad Library when the agent couldn't
              // confidently identify the right FB page.
              const direct =
                typeof c.ad_library_url === "string" && c.ad_library_url.startsWith("http")
                  ? c.ad_library_url
                  : null;
              const href = direct ?? adLibraryUrl(c.name);
              const label = direct ? "View ads on Meta Ad Library" : "Search Meta Ad Library";
              const tip = direct
                ? `Direct page link verified by Stratos`
                : `Keyword search for "${c.name}" — agent could not confirm a specific page`;
              return (
                <a
                  className={
                    "form-out-competitor-ad-library" + (direct ? " is-verified" : " is-fallback")
                  }
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  title={tip}
                >
                  <span className="form-out-competitor-ad-library-glyph">↗</span>
                  <span>{label}</span>
                </a>
              );
            })()}
          </article>
        ))}
      </div>
      {payload.white_space && (
        <section className="form-out-section form-out-whitespace">
          <div className="form-out-label">White space</div>
          <p>{payload.white_space}</p>
        </section>
      )}
    </div>
  );
}

function Footnote({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;
  return (
    <aside className="form-out-footnote">
      <div className="form-out-label">Notes from the agent</div>
      <MarkdownBody text={markdown} />
    </aside>
  );
}

/* Try to find a short trailing note from the agent (after the rendered body).
 * The agents frequently end with "Sir — flagged …" or a "One note" disclaimer.
 * We only want to surface that bit, not the whole human-readable duplicate of
 * the JSON. Heuristic: take the last paragraph if it starts with "Sir" or
 * contains "note" / "flag" / "placeholder". Otherwise return empty. */
function extractFootnote(markdown: string): string {
  if (!markdown) return "";
  const paragraphs = markdown.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) return "";
  const last = paragraphs[paragraphs.length - 1];
  if (/^(sir\b|one note|note[: —-]|⚠|warning|caveat)/i.test(last)) return last;
  if (/\bplaceholder\b|\bflag(ged)?\b|\bswap (in|out)\b|\bbefore (you )?send\b/i.test(last)) return last;
  return "";
}

function MarkdownBody({ text }: { text: string }) {
  return (
    <div className="form-out-md">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
