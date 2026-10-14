import { useSearchParams } from "react-router-dom";
import { TabsStyle } from "../coldSms/ColdSmsPage";
import SmsPipelineBoard from "../coldSms/SmsPipelineBoard";
import SalesDataTracker from "../tracker/SalesDataTracker";
import SalesCalendar from "./SalesCalendar";

// Sales: one rail row, Pipeline and Data as tabs inside it (Jake, 2026-10-13),
// the same strip as Cold SMS. Calendar joined 2026-10-14. The tab stays in
// ?tab= (pipeline | sales-data | calendar) so
// old links to either page still land on it.

const VIEWS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "sales-data", label: "Data" },
  { id: "calendar", label: "Calendar" },
] as const;

export default function SalesPage({ tab }: { tab: string }) {
  const [, setParams] = useSearchParams();
  const view = tab === "sales-data" || tab === "calendar" ? tab : "pipeline";

  const pick = (id: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", id);
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <TabsStyle />
      <div className="flex flex-col gap-6 pb-12">
        <div className="cs-tabs" role="tablist" aria-label="Sales">
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
          <SmsPipelineBoard kind="sales" />
        ) : view === "calendar" ? (
          <SalesCalendar />
        ) : (
          <SalesDataTracker />
        )}
      </div>
    </>
  );
}
