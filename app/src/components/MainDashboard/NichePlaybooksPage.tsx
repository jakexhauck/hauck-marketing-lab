import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/tauri";
import {
  emptyBenchmarks,
  emptyPlaybookSaveInput,
  slugify,
  type PlaybookBenchmarks,
  type PlaybookContent,
  type PlaybookSaveInput,
  type PlaybookSummary,
} from "../../lib/playbooks";

type Props = {
  root: string | null;
};

type ModalMode = "add" | "edit";

type ModalState = {
  mode: ModalMode;
  draft: PlaybookSaveInput;
  /** When editing, the original slug. Disables the slug input to avoid
   *  half-renames; Jake can delete + re-add if he genuinely wants to rename. */
  originalSlug: string | null;
  displayName: string;
};

function summaryToDraft(content: PlaybookContent): PlaybookSaveInput {
  return {
    slug: content.slug,
    display_name: content.display_name,
    audience: content.audience,
    offers: content.offers,
    angles: content.angles,
    creative_brief: content.creative_brief,
    competitors: content.competitors,
    benchmarks: content.benchmarks ?? emptyBenchmarks(),
  };
}

export function NichePlaybooksPage({ root }: Props) {
  const [playbooks, setPlaybooks] = useState<PlaybookSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!root) {
      setPlaybooks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await api.listPlaybooks(root);
      setPlaybooks(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [root]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = () => {
    setError(null);
    setModal({
      mode: "add",
      draft: emptyPlaybookSaveInput(),
      originalSlug: null,
      displayName: "",
    });
  };

  const onEdit = async (slug: string) => {
    if (!root) return;
    setError(null);
    setBusy(true);
    try {
      const content = await api.readPlaybook(root, slug);
      setModal({
        mode: "edit",
        draft: summaryToDraft(content),
        originalSlug: content.slug,
        displayName: content.display_name,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (slug: string) => {
    if (!root) return;
    setError(null);
    setBusy(true);
    try {
      await api.deletePlaybook(root, slug);
      setConfirmDelete(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!root || !modal) return;
    setError(null);
    const draft = modal.draft;
    const slug = draft.slug.trim();
    if (!slug) {
      setError("Enter a slug.");
      return;
    }
    if (!/^[a-z0-9-]+$/.test(slug) || slug.startsWith("-") || slug.endsWith("-")) {
      setError("Slug must be lowercase letters, digits, or dashes only, and cannot start or end with a dash.");
      return;
    }
    setBusy(true);
    try {
      await api.savePlaybook(root, {
        ...draft,
        slug,
        display_name: modal.displayName.trim() || null,
      });
      setModal(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const updateDraft = (patch: Partial<PlaybookSaveInput>) => {
    if (!modal) return;
    setModal({ ...modal, draft: { ...modal.draft, ...patch } });
  };

  const updateBenchmark = (patch: Partial<PlaybookBenchmarks>) => {
    if (!modal) return;
    setModal({
      ...modal,
      draft: {
        ...modal.draft,
        benchmarks: { ...modal.draft.benchmarks, ...patch },
      },
    });
  };

  const sorted = useMemo(
    () => [...playbooks].sort((a, b) => a.slug.localeCompare(b.slug)),
    [playbooks],
  );

  return (
    <div className="hml-content">
      <style>{playbooksCSS}</style>
      <header className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Workspace · Niche Playbooks
          </div>
          <h1 className="hml-page-title">Niche playbooks</h1>
          <div className="hml-page-subtitle">
            Reusable per-niche defaults that pre-fill every form. Each playbook
            holds audience research, proven offers, creative angles, brand
            guardrails, competitor intel, and benchmark targets. Stored under{" "}
            <code>vault/Playbooks/&lt;slug&gt;/</code>.
          </div>
        </div>
        <div className="hml-page-header-actions">
          <button
            type="button"
            className="hml-btn hml-accent"
            onClick={onAdd}
            disabled={busy || !root}
          >
            + Add niche
          </button>
        </div>
      </header>

      {error && <div className="hml-error-banner">{error}</div>}

      {loading ? (
        <div className="hml-empty">
          <div className="hml-empty-title">Loading playbooks...</div>
        </div>
      ) : sorted.length === 0 ? (
        <div className="hml-empty">
          <div className="hml-empty-title">No playbooks yet.</div>
          <div className="hml-empty-body">
            Click <strong>Add niche</strong> above to create the first one.
          </div>
        </div>
      ) : (
        <ul className="nplb-list">
          {sorted.map((p) => (
            <li key={p.slug} className="hml-panel nplb-card">
              <div className="nplb-card-main">
                <div className="nplb-card-head">
                  <div className="nplb-card-name">{p.display_name}</div>
                  <code className="nplb-card-slug">{p.slug}</code>
                  <span
                    className={`nplb-status${p.complete ? " nplb-ok" : " nplb-warn"}`}
                  >
                    {p.complete ? "Complete" : `Missing: ${p.missing.join(", ")}`}
                  </span>
                </div>
                <div className="nplb-card-body">
                  Pre-fills forms for any client whose Profile.md carries{" "}
                  <code>niche: {p.slug}</code>.
                </div>
              </div>
              <div className="nplb-card-actions">
                <button
                  type="button"
                  className="hml-btn"
                  onClick={() => onEdit(p.slug)}
                  disabled={busy}
                >
                  Edit
                </button>
                {confirmDelete === p.slug ? (
                  <>
                    <button
                      type="button"
                      className="hml-btn hml-danger"
                      onClick={() => onDelete(p.slug)}
                      disabled={busy}
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      className="hml-btn hml-ghost"
                      onClick={() => setConfirmDelete(null)}
                      disabled={busy}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="hml-btn hml-ghost"
                    onClick={() => setConfirmDelete(p.slug)}
                    disabled={busy}
                  >
                    Delete
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal && (
        <div className="nplb-modal-scrim" onClick={() => !busy && setModal(null)}>
          <div
            className="nplb-modal hml-panel"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="nplb-modal-head">
              <div>
                <div className="hml-page-eyebrow">
                  <span className="hml-eyebrow-dot" />
                  {modal.mode === "add" ? "New niche" : `Edit · ${modal.originalSlug}`}
                </div>
                <h2 className="nplb-modal-title">
                  {modal.mode === "add" ? "Add a playbook" : "Edit playbook"}
                </h2>
              </div>
              <button
                type="button"
                className="hml-btn hml-ghost"
                onClick={() => setModal(null)}
                disabled={busy}
              >
                Close
              </button>
            </header>

            <div className="nplb-modal-body">
              <div className="nplb-grid-2">
                <Field label="Display name">
                  <input
                    className="hml-form-input"
                    placeholder="e.g. Family Dentists"
                    value={modal.displayName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setModal({
                        ...modal,
                        displayName: v,
                        draft:
                          modal.mode === "add" && !modal.draft.slug
                            ? { ...modal.draft, slug: slugify(v) }
                            : modal.draft,
                      });
                    }}
                    disabled={busy}
                  />
                </Field>
                <Field
                  label="Slug"
                  hint="kebab-case, lowercase, used as the folder name."
                >
                  <input
                    className="hml-form-input"
                    placeholder="dental"
                    value={modal.draft.slug}
                    onChange={(e) => updateDraft({ slug: e.target.value })}
                    disabled={busy || modal.mode === "edit"}
                  />
                </Field>
              </div>

              <Field
                label="Audience"
                hint="Voice-of-customer research. Motivations, objections, triggers, language."
              >
                <textarea
                  className="hml-form-textarea"
                  rows={6}
                  value={modal.draft.audience}
                  onChange={(e) => updateDraft({ audience: e.target.value })}
                  disabled={busy}
                />
              </Field>

              <Field
                label="Offers"
                hint="3 to 5 proven offers for this niche, one per line."
              >
                <textarea
                  className="hml-form-textarea"
                  rows={5}
                  value={modal.draft.offers}
                  onChange={(e) => updateDraft({ offers: e.target.value })}
                  disabled={busy}
                />
              </Field>

              <Field
                label="Angles"
                hint="10+ creative angles with sample hooks."
              >
                <textarea
                  className="hml-form-textarea"
                  rows={8}
                  value={modal.draft.angles}
                  onChange={(e) => updateDraft({ angles: e.target.value })}
                  disabled={busy}
                />
              </Field>

              <Field
                label="Creative brief"
                hint="Visual style + do-nots boilerplate for this niche."
              >
                <textarea
                  className="hml-form-textarea"
                  rows={7}
                  value={modal.draft.creative_brief}
                  onChange={(e) => updateDraft({ creative_brief: e.target.value })}
                  disabled={busy}
                />
              </Field>

              <Field
                label="Competitors"
                hint="Typical competitor landscape patterns and lanes to own."
              >
                <textarea
                  className="hml-form-textarea"
                  rows={6}
                  value={modal.draft.competitors}
                  onChange={(e) => updateDraft({ competitors: e.target.value })}
                  disabled={busy}
                />
              </Field>

              <div className="nplb-bench-head">Benchmarks</div>
              <div className="nplb-grid-4">
                <Field label="CPL target ($)">
                  <input
                    type="number"
                    className="hml-form-input"
                    value={modal.draft.benchmarks.cpl_target ?? ""}
                    onChange={(e) =>
                      updateBenchmark({
                        cpl_target: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={busy}
                  />
                </Field>
                <Field label="CPM min ($)">
                  <input
                    type="number"
                    className="hml-form-input"
                    value={modal.draft.benchmarks.cpm_min ?? ""}
                    onChange={(e) =>
                      updateBenchmark({
                        cpm_min: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={busy}
                  />
                </Field>
                <Field label="CPM max ($)">
                  <input
                    type="number"
                    className="hml-form-input"
                    value={modal.draft.benchmarks.cpm_max ?? ""}
                    onChange={(e) =>
                      updateBenchmark({
                        cpm_max: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={busy}
                  />
                </Field>
                <Field label="CTR floor (%)">
                  <input
                    type="number"
                    step="0.1"
                    className="hml-form-input"
                    value={modal.draft.benchmarks.ctr_floor ?? ""}
                    onChange={(e) =>
                      updateBenchmark({
                        ctr_floor: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={busy}
                  />
                </Field>
                <Field label="ROAS target (x)">
                  <input
                    type="number"
                    step="0.1"
                    className="hml-form-input"
                    value={modal.draft.benchmarks.roas_target ?? ""}
                    onChange={(e) =>
                      updateBenchmark({
                        roas_target: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    disabled={busy}
                  />
                </Field>
              </div>
            </div>

            <footer className="nplb-modal-foot">
              <button
                type="button"
                className="hml-btn hml-ghost"
                onClick={() => setModal(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hml-btn hml-accent"
                onClick={onSave}
                disabled={busy}
              >
                {busy ? "Saving..." : modal.mode === "add" ? "Create playbook" : "Save changes"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="hml-form-field">
      <label className="hml-form-label">{label}</label>
      {children}
      {hint && <div className="hml-form-help">{hint}</div>}
    </div>
  );
}

const playbooksCSS = `
.nplb-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.nplb-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
  padding: 16px 18px;
  align-items: flex-start;
}

.nplb-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.nplb-card-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--hml-text-primary);
  letter-spacing: -0.01em;
}

.nplb-card-slug {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  color: var(--hml-text-tertiary);
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  border-radius: 4px;
  padding: 2px 7px;
}

.nplb-card-body {
  font-size: 12.5px;
  color: var(--hml-text-secondary);
  line-height: 1.55;
}

.nplb-status {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--hml-border-subtle);
}

.nplb-ok {
  color: #6bcf94;
  border-color: rgba(107, 207, 148, 0.35);
  background: rgba(107, 207, 148, 0.08);
}

.nplb-warn {
  color: #e0a85a;
  border-color: rgba(224, 168, 90, 0.35);
  background: rgba(224, 168, 90, 0.08);
}

.nplb-card-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: stretch;
  min-width: 130px;
}

.nplb-modal-scrim {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 48px 24px;
  z-index: 1000;
  overflow-y: auto;
}

.nplb-modal {
  width: min(900px, 100%);
  display: flex;
  flex-direction: column;
  background: var(--hml-bg-elev-1);
  border-radius: 8px;
}

.nplb-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 18px 22px 12px;
  border-bottom: 1px solid var(--hml-border-subtle);
}

.nplb-modal-title {
  font-size: 20px;
  font-weight: 500;
  margin: 6px 0 0;
  color: var(--hml-text-primary);
}

.nplb-modal-body {
  padding: 18px 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.nplb-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.nplb-grid-4 {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

.nplb-bench-head {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--hml-text-tertiary);
  border-top: 1px solid var(--hml-border-subtle);
  padding-top: 14px;
  margin-top: 4px;
}

.nplb-modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 18px;
  border-top: 1px solid var(--hml-border-subtle);
}

@media (max-width: 800px) {
  .nplb-card { grid-template-columns: 1fr; }
  .nplb-card-actions { flex-direction: row; flex-wrap: wrap; }
  .nplb-grid-2 { grid-template-columns: 1fr; }
  .nplb-grid-4 { grid-template-columns: 1fr 1fr; }
}
`;
