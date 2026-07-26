import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, UserPlus } from "lucide-react";
import type { AdminLead } from "../../../lib/api";
import { STATUS_META } from "../../../lib/adminLeads";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import { useAssignableCallersQuery, useAssignLeads } from "../../../hooks/useLeadAssignment";
import { useToast } from "../../../context/ToastContext";
import ColdCallImportDialog from "./ColdCallImportDialog";

// Cold Call > Leads, the owner's half: the book, and who each row belongs to.
//
// The job this page does is the one Jake described: put the leads in, mark who
// they are for, and they appear on that person's queue. So the table leads with
// a checkbox and ends with an owner, and the only bulk action is handing work
// out or taking it back.
//
// Filtering by assignee is how you answer "what has he actually got left",
// which is the question that comes up when someone runs dry mid-shift.

type AssigneeFilter = "all" | "unassigned" | string;

function fullName(lead: AdminLead): string {
  return `${lead.firstName} ${lead.lastName}`.trim() || "Unnamed prospect";
}

// callerId, when set, preselects the assignee filter so the section's person
// selector and this page agree about who you are looking at.
export default function ColdCallManage({ callerId = "" }: { callerId?: string }) {
  const { showToast } = useToast();
  const leadsQuery = useAdminLeadsQuery();
  const callers = useAssignableCallersQuery();
  const assignLeads = useAssignLeads();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<AssigneeFilter>(callerId || "all");
  // Drag to select a run of rows: press on one, move down (or up) and every row
  // the pointer crosses joins the selection. This is how a list gets handed out
  // in practice, fifty at a time, and clicking fifty boxes is not that.
  const dragRef = useRef<{ anchor: number; adding: boolean } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [assignTo, setAssignTo] = useState("");

  useEffect(() => {
    setFilter(callerId || "all");
  }, [callerId]);

  const leads = leadsQuery.data?.leads ?? [];
  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of callers.data ?? []) map.set(c.id, c.name);
    return map;
  }, [callers.data]);

  const visible = useMemo(() => {
    if (filter === "all") return leads;
    if (filter === "unassigned") return leads.filter((l) => !l.assignedTo);
    return leads.filter((l) => l.assignedTo === filter);
  }, [leads, filter]);

  // Selection is kept across filter changes on purpose: pick fifty from one
  // view, fifty from another, hand out all hundred at once.
  const visibleIds = visible.map((l) => l.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Apply the drag to every row between the anchor and the row now under the
  // pointer. Recomputed from the anchor each time rather than accumulated, so
  // dragging back up UNSELECTS what overshooting just selected.
  const applyDrag = (index: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    const [from, to] = drag.anchor <= index ? [drag.anchor, index] : [index, drag.anchor];
    setSelected((prev) => {
      const next = new Set(prev);
      for (let i = from; i <= to; i++) {
        const id = visible[i]?.id;
        if (!id) continue;
        if (drag.adding) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const startDrag = (index: number, id: string) => {
    // Dragging from an unselected row selects; from a selected row it clears,
    // so the same gesture undoes itself.
    dragRef.current = { anchor: index, adding: !selected.has(id) };
    applyDragFrom(index, !selected.has(id));
  };

  // The first row of a drag, applied immediately so a plain click still works.
  const applyDragFrom = (index: number, adding: boolean) => {
    const id = visible[index]?.id;
    if (!id) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (adding) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  // The drag ends wherever the button is released, including outside the table.
  useEffect(() => {
    const end = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);

  const doAssign = async (target: string | null) => {
    if (selected.size === 0) return;
    try {
      const res = await assignLeads.mutateAsync({
        ids: [...selected],
        assignedTo: target,
      });
      showToast(
        target
          ? `${res.updated} handed to ${nameById.get(target) ?? "them"}`
          : `${res.updated} returned to the book`,
      );
      setSelected(new Set());
      setAssignTo("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not assign those leads");
    }
  };

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading the book...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load the book. Reload to try again.</div>;
  }

  return (
    <div>
      {/* Filter + import */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip on={filter === "all"} onClick={() => setFilter("all")}>
            Everyone ({leads.length})
          </FilterChip>
          <FilterChip on={filter === "unassigned"} onClick={() => setFilter("unassigned")}>
            Unassigned ({leads.filter((l) => !l.assignedTo).length})
          </FilterChip>
          {(callers.data ?? []).map((c) => {
            const count = leads.filter((l) => l.assignedTo === c.id).length;
            if (count === 0) return null;
            return (
              <FilterChip key={c.id} on={filter === c.id} onClick={() => setFilter(c.id)}>
                {c.name} ({count})
              </FilterChip>
            );
          })}
        </div>
        <button type="button" className="pk-link" onClick={() => setImportOpen(true)}>
          <Upload aria-hidden />
          Import CSV
        </button>
      </div>

      {/* Bulk bar. Only present when something is selected, so it never sits
          there implying an action nobody asked for. */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-brand bg-brand/5 px-4 py-3">
          <span className="text-[13px] font-semibold">{selected.size} selected</span>
          <select
            className="pk-select !w-auto"
            value={assignTo}
            onChange={(e) => setAssignTo(e.target.value)}
          >
            <option value="">Hand to...</option>
            {(callers.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="pk-btn-save"
            disabled={!assignTo || assignLeads.isPending}
            onClick={() => void doAssign(assignTo)}
          >
            <UserPlus size={14} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
            {assignLeads.isPending ? "Assigning..." : "Assign"}
          </button>
          <button
            type="button"
            className="pk-btn-cancel"
            disabled={assignLeads.isPending}
            onClick={() => void doAssign(null)}
          >
            Return to the book
          </button>
          <button
            type="button"
            className="pk-btn-cancel"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </button>
        </div>
      )}

      {/* The book */}
      {visible.length === 0 ? (
        <div className="pk-empty">
          {leads.length === 0
            ? "No leads yet. Import a CSV to fill the book."
            : "Nothing here with that filter."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11.5px] uppercase tracking-wider text-muted">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select every lead shown"
                  />
                </th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Source</th>
                <th className="px-3 py-2.5">Whose list</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((lead, index) => {
                const on = selected.has(lead.id);
                return (
                  <tr
                    key={lead.id}
                    onPointerDown={(e) => {
                      // Left button only, and never when the press landed on the
                      // checkbox itself (it has its own handler).
                      if (e.button !== 0) return;
                      if ((e.target as HTMLElement).closest("input")) return;
                      e.preventDefault();
                      startDrag(index, lead.id);
                    }}
                    onPointerEnter={() => applyDrag(index)}
                    className={`select-none border-b border-divider last:border-b-0 ${
                      on ? "bg-brand/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggleOne(lead.id)}
                        aria-label={`Select ${fullName(lead)}`}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium">{fullName(lead)}</td>
                    <td className="px-3 py-2.5 font-mono text-[12.5px]">
                      {lead.phone || "No number"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
                        style={{
                          background: `color-mix(in srgb, ${STATUS_META[lead.status].swatch} 14%, transparent)`,
                          color: STATUS_META[lead.status].swatch,
                        }}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{lead.source || "·"}</td>
                    <td className="px-3 py-2.5">
                      {lead.assignedTo ? (
                        nameById.get(lead.assignedTo) ?? "Someone else"
                      ) : (
                        <span className="text-faint">Nobody</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {importOpen && (
        <ColdCallImportDialog
          onClose={() => setImportOpen(false)}
          onImported={(summary) => {
            setImportOpen(false);
            showToast(summary);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
        on ? "border-brand bg-brand/10 text-brand" : "border-border text-muted hover:text-text",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
