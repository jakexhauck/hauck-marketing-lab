/**
 * Phase1CascadeModal — Day-0 cascade. Bulk-runs every form-backed step in
 * parallel via Promise.all, surfaces drafts in collapsible cards, lets Jake
 * approve each (or all) and dispatches via Gmail draft / Google Calendar /
 * clipboard. Failures isolate to their card; the rest of the cascade keeps
 * moving.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../lib/tauri";
import {
  defaultValuesFor,
  getFormConfig,
  type FormConfig,
  type FormValues,
} from "../lib/formConfigs";
import { assembleGenericPrompt } from "../lib/genericPrompt";
import {
  parseProfileBody,
  profilePathFor,
  type ProfileFormValues,
} from "../lib/clientProfile";
import type { AgentSummary, ClientEntry, OnboardingState } from "../lib/types";
import { logActivity } from "../lib/activity";
import {
  PHASE_1_CASCADE,
  type CascadeStep,
  type CascadeAction,
} from "../lib/cascades";

type StepStatus =
  | "pending"
  | "generating"
  | "ready"
  | "approved"
  | "sending"
  | "sent"
  | "skipped"
  | "error";

interface StepState {
  status: StepStatus;
  draft: string;
  subject: string | null;
  error: string | null;
  expanded: boolean;
}

interface Props {
  root: string;
  client: ClientEntry;
  agents: AgentSummary[];
  /** Optional intake form URL to copy for the intake-form-share step. */
  intakeFormUrl?: string;
  onClose: () => void;
}

const SUBJECT_RE = /^\s*subject\s*[:\-]\s*(.+)$/im;

function extractSubject(body: string): string | null {
  const json = extractJson(body);
  if (json) {
    const subjects = json.subject_lines as unknown;
    if (Array.isArray(subjects) && subjects.length > 0 && typeof subjects[0] === "string") {
      return subjects[0];
    }
    if (typeof json.subject === "string") return json.subject;
  }
  const m = body.match(SUBJECT_RE);
  return m ? m[1].trim() : null;
}

