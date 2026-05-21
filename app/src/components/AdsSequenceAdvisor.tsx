/**
 * Ads Sequence Advisor drawer. Slides in from the right of the wizard's active
 * form. On first open per step it fires a single invokeClaude call using the
 * step form's owning agent, with prior step outputs and Profile.md as context,
 * and surfaces 2-3 actionable suggestions for the current step.
 *
 * Stateless across mounts. Caching of per-step suggestions lives in the parent
 * (AdsSequenceWizard) so closing/reopening the drawer doesn't re-fire.
 */

import { useEffect, useRef, useState } from "react";
import { api } from "../lib/tauri";
import { getFormConfig } from "../lib/formConfigs";
import {
  MEDIA_BUYING_SEQUENCE,
  type SequenceState,
  type SequenceStep,
  type SequenceStepId,
} from "../lib/mediaBuyingSequence";
import { readAggregatedCompetitorIntel } from "../lib/competitorIntel";
import type { AgentSummary } from "../lib/types";

export type AdvisorSuggestion = {
  bullets: string[];
  generatedAt: string;
};

type Props = {
  open: boolean;
  step: SequenceStep;
  root: string;
  clientName: string;
  clientSlug: string;
  agents: AgentSummary[];
  sequenceState: SequenceState;
  cached: AdvisorSuggestion | null;
  onCache: (stepId: SequenceStepId, value: AdvisorSuggestion) => void;
  onClose: () => void;
};

function findAgent(agents: AgentSummary[], slug: string): AgentSummary | null {
  const lc = slug.toLowerCase();
  return (
    agents.find((a) => a.slug.toLowerCase() === lc) ??
    agents.find((a) => a.name.toLowerCase() === lc) ??
    null
  );
}

/** Parse 1-N bullet points out of a Claude response. Accepts "- ", "* ", or
 *  "1. " style lists, plus plain newline-separated lines if no markers found. */
function parseBullets(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const markerRe = /^\s*(?:[-*]|\d+[\.\)])\s+(.+)$/gm;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = markerRe.exec(trimmed)) !== null) {
    const t = m[1].trim();
    if (t) matches.push(t);
  }
  if (matches.length > 0) return matches;
  return trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** Read the markdown body of a saved sequence step. Best-effort, returns
 *  empty string on failure so the advisor degrades gracefully. */
async function readStepBody(
  root: string,
  state: SequenceState,
  stepId: SequenceStepId,
): Promise<string> {
  const rec = state.stepOutputs[stepId];
  if (!rec?.path) return "";
  try {
    const note = await api.readVaultNote(root, rec.path);
    return note?.body ?? "";
  } catch {
    return "";
  }
}

/** Truncate long context blocks so the advisor prompt stays cheap. Each
 *  prior step gets at most ~2k chars; Profile.md gets ~3k. The model still
 *  sees enough to ground the bullets without paying for full novels. */
function truncate(body: string, max: number): string {
  if (body.length <= max) return body;
  return body.slice(0, max) + "\n…[truncated]";
}

