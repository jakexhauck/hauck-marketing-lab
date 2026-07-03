import { useState, type FormEvent } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import type { ConstraintStep, PillarConstraint } from "../../lib/api";
import {
  addConstraintStep,
  buildConstraintPayload,
  type ConstraintFormState,
  reorderConstraintStep,
  removeConstraintStep,
  severityWord,
  sortSteps,
  stepStatusWord,
  toFormState,
} from "../../lib/adminCommand";
import { useSaveConstraintMutation } from "../../hooks/useApi";

// The Theory-of-Constraints spotlight card: severity chip, title, metric,
// detail, impact, and the ordered Identify/Exploit/Subordinate/Elevate/Repeat
// attack plan. Shared by the Command board's flow lanes (via SeverityChip),
// the Service Delivery overview, and every generic pillar page so the
// constraint/attack-plan rendering lives in exactly one place.
//
// Presentational when `editable` is unset/false: takes a resolved
// PillarConstraint and renders it, no data fetching, no loading/error/empty
// handling (the caller owns that, since the empty-state copy differs per
// page). When `editable` is true, an Edit button swaps the card into an
// inline form (Task 4.2) that saves via useSaveConstraintMutation.

const SEVERITIES: PillarConstraint["severity"][] = ["high", "med", "low"];
const STEP_TYPES = ["Identify", "Exploit", "Subordinate", "Elevate", "Repeat"];
const STEP_STATUSES: ConstraintStep["status"][] = ["todo", "doing", "done"];

