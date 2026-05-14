import { useEffect, useState } from "react";
import { api } from "../lib/tauri";
import type { NoteFront, VaultNote } from "../lib/types";

type Props = {
  root: string;
};

type Slot = "jake" | "agency";

type SlotState = {
  note: VaultNote | null;
  draft: string;
  loaded: string;
  busy: boolean;
  error: string | null;
};

const EMPTY_SLOT: SlotState = {
  note: null,
  draft: "",
  loaded: "",
  busy: false,
  error: null,
};

const SLOT_META: Record<
  Slot,
  { title: string; subtitle: string; placeholder: string }
> = {
  jake: {
    title: "Identity & voice",
    subtitle: "Edits vault/About/Jake.md. Frontmatter is preserved automatically.",
    placeholder: "# Jake Hauck\n\n## Who I am\n- ...",
  },
  agency: {
    title: "Agency voice & ad-copy rules",
    subtitle:
      "Edits vault/About/Hauck Marketing.md. Frontmatter is preserved automatically.",
    placeholder: "# Hauck Marketing\n\n## Voice for our ads\n- ...",
  },
};

function classifyNote(note: VaultNote): Slot | null {
  const rel = note.rel_path.replace(/\\/g, "/");
  if (rel.endsWith("About/Jake.md")) return "jake";
  if (rel.endsWith("About/Hauck Marketing.md")) return "agency";
  const subject = (note.front?.subject ?? "").toString().toLowerCase();
  if (subject === "jake") return "jake";
  if (subject === "agency") return "agency";
  return null;
}

