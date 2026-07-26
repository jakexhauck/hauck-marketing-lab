import { useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { effectiveAdminRole } from "../../../lib/adminRoles";
import type { AdminLeadStatus } from "../../../lib/api";
import { useAdminLeadsQuery } from "../../../hooks/useAdminLeads";
import CallWorkspace from "./CallWorkspace";
import ColdCallManage from "./ColdCallManage";

// Cold Call > Leads.
//
// Two jobs on one page. An owner opens it to run the book (import a list, hand
// rows out); a caller opens it to work their queue. So the owner gets a switch
// and lands on the one they came for, and a caller only ever sees the queue.
//
// The queue itself is CallWorkspace, shared with Callbacks: same list-and-call
// layout, same four outcome buttons, because it is the same job.
//
// The list is the agency prospect book. A caller may update a row he is working
// and cannot add or delete one, which the API enforces by role rather than by
// what is rendered here.

// The working queue: everything not yet resolved. Booked, Qualified, Closed and
// Dead have left it and live on their own pages.
const QUEUE_STATUSES: AdminLeadStatus[] = ["New", "Contacted", "No Answer"];

// callerId "" means everyone (the owner looking at the whole operation);
// otherwise the section is scoped to one person.
export default function ColdCallLeads({ callerId = "" }: { callerId?: string }) {
  const { admin } = useAuth();
  const isOwner = effectiveAdminRole(admin?.role) === "owner";
  const [mode, setMode] = useState<"manage" | "call">(isOwner ? "manage" : "call");
  const leadsQuery = useAdminLeadsQuery();

  const all = leadsQuery.data?.leads ?? [];
  const queue = useMemo(
    () =>
      all
        .filter((l) => (callerId ? l.assignedTo === callerId : true))
        .filter((l) => QUEUE_STATUSES.includes(l.status)),
    [all, callerId],
  );

  if (leadsQuery.isLoading) return <div className="pk-empty">Loading the list...</div>;
  if (leadsQuery.isError) {
    return <div className="pk-empty">Could not load the list. Reload to try again.</div>;
  }

  if (isOwner && mode === "manage") {
    return (
      <div>
        <ModeSwitch mode={mode} onChange={setMode} />
        <ColdCallManage callerId={callerId} />
      </div>
    );
  }

  return (
    <div>
      {isOwner && <ModeSwitch mode={mode} onChange={setMode} />}
      <CallWorkspace
        leads={queue}
        queueTitle="To call"
        emptyTitle="Queue is clear"
        emptyHint="Every prospect has been worked. Check Callbacks for who is due back."
      />
    </div>
  );
}

// Owner-only switch between running the book and working the queue.
function ModeSwitch({
  mode,
  onChange,
}: {
  mode: "manage" | "call";
  onChange: (mode: "manage" | "call") => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-1.5">
      {(["manage", "call"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={[
            "rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
            mode === m
              ? "border-brand bg-brand/10 text-brand"
              : "border-border text-muted hover:text-text",
          ].join(" ")}
        >
          {m === "manage" ? "Run the book" : "Work the queue"}
        </button>
      ))}
    </div>
  );
}