function extractJson(src: string): Record<string, unknown> | null {
  const startIdx = src.indexOf("```json");
  if (startIdx === -1) return null;
  const after = src.slice(startIdx + "```json".length).replace(/^\n/, "");
  const endIdx = after.indexOf("```");
  if (endIdx === -1) return null;
  try {
    return JSON.parse(after.slice(0, endIdx).trim()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Best-effort body extraction: prefers email_body from JSON, falls back to
 *  everything after the json fence, falls back to the whole draft. */
function extractEmailBody(body: string): string {
  const json = extractJson(body);
  if (json && typeof json.email_body === "string") return json.email_body;
  const closeIdx = body.indexOf("```", body.indexOf("```json") + 1);
  if (closeIdx >= 0) {
    const tail = body.slice(closeIdx + 3).trim();
    if (tail.length > 0) return tail;
  }
  return body.trim();
}

async function loadProfileValues(
  root: string,
  client: ClientEntry,
): Promise<ProfileFormValues | null> {
  try {
    const note = await api.readVaultNote(root, profilePathFor(root, client));
    if (!note?.body) return null;
    return parseProfileBody(note.body);
  } catch {
    return null;
  }
}

function buildFormValues(
  config: FormConfig,
  profile: ProfileFormValues | null,
): FormValues {
  const values = defaultValuesFor(config);
  const mapping = config.prefillFromProfile;
  if (mapping && profile) {
    for (const [fieldKey, profileKey] of Object.entries(mapping)) {
      if (!profileKey) continue;
      const v = profile[profileKey as keyof ProfileFormValues];
      if (typeof v === "string" && v.trim().length > 0) values[fieldKey] = v;
    }
  }
  return values;
}

/** Compose the Gmail-draft instruction we hand to claude -p. The MCP tool
 *  inherited from this app's claude session can create the draft directly. */
function gmailDraftPrompt(opts: {
  to: string | null;
  subject: string;
  body: string;
}): string {
  const to = opts.to?.trim() || "[client email]";
  return [
    "Create a Gmail draft using the claude.ai Gmail MCP (tool: create_draft).",
    `To: ${to}`,
    `Subject: ${opts.subject}`,
    "",
    "Body (use exactly as-is, do not edit):",
    "---",
    opts.body,
    "---",
    "",
    "Return only a one-line confirmation: 'draft created' or the MCP error message.",
  ].join("\n");
}

export function Phase1CascadeModal({
  root,
  client,
  agents,
  intakeFormUrl,
  onClose,
}: Props) {
  const [stepState, setStepState] = useState<Record<string, StepState>>(() => {
    const init: Record<string, StepState> = {};
    for (const step of PHASE_1_CASCADE.steps) {
      init[step.id] = {
        status: "pending",
        draft: "",
        subject: null,
        error: null,
        expanded: false,
      };
    }
    return init;
  });
  const [phase, setPhase] = useState<"running" | "review">("running");
  const startedRef = useRef(false);

  const update = useCallback((id: string, patch: Partial<StepState>) => {
    setStepState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  const runStep = useCallback(
    async (step: CascadeStep, profile: ProfileFormValues | null) => {
      if (!step.formId) {
        update(step.id, {
          status: "ready",
          draft: descriptionForActionOnly(step, client, intakeFormUrl),
          subject: null,
        });
        return;
      }
      const config = getFormConfig(step.formId);
      if (!config) {
        update(step.id, {
          status: "error",
          error: `Form config not found: ${step.formId}`,
        });
        return;
      }
      update(step.id, { status: "generating" });
      try {
        const agent = agents.find(
          (a) => a.slug.toLowerCase() === config.agentSlug.toLowerCase(),
        );
        let agentBody = "";
        if (agent) {
          try {
            agentBody = await api.readAgentBody(root, agent.slug);
          } catch {
            agentBody = "";
          }
        }
        const values = buildFormValues(config, profile);
        const prompt = assembleGenericPrompt({
          config,
          values,
          agentBody,
          clientName: client.name,
          driveContext: null,
        });
        const id = crypto.randomUUID();
        const out = await api.invokeClaude(id, prompt);
        const text = (out || "").trim();
        if (!text) {
          update(step.id, {
            status: "error",
            error: "Generation returned empty. Try again or open the form to edit.",
          });
          return;
        }
        update(step.id, {
          status: "ready",
          draft: text,
          subject: extractSubject(text),
        });
      } catch (e) {
        update(step.id, { status: "error", error: String(e) });
      }
    },
    [agents, root, client, intakeFormUrl, update],
  );

  // Kick off all cascade steps in parallel exactly once on mount.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      const profile = await loadProfileValues(root, client);
      await Promise.all(PHASE_1_CASCADE.steps.map((s) => runStep(s, profile)));
      setPhase("review");
    })();
  }, [root, client, runStep]);

  const tickChecklist = useCallback(
    async (taskId: string) => {
      try {
        const state: OnboardingState = await api.readOnboardingState(root, client.slug);
        const done = new Set(state.done ?? []);
        if (done.has(taskId)) return;
        done.add(taskId);
        await api.writeOnboardingState(root, client.slug, {
          ...state,
          done: Array.from(done),
        });
      } catch (e) {
        console.warn("cascade: auto-tick failed", taskId, e);
      }
    },
    [root, client.slug],
  );

  const dispatchStep = useCallback(
    async (step: CascadeStep) => {
      const s = stepState[step.id];
      if (!s || s.status === "sent" || s.status === "sending") return;
      update(step.id, { status: "sending", error: null });
      try {
        await runAction(step, s.draft, s.subject, { client, intakeFormUrl });
        await logActivity(root, {
          type: "outreach.sent",
          summary: step.activitySummary + `: ${client.name}`,
          clientSlug: client.slug,
          meta: { cascade: PHASE_1_CASCADE.id, step: step.id },
        });
        if (step.checklistTaskId) void tickChecklist(step.checklistTaskId);
        update(step.id, { status: "sent" });
      } catch (e) {
        update(step.id, { status: "error", error: String(e) });
      }
    },
    [stepState, root, client, intakeFormUrl, tickChecklist, update],
  );

  const approveStep = useCallback(
    (step: CascadeStep) => {
      const s = stepState[step.id];
      if (!s || s.status !== "ready") return;
      update(step.id, { status: "approved" });
      void dispatchStep(step);
    },
    [stepState, dispatchStep, update],
  );

  const approveAll = useCallback(() => {
    for (const step of PHASE_1_CASCADE.steps) {
      const s = stepState[step.id];
      if (s?.status === "ready") {
        update(step.id, { status: "approved" });
        void dispatchStep(step);
      }
    }
  }, [stepState, dispatchStep, update]);

  const skipStep = useCallback(
    (step: CascadeStep) => {
      update(step.id, { status: "skipped", error: null });
    },
    [update],
  );

  const counts = useMemo(() => {
    const c = { pending: 0, generating: 0, ready: 0, approved: 0, sending: 0, sent: 0, skipped: 0, error: 0 };
    for (const step of PHASE_1_CASCADE.steps) {
      const s = stepState[step.id];
      if (!s) continue;
      c[s.status]++;
    }
    return c;
  }, [stepState]);

  const allTerminal = useMemo(
    () =>
      PHASE_1_CASCADE.steps.every((step) => {
        const s = stepState[step.id]?.status;
        return s === "sent" || s === "skipped" || s === "error";
      }),
    [stepState],
  );

  return (
    <div className="hml-modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="hml-modal hml-cascade-modal" role="dialog" aria-modal="true">
        <header className="hml-cascade-head">
          <div>
            <div className="hml-cascade-eyebrow">▸ {PHASE_1_CASCADE.title.toUpperCase()} · {client.name.toUpperCase()}</div>
            <h2 className="hml-cascade-title">{PHASE_1_CASCADE.title}</h2>
            <div className="hml-cascade-sub">{PHASE_1_CASCADE.subtitle}</div>
          </div>
          <button
            type="button"
            className="hml-btn"
            onClick={onClose}
            aria-label="Close cascade"
          >
            Close
          </button>
        </header>

        <div className="hml-cascade-counts">
          {phase === "running" && counts.generating > 0 && (
            <span>Drafting · {counts.generating} of {PHASE_1_CASCADE.steps.length}</span>
          )}
          {phase === "review" && (
            <>
              <span>Ready · {counts.ready}</span>
              <span>Sent · {counts.sent}</span>
              {counts.error > 0 && <span className="hml-cascade-err">Failed · {counts.error}</span>}
              {counts.skipped > 0 && <span>Skipped · {counts.skipped}</span>}
            </>
          )}
        </div>

        <div className="hml-cascade-body">
          {PHASE_1_CASCADE.steps.map((step) => (
            <CascadeCard
              key={step.id}
              step={step}
              state={stepState[step.id]}
              onToggle={() =>
                update(step.id, { expanded: !stepState[step.id]?.expanded })
              }
              onApprove={() => approveStep(step)}
              onSkip={() => skipStep(step)}
              onRetry={() =>
                void (async () => {
                  const profile = await loadProfileValues(root, client);
                  await runStep(step, profile);
                })()
              }
            />
          ))}
        </div>

        <footer className="hml-cascade-foot">
          <button
            type="button"
            className="os-primary"
            onClick={approveAll}
            disabled={counts.ready === 0}
          >
            Approve all ready ({counts.ready})
          </button>
          <span style={{ flex: 1 }} />
          {allTerminal && (
            <button type="button" className="hml-btn" onClick={onClose}>
              Done
            </button>
          )}
        </footer>

        <style>{CASCADE_CSS}</style>
      </div>
    </div>
  );
}

function CascadeCard({
  step,
  state,
  onToggle,
  onApprove,
  onSkip,
  onRetry,
}: {
  step: CascadeStep;
  state: StepState | undefined;
  onToggle: () => void;
  onApprove: () => void;
  onSkip: () => void;
  onRetry: () => void;
}) {
  if (!state) return null;
  const expanded = state.expanded;
  return (
    <section className={`hml-cascade-card hml-cascade-${state.status}`}>
      <header className="hml-cascade-card-head" onClick={onToggle}>
        <div className="hml-cascade-card-title">
          <StatusDot status={state.status} />
          <div>
            <div className="hml-cascade-card-eyebrow">{step.meta}</div>
            <div className="hml-cascade-card-label">{step.label}</div>
          </div>
        </div>
        <div className="hml-cascade-card-meta">
          <StatusBadge status={state.status} />
          <button
            type="button"
            className="hml-btn hml-cascade-toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >
            {expanded ? "Collapse" : "Preview"}
          </button>
        </div>
      </header>

      {expanded && (
        <div className="hml-cascade-preview">
          {state.error ? (
            <div className="os-error">{state.error}</div>
          ) : state.status === "generating" ? (
            <div className="hml-dim">Drafting…</div>
          ) : state.draft ? (
            <pre className="hml-cascade-draft">{state.draft}</pre>
          ) : (
            <div className="hml-dim">No draft yet.</div>
          )}
        </div>
      )}

      <div className="hml-cascade-card-actions">
        {state.status === "ready" && (
          <>
            <button type="button" className="os-primary" onClick={onApprove}>
              Approve {actionVerb(step.action)}
            </button>
            <button type="button" className="hml-btn" onClick={onSkip}>
              Skip
            </button>
          </>
        )}
        {state.status === "error" && (
          <>
            <button type="button" className="hml-btn" onClick={onRetry}>
              Retry
            </button>
            <button type="button" className="hml-btn" onClick={onSkip}>
              Skip
            </button>
          </>
        )}
        {state.status === "sent" && (
          <span className="hml-dim">✓ Done</span>
        )}
        {state.status === "skipped" && (
          <span className="hml-dim">Skipped</span>
        )}
      </div>
    </section>
  );
}

function actionVerb(action: CascadeAction): string {
  switch (action) {
    case "gmail-draft":
      return "and create draft";
    case "calendar-invite":
      return "and create event";
    case "copy-link":
      return "and copy link";
    case "manual":
      return "and save";
  }
}

function StatusDot({ status }: { status: StepStatus }) {
  const color = {
    pending: "#6b7280",
    generating: "#a3a3a3",
    ready: "var(--hml-accent, #6aa9ff)",
    approved: "#f59e0b",
    sending: "#f59e0b",
    sent: "#22c55e",
    skipped: "#6b7280",
    error: "#ef4444",
  }[status];
  return <span className="hml-cascade-dot" style={{ background: color }} />;
}

function StatusBadge({ status }: { status: StepStatus }) {
  const label: Record<StepStatus, string> = {
    pending: "Pending",
    generating: "Drafting",
    ready: "Ready",
    approved: "Approved",
    sending: "Sending",
    sent: "Sent",
    skipped: "Skipped",
    error: "Error",
  };
  return <span className={`hml-cascade-badge hml-cascade-badge-${status}`}>{label[status]}</span>;
}

function descriptionForActionOnly(
  step: CascadeStep,
  client: ClientEntry,
  intakeFormUrl?: string,
): string {
  switch (step.id) {
    case "kickoff-invite":
      return [
        "Kickoff onboarding call with " + client.name + ".",
        "30 minutes. Calendar invite will be created on your Google Calendar with a default time of 3 days from now at 10:00 (your local time).",
        "Edit time after creating if needed.",
      ].join("\n");
    case "intake-form-share":
      return [
        "Intake form link to share with " + client.name + ":",
        intakeFormUrl || "https://intake.hauckmarketing.com/",
        "Approving copies the link to your clipboard.",
      ].join("\n");
    default:
      return step.label;
  }
}

async function runAction(
  step: CascadeStep,
  draft: string,
  subject: string | null,
  ctx: { client: ClientEntry; intakeFormUrl?: string },
): Promise<void> {
  if (step.action === "gmail-draft") {
    const body = extractEmailBody(draft);
    const sub = subject || `${step.label}: ${ctx.client.name}`;
    const prompt = gmailDraftPrompt({ to: null, subject: sub, body });
    const id = crypto.randomUUID();
    await api.invokeClaude(id, prompt);
    return;
  }
  if (step.action === "calendar-invite") {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1000);
    await api.googleCalendarCreateEvent({
      title: `Kickoff call: ${ctx.client.name}`,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      description:
        "Phase 1 kickoff. Set during cascade. Reschedule via Google Calendar if needed.",
      allDay: false,
    });
    return;
  }
  if (step.action === "copy-link") {
    const url = ctx.intakeFormUrl || "https://intake.hauckmarketing.com/";
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      throw new Error("Could not access clipboard. Copy manually: " + url);
    }
    return;
  }
  // manual: just mark as sent — Jake saves/sends elsewhere.
}

