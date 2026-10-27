import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useAdminClientsQuery, useClientNotesQuery, useSetterScriptQuery } from "../../../hooks/useApi";
import ScriptPanel from "../script/ScriptPanel";

// What a lead's panel gets on Client Setting (Jake, 2026-10-27), beside the
// shared Cold SMS panel (coldSms/SmsProspectPanel.tsx).

/** True when a saved document has words in it, not just empty tags. */
export function hasText(html: string): boolean {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
}

/**
 * The client's script, docked against the left edge of the lead's panel while
 * it is open ("when we are dialling make the script show up next to the
 * message popup"), and their notes beside it when there are any. Each column
 * hides below the width that fits it, and each can be closed.
 */
export function SettingScriptAside({ tenantId }: { tenantId: string }) {
  const [scriptShown, setScriptShown] = useState(true);
  const [notesShown, setNotesShown] = useState(true);
  const script = useSetterScriptQuery(tenantId);
  const notes = useClientNotesQuery(tenantId);
  const name = useAdminClientsQuery(true).data?.clients.find((c) => c.id === tenantId)?.name ?? "";
  const notesHtml = notes.data?.html ?? "";
  const showNotes = notesShown && hasText(notesHtml);
  if (!scriptShown && !showNotes) return null;

  return createPortal(
    <div
      className="fixed bottom-0 top-0 z-[61] hidden flex-row-reverse gap-3 p-3 lg:flex"
      style={{ right: "min(480px, 100vw)" }}
    >
      {scriptShown && (
        <div className="w-[440px] overflow-y-auto">
          <ScriptPanel
            inline
            html={script.data?.html ?? ""}
            subtitle={name}
            isLoading={script.isLoading}
            isError={script.isLoadingError}
            emptyHint="No script yet. Add one in Settings."
            onClose={() => setScriptShown(false)}
          />
        </div>
      )}
      {showNotes && (
        <div className="hidden w-[360px] overflow-y-auto xl:block">
          <ScriptPanel
            inline
            title="Notes"
            html={notesHtml}
            subtitle={name}
            isLoading={false}
            isError={false}
            emptyHint=""
            onClose={() => setNotesShown(false)}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

/** The lead's outcome page (the Setting tab's, /api/setter-outcome) over the board. */
export function SettingOutcomeDialog({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[70] bg-black/50" onClick={onClose} aria-hidden />
      <section
        role="dialog"
        aria-label={`Outcome for ${name}`}
        className="fixed left-1/2 top-[4vh] z-[71] flex h-[92vh] w-[min(560px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          <h2 className="min-w-0 flex-1 truncate font-display text-[16px] font-semibold text-text">Outcome</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted hover:text-text"
          >
            <X size={16} />
          </button>
        </header>
        <iframe src={url} title="Outcome" className="w-full flex-1 bg-white" />
      </section>
    </>,
    document.body,
  );
}
