import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatMoneyExact } from "../../../lib/formatMoney";
import type { MetaDataRow } from "../../../lib/api";
import { groupMetaDaysByDate, reachIsExact, totalMetaDays } from "../../../lib/metaDays";

// The Paid Ads Meta Data sheet: the raw daily Meta snapshot, ONE ROW PER DAY,
// opening to the ads that made it.
//
// Rendered by BOTH the client's own page and the admin cockpit's Paid Ads >
// Meta Data tab.
//
// meta_ad_days stores a row per ad per day, and drawing that raw made a
// three-ad day three rows: reading a day's spend meant adding them up by eye,
// and a day with nine ads buried the day itself. The per-ad detail is not gone,
// it is one click down and sorted by spend, so the ad taking the budget is the
// first thing read.
//
// CTR, CPM and the weekday are derived here (the sheet recomputed them too)
// rather than stored. Derived from the day's TOTALS, not averaged across the
// ads: a mean of three CTRs weights a six-impression ad the same as a
// three-hundred-impression one, which is how a dead ad flatters a day.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  return WEEKDAYS[new Date(y, m - 1, d).getDay()] ?? "";
}

function ctr(clicks: number, impressions: number): string {
  return impressions ? `${((clicks / impressions) * 100).toFixed(2)}%` : "-";
}

function cpm(spend: number, impressions: number): string {
  return impressions ? formatMoneyExact((spend / impressions) * 1000) : "-";
}

function displayDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MetaDataTable({
  rows,
  // The client page insets the sheet from the page gutter so it reads as an
  // object on the page; inside the cockpit's own padded section it does not.
  inset = false,
}: {
  rows: MetaDataRow[];
  inset?: boolean;
}) {
  const days = useMemo(() => groupMetaDaysByDate(rows), [rows]);
  const totals = useMemo(() => totalMetaDays(days), [days]);

  // Which days are open. A Set rather than one id, because comparing two days
  // means having both of them open at once.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (date: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });

  if (days.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-[13px] text-muted">
        No ad data has been pulled in yet.
      </div>
    );
  }

  return (
    // shrink-0 on this wrapper is not optional. The client's PAGE_CONTAINER is a
    // flex column with flex-1, and a direct child carrying overflow-x-auto gets
    // CLIPPED by flex-shrink rather than scrolling. That is what once rendered
    // Paid Ads Results sliced in half.
    <div
      className={`shrink-0 overflow-x-auto rounded-lg border border-border ${
        inset ? "sm:mx-4 lg:mx-10" : ""
      }`}
    >
      <table className="w-full min-w-[880px] border-collapse text-[12.5px]">
        <thead>
          <tr className="whitespace-nowrap border-b border-border text-[11px] text-faint">
            <th className="px-3 py-2.5 text-left font-semibold">Date</th>
            <th className="px-3 py-2.5 text-right font-semibold">Ads</th>
            <th className="px-3 py-2.5 text-right font-semibold">Spend</th>
            <th className="px-3 py-2.5 text-right font-semibold">Impressions</th>
            <th className="px-3 py-2.5 text-right font-semibold">Reach</th>
            <th className="px-3 py-2.5 text-right font-semibold">Link Clicks</th>
            <th className="px-3 py-2.5 text-right font-semibold">CTR</th>
            <th className="px-3 py-2.5 text-right font-semibold">CPM</th>
            <th className="px-3 py-2.5 text-right font-semibold">Day</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const isOpen = open.has(day.date);
            const exact = reachIsExact(day);
            return [
              <tr
                key={day.date}
                onClick={() => toggle(day.date)}
                aria-expanded={isOpen}
                className={`cursor-pointer border-b border-border/60 hover:bg-surface ${
                  isOpen ? "bg-surface" : ""
                }`}
              >
                <td className="whitespace-nowrap px-3 py-2.5 text-text tnum">
                  <span className="inline-flex items-center gap-1.5">
                    <ChevronRight
                      size={13}
                      aria-hidden
                      className={`shrink-0 text-faint transition-transform ${
                        isOpen ? "rotate-90" : ""
                      }`}
                    />
                    {displayDate(day.date)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-muted tnum">{day.ads.length}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-text tnum">
                  {formatMoneyExact(day.spend)}
                </td>
                <td className="px-3 py-2.5 text-right text-text tnum">
                  {day.impressions.toLocaleString()}
                </td>
                {/* Reach is unique people, so adding the ads together counts
                    anyone who saw two of them twice. Marked rather than either
                    hidden or printed as though it were exact. */}
                <td
                  className="px-3 py-2.5 text-right text-text tnum"
                  title={
                    exact
                      ? undefined
                      : `Up to ${day.reach.toLocaleString()}. Reach counts people, not views, so adding ${day.ads.length} ads together counts anyone who saw more than one of them twice. Only Meta can de-duplicate it.`
                  }
                >
                  {exact ? (
                    day.reach.toLocaleString()
                  ) : (
                    <span className="cursor-help decoration-dotted underline-offset-[3px] [text-decoration-line:underline]">
                      ≤ {day.reach.toLocaleString()}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-text tnum">
                  {day.linkClicks.toLocaleString()}
                </td>
                <td className="px-3 py-2.5 text-right text-text tnum">
                  {ctr(day.linkClicks, day.impressions)}
                </td>
                <td className="px-3 py-2.5 text-right text-text tnum">
                  {cpm(day.spend, day.impressions)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right text-faint">
                  {weekday(day.date)}
                </td>
              </tr>,

              ...(isOpen
                ? day.ads.map((ad, i) => (
                    <tr
                      key={`${day.date}-${ad.adId}-${i}`}
                      className="border-b border-border/60 bg-surface-2/40 text-[12px]"
                    >
                      {/* The ad set sits UNDER the ad name rather than in its
                          own cell. It had one, and when Day moved to the far
                          right every number on these rows slid a column left of
                          the day-row figure it belongs beneath. One cell for the
                          ad, and the rest line up. */}
                      <td
                        className="max-w-[280px] py-2 pl-9 pr-3 text-text"
                        title={`${ad.campaignName} > ${ad.adsetName} > ${ad.adName}`}
                      >
                        <span className="block truncate">{ad.adName || "-"}</span>
                        {ad.adsetName && (
                          <span className="block truncate text-[11px] text-faint">
                            {ad.adsetName}
                          </span>
                        )}
                      </td>
                      <td />
                      <td className="px-3 py-2 text-right text-muted tnum">
                        {formatMoneyExact(ad.spend)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted tnum">
                        {ad.impressions.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-muted tnum">
                        {ad.reach.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-muted tnum">
                        {ad.linkClicks.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right text-muted tnum">
                        {ctr(ad.linkClicks, ad.impressions)}
                      </td>
                      <td className="px-3 py-2 text-right text-muted tnum">
                        {cpm(ad.spend, ad.impressions)}
                      </td>
                      <td />
                    </tr>
                  ))
                : []),
            ];
          })}
        </tbody>

        <tfoot>
          <tr className="border-t border-border text-[12px] font-semibold">
            <td className="px-3 py-2.5 text-text">Total</td>
            <td className="px-3 py-2.5 text-right text-muted tnum">{rows.length}</td>
            <td className="px-3 py-2.5 text-right text-text tnum">
              {formatMoneyExact(totals.spend)}
            </td>
            <td className="px-3 py-2.5 text-right text-text tnum">
              {totals.impressions.toLocaleString()}
            </td>
            {/* Never exact across more than one day, for the same reason it is
                not across more than one ad. */}
            <td className="px-3 py-2.5 text-right text-faint tnum">-</td>
            <td className="px-3 py-2.5 text-right text-text tnum">
              {totals.linkClicks.toLocaleString()}
            </td>
            <td className="px-3 py-2.5 text-right text-text tnum">
              {ctr(totals.linkClicks, totals.impressions)}
            </td>
            <td className="px-3 py-2.5 text-right text-text tnum">
              {cpm(totals.spend, totals.impressions)}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