export function SeverityChip({ severity }: { severity: PillarConstraint["severity"] }) {
  return <span className={`pk-sev-chip pk-sev-chip-${severity}`}>{severityWord(severity)}</span>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function ConstraintPanel({
  constraint,
  editable = false,
}: {
  constraint: PillarConstraint;
  editable?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState<ConstraintFormState | null>(null);
  const saveMutation = useSaveConstraintMutation();

  function startEdit() {
    setForm(toFormState(constraint));
    saveMutation.reset();
    setIsEditing(true);
  }

  function cancelEdit() {
    setForm(null);
    saveMutation.reset();
    setIsEditing(false);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    saveMutation.mutate(buildConstraintPayload(form), {
      onSuccess: () => {
        setForm(null);
        setIsEditing(false);
      },
      // On error the mutation's own isError/error state renders below; the
      // form and its edits stay exactly as the admin left them.
    });
  }

  if (editable && isEditing && form) {
    const saving = saveMutation.isPending;
    return (
      <div className="pk-card pk-constraint-card">
        <form className="pk-form" onSubmit={handleSubmit}>
          <div className="pk-field">
            <label htmlFor="ct-title">Title</label>
            <input
              id="ct-title"
              className="pk-input"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              disabled={saving}
              required
            />
          </div>

          <div className="pk-field-row">
            <div className="pk-field">
              <label htmlFor="ct-severity">Severity</label>
              <select
                id="ct-severity"
                className="pk-select"
                value={form.severity}
                disabled={saving}
                onChange={(e) =>
                  setForm({ ...form, severity: e.target.value as PillarConstraint["severity"] })
                }
              >
                {SEVERITIES.map((sev) => (
                  <option key={sev} value={sev}>
                    {severityWord(sev)}
                  </option>
                ))}
              </select>
            </div>
            <div className="pk-field">
              <label htmlFor="ct-metric">Metric</label>
              <input
                id="ct-metric"
                className="pk-input"
                value={form.metric}
                disabled={saving}
                onChange={(e) => setForm({ ...form, metric: e.target.value })}
              />
            </div>
          </div>

          <div className="pk-field-row">
            <div className="pk-field">
              <label htmlFor="ct-throughput-val">Throughput value</label>
              <input
                id="ct-throughput-val"
                className="pk-input"
                value={form.throughputVal}
                disabled={saving}
                onChange={(e) => setForm({ ...form, throughputVal: e.target.value })}
              />
            </div>
            <div className="pk-field">
              <label htmlFor="ct-throughput-label">Throughput label</label>
              <input
                id="ct-throughput-label"
                className="pk-input"
                value={form.throughputLabel}
                disabled={saving}
                onChange={(e) => setForm({ ...form, throughputLabel: e.target.value })}
              />
            </div>
          </div>

          <div className="pk-field">
            <label htmlFor="ct-detail">Detail</label>
            <textarea
              id="ct-detail"
              className="pk-textarea"
              value={form.detail}
              disabled={saving}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
            />
          </div>

          <div className="pk-field">
            <label htmlFor="ct-impact">Impact</label>
            <textarea
              id="ct-impact"
              className="pk-textarea"
              value={form.impact}
              disabled={saving}
              onChange={(e) => setForm({ ...form, impact: e.target.value })}
            />
          </div>

          <label className="pk-checkbox-row">
            <input
              type="checkbox"
              checked={form.isSystem}
              disabled={saving}
              onChange={(e) => setForm({ ...form, isSystem: e.target.checked })}
            />
            <span>
              This is the governing system constraint
              <div className="pk-checkbox-hint">Turning this on clears it from every other pillar.</div>
            </span>
          </label>

          <div className="pk-constraint-steps-h">
            Attack plan &middot; Identify &rarr; Exploit &rarr; Subordinate &rarr; Elevate &rarr;
            Repeat
          </div>

          <div className="pk-step-edit-list">
            {form.steps.map((s, i) => (
              <div className="pk-step-edit-row" key={i}>
                <div className="pk-step-reorder">
                  <button
                    type="button"
                    aria-label="Move step up"
                    disabled={saving || i === 0}
                    onClick={() =>
                      setForm({ ...form, steps: reorderConstraintStep(form.steps, i, "up") })
                    }
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label="Move step down"
                    disabled={saving || i === form.steps.length - 1}
                    onClick={() =>
                      setForm({ ...form, steps: reorderConstraintStep(form.steps, i, "down") })
                    }
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                <div className="pk-step-fields">
                  <select
                    className="pk-select"
                    aria-label="Step type"
                    value={s.step}
                    disabled={saving}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        steps: form.steps.map((row, ri) =>
                          ri === i ? { ...row, step: e.target.value } : row,
                        ),
                      })
                    }
                  >
                    {STEP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    className="pk-input"
                    aria-label="Action"
                    placeholder="Action"
                    value={s.action}
                    disabled={saving}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        steps: form.steps.map((row, ri) =>
                          ri === i ? { ...row, action: e.target.value } : row,
                        ),
                      })
                    }
                  />
                  <input
                    className="pk-input"
                    aria-label="Owner"
                    placeholder="Owner"
                    value={s.owner ?? ""}
                    disabled={saving}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        steps: form.steps.map((row, ri) =>
                          ri === i ? { ...row, owner: e.target.value } : row,
                        ),
                      })
                    }
                  />
                  <select
                    className="pk-select"
                    aria-label="Status"
                    value={s.status}
                    disabled={saving}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        steps: form.steps.map((row, ri) =>
                          ri === i
                            ? { ...row, status: e.target.value as ConstraintStep["status"] }
                            : row,
                        ),
                      })
                    }
                  >
                    {STEP_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {stepStatusWord(st)}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  className="pk-step-del"
                  aria-label="Delete step"
                  disabled={saving}
                  onClick={() =>
                    setForm({ ...form, steps: removeConstraintStep(form.steps, i) })
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            className="pk-add-step-btn"
            disabled={saving}
            onClick={() => setForm({ ...form, steps: addConstraintStep(form.steps) })}
          >
            <Plus size={13} /> Add step
          </button>

          {saveMutation.isError && (
            <div className="pk-form-error">Could not save: {errorMessage(saveMutation.error)}</div>
          )}

          <div className="pk-form-actions">
            <button type="submit" className="pk-btn-save" disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </button>
            <button type="button" className="pk-btn-cancel" onClick={cancelEdit} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    );
  }

  const steps = sortSteps(constraint.steps);

  return (
    <div className="pk-card pk-constraint-card">
      {editable && (
        <button type="button" className="pk-edit-btn" onClick={startEdit}>
          <Pencil size={12} /> Edit
        </button>
      )}
      <SeverityChip severity={constraint.severity} />
      <div className="pk-constraint-title">{constraint.title}</div>
      {constraint.metric && <div className="pk-constraint-metric">{constraint.metric}</div>}
      {constraint.detail && <p className="pk-constraint-detail">{constraint.detail}</p>}
      {constraint.impact && <p className="pk-constraint-impact">{constraint.impact}</p>}

      {steps.length > 0 && (
        <>
          <div className="pk-constraint-steps-h">
            Attack plan &middot; Identify &rarr; Exploit &rarr; Subordinate &rarr; Elevate &rarr;
            Repeat
          </div>
          <ol className="pk-steps">
            {steps.map((s, i) => (
              <li key={i}>
                <b>{s.step}</b>
                {s.owner && <span className="pk-step-owner"> &middot; owner {s.owner}</span>}
                <div className="pk-step-action">{s.action}</div>
                <span className={`pk-step-status pk-step-status-${s.status}`}>
                  {stepStatusWord(s.status)}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
