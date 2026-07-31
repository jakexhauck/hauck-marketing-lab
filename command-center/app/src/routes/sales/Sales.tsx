import { useState } from "react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { TAB_TRACK, TabButton } from "../../components/PageTabs";
import { HandoffsBoard } from "../Handoffs";
import { JobsBoard } from "./Jobs";
import { useUpdateHandoff } from "../../hooks/useApi";
import type { ApiHandoff } from "../../lib/api";

// The combined Sales surface: one page, two tabs. "Leads" is the handoff
// outcomes board; "Schedule" is the jobs calendar. Booking an Estimate or Job
// from a lead sends the owner to the Schedule tab to pick a real open slot, then
// books it and moves the lead, so the whole journey lives under one roof.
type SalesTab = "leads" | "schedule";
const TAB_KEY = "hml_sales_tab";

export interface BookingRequest {
  handoffId: string;
  name: string;
  kind: "estimate" | "job";
  calendar: string; // the GHL calendar to book onto
  // Carried from the lead so a Job pre-fills what the estimate already captured.
  prefillAddress: string;
  prefillService: string;
}

function initialTab(): SalesTab {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("tab");
    if (fromUrl === "leads" || fromUrl === "schedule") return fromUrl;
    const saved = window.localStorage.getItem(TAB_KEY);
    if (saved === "leads" || saved === "schedule") return saved;
  } catch {
    /* ignore */
  }
  return "leads";
}

export default function Sales() {
  const [tab, setTab] = useState<SalesTab>(initialTab);
  const [booking, setBooking] = useState<BookingRequest | null>(null);
  const update = useUpdateHandoff();

  const select = (t: SalesTab) => {
    setTab(t);
    try {
      window.localStorage.setItem(TAB_KEY, t);
    } catch {
      /* ignore */
    }
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
        {/* The header panel every client page now opens with. Leads / Schedule
            are real page switchers rather than filters, so they belong inside
            the chrome beside the title, the same place a Marketing section's
            route tabs sit. tabs={[]} because these switch state, not routes. */}
        <div className="px-[22px] pt-5 lg:px-6">
          <PageBar tabs={[]} section="Sales">
            <div className={TAB_TRACK}>
              <TabButton active={tab === "leads"} onClick={() => select("leads")}>
                Leads
              </TabButton>
              <TabButton active={tab === "schedule"} onClick={() => select("schedule")}>
                Schedule
              </TabButton>
            </div>
          </PageBar>
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
