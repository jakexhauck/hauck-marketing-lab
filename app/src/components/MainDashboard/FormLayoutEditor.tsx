import { useEffect, useMemo, useState } from "react";
import {
  defaultLayoutFromConfigs,
  moveItem,
  newCategory,
  type SidebarCategory,
  type SidebarLayout,
} from "../../lib/formLayout";
import { ALL_FORM_CONFIGS, type FormConfig } from "../../lib/formConfigs";

interface Props {
  open: boolean;
  layout: SidebarLayout;
  onClose: () => void;
  onSave: (next: SidebarLayout) => void;
}

export function FormLayoutEditor({ open, layout, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<SidebarLayout>(layout);
  const [newCatName, setNewCatName] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(layout);
      setNewCatName("");
    }
  }, [open, layout]);

  const configsById = useMemo(() => {
    const m = new Map<string, FormConfig>();
    for (const c of ALL_FORM_CONFIGS) m.set(c.id, c);
    return m;
  }, []);

  if (!open) return null;

  function updateCategories(fn: (cats: SidebarCategory[]) => SidebarCategory[]) {
    setDraft((d) => ({ ...d, categories: fn(d.categories) }));
  }

  function renameCategory(id: string, name: string) {
    updateCategories((cats) => cats.map((c) => (c.id === id ? { ...c, name } : c)));
  }

  function moveCategory(idx: number, dir: -1 | 1) {
    updateCategories((cats) => moveItem(cats, idx, idx + dir));
  }

  function deleteCategory(id: string) {
    updateCategories((cats) => {
      const target = cats.find((c) => c.id === id);
      if (!target) return cats;
      const next = cats.filter((c) => c.id !== id);
      // Move any forms from the deleted category into the first remaining one.
      if (target.formIds.length > 0 && next.length > 0) {
        next[0] = { ...next[0], formIds: [...next[0].formIds, ...target.formIds] };
      }
      return next;
    });
  }

  function addCategory() {
    const name = newCatName.trim();
    if (!name) return;
    updateCategories((cats) => [...cats, newCategory(name)]);
    setNewCatName("");
  }

  function moveForm(catId: string, idx: number, dir: -1 | 1) {
    updateCategories((cats) =>
      cats.map((c) => (c.id === catId ? { ...c, formIds: moveItem(c.formIds, idx, idx + dir) } : c)),
    );
  }

  function assignFormToCategory(formId: string, toCatId: string) {
    updateCategories((cats) => {
      const stripped = cats.map((c) => ({
        ...c,
        formIds: c.formIds.filter((id) => id !== formId),
      }));
      const target = stripped.find((c) => c.id === toCatId);
      if (target) target.formIds = [...target.formIds, formId];
      return stripped;
    });
  }

  function resetToDefaults() {
    setDraft(defaultLayoutFromConfigs(ALL_FORM_CONFIGS));
  }

  function handleSave() {
    // Drop any empty categories silently — keeps the sidebar tidy.
    const cleaned = draft.categories.filter((c) => c.formIds.length > 0 || c.name.trim());
    onSave({ categories: cleaned });
  }

  return (
    <div
      className="md-modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="md-modal-card md-form-layout-card"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: 760, width: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column" }}
      >
        <div className="md-modal-title">Edit Sidebar Forms</div>
        <p className="md-modal-help" style={{ marginBottom: 14 }}>
          Reorder, rename, add, or remove categories. Move forms between categories using the dropdown,
          and reorder forms within a category with the arrows.
        </p>

        <div className="md-form-layout-list">
          {draft.categories.map((cat, catIdx) => (
            <div key={cat.id} className="md-form-layout-cat">
              <div className="md-form-layout-cat-head">
                <button
                  type="button"
                  className="md-form-layout-mini"
                  onClick={() => moveCategory(catIdx, -1)}
                  disabled={catIdx === 0}
                  aria-label="Move category up"
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="md-form-layout-mini"
                  onClick={() => moveCategory(catIdx, 1)}
                  disabled={catIdx === draft.categories.length - 1}
                  aria-label="Move category down"
                  title="Move down"
                >
                  ↓
                </button>
                <input
                  type="text"
                  className="md-modal-input md-form-layout-name"
                  value={cat.name}
                  onChange={(e) => renameCategory(cat.id, e.target.value)}
                  placeholder="Category name"
                />
                <span className="md-form-layout-count">{cat.formIds.length}</span>
                <button
                  type="button"
                  className="md-form-layout-mini md-form-layout-delete"
                  onClick={() => deleteCategory(cat.id)}
                  disabled={draft.categories.length === 1}
                  title={
                    draft.categories.length === 1
                      ? "Can't delete the last category"
                      : "Delete category (its forms move to the first category)"
                  }
                >
                  ✕
                </button>
              </div>

              {cat.formIds.length === 0 ? (
                <div className="md-form-layout-empty">No forms in this category.</div>
              ) : (
                <div className="md-form-layout-forms">
                  {cat.formIds.map((fid, fIdx) => {
                    const cfg = configsById.get(fid);
                    if (!cfg) return null;
                    return (
                      <div key={fid} className="md-form-layout-form-row">
                        <button
                          type="button"
                          className="md-form-layout-mini"
                          onClick={() => moveForm(cat.id, fIdx, -1)}
                          disabled={fIdx === 0}
                          aria-label="Move form up"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="md-form-layout-mini"
                          onClick={() => moveForm(cat.id, fIdx, 1)}
                          disabled={fIdx === cat.formIds.length - 1}
                          aria-label="Move form down"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <span className="md-form-layout-form-title">{cfg.title}</span>
                        <span className="md-form-layout-form-agent">{cfg.agentName}</span>
                        <select
                          className="md-form-layout-select"
                          value={cat.id}
                          onChange={(e) => assignFormToCategory(fid, e.target.value)}
                          title="Move to category"
                        >
                          {draft.categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || "(unnamed)"}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="md-form-layout-add">
          <input
            type="text"
            className="md-modal-input"
            placeholder="New category name…"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCategory();
              }
            }}
          />
          <button
            type="button"
            className="md-modal-save"
            onClick={addCategory}
            disabled={!newCatName.trim()}
          >
            + Add category
          </button>
        </div>

        <div className="md-modal-actions">
          <button type="button" className="md-modal-cancel" onClick={resetToDefaults}>
            Reset to defaults
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="md-modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="md-modal-save" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
