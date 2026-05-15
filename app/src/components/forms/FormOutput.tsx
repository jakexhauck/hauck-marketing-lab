import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { GeneratorKind } from "../../lib/types";
import {
  asCompetitorPayload,
  asEmailPayload,
  asHooksPayload,
  asMessagePayload,
  cleanStreamingText,
  payloadHeader,
  splitFormBody,
  type CompetitorPayload,
  type EmailPayload,
  type HooksPayload,
} from "../../lib/formOutput";
import "./form-output.css";

interface FormOutputProps {
  body: string;
  kind: GeneratorKind;
  /** When true, render in streaming mode (hide in-flight JSON, no card chrome). */
  streaming?: boolean;
  /** Show the parsed headline + summary above the layout (default true). */
  showHeader?: boolean;
}

export function FormOutput({
  body,
  kind,
  streaming = false,
  showHeader = true,
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
