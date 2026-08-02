import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { HandoffsBoard } from "../Handoffs";
import { JobsBoard } from "./Jobs";
import { useUpdateHandoff } from "../../hooks/useApi";
import type { ApiHandoff } from "../../lib/api";

// Leads and Schedule. "Leads" is the handoff outcomes board; "Schedule" is the
// jobs calendar. Booking an Estimate or Job from a lead sends the owner to
// Schedule to pick a real open slot, then books it and moves the lead, so the
// whole journey lives under one roof.
//
// They are SIDEBAR ROWS now, not tabs, but still ONE component mounted at
// /sales/*. That is deliberate and load-bearing: `booking` below is the state
// carrying a half-finished booking from one page to the other, and two separate
// routes would unmount this component on the jump and throw it away. The URL is
// the tab.
type SalesTab = "leads" | "schedule";

export interface BookingRequest {
  handoffId: string;
  name: string;
  kind: "estimate" | "job";
  calendar: string; // the GHL calendar to book onto
  // Carried from the lead so a Job pre-fills what the estimate already captured.
  prefillAddress: string;
  prefillService: string;
}

// Which page the URL is asking for. /sales/schedule is Schedule; everything
// else under /sales is Leads.
//
// ?tab=schedule is still honoured: it was the old in-page tab's URL and is what
// the retired /sales/jobs route redirected to, so a bookmark from before this
// change still lands where it names.
function tabFromLocation(pathname: string, search: string): SalesTab {
  if (pathname.startsWith("/sales/schedule")) return "schedule";
  try {
    if (new URLSearchParams(search).get("tab") === "schedule") return "schedule";
  } catch {
    /* ignore */
  }
  return "leads";
}

export default function Sales() {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabFromLocation(location.pathname, location.search);
  const [booking, setBooking] = useState<BookingRequest | null>(null);
  const update = useUpdateHandoff();

  // The URL is the tab, so switching pages is a navigation. replace: true so
  // the booking journey (Leads -> Schedule -> back to Leads) does not leave
  // three entries in the history for one job.
  const select = (t: SalesTab) => {
    navigate(t === "schedule" ? "/sales/schedule" : "/sales", { replace: true });
  };

  // Lead -> "book an estimate/job": jump to the Schedule tab in booking mode.
  const startBooking = (handoff: ApiHandoff, kind: "estimate" | "job") => {
    setBooking({
      handoffId: handoff.id,
      name: handoff.name,
      kind,
      calendar: kind === "estimate" ? "Home Estimate" : "Job",
      // A Job pre-fills address + service from the estimate; an estimate starts blank.
      prefillAddress: kind === "job" ? (handoff.address ?? "") : "",
      prefillService: kind === "job" ? (handoff.service ?? "") : "",
    });
    select("schedule");
  };

  // A slot + details were confirmed: record the appointment + move the lead.
  // The address / service / notes populate the real GHL appointment when live;
  // in demo we just move the lead and stamp the time.
  const confirmBooking = (
    iso: string,
    details: { address: string; service: string; notes: string },
  ) => {
    if (!booking) return;
    update.mutate({
      id: booking.handoffId,
      status: booking.kind === "estimate" ? "estimate_set" : "job_booked",
      ...(booking.kind === "estimate" ? { estimateAt: iso } : { jobAt: iso }),
      // Keep the address + service on the lead so the Job booking pre-fills them.
      address: details.address,
      service: details.service,
    });
    setBooking(null);
    select("leads");
  };

  const cancelBooking = () => {
    setBooking(null);
    select("leads");
  };

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col">
        {/* The header panel every client page opens with. No tab strip any more:
            Leads and Schedule are sidebar rows, so the section name is the page
            name and repeating the pair here would be a second copy of the nav. */}
        {/* px-5 (not the 22px this once used) so the header card's left edge
            lines up exactly with the board below it, which sits in
            PAGE_CONTAINER. The 2px difference read as a step down the page. */}
        <div className="px-5 pt-5 lg:px-6">
          <PageBar tabs={[]} section={tab === "schedule" ? "Schedule" : "Leads"} />
        </div>
        {/* PageBar's own mb-5 is the white space between the header and the
            board; the board brings its own top padding on top of that. */}
        <div className="flex min-h-0 flex-1 flex-col">
          {tab === "leads" ? (
            <HandoffsBoard onBook={startBooking} />
          ) : (
            <JobsBoard
              embedded
              booking={booking}
              onBookPick={confirmBooking}
              onBookCancel={cancelBooking}
            />
          )}
        </div>
      </div>
    </Shell>
  );
}
