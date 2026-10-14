import { Users, CalendarCheck } from "lucide-react";
import Shell from "../../components/Shell";
import PageBar from "../../components/PageBar";
import { REACTIVATION_TABS } from "../../lib/pageTabs";
import { Panel, PanelHeader, EmptyState } from "../../components/ui";
import { useAuth } from "../../context/AuthContext";
import { PAGE_CONTAINER } from "../../lib/layout";
import { useReactivation } from "../../hooks/useReactivation";
import { REACT_STAGE_ROWS, reactRates } from "../../lib/reactivation";

// Reactivation > Full Data: the detailed breakdown of the win-back campaign,
// moved off the Overview so the summary stays light. Everyone reached, the full
// stage distribution, the derived rates, and the customers won back most
// recently. Real data, honest empties. Read-only. Customer language only.

export default function ReactivationData() {
  const { session } = useAuth();
  const { data } = useReactivation(Boolean(session));

  const reached = data?.reached ?? 0;
  const rates = reactRates(data);

  // Raw counts, spelled out (the "by the numbers" table).
  const metrics = [
    { label: "Reached out to", value: reached },
    { label: "Replied", value: data?.replied ?? 0 },
    { label: "No answer yet", value: data?.noAnswer ?? 0 },
    { label: "Estimates booked", value: data?.booked ?? 0 },
    { label: "Not a fit", value: data?.notFit ?? 0 },
  ];

  const rateRows = [
    { label: "Reply rate", value: rates.replyRate },
    { label: "Estimates booked", value: rates.bookedRate },
    { label: "Still no answer", value: rates.noAnswerRate },
  ];

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageBar
          tabs={REACTIVATION_TABS}
        />

        {/* Renders as zeros before the campaign starts and fills in as
            customers move through. */}
        <>
            {/* By the numbers: the raw counts spelled out. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {metrics.map((m) => (
                <Panel key={m.label} className="p-4">
                  <div className="text-[13px] text-muted">{m.label}</div>
                  <div className="mt-2 font-data text-[26px] font-semibold tnum text-text">
                    {m.value.toLocaleString("en-US")}
                  </div>
                </Panel>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="flex flex-col gap-4 lg:col-span-2">
                {/* Full stage distribution: one row per bucket, measured against
                    the reached total. */}
                <Panel className="overflow-hidden">
                  <PanelHeader title="Where they are now" />
                  <div className="flex flex-col gap-4 p-4">
                    {REACT_STAGE_ROWS.map((s) => {
                      const count = data?.[s.key] ?? 0;
                      return (
                        <div key={s.key}>
                          <div className="flex items-baseline justify-between gap-3">
                            <div className="flex items-center gap-2 font-display text-[14px] text-text">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={s.grad ? { backgroundImage: s.bar } : { background: s.bar }}
                                aria-hidden
                              />
                              {s.label}
                            </div>
                            <div className="shrink-0 font-data text-[13px] font-semibold text-text">{count}</div>
                          </div>
                          <div className="mt-1 pl-[18px] text-[12px] text-faint">{s.hint}</div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max((count / Math.max(reached, 1)) * 100, count > 0 ? 3 : 0)}%`,
                                ...(s.grad ? { backgroundImage: s.bar } : { background: s.bar }),
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-1.5 pt-1 text-[12px] text-faint">
                      <Users size={13} /> {reached.toLocaleString("en-US")} customers reached so far
                    </div>
                  </div>
                </Panel>

                {/* Derived rates. */}
                <Panel className="overflow-hidden">
                  <PanelHeader title="Rates" />
                  <div className="grid grid-cols-1 gap-px bg-divider sm:grid-cols-3">
                    {rateRows.map((r) => (
                      <div key={r.label} className="bg-surface p-4">
                        <div className="text-[13px] text-muted">{r.label}</div>
                        <div className="mt-1 font-data text-[24px] font-semibold tnum text-text">{r.value}%</div>
                      </div>
                    ))}
                  </div>
                </Panel>
              </div>

              {/* Recently won back. */}
              <div className="flex flex-col gap-4">
                <Panel className="overflow-hidden">
                  <PanelHeader title="Recently won back" />
                  {data && data.recent.length > 0 ? (
                    <ul>
                      {data.recent.map((r) => (
                        <li
                          key={r.name}
                          className="flex items-center gap-3 border-b border-divider px-4 py-3 last:border-b-0"
                        >
                          <span
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[14px] font-semibold"
                            style={{ background: "var(--brand-tint)", color: "var(--brand-text)" }}
                            aria-hidden
                          >
                            {r.initials}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-display text-[14px] text-text">{r.name}</div>
                            <div className="mt-0.5 text-[12px] text-faint">{r.sub}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="px-4 py-10">
                      <EmptyState
                        icon={<CalendarCheck size={22} />}
                        title="No win-backs yet"
                        description="Customers this campaign brings back will appear here."
                      />
                    </div>
                  )}
                </Panel>
              </div>
            </div>
        </>
      </div>
    </Shell>
  );
}
