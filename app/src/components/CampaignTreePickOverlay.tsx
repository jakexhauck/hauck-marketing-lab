/**
 * CampaignTreePickOverlay — full-screen overlay that opens the
 * CampaignTreeView in pick mode for a snippet (typically an edited ad-copy
 * body sent from a FormOutput "+" button).
 *
 * Sits at the AppPane level so it's reachable from anywhere — the standalone
 * Aurelius Prompt Builder, the Forms hub, etc. — without needing the Ads
 * Sequence wizard to be mounted. Loads sequenceState from `onboarding.json`,
 * mounts the tree, and on pick writes the updated skeleton back via the
 * same `writeOnboardingState` path the wizard uses.
 */

import { useEffect, useState } from "react";
import { CampaignTreeView, type PendingSnippet } from "./CampaignTreeView";
import {
  emptySequenceState,
  type CampaignSkeleton,
  type SequenceState,
} from "../lib/mediaBuyingSequence";
import { api } from "../lib/tauri";

type Props = {
  root: string;
  clientName: string;
  clientSlug: string;
  snippet: PendingSnippet;
  /** Fires after the user clicks an ad slot. Receives a short toast string. */
  onPicked: (toast: string) => void;
  /** Fires when the user dismisses without picking. */
  onClose: () => void;
};

export function CampaignTreePickOverlay({
  root,
  clientName,
  clientSlug,
  snippet,
  onPicked,
  onClose,
}: Props) {
  const [doneSet, setDoneSet] = useState<string[]>([]);
  const [skippedSet, setSkippedSet] = useState<string[]>([]);
  const [phaseDoneAt, setPhaseDoneAt] = useState<Record<string, string>>({});
  const [sequenceState, setSequenceState] = useState<SequenceState>(() =>
    emptySequenceState(),
  );
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setLoadError(null);
    void (async () => {
      try {
        const state = await api.readOnboardingState(root, clientSlug);
        if (cancelled) return;
        setDoneSet(state.done ?? []);
        setSkippedSet(state.skippedOptional ?? []);
        setPhaseDoneAt(state.phaseDoneAt ?? {});
        if (state.sequence) {
          setSequenceState({
            currentStep: state.sequence.currentStep as SequenceState["currentStep"],
            stepOutputs: state.sequence.stepOutputs as SequenceState["stepOutputs"],
            skipped: state.sequence.skipped as SequenceState["skipped"],
            launchedAt: state.sequence.launchedAt,
            driveFolderId: state.sequence.driveFolderId,
            campaignSkeleton: state.sequence.campaignSkeleton as SequenceState["campaignSkeleton"],
          });
        } else {
          setSequenceState(emptySequenceState());
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(String(e));
          setSequenceState(emptySequenceState());
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  const persist = (next: SequenceState) => {
    void api
      .writeOnboardingState(root, clientSlug, {
        done: doneSet,
        skippedOptional: skippedSet,
        phaseDoneAt,
        sequence: next,
      })
      .catch((err) => {
        console.error("CampaignTreePickOverlay: persist failed", err);
      });
  };

  const handleSkeletonChange = (next: CampaignSkeleton) => {
    setSequenceState((prev) => {
      const updated = { ...prev, campaignSkeleton: next };
      persist(updated);
      return updated;
    });
  };

  if (!loaded) {
    return (
      <div className="ct-pick-overlay">
        <div className="ct-pick-loading">Loading {clientName}'s campaign tree…</div>
        <style>{OVERLAY_CSS}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ct-pick-overlay">
        <div className="ct-pick-error">
          <div>Couldn't load campaign tree for {clientName}.</div>
          <div className="ct-pick-error-detail">{loadError}</div>
          <button type="button" className="hml-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <style>{OVERLAY_CSS}</style>
      </div>
    );
  }

  return (
    <div className="ct-pick-overlay">
      <CampaignTreeView
        clientName={clientName}
        sequenceState={sequenceState}
        onSkeletonChange={handleSkeletonChange}
        onClose={onClose}
        root={root}
        clientSlug={clientSlug}
        pendingSnippet={snippet}
        onPickSlot={(setIdx, adIdx) => {
          const where = `Ad set ${setIdx + 1} · Ad ${adIdx + 1}`;
          const preview =
            snippet.text.length > 48 ? snippet.text.slice(0, 48) + "…" : snippet.text;
          onPicked(`Dropped "${preview}" into ${where}.`);
        }}
        onCancelPick={onClose}
      />
      <style>{OVERLAY_CSS}</style>
    </div>
  );
}

const OVERLAY_CSS = `
.ct-pick-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(8, 10, 14, 0.96);
  overflow: auto;
}
.ct-pick-loading,
.ct-pick-error {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  justify-content: center;
  color: var(--hml-text-secondary);
  font-family: var(--hml-font-mono);
  font-size: 12px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.ct-pick-error-detail {
  font-family: var(--hml-font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: none;
  color: var(--hml-text-tertiary);
  max-width: 480px;
  text-align: center;
}
`;
