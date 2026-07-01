import { useMemo } from "react";
import { demoMode } from "../demo/demoMode";
import { useCalendarEventsQuery } from "./useApi";
import { useJobs } from "./useJobs";
import {
  appointmentToItem,
  jobToItem,
  type CalendarItem,
  type CalendarSource,
} from "../lib/calendarModel";
import {
  DEMO_APPOINTMENTS,
  DEMO_SOCIAL,
  DEMO_CAMPAIGNS,
} from "../lib/calendarDemo";

export interface CalendarData {
  items: CalendarItem[];
  timezone: string | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  // Which streams actually have a live source wired right now. Drives the
  // not-connected messaging and keeps the legend honest.
  connected: Record<CalendarSource, boolean>;
}

// The single source of truth for what shows on the Company calendar. In demo mode
// it returns rich sample data for all four streams. In a real session it returns
// only connected feeds: appointments (live via GHL) plus jobs when useJobs is
// wired; social + campaigns stay empty until those backends exist, so a real
// client never sees fabricated content.
export function useCalendarItems(enabled: boolean): CalendarData {
  const demo = demoMode();
  const apptQuery = useCalendarEventsQuery(enabled && !demo);
  const jobs = useJobs(); // demo-rich, [] in a real session

  return useMemo<CalendarData>(() => {
    if (demo) {
      const jobItems = jobs.map(jobToItem);
      return {
        items: [
          ...DEMO_APPOINTMENTS,
          ...jobItems,
          ...DEMO_SOCIAL,
          ...DEMO_CAMPAIGNS,
        ],
        timezone: null,
        isLoading: false,
        isError: false,
        error: null,
        connected: { appointment: true, job: true, social: true, campaign: true },
      };
    }

    const tz = apptQuery.data?.timezone ?? null;
    const appts = (apptQuery.data?.events ?? []).map((e) =>
      appointmentToItem(e, tz),
    );
    const jobItems = jobs.map(jobToItem); // [] until the live feed lands

    return {
      items: [...appts, ...jobItems],
      timezone: tz,
      isLoading: apptQuery.isLoading,
      isError: apptQuery.isError,
      error: (apptQuery.error as Error | null) ?? null,
      // Appointments are the only live stream today; jobs flips on when useJobs
      // returns rows; social + campaigns are not wired yet.
      connected: {
        appointment: true,
        job: jobItems.length > 0,
        social: false,
        campaign: false,
      },
    };
  }, [
    demo,
    jobs,
    apptQuery.data,
    apptQuery.isLoading,
    apptQuery.isError,
    apptQuery.error,
  ]);
}
