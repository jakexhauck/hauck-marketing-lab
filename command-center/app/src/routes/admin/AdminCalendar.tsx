import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Loader2 } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import MonthGrid from "../../components/admin/calendar/MonthGrid";
import ConnectGoogleCard from "../../components/admin/calendar/ConnectGoogleCard";
import BlockEditorModal, { type BlockDraft } from "../../components/admin/calendar/BlockEditorModal";
import { api, type ApiWorkBlock, type CalendarBlocksResponse } from "../../lib/api";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// A default 9-11am block on a clicked day, in local time, as ISO.
function defaultDraftForDay(day: Date): BlockDraft {
  const s = new Date(day); s.setHours(9, 0, 0, 0);
  const e = new Date(day); e.setHours(11, 0, 0, 0);
  return { title: "", startsAt: s.toISOString(), endsAt: e.toISOString(), color: "deep" };
}

export default function AdminCalendar() {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [data, setData] = useState<CalendarBlocksResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<BlockDraft | null>(null);

  const { fromIso, toIso } = useMemo(() => {
    const from = new Date(cursor.year, cursor.month, 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(cursor.year, cursor.month + 1, 0);
    to.setDate(to.getDate() + 14);
    return { fromIso: from.toISOString(), toIso: to.toISOString() };
  }, [cursor]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await api<CalendarBlocksResponse>(`/api/admin/calendar/blocks?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the calendar.");
    } finally {
      setLoading(false);
    }
  }, [fromIso, toIso]);

  useEffect(() => { void load(); }, [load]);

  const saveBlock = async (b: BlockDraft) => {
    if (b.id) {
      await api(`/api/admin/calendar/blocks/${b.id}`, { method: "PATCH", body: JSON.stringify({ title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, color: b.color }) });
    } else {
      await api("/api/admin/calendar/blocks", { method: "POST", body: JSON.stringify({ title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, color: b.color }) });
    }
    await load();
  };

  const deleteBlock = async (id: string) => {
    await api(`/api/admin/calendar/blocks/${id}`, { method: "DELETE" });
    await load();
  };

  const move = (delta: number) => setCursor((c) => {
    const m = c.month + delta;
    return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
  });

  const blockToDraft = (b: ApiWorkBlock): BlockDraft => ({ id: b.id, title: b.title, startsAt: b.startsAt, endsAt: b.endsAt, color: b.color });

  return (
    <DesktopPage
      title="Calendar"
      subtitle={`${MONTHS[cursor.month]} ${cursor.year}`}
      actions={
        <div className="flex items-center gap-1.5">
          <button onClick={() => move(-1)} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted hover:bg-surface-2 hover:text-text"><ChevronLeft size={16} /></button>
          <button onClick={() => setCursor(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; })} className="rounded-[var(--radius)] border border-border px-3 py-2 text-[13px] font-semibold text-muted hover:bg-surface-2 hover:text-text">Today</button>
          <button onClick={() => move(1)} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-[var(--radius)] border border-border text-muted hover:bg-surface-2 hover:text-text"><ChevronRight size={16} /></button>
          <Button variant="primary" onClick={() => setEditing(defaultDraftForDay(new Date()))}><Plus size={16} /> New block</Button>
        </div>
      }
    >
      {data && <ConnectGoogleCard connected={data.connection.connected} email={data.connection.email} onChange={() => void load()} />}
      {data?.syncError && (
        <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
          Google sync notice: {data.syncError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-16 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Loading calendar...</div>
      ) : error ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">{error}</div>
      ) : data ? (
        <MonthGrid
          year={cursor.year}
          month={cursor.month}
          blocks={data.blocks}
          googleEvents={data.googleEvents}
          onPickDay={(day) => setEditing(defaultDraftForDay(day))}
          onPickBlock={(b) => setEditing(blockToDraft(b))}
        />
      ) : null}

      {editing && (
        <BlockEditorModal
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={saveBlock}
          onDelete={deleteBlock}
        />
      )}
    </DesktopPage>
  );
}
