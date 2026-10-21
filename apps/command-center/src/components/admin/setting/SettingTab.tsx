import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, ClipboardList, Phone } from "lucide-react";
import { ErrorNote, Spinner } from "../../../routes/paid-ads/trackerShared";
import {
  useSaveSetterScriptMutation,
  useSetterScriptQuery,
  useSettingBoardQuery,
  useSettingCall,
  useSettingOutcomeLinkQuery,
} from "../../../hooks/useApi";
import { clientPath } from "../../../lib/clientNav";
import type { BoardLead, BoardPayload, BoardStage } from "../../../lib/leadBoard";
import ScriptEditor from "../script/ScriptEditor";
import SettingBookingWizard from "./SettingBookingWizard";

// Client > Setting (Jake, 2026-10-21). Jake sets appointments for the client:
// their GHL Sales Pipeline with a Call on every lead, the setter script, and the
// universal outcome page for the lead he just called. Call enrols the lead in
// the sub-account's App Call workflow, which rings Jake and bridges the lead
// from the client's number. The chosen lead rides in ?c= so Call on the
// Pipeline lands on that lead's Outcome; ?book=1 opens the booking wizard
// (SettingBookingWizard, the Cold SMS wizard over the client's calendar).

type Sub = "pipeline" | "script" | "outcome";

export default function SettingTab({ tenantId, sub }: { tenantId: string; sub: string | null }) {
  const page: Sub = sub === "script" || sub === "outcome" ? sub : "pipeline";
  if (page === "script") return <ScriptPage tenantId={tenantId} />;
  if (page === "outcome") return <OutcomePage tenantId={tenantId} />;
  return <PipelinePage tenantId={tenantId} />;
}

function useCallLead(tenantId: string) {
  const call = useSettingCall(tenantId);
  const [state, setState] = useState<{ id: string; error: string | null } | null>(null);
  const ring = async (contactId: string) => {
    setState({ id: contactId, error: null });
    try {
      await call.mutateAsync(contactId);
      return true;
    } catch (err) {
      setState({ id: contactId, error: err instanceof Error ? err.message : "Could not start the call." });
      return false;
    }
  };
  return { ring, busy: call.isPending ? state?.id ?? null : null, state };
}

function PipelinePage({ tenantId }: { tenantId: string }) {
  const navigate = useNavigate();
  const board = useSettingBoardQuery(tenantId);
  const { ring, busy, state } = useCallLead(tenantId);

  const open = (contactId: string, book = false) =>
    navigate(`${clientPath(tenantId, "setting", "outcome")}?c=${encodeURIComponent(contactId)}${book ? "&book=1" : ""}`);

  if (board.isLoading) return <Spinner />;
  if (board.isError) return <ErrorNote message={(board.error as Error).message} />;
  const data = board.data as BoardPayload;
  if (data.configError) return <Empty text="No Sales Pipeline in this sub-account." />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-[22px] font-semibold text-text">Pipeline</h1>
      {state?.error && (
        <div className="rounded-[var(--radius)] border border-danger/30 bg-danger-tint px-4 py-2.5 text-[13px] text-danger">
          {state.error}
        </div>
      )}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {data.stages.map((stage) => (
          <Column
            key={stage.id}
            stage={stage}
            leads={data.leads.filter((l) => l.stageId === stage.id)}
            busy={busy}
            calledId={state && !state.error && !busy ? state.id : null}
            onCall={(id) => void ring(id).then((ok) => ok && open(id))}
            onOutcome={open}
            onBook={(id) => open(id, true)}
          />
        ))}
      </div>
    </div>
  );
}