export function AboutSettings({ root }: Props) {
  const [active, setActive] = useState<Slot>("jake");
  const [jake, setJake] = useState<SlotState>(EMPTY_SLOT);
  const [agency, setAgency] = useState<SlotState>(EMPTY_SLOT);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const getSlot = (key: Slot) => (key === "jake" ? jake : agency);
  const setSlot = (key: Slot, updater: (prev: SlotState) => SlotState) => {
    if (key === "jake") setJake(updater);
    else setAgency(updater);
  };

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const notes = await api.readAboutNotes(root);
      let nextJake: VaultNote | null = null;
      let nextAgency: VaultNote | null = null;
      for (const n of notes) {
        const slot = classifyNote(n);
        if (slot === "jake" && !nextJake) nextJake = n;
        else if (slot === "agency" && !nextAgency) nextAgency = n;
      }
      setJake({
        note: nextJake,
        draft: nextJake?.body ?? "",
        loaded: nextJake?.body ?? "",
        busy: false,
        error: nextJake ? null : "vault/About/Jake.md not found.",
      });
      setAgency({
        note: nextAgency,
        draft: nextAgency?.body ?? "",
        loaded: nextAgency?.body ?? "",
        busy: false,
        error: nextAgency ? null : "vault/About/Hauck Marketing.md not found.",
      });
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  const handleSave = async (key: Slot) => {
    const slot = getSlot(key);
    if (!slot.note) return;
    const body = slot.draft;
    if (body.trim().length === 0) {
      setSlot(key, (prev) => ({ ...prev, error: "Body cannot be empty." }));
      return;
    }
    setSlot(key, (prev) => ({ ...prev, busy: true, error: null }));
    try {
      const front: NoteFront = { ...slot.note.front };
      const written = await api.writeVaultNote(root, slot.note.path, front, body);
      setSlot(key, () => ({
        note: written,
        draft: written.body,
        loaded: written.body,
        busy: false,
        error: null,
      }));
    } catch (e) {
      setSlot(key, (prev) => ({ ...prev, busy: false, error: String(e) }));
    }
  };

  const handleRevert = (key: Slot) => {
    setSlot(key, (prev) => ({ ...prev, draft: prev.loaded, error: null }));
  };

  const renderSlot = (key: Slot) => {
    const slot = getSlot(key);
    const meta = SLOT_META[key];
    const dirty = slot.draft !== slot.loaded;
    const canSave =
      !!slot.note && !slot.busy && dirty && slot.draft.trim().length > 0;
    return (
      <div className="about-pane">
        <div className="about-pane-head">
          <div>
            <div className="about-pane-title">{meta.title}</div>
            <div className="about-pane-sub">{meta.subtitle}</div>
          </div>
          {dirty && <span className="about-dirty">UNSAVED</span>}
        </div>

        {slot.error && <div className="hml-error-banner about-err">{slot.error}</div>}

        <textarea
          className="hml-form-textarea about-textarea"
          value={slot.draft}
          placeholder={meta.placeholder}
          rows={28}
          spellCheck={false}
          disabled={!slot.note || slot.busy}
          onChange={(e) =>
            setSlot(key, (prev) => ({ ...prev, draft: e.target.value }))
          }
        />

        <div className="about-actions">
          <button
            type="button"
            className="hml-btn hml-accent"
            onClick={() => void handleSave(key)}
            disabled={!canSave}
          >
            {slot.busy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="hml-btn hml-ghost"
            onClick={() => handleRevert(key)}
            disabled={slot.busy || !dirty}
          >
            Revert
          </button>
          {slot.note && (
            <span className="about-path">
              <code className="set-code">
                {slot.note.rel_path.replace(/\\/g, "/")}
              </code>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="hml-panel set-panel">
      <style>{aboutCSS}</style>
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" style={{ background: "var(--hml-amber)" }} />
          Identity & agency rules
        </div>
        <span className="hml-panel-action">Injected into every chat turn</span>
      </div>
      <div className="hml-panel-body set-body">
        <p className="set-note about-intro">
          These notes are read into every chat turn as the agent's system
          context. Edit the markdown directly — frontmatter at the top of each
          file is hidden from this form but round-tripped on save.
        </p>

        {loadError && <div className="hml-error-banner">{loadError}</div>}

        <div className="about-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={active === "jake"}
            className={`about-tab${active === "jake" ? " active" : ""}`}
            onClick={() => setActive("jake")}
          >
            About Jake
            {jake.draft !== jake.loaded && <span className="about-tab-dot" />}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={active === "agency"}
            className={`about-tab${active === "agency" ? " active" : ""}`}
            onClick={() => setActive("agency")}
          >
            About Hauck Marketing
            {agency.draft !== agency.loaded && (
              <span className="about-tab-dot" />
            )}
          </button>
        </div>

        {loading ? (
          <div className="about-loading">Loading…</div>
        ) : (
          renderSlot(active)
        )}
      </div>
    </section>
  );
}

const aboutCSS = `
.about-intro { margin: 0 0 14px; }

.about-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--hml-border-subtle);
}

.about-tab {
  position: relative;
  background: transparent;
  border: none;
  padding: 8px 12px;
  color: var(--hml-text-tertiary);
  font: inherit;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.12s ease, border-color 0.12s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.about-tab:hover { color: var(--hml-text-primary); }
.about-tab.active {
  color: var(--hml-accent);
  border-bottom-color: var(--hml-accent);
}

.about-tab-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--hml-accent);
}

.about-pane-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.about-pane-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--hml-text-primary);
  margin-bottom: 3px;
}

.about-pane-sub {
  font-size: 12px;
  color: var(--hml-text-tertiary);
}

.about-dirty {
  font-family: var(--hml-font-mono);
  font-size: 9.5px;
  letter-spacing: 0.10em;
  color: var(--hml-accent);
  padding: 3px 6px;
  border: 1px solid var(--hml-accent-border);
  background: var(--hml-accent-dim);
  border-radius: 4px;
}

.about-textarea {
  font-family: var(--hml-font-mono);
  font-size: 12.5px;
  line-height: 1.55;
  min-height: 360px;
  background: var(--hml-bg-elev-2);
}

.about-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.about-path {
  margin-left: auto;
  display: inline-flex;
}

.about-err { margin-bottom: 10px; }

.about-loading {
  padding: 30px;
  text-align: center;
  font-size: 13px;
  color: var(--hml-text-tertiary);
}
`;
