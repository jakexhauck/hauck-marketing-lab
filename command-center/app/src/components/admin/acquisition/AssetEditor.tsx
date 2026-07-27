import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import type { ColdCallAsset } from "../../../lib/api";
import { useUpdateColdCallAsset } from "../../../hooks/useColdCallAssets";
import ScriptEditor from "../script/ScriptEditor";

// Editing one thing off the cold caller's shelf: its name, and its document.
//
// Shared by both Settings panels, because a script variation and an objection
// walkthrough are edited identically. The only difference is what the panel
// around it says, so that is what the panels own and this does not.
//
// ScriptEditor is unchanged and reused whole: it autosaves, flushes on unmount,
// and seeds exactly once. It is keyed on the asset id so switching between two
// documents remounts and reseeds, rather than leaving the previous one's markup
// in the box. The name is handed to it as its title, so this component adds only
// the two controls it does not have: rename, and close.

export default function AssetEditor({
  asset,
  subtitle,
  onDone,
}: {
  asset: ColdCallAsset;
  subtitle: string;
  onDone: () => void;
}) {
  const update = useUpdateColdCallAsset();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(asset.name);
  const [error, setError] = useState<string | null>(null);

  const rename = async () => {
    const next = name.trim();
    if (!next || next === asset.name) {
      setRenaming(false);
      setName(asset.name);
      return;
    }
    try {
      await update.mutateAsync({ id: asset.id, name: next });
      setRenaming(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename that");
    }
  };

  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {renaming ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void rename();
            }}
          >
            <input
              className="pk-input !w-auto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Name"
              autoFocus
            />
            <button type="submit" className="pk-btn-save" disabled={update.isPending}>
              <Check size={14} aria-hidden />
            </button>
            <button
              type="button"
              className="pk-btn-cancel"
              onClick={() => {
                setRenaming(false);
                setName(asset.name);
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </form>
        ) : (
          <button type="button" className="pk-link" onClick={() => setRenaming(true)}>
            <Pencil size={13} aria-hidden />
            Rename
          </button>
        )}
        <button type="button" className="pk-btn-cancel ml-auto" onClick={onDone}>
          Done
        </button>
      </div>

      {error && <p className="mb-2 text-[12.5px] text-danger">{error}</p>}

      <ScriptEditor
        key={asset.id}
        title={asset.name}
        subtitle={subtitle}
        html={asset.html}
        isLoading={false}
        isError={false}
        save={(html) => update.mutateAsync({ id: asset.id, html })}
      />
    </div>
  );
}
