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

// One labelled figure on a phone card. A <dl> pair rather than two spans,
// because the label is the only thing saying what the number is once the column
// header is gone.
function MetaStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-faint">{label}</dt>
      <dd
        className={`truncate text-text tnum ${
          hint ? "cursor-help decoration-dotted underline-offset-[3px] [text-decoration-line:underline]" : ""
        }`}
        title={hint}
      >
        {value}
      </dd>
    </div>
  );
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
    <>
      {/* Phone: a card per day, tapping one opens its ads, same as the row does.
          The table is nine columns at min-w-[880px] in a ~408px column, so on a
          phone it was a sheet you dragged sideways to read one figure at a time.
          Spend leads because it is the number the day is opened for; the rest
          sit under it as a labelled grid, since a card has no column header to
          say which figure is which. */}
      <div className="flex shrink-0 flex-col gap-2 lg:hidden">
        {days.map((day) => {
          const isOpen = open.has(day.date);
          const exact = reachIsExact(day);
          return (
            <div key={day.date} className="rounded-lg border border-border bg-surface">
              <button
                type="button"
                onClick={() => toggle(day.date)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-text">
                    {displayDate(day.date)}
                  </span>
                  <span className="block text-[12px] text-faint">
                    {weekday(day.date)} · {day.ads.length} ad{day.ads.length === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-[15px] font-semibold text-text tnum">
                    {formatMoneyExact(day.spend)}
                  </span>
                  <ChevronRight
                    size={15}
                    aria-hidden
                    className={`shrink-0 text-faint transition-transform ${
                      isOpen ? "rotate-90" : ""
                    }`}
                  />
                </span>
              </button>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border/60 px-3.5 py-2.5 text-[12.5px]">
                <MetaStat label="Impressions" value={day.impressions.toLocaleString()} />
                <MetaStat
                  label="Reach"
                  value={exact ? day.reach.toLocaleString() : `≤ ${day.reach.toLocaleString()}`}
                  hint={
                    exact
                      ? undefined
                      : `Up to ${day.reach.toLocaleString()}. Reach counts people, not views, so adding ${day.ads.length} ads together counts anyone who saw more than one of them twice. Only Meta can de-duplicate it.`
                  }
                />
                <MetaStat label="Link clicks" value={day.linkClicks.toLocaleString()} />
                <MetaStat label="CTR" value={ctr(day.linkClicks, day.impressions)} />
                <MetaStat label="CPM" value={cpm(day.spend, day.impressions)} />
              </dl>

              {isOpen && (
                <div className="flex flex-col gap-2 border-t border-border bg-surface-2/40 px-3.5 py-3">
                  {day.ads.map((ad, i) => (
                    <div key={`${day.date}-${ad.adId}-${i}`} className="text-[12px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate font-medium text-text">
                          {ad.adName || "-"}
                        </span>
                        <span className="shrink-0 font-semibold text-text tnum">
                          {formatMoneyExact(ad.spend)}
                        </span>
                      </div>
                      {ad.adsetName && (
                        <div className="truncate text-[11px] text-faint">{ad.adsetName}</div>
                      )}
                      <div className="mt-0.5 text-[11px] text-muted tnum">
                        {ad.impressions.toLocaleString()} impressions ·{" "}
                        {ad.linkClicks.toLocaleString()} clicks ·{" "}
                        {ctr(ad.linkClicks, ad.impressions)} CTR
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* The table's tfoot, as a card. Reach is omitted rather than shown as
            "-": on a card there is no column to hold a dash, and a labelled
            "Reach -" reads as a missing figure rather than as one that cannot
            be added up. */}
        <div className="rounded-lg border border-border bg-surface-2/60 px-3.5 py-3">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">
            Total · {rows.length} ad day{rows.length === 1 ? "" : "s"}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
            <MetaStat label="Spend" value={formatMoneyExact(totals.spend)} />
            <MetaStat label="Impressions" value={totals.impressions.toLocaleString()} />
            <MetaStat label="Link clicks" value={totals.linkClicks.toLocaleString()} />
            <MetaStat label="CTR" value={ctr(totals.linkClicks, totals.impressions)} />
            <MetaStat label="CPM" value={cpm(totals.spend, totals.impressions)} />
          </dl>
        </div>
      </div>

      {/* Desktop: the sheet's table, unchanged.
          shrink-0 on this wrapper is not optional. The client's PAGE_CONTAINER is a
          flex column with flex-1, and a direct child carrying overflow-x-auto gets
          CLIPPED by flex-shrink rather than scrolling. That is what once rendered
          Paid Ads Results sliced in half. */}
    <div
      className={`hidden shrink-0 overflow-x-auto rounded-lg border border-border lg:block ${
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
    </>
  );
}
