/**
 * Per-step Drive folder configurator for the Ads Sequence wizard.
 *
 * Opens as a modal from the gear button on the wizard topbar. Lists every
 * sequence step with a folder dropdown sourced from the client's
 * `_drive-index.md`. Each pick is persisted immediately via
 * `setClientSequenceFolderDefault`, so closing the modal commits whatever
 * the user has done.
 *
 *  ┌─────────────────────────────────────────────────────┐
 *  │  Drive folders                          ✕            │
 *  │  Pick where each step's artifact is pushed.          │
 *  │                                                      │
 *  │  Audience research      [▾ Notes              ]      │
 *  │  Creative brief         [▾ Notes              ]      │
 *  │  Hooks                  [▾ Creatives          ]      │
 *  │  Ad copy                [▾ Creatives          ]      │
 *  │  Build static creatives [▾ Creatives          ]      │
 *  │  Campaign structure     [▾ Creatives          ]      │
 *  │                                                      │
 *  │  Folders come from <client>/_drive-index.md          │
 *  │  Refresh index ↻                                     │
 *  └─────────────────────────────────────────────────────┘
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/tauri";
import { parseDriveFolders, type DriveFolder } from "../lib/driveIndex";
import { MEDIA_BUYING_SEQUENCE } from "../lib/mediaBuyingSequence";
import type {
  ClientEntry,
  DocFolderTarget,
  SequenceFolderDefaults,
} from "../lib/types";

interface Props {
  root: string;
  clientSlug: string;
  onClose: () => void;
  /** Notify the parent that the persisted client record has changed so it
   *  can refresh whatever it cached. */
  onSaved?: () => void;
}

type StepId = (typeof MEDIA_BUYING_SEQUENCE)[number]["id"];

/** Field key on SequenceFolderDefaults that maps to each step id. They
 *  happen to be identical strings, but typing this explicitly catches any
 *  future drift between the sequence ids and the defaults shape. */
const STEP_FIELD: Record<StepId, keyof SequenceFolderDefaults> = {
  "audience-research": "audience-research",
  "creative-brief": "creative-brief",
  "ad-copy": "ad-copy",
  "ad-creative": "ad-creative",
  structure: "structure",
};

