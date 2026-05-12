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
  { eye: string; title: string; subtitle: string; placeholder: string }
> = {
  jake: {
    eye: "ABOUT JAKE",
    title: "Identity & voice",
    subtitle: "Edits vault/About/Jake.md. Frontmatter is preserved automatically.",
    placeholder: "# Jake Hauck\n\n## Who I am\n- ...",
  },
  agency: {
    eye: "ABOUT HAUCK MARKETING",
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
  // Fallback to frontmatter subject
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
      // Preserve frontmatter exactly — pass back the loaded `front` unchanged.
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
    const canSave = !!slot.note && !slot.busy && dirty && slot.draft.trim().length > 0;
    return (
      <div className="about-pane">
        <div className="about-pane-head">
          <div>
            <div className="settings-section-eye">{meta.eye}</div>
            <div className="settings-section-title">{meta.title}</div>
            <div className="about-pane-sub">{meta.subtitle}</div>
          </div>
          {dirty && <span className="about-dirty-dot">UNSAVED</span>}
        </div>

        {slot.error && <div className="clients-page-err">{slot.error}</div>}

        <textarea
          className="about-textarea"
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
            className="kpi-form-btn primary"
            onClick={() => void handleSave(key)}
            disabled={!canSave}
          >
            {slot.busy ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            className="kpi-form-btn"
            onClick={() => handleRevert(key)}
            disabled={slot.busy || !dirty}
          >
            Revert
          </button>
          {slot.note && (
            <span className="about-path">
              <code>{slot.note.rel_path.replace(/\\/g, "/")}</code>
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="settings-section">
      <div className="settings-section-head">
        <div className="settings-section-eye">ABOUT</div>
        <div className="settings-section-title">Identity & agency rules</div>
      </div>
      <div className="settings-section-body">
        <p className="settings-note">
          These notes are read into every chat turn as the agent's system context.
          Edit the markdown directly — frontmatter at the top of each file is hidden
          from this form but round-tripped on save.
        </p>

        {loadError && <div className="clients-page-err">{loadError}</div>}

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
            {agency.draft !== agency.loaded && <span className="about-tab-dot" />}
          </button>
        </div>

        {loading ? (
          <div className="about-loading">Loading…</div>
        ) : (
          renderSlot(active)
        )}
      </div>
    </div>
  );
}
