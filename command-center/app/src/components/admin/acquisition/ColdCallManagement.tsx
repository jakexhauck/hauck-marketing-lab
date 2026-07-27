import { useSearchParams } from "react-router-dom";
import { MANAGEMENT_PAGES, resolveManagementPage } from "../../../lib/coldCallPages";
import ColdCallManage from "./ColdCallManage";
import ColdCallTeamAvailability from "./ColdCallTeamAvailability";

// Cold Call > Management: the owner's half of the operation, behind one tab.
//
// Not to be confused with ColdCallManage, which is the Assign leads SURFACE.
// This file is the container that holds it and the roster's week alongside it.
//
// Its pages live in ?manage=, a second level below ?view=, so a link to a
// specific management page survives a reload the same way every other page in
// this section does.
export default function ColdCallManagement({ callerId = "" }: { callerId?: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = resolveManagementPage(searchParams.get("manage"));

  const setPage = (next: string) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("manage", next);
        return params;
      },
      { replace: true },
    );
  };

  return (
    <div className="ccm">
      <ManagementStyle />

      <div className="ccm-tabs" role="tablist" aria-label="Management pages">
        {MANAGEMENT_PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={page === p.id}
            className={`ccm-tab${page === p.id ? " on" : ""}`}
            onClick={() => setPage(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {page === "availability" ? (
        <ColdCallTeamAvailability />
      ) : (
        // Unfiltered by stage on purpose: handing work out means seeing every
        // lead, not one stage at a time. The section's person selector still
        // narrows it to one assignee.
        <ColdCallManage callerId={callerId} />
      )}
    </div>
  );
}

function ManagementStyle() {
  return (
    <style>{`
      /* A quieter strip than the section's own: these are pages inside a page,
         and two tab rows shouting at the same weight reads as one confused row. */
      .ccm-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 18px; }
      .ccm-tab { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 6px 14px; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-muted); cursor: pointer; }
      .ccm-tab:hover { border-color: var(--brand); color: var(--brand-text); }
      .ccm-tab.on { background: var(--brand-tint); border-color: var(--brand); color: var(--brand-text); }
    `}</style>
  );
}