export function AdsSequenceFolderConfigurator({
  root,
  clientSlug,
  onClose,
  onSaved,
}: Props) {
  const [client, setClient] = useState<ClientEntry | null>(null);
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Per-step saving state, keyed by step id. Disables that row while a
   *  setClientSequenceFolderDefault call is in flight. */
  const [savingStep, setSavingStep] = useState<StepId | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [clients, idx] = await Promise.all([
        api.listClients(root),
        api.readDriveIndex(root, clientSlug),
      ]);
      const found = clients.find((c) => c.slug === clientSlug) ?? null;
      setClient(found);
      setFolders(idx ? parseDriveFolders(idx.body) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [root, clientSlug]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const refreshIndex = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const idx = await api.refreshDriveIndex(root, clientSlug);
      setFolders(parseDriveFolders(idx.body));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [root, clientSlug]);

  const handlePick = useCallback(
    async (stepId: StepId, folderId: string) => {
      setSavingStep(stepId);
      setError(null);
      try {
        let target: DocFolderTarget | null = null;
        if (folderId) {
          const f = folders.find((x) => x.id === folderId);
          if (!f) throw new Error("Folder not found in the drive index.");
          target = { id: f.id, name: f.name };
        }
        await api.setClientSequenceFolderDefault(root, clientSlug, stepId, target);
        // Mirror the change locally so the dropdown reflects it without a
        // round-trip to listClients.
        setClient((prev) => {
          if (!prev) return prev;
          const defaults: SequenceFolderDefaults = {
            ...(prev.sequence_folder_defaults ?? {}),
          };
          const field = STEP_FIELD[stepId];
          if (target) {
            defaults[field] = target;
          } else {
            delete defaults[field];
          }
          const allEmpty = Object.values(defaults).every((v) => !v);
          return {
            ...prev,
            sequence_folder_defaults: allEmpty ? null : defaults,
          };
        });
        onSaved?.();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setSavingStep(null);
      }
    },
    [folders, root, clientSlug, onSaved],
  );

  const currentFor = useCallback(
    (stepId: StepId): string => {
      const defaults = client?.sequence_folder_defaults;
      const field = STEP_FIELD[stepId];
      return defaults?.[field]?.id ?? "";
    },
    [client],
  );

  const stalePicks = useMemo(() => {
    if (!client?.sequence_folder_defaults) return new Set<StepId>();
    const knownIds = new Set(folders.map((f) => f.id));
    const out = new Set<StepId>();
    for (const step of MEDIA_BUYING_SEQUENCE) {
      const id = currentFor(step.id);
      if (id && !knownIds.has(id)) out.add(step.id);
    }
    return out;
  }, [client, folders, currentFor]);

  return (
    <div
      className="asfc-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="asfc-modal" role="dialog" aria-modal="true">
        <div className="asfc-head">
          <div>
            <div className="asfc-eyebrow">▸ Ads Sequence · Drive</div>
            <h2 className="asfc-title">Drive folders</h2>
            <p className="asfc-sub">
              Pick where each step's artifact lands. Auto-push uses these when
              the wizard saves. Override per-push from each step.
            </p>
          </div>
          <button type="button" className="asfc-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading ? (
          <div className="asfc-state">Loading…</div>
        ) : folders.length === 0 ? (
          <div className="asfc-state asfc-empty">
            <p>
              No folders in this client's <code>_drive-index.md</code>. Refresh
              the index to populate it from Drive.
            </p>
            <button
              type="button"
              className="asfc-primary"
              onClick={refreshIndex}
              disabled={refreshing}
            >
              {refreshing ? "Refreshing…" : "Refresh drive index"}
            </button>
          </div>
        ) : (
          <>
            <div className="asfc-list">
              {MEDIA_BUYING_SEQUENCE.map((step) => {
                const stale = stalePicks.has(step.id);
                const current = currentFor(step.id);
                return (
                  <div key={step.id} className="asfc-row">
                    <div className="asfc-row-left">
                      <div className="asfc-step-name">{step.label}</div>
                      <div className="asfc-step-id">{step.id}</div>
                    </div>
                    <div className="asfc-row-right">
                      <select
                        className={"asfc-select" + (stale ? " is-stale" : "")}
                        value={current}
                        disabled={savingStep === step.id}
                        onChange={(e) => {
                          void handlePick(step.id, e.target.value);
                        }}
                      >
                        <option value="">Not set</option>
                        {folders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                        {stale && current && (
                          <option value={current} disabled>
                            {`(missing: ${current.slice(0, 10)}…)`}
                          </option>
                        )}
                      </select>
                      {savingStep === step.id && (
                        <span className="asfc-spinner">…</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="asfc-foot">
              <span className="asfc-foot-note">
                Folders come from <code>_drive-index.md</code>
              </span>
              <button
                type="button"
                className="asfc-ghost"
                onClick={refreshIndex}
                disabled={refreshing}
              >
                {refreshing ? "Refreshing…" : "↻ Refresh index"}
              </button>
            </div>
          </>
        )}

        {error && <div className="asfc-err">{error}</div>}
      </div>

      <style>{ASFC_CSS}</style>
    </div>
  );
}

const ASFC_CSS = `
.asfc-backdrop {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--bg) 60%, transparent);
  backdrop-filter: blur(2px);
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 24px;
}
.asfc-modal {
  width: min(640px, 100%);
  max-height: calc(100vh - 48px);
  overflow: auto;
  background: var(--hml-bg-elev-1);
  border: 1px solid var(--hml-border);
  border-radius: 14px;
  padding: 24px 28px 22px;
  color: var(--hml-text-primary);
  font-family: var(--hml-font-sans);
  box-shadow: 0 24px 80px -16px rgba(0,0,0,0.6);
}
.asfc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.asfc-eyebrow {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  letter-spacing: 0.14em;
  color: var(--hml-accent);
  text-transform: uppercase;
  margin-bottom: 6px;
}
.asfc-title {
  font-size: 19px;
  font-weight: 600;
  letter-spacing: -0.018em;
  margin: 0 0 6px;
}
.asfc-sub {
  color: var(--hml-text-secondary);
  font-size: 12.5px;
  margin: 0;
  max-width: 520px;
}
.asfc-close {
  background: transparent;
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}
.asfc-close:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}

.asfc-state {
  padding: 22px 4px;
  color: var(--hml-text-secondary);
  font-size: 13px;
}
.asfc-empty {
  text-align: center;
  border: 1px dashed var(--hml-border);
  border-radius: 10px;
  padding: 28px 22px;
}
.asfc-empty p {
  margin: 0 0 14px;
}
.asfc-primary {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  padding: 9px 16px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--hml-accent-border);
  background: var(--hml-accent-dim);
  color: var(--hml-accent-bright);
}
.asfc-primary:disabled {
  opacity: 0.5;
  cursor: progress;
}

.asfc-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  border: 1px solid var(--hml-border-subtle);
  border-radius: 10px;
  padding: 6px;
  background: var(--hml-bg-elev-2);
}
.asfc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 6px;
}
.asfc-row:hover {
  background: var(--hml-bg-elev-3);
}
.asfc-row-left { min-width: 0; flex: 1; }
.asfc-step-name {
  font-size: 13px;
  color: var(--hml-text-primary);
  line-height: 1.3;
}
.asfc-step-id {
  font-family: var(--hml-font-mono);
  font-size: 10px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.04em;
  margin-top: 2px;
}
.asfc-row-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.asfc-select {
  font-family: var(--hml-font-sans);
  font-size: 12.5px;
  padding: 7px 10px;
  border-radius: 6px;
  border: 1px solid var(--hml-border);
  background: var(--hml-bg-elev-1);
  color: var(--hml-text-primary);
  min-width: 200px;
  cursor: pointer;
}
.asfc-select:disabled { opacity: 0.6; cursor: progress; }
.asfc-select.is-stale {
  border-color: var(--hml-amber-border, var(--hml-border));
}
.asfc-spinner {
  font-family: var(--hml-font-mono);
  color: var(--hml-text-tertiary);
  font-size: 12px;
}

.asfc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 14px;
}
.asfc-foot-note {
  font-family: var(--hml-font-mono);
  font-size: 10.5px;
  color: var(--hml-text-tertiary);
  letter-spacing: 0.04em;
}
.asfc-foot-note code {
  background: var(--hml-bg-elev-2);
  border: 1px solid var(--hml-border-subtle);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 10px;
  color: var(--hml-text-secondary);
}
.asfc-ghost {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 7px 12px;
  background: transparent;
  border: 1px solid var(--hml-border);
  color: var(--hml-text-secondary);
  border-radius: 6px;
  cursor: pointer;
}
.asfc-ghost:hover {
  border-color: var(--hml-border-strong);
  color: var(--hml-text-primary);
}
.asfc-ghost:disabled { opacity: 0.5; cursor: progress; }

.asfc-err {
  margin-top: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--hml-red-border, var(--hml-border));
  background: var(--hml-red-bg, transparent);
  color: var(--hml-red, var(--hml-text-primary));
  font-size: 12.5px;
}
`;

export default AdsSequenceFolderConfigurator;