const CASCADE_CSS = `
.hml-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  z-index: 1000;
  padding: 40px 20px;
  overflow-y: auto;
}
.hml-modal.hml-cascade-modal {
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border);
  border-radius: 12px;
  width: 100%;
  max-width: 880px;
  padding: 22px 24px 18px;
  color: var(--hml-text-primary);
  display: flex;
  flex-direction: column;
  gap: 14px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
}
.hml-cascade-head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  justify-content: space-between;
}
.hml-cascade-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--hml-text-tertiary);
}
.hml-cascade-title {
  font-size: 22px;
  margin: 4px 0 2px;
  font-weight: 600;
}
.hml-cascade-sub {
  color: var(--hml-text-secondary);
  font-size: 13px;
}
.hml-cascade-counts {
  display: flex;
  gap: 14px;
  font-family: var(--hml-font-mono);
  font-size: 11.5px;
  color: var(--hml-text-secondary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.hml-cascade-counts .hml-cascade-err { color: #ef4444; }
.hml-cascade-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 4px;
}
.hml-cascade-card {
  border: 1px solid var(--hml-border-subtle);
  border-radius: 8px;
  padding: 12px 14px;
  background: var(--hml-bg-elev-2, rgba(255,255,255,0.02));
}
.hml-cascade-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  cursor: pointer;
}
.hml-cascade-card-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.hml-cascade-card-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--hml-text-tertiary);
  text-transform: uppercase;
}
.hml-cascade-card-label {
  font-size: 14px;
  font-weight: 600;
}
.hml-cascade-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.hml-cascade-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.hml-cascade-badge {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--hml-border-subtle);
  color: var(--hml-text-secondary);
}
.hml-cascade-badge-sent { color: #22c55e; border-color: rgba(34,197,94,0.5); }
.hml-cascade-badge-error { color: #ef4444; border-color: rgba(239,68,68,0.5); }
.hml-cascade-badge-ready { color: var(--hml-accent); border-color: var(--hml-accent-border, rgba(106,169,255,0.5)); }
.hml-cascade-badge-generating { color: #a3a3a3; }
.hml-cascade-badge-sending { color: #f59e0b; border-color: rgba(245,158,11,0.5); }
.hml-cascade-toggle { padding: 4px 10px; font-size: 11px; }
.hml-cascade-preview {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--hml-bg-base, rgba(0,0,0,0.2));
  border: 1px solid var(--hml-border-subtle);
  border-radius: 6px;
}
.hml-cascade-draft {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--hml-font-sans);
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--hml-text-secondary);
  margin: 0;
  max-height: 260px;
  overflow-y: auto;
}
.hml-cascade-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  align-items: center;
}
.hml-cascade-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--hml-border-subtle);
}
.hml-dim {
  color: var(--hml-text-tertiary);
  font-size: 12px;
}
`;
