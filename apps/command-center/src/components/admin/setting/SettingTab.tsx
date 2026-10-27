import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { Settings, X } from "lucide-react";
import {
  useSaveClientNotesMutation,
  useSaveSetterScriptMutation,
  useClientNotesQuery,
  useSetterScriptQuery,
} from "../../../hooks/useApi";
import { BoardTenantContext } from "../../../hooks/useColdSmsBoard";
import SmsPipelineBoard from "../coldSms/SmsPipelineBoard";
import ScriptEditor from "../script/ScriptEditor";

// Client > Client Setting (Jake, 2026-10-21; one page since 2026-10-27: "make it
// one page ... keep the pipeline and instead of enter live app make it Settings,
// the only option in there is to add a script").
//
// The page is the client's GHL Sales Pipeline on the Cold SMS board: drag to
// move in GHL, the lead's thread and reply box texting from the client's number,
// follow-ups, the right-click menu, and Call (their App Call workflow), Outcome
// and Book on every lead (SmsProspectPanel). The board's endpoints run on this
// client's sub-account because of the context (functions/lib/boardGhl.ts).
// While a lead is open the script sits beside them.
//
// Settings, in the top right where other client pages have Enter live app
// (SettingsButton, in routes/admin/ClientPage.tsx), holds two editors: the
// script and the client's notes, which sit beside the script while dialling
// when there are any. It rides in ?settings=1 so a refresh keeps it open.

const SETTINGS = "settings";

export default function SettingTab({ tenantId }: { tenantId: string }) {
  const [params, setParams] = useSearchParams();
  const close = () =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete(SETTINGS);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[22px] font-semibold text-text">Client Setting</h1>
      <BoardTenantContext.Provider value={tenantId}>
        <SmsPipelineBoard kind="setting" />
      </BoardTenantContext.Provider>
      {params.get(SETTINGS) === "1" && <SettingsDialog tenantId={tenantId} onClose={close} />}
    </div>
  );
}

export function SettingsButton() {
  const [, setParams] = useSearchParams();
  return (
    <button
      type="button"
      onClick={() =>
        setParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set(SETTINGS, "1");
          return next;
        })
      }
      className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand"
    >
      <Settings size={15} /> Settings
    </button>
  );
}

const TABS = [
  { id: "script", label: "Script" },
  { id: "notes", label: "Notes" },
] as const;

function SettingsDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("script");
  const script = useSetterScriptQuery(tenantId);
  const save = useSaveSetterScriptMutation(tenantId);
  const notes = useClientNotesQuery(tenantId);
  const saveNotes = useSaveClientNotesMutation(tenantId);

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
        aria-label="Settings"
        className="fixed left-1/2 top-[5vh] z-[71] flex max-h-[90vh] w-[min(900px,96vw)] -translate-x-1/2 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-surface shadow-2xl"
      >
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-4">
          <h2 className="font-display text-[18px] font-semibold text-text">Settings</h2>
          <div role="tablist" aria-label="Settings" className="ml-3 flex gap-1 rounded-xl bg-surface-2 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3.5 py-1.5 text-[13px] font-semibold ${
                  tab === t.id ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-muted hover:text-text"
          >
            <X size={16} />
          </button>
        </header>
        <div className="overflow-y-auto px-6 py-5">
          {tab === "script" ? (
            <ScriptEditor
              key={`${tenantId}:script`}
              title="Script"
              html={script.data?.html ?? ""}
              isLoading={script.isLoading}
              isError={script.isError}
              save={(html) => save.mutateAsync({ tenantId, html })}
            />
          ) : (
            <ScriptEditor
              key={`${tenantId}:notes`}
              title="Notes"
              html={notes.data?.html ?? ""}
              isLoading={notes.isLoading}
              isError={notes.isError}
              save={(html) => saveNotes.mutateAsync(html)}
            />
          )}
        </div>
      </section>
    </>,
    document.body,
  );
}
