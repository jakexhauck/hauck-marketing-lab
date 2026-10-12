import { useSearchParams } from "react-router-dom";
import { SheetStyle } from "./SheetStyle";
import SmsDailySheet from "./SmsDailySheet";
import SmsMonthlySheet from "./SmsMonthlySheet";
import SmsScriptSheet from "./SmsScriptSheet";
import SmsBudgetSheet from "./SmsBudgetSheet";
import SmsLeadsSheet from "./SmsLeadsSheet";
import SmsPipelineBoard from "./SmsPipelineBoard";

// Acquisition > Cold SMS. Tabs: Tracker and Leads (Jake, 2026-10-06), then
// Pipeline (Jake, 2026-10-12): the GHL Cold SMS pipeline as a board, with
// Claude sorting the replies (SmsPipelineBoard).
//
// Tracker is the SMS Tracking tab of the Master Data Tracker Google Sheet,
// rebuilt so Jake types his SMS numbers here instead (Jake, 2026-10-01):
// Daily with Script beside it at the top, then Monthly, then the SMS Budget
// (the month's estimated cost) as one horizontal band (Jake, 2026-10-05).
// Script drops under Daily on a narrow screen. Daily keeps its own scroll box
// so the tables below stay reachable. Nothing is synced or automated.
//
// Leads is the cold-sms-pipeline's textable leads, picked and downloaded as
// the GHL import CSV (SmsLeadsSheet). The tab rides in ?view= so a refresh
// stays put; ?tab= already belongs to the pillar.

const VIEWS = [
  { id: "tracker", label: "Tracker" },
  { id: "leads", label: "Leads" },
  { id: "pipeline", label: "Pipeline" },
] as const;

function TabsStyle() {
  return (
    <style>{`
      .pk-kit .cs-tabs {
        display: inline-flex; gap: 4px; padding: 5px; border-radius: 15px; align-self: flex-start;
        background: color-mix(in srgb, var(--text) 6%, transparent);
      }
      .pk-kit .cs-tab {
        border: 0; background: transparent; cursor: pointer; font: inherit;
        font-size: 13.5px; font-weight: 600; color: var(--text-muted);
        padding: 8px 16px; border-radius: 11px; transition: color .15s, background .15s;
      }
      .pk-kit .cs-tab:hover { color: var(--text); }
      .pk-kit .cs-tab.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }
    `}</style>
  );
}

export default function ColdSmsPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view = raw === "leads" || raw === "pipeline" ? raw : "tracker";

  const pick = (id: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (id === "tracker") next.delete("view");
        else next.set("view", id);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <SheetStyle />
      <TabsStyle />
      <div className="flex flex-col gap-6 pb-12">
        <div className="cs-tabs" role="tablist" aria-label="Cold SMS">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={view === v.id}
              className={`cs-tab${view === v.id ? " on" : ""}`}
              onClick={() => pick(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {view === "pipeline" ? (
          <SmsPipelineBoard />
        ) : view === "leads" ? (
          <SmsLeadsSheet />
        ) : (
          <>
            <div className="flex flex-wrap items-start gap-3">
              <SmsDailySheet />
              <SmsScriptSheet />
            </div>
            <SmsMonthlySheet />
            <SmsBudgetSheet />
          </>
        )}
      </div>
    </>
  );
}