function Column({
  stage,
  leads,
  busy,
  calledId,
  onCall,
  onOutcome,
  onBook,
}: {
  stage: BoardStage;
  leads: BoardLead[];
  busy: string | null;
  calledId: string | null;
  onCall: (contactId: string) => void;
  onOutcome: (contactId: string) => void;
  onBook: (contactId: string) => void;
}) {
  return (
    <section className="flex w-[260px] shrink-0 flex-col rounded-[var(--radius-lg)] border border-border bg-[var(--surface-2)]">
      <header className="flex items-center gap-2 px-3 py-2.5">
        <span className="h-2 w-2 rounded-full" style={{ background: stage.color ?? "var(--text-faint)" }} />
        <span className="truncate text-[13px] font-semibold text-text">{stage.name}</span>
        <span className="tnum ml-auto text-[12px] text-[var(--text-faint)]">{leads.length}</span>
      </header>
      <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto px-2 pb-2">
        {leads.map((lead) => (
          <li key={lead.id} className="rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5">
            <div className="truncate text-[13.5px] font-semibold text-text">{lead.name}</div>
            <div className="tnum mt-0.5 flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
              <span className="truncate">{lead.phone || "No phone"}</span>
              <span className="ml-auto shrink-0">{age(lead.createdAt)}</span>
            </div>
            {lead.contactId && (
              <div className="mt-2 flex gap-1.5">
                <button
                  type="button"
                  disabled={!lead.phone || busy !== null}
                  onClick={() => onCall(lead.contactId!)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius)] bg-brand px-2 py-1.5 text-[12.5px] font-semibold text-white disabled:opacity-50"
                >
                  <Phone size={13} />
                  {busy === lead.contactId ? "Ringing..." : calledId === lead.contactId ? "Called" : "Call"}
                </button>
                <button
                  type="button"
                  onClick={() => onOutcome(lead.contactId!)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius)] border border-border px-2 py-1.5 text-[12.5px] font-semibold text-text hover:border-brand"
                >
                  <ClipboardList size={13} /> Outcome
                </button>
                <button
                  type="button"
                  aria-label="Book"
                  title="Book"
                  onClick={() => onBook(lead.contactId!)}
                  className="inline-flex items-center justify-center rounded-[var(--radius)] border border-border px-2 py-1.5 text-text hover:border-brand"
                >
                  <CalendarPlus size={13} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScriptPage({ tenantId }: { tenantId: string }) {
  const script = useSetterScriptQuery(tenantId);
  const save = useSaveSetterScriptMutation(tenantId);
  return (
    <div className="flex flex-col gap-4">
      <ScriptEditor
        key={tenantId}
        title="Script"
        html={script.data?.html ?? ""}
        isLoading={script.isLoading}
        isError={script.isError}
        save={(html) => save.mutateAsync({ tenantId, html })}
      />
    </div>
  );
}

function OutcomePage({ tenantId }: { tenantId: string }) {
  const [params, setParams] = useSearchParams();
  const contactId = params.get("c");
  const board = useSettingBoardQuery(tenantId);
  const link = useSettingOutcomeLinkQuery(tenantId, contactId);
  const [booking, setBooking] = useState(params.get("book") === "1");
  const [booked, setBooked] = useState<string | null>(null);
  // Bumped after a wizard booking so the framed page reloads with it.
  const [frame, setFrame] = useState(0);

  // Every lead with a contact, newest first, for the picker.
  const leads = useMemo(
    () => (board.data?.leads ?? []).filter((l): l is BoardLead & { contactId: string } => !!l.contactId),
    [board.data],
  );
  const stageName = useMemo(
    () => new Map((board.data?.stages ?? []).map((s) => [s.id, s.name])),
    [board.data],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[22px] font-semibold text-text">Outcome</h1>
        <select
          value={contactId ?? ""}
          onChange={(e) => {
            setBooked(null);
            setParams(e.target.value ? { c: e.target.value } : {});
          }}
          className="ml-auto min-w-[260px] rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] text-text"
        >
          <option value="">Pick a lead</option>
          {leads.map((l) => (
            <option key={l.id} value={l.contactId}>
              {l.name}
              {l.phone ? ` · ${l.phone}` : ""}
              {stageName.get(l.stageId) ? ` · ${stageName.get(l.stageId)}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!link.data}
          onClick={() => setBooking(true)}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          <CalendarPlus size={15} /> Book
        </button>
      </div>
      {booked && (
        <div className="rounded-[var(--radius)] border border-[var(--positive)]/30 bg-[var(--positive-tint)] px-4 py-2.5 text-[13px] font-semibold text-[var(--positive)]">
          {booked}
        </div>
      )}
      {booking && link.data && (
        <SettingBookingWizard
          outcomeUrl={link.data.url}
          onClose={() => setBooking(false)}
          onBooked={(message) => {
            setBooking(false);
            setBooked(message);
            setFrame((n) => n + 1);
          }}
        />
      )}
      {!contactId ? (
        <Empty text="No lead picked." />
      ) : link.isLoading ? (
        <Spinner />
      ) : link.isError || !link.data ? (
        <ErrorNote message={(link.error as Error | null)?.message} />
      ) : (
        <iframe
          key={`${link.data.url}#${frame}`}
          src={link.data.url}
          title="Outcome"
          className="h-[80vh] w-full max-w-[560px] self-center rounded-[var(--radius-lg)] border border-border bg-white"
        />
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border bg-surface px-4 py-10 text-center text-[13px] text-[var(--text-muted)]">
      {text}
    </div>
  );
}

function age(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}
