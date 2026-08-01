import { useSearchParams } from "react-router-dom";
import {
  MANAGEMENT_PAGES,
  movedIntoManagement,
  resolveManagementPage,
} from "../../../lib/coldCallPages";
import ColdCallManage from "./ColdCallManage";
import ColdCallTeamAvailability from "./ColdCallTeamAvailability";
import ScriptsPanel from "./ScriptsPanel";
import AssetsPanel from "./AssetsPanel";
import StagesPanel from "./StagesPanel";
import { TAB_TRACK, TabButton } from "../../PageTabs";

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
  // With no ?manage= of its own, an old top-level link decides which page opens:
  // ?view=settings still means "the scripts", not Management's default.
  const page = resolveManagementPage(
    searchParams.get("manage") ?? movedIntoManagement(searchParams.get("view"), true),
  );

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
      {/* The third and deepest level of nav, in the same segmented track as the
          two above it. It used to be a row of outlined pills, which made three
          nested levels read as three unrelated controls. */}
      <nav
        aria-label="Management pages"
        className="mb-[18px] flex shrink-0 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <div className={TAB_TRACK}>
          {MANAGEMENT_PAGES.map((p) => (
            <TabButton key={p.id} active={page === p.id} onClick={() => setPage(p.id)}>
              {p.label}
            </TabButton>
          ))}
        </div>
      </nav>

      <ManagementBody page={page} callerId={callerId} />
    </div>
  );
}

function ManagementBody({ page, callerId }: { page: string; callerId: string }) {
  switch (page) {
    case "availability":
      return <ColdCallTeamAvailability />;
    // The pitch variations and, beneath them, the objection handling read
    // alongside. "Call shelf" used to be a page here and held only that one
    // document; ?manage=assets now resolves to this page.
    case "scripts":
      return <ScriptsPanel />;
    case "sops":
      // Which SOP Hub documents the team reads on their own SOPs page.
      return <AssetsPanel kind="sop" />;
    case "stages":
      return <StagesPanel />;
    default:
      // Unfiltered by stage on purpose: handing work out means seeing every
      // lead, not one stage at a time. The section's person selector still
      // narrows it to one assignee.
      return <ColdCallManage callerId={callerId} />;
  }
}