export function AdsSequenceAdvisor({
  open,
  step,
  root,
  clientName,
  clientSlug,
  agents,
  sequenceState,
  cached,
  onCache,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<AdvisorSuggestion | null>(cached);
  const inFlightFor = useRef<SequenceStepId | null>(null);

  useEffect(() => {
    setSuggestion(cached);
  }, [cached, step.id]);

  const formConfig = getFormConfig(step.formId);

  const runAdvisor = async (forceRefresh: boolean) => {
    if (!formConfig) {
      setError("This step has no form config — advisor unavailable.");
      return;
    }
    const agent = findAgent(agents, formConfig.agentSlug);
    if (!agent) {
      setError(`Agent "${formConfig.agentSlug}" not found in /agents.`);
      return;
    }
    if (inFlightFor.current === step.id && !forceRefresh) return;
    inFlightFor.current = step.id;
    setLoading(true);
    setError(null);

    try {
      const agentBody = await api.readAgentBody(root, agent.slug);

      // Best-effort Profile.md read. Path mirrors profilePathFor() but we
      // pass through the vault note API so it respects the same root.
      let profileBody = "";
      try {
        const note = await api.readVaultNote(
          root,
          `Clients/${clientName}/Profile.md`,
        );
        profileBody = note?.body ?? "";
      } catch {
        profileBody = "";
      }

      // Gather every COMPLETED prior step's saved body, in sequence order.
      // Skipped steps contribute nothing.
      const priorBlocks: string[] = [];
      for (const s of MEDIA_BUYING_SEQUENCE) {
        if (s.id === step.id) break;
        const rec = sequenceState.stepOutputs[s.id];
        if (!rec?.path) continue;
        const body = await readStepBody(root, sequenceState, s.id);
        if (body.trim().length === 0) continue;
        priorBlocks.push(
          `### Prior step · ${s.label}\n\n${truncate(body, 2000)}`,
        );
      }

      const priorsText =
        priorBlocks.length > 0
          ? priorBlocks.join("\n\n---\n\n")
          : "(No prior step outputs yet. Lean on Profile.md and your own knowledge.)";

      const profileText = profileBody.trim().length > 0
        ? truncate(profileBody, 3000)
        : "(No Profile.md content available.)";

      // Competitor research lives outside MEDIA_BUYING_SEQUENCE (Phase 3
      // Technical Setup form). Pull the latest saved brief as side context so
      // every advisor run can reason against it. Null = nothing saved yet.
      const competitorIntel = await readAggregatedCompetitorIntel(root, clientSlug);
      const competitorBlock = competitorIntel
        ? truncate(competitorIntel, 4000)
        : "(No competitor research saved yet for this client.)";

      const prompt = [
        `You are ${agent.name}.`,
        "",
        agentBody.trim(),
        "",
        "---",
        "",
        `# Advisor mode · ${step.label}`,
        "",
        `Jake is about to fill out the "${step.label}" form for ${clientName}.`,
        `Hint shown on the form: ${step.hint}`,
        "",
        "Your job: surface 2-3 specific, actionable suggestions that should",
        "shape how he fills this form. Ground every bullet in the priors below",
        "or in your own domain knowledge. No fluff, no restating what he",
        "already knows. If the priors flag a winning angle, lean on it. If",
        "there's a gap you'd push on, say so.",
        "",
        "Constraints:",
        "- 2-3 bullets, max ~25 words each",
        "- Lead each bullet with a verb (Lean, Skip, Push, Test, etc.)",
        "- Cite the source (e.g. 'audience research flagged…') when grounded",
        "- No em dashes anywhere",
        "- Output ONLY the bullets, one per line, prefixed with '- '. No",
        "  preamble, no closing summary, no headers.",
        "",
        "---",
        "",
        "## Client Profile",
        "",
        profileText,
        "",
        "---",
        "",
        "## Competitor research",
        "",
        competitorBlock,
        "",
        "---",
        "",
        "## Prior step outputs",
        "",
        priorsText,
      ].join("\n");

      const id = crypto.randomUUID();
      const raw = await api.invokeClaude(id, prompt);
      const bullets = parseBullets(raw);
      if (bullets.length === 0) {
        setError("Advisor returned no bullets. Try Refresh.");
        return;
      }
      const value: AdvisorSuggestion = {
        bullets,
        generatedAt: new Date().toISOString(),
      };
      setSuggestion(value);
      onCache(step.id, value);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      inFlightFor.current = null;
    }
  };

  // Auto-fire on first open if we don't have a cached suggestion for this step.
  useEffect(() => {
    if (!open) return;
    if (cached) return;
    if (loading) return;
    void runAdvisor(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step.id]);

  if (!open) return null;

  return (
    <>
      <div className="advisor-scrim" onClick={onClose} />
      <aside
        className="advisor-drawer"
        role="dialog"
        aria-label={`${step.label} advisor`}
      >
        <header className="advisor-head">
          <div>
            <div className="advisor-eyebrow">
              ▸ {formConfig?.agentName ?? "Advisor"}
            </div>
            <h3 className="advisor-title">{step.label}</h3>
          </div>
          <button
            type="button"
            className="advisor-close"
            onClick={onClose}
            aria-label="Close advisor"
          >
            ×
          </button>
        </header>

        <div className="advisor-body">
          {loading && (
            <div className="advisor-loading">
              <div className="advisor-spinner" />
              <span>Reading priors and thinking…</span>
            </div>
          )}

          {!loading && error && (
            <div className="advisor-error">
              <p>{error}</p>
              <button
                type="button"
                className="advisor-ghost"
                onClick={() => void runAdvisor(true)}
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && suggestion && (
            <>
              <ul className="advisor-bullets">
                {suggestion.bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
              <div className="advisor-meta">
                Generated {new Date(suggestion.generatedAt).toLocaleTimeString()}
              </div>
            </>
          )}

          {!loading && !error && !suggestion && (
            <div className="advisor-empty">
              No suggestions yet. Click Refresh.
            </div>
          )}
        </div>

        <footer className="advisor-foot">
          <button
            type="button"
            className="advisor-ghost"
            onClick={() => void runAdvisor(true)}
            disabled={loading}
            title="Re-run the advisor with the latest prior outputs"
          >
            ⟳ Refresh
          </button>
        </footer>
      </aside>

      <style>{ADVISOR_CSS}</style>
    </>
  );
}

const ADVISOR_CSS = `
.advisor-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 1090;
  animation: advisor-fade 160ms ease;
}
.advisor-drawer {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 92vw);
  background: var(--hml-bg-elev-1);
  border-left: 1px solid var(--hml-border-subtle);
  box-shadow: -16px 0 48px -16px rgba(0, 0, 0, 0.45);
  z-index: 1095;
  display: flex;
  flex-direction: column;
  animation: advisor-slide 220ms cubic-bezier(.32,.72,.32,1);
  font-family: var(--hml-font-sans);
  color: var(--hml-text-primary);
}
@keyframes advisor-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes advisor-slide {
  from { transform: translateX(24px); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

.advisor-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 22px 22px 16px;
  border-bottom: 1px solid var(--hml-border-subtle);
}
.advisor-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--hml-accent);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.advisor-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--hml-text-primary);
}
.advisor-close {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  background: transparent;
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease;
}
.advisor-close:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}

.advisor-body {
  flex: 1;
  overflow-y: auto;
  padding: 18px 22px;
}

.advisor-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-tertiary);
  padding: 8px 0;
}
.advisor-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--hml-border);
  border-top-color: var(--hml-accent);
  animation: advisor-spin 0.9s linear infinite;
}
@keyframes advisor-spin {
  to { transform: rotate(360deg); }
}

.advisor-bullets {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.advisor-bullets li {
  position: relative;
  padding: 12px 14px 12px 32px;
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--hml-text-primary);
}
.advisor-bullets li::before {
  content: "▸";
  position: absolute;
  left: 12px;
  top: 12px;
  color: var(--hml-accent);
  font-family: var(--hml-font-mono);
  font-size: 12px;
}

.advisor-meta {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-text-quaternary);
  letter-spacing: 0.04em;
  margin-top: 14px;
}

.advisor-error {
  padding: 14px;
  background: var(--hml-red-bg, var(--hml-bg-elev-2));
  border: 1px solid var(--hml-red-border, var(--hml-border));
  border-radius: 8px;
  color: var(--hml-red, var(--hml-text-secondary));
  font-size: 12.5px;
}
.advisor-error p { margin: 0 0 10px; }

.advisor-empty {
  font-family: var(--hml-font-mono);
  font-size: 12px;
  color: var(--hml-text-tertiary);
  padding: 8px 0;
}

.advisor-foot {
  padding: 14px 22px 18px;
  border-top: 1px solid var(--hml-border-subtle);
  display: flex;
  justify-content: flex-end;
}
.advisor-ghost {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  cursor: pointer;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.advisor-ghost:hover:not(:disabled) {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
  background: var(--hml-bg-elev-2);
}
.advisor-ghost:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
`;

export default AdsSequenceAdvisor;
