import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import type { AdminTaskCategory } from "../../lib/api";
import {
  CATEGORY_COLORS,
  DEFAULT_CATEGORY_COLOR,
  MAX_CATEGORY_NAME,
  type CategoryColor,
} from "../../lib/taskCategories";
import type { UseAdminTaskCategories } from "../../hooks/useAdminTaskCategories";

// The "Manage categories" panel for the admin Tasks checklist: add, rename,
// recolour and delete the operator's own categories.
//
// A panel rather than a separate settings page because categories only mean
// anything next to the list they file, and a round trip to another screen to
// add one word is how a feature stops being used.
//
// Every control writes through useAdminTaskCategories, so this component holds
// only what is uncommitted: the new-category draft and which row has its colour
// picker open. Styling comes from OperationsTasksTab's scoped stylesheet.

export default function TaskCategoryManager({
  controller,
  onClose,
  onDeleted,
}: {
  controller: UseAdminTaskCategories;
  onClose: () => void;
  // Fired after a category is removed so the checklist can drop it from the
  // rows that carried it (the server has already done so).
  onDeleted: (categoryId: string) => void;
}) {
  const {
    categories,
    loading,
    error,
    saving,
    addCategory,
    renameCategory,
    recolorCategory,
    deleteCategory,
  } = controller;

  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<CategoryColor>(DEFAULT_CATEGORY_COLOR);
  // The category whose colour swatches are expanded, if any.
  const [pickerId, setPickerId] = useState<string | null>(null);

  const onAdd = async () => {
    if (!draftName.trim() || saving) return;
    const created = await addCategory(draftName, draftColor);
    // The typed name survives a rejection (a duplicate) so it can be corrected
    // rather than retyped; a success clears the field for the next one.
    if (created) {
      setDraftName("");
      setDraftColor(DEFAULT_CATEGORY_COLOR);
    }
  };

  const onDelete = (category: AdminTaskCategory) => {
    if (
      !window.confirm(
        `Remove the "${category.name}" category? Tasks filed under it stay in the list, uncategorised.`,
      )
    ) {
      return;
    }
    onDeleted(category.id);
    void deleteCategory(category);
  };

  return (
    <div className="otk-modal" role="dialog" aria-modal="true" aria-label="Manage categories">
      {/* Click-off to close, the way the rest of the console's overlays behave. */}
      <button type="button" className="otk-scrim" aria-label="Close" onClick={onClose} />

      <div className="otk-panel">
        <div className="otk-panelhead">
          <div className="otk-cardtitle">Categories</div>
          <button type="button" className="otk-del" aria-label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>

        {error ? <div className="otk-panelerr">{error}</div> : null}

        <div className="otk-panelbody">
          {loading ? (
            <div className="otk-state">Loading categories</div>
          ) : categories.length === 0 ? (
            <div className="otk-state">
              No categories yet. Add one below, then pick it on any task.
            </div>
          ) : (
            <ul className="otk-catlist">
              {categories.map((category) => (
                <li key={category.id} className="otk-catrow">
                  <button
                    type="button"
                    className={`otk-swatch c-${category.color}`}
                    aria-label={`Colour for ${category.name}`}
                    title="Change colour"
                    onClick={() => setPickerId((id) => (id === category.id ? null : category.id))}
                  />
                  <input
                    className="otk-catname"
                    defaultValue={category.name}
                    maxLength={MAX_CATEGORY_NAME}
                    aria-label={`Name for ${category.name}`}
                    // Uncontrolled + commit on blur: the stored name is the
                    // source of truth and a rejected rename rolls back to it,
                    // which a controlled input would fight on every keystroke.
                    onBlur={(e) => void renameCategory(category, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                  <button
                    type="button"
                    className="otk-del"
                    aria-label={`Remove ${category.name}`}
                    title="Remove category"
                    onClick={() => onDelete(category)}
                  >
                    <X size={15} strokeWidth={2.4} />
                  </button>

                  {pickerId === category.id ? (
                    <div className="otk-picker">
                      {CATEGORY_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`otk-swatch c-${color}${
                            color === category.color ? " on" : ""
                          }`}
                          aria-label={color}
                          title={color}
                          onClick={() => {
                            void recolorCategory(category, color);
                            setPickerId(null);
                          }}
                        >
                          {color === category.color ? (
                            <Check size={11} strokeWidth={3.4} />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="otk-addcat">
          <div className="otk-picker">
            {CATEGORY_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`otk-swatch c-${color}${color === draftColor ? " on" : ""}`}
                aria-label={`New category colour: ${color}`}
                title={color}
                onClick={() => setDraftColor(color)}
              >
                {color === draftColor ? <Check size={11} strokeWidth={3.4} /> : null}
              </button>
            ))}
          </div>
          <div className="otk-addrow">
            <input
              className="otk-catname"
              value={draftName}
              placeholder="New category"
              maxLength={MAX_CATEGORY_NAME}
              aria-label="New category name"
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void onAdd();
                }
              }}
            />
            <button
              type="button"
              className="otk-add"
              disabled={saving || !draftName.trim()}
              onClick={() => void onAdd()}
            >
              <Plus size={15} strokeWidth={2.4} />
              {saving ? "Adding" : "Add"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
