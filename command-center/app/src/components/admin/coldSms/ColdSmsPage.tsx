import { useSearchParams } from "react-router-dom";
import { TAB_TRACK, TabButton } from "../../PageTabs";
import { SheetStyle } from "./SheetStyle";
import SmsDailySheet from "./SmsDailySheet";
import SmsMonthlySheet from "./SmsMonthlySheet";
import SmsScriptSheet from "./SmsScriptSheet";

// Acquisition > Cold SMS. The SMS Tracking tab of the Master Data Tracker
// Google Sheet, rebuilt so Jake types his SMS numbers here instead (Jake,
// 2026-10-01). The sheet's three tables are three pages, picked from the strip
// and kept in ?view= so each is linkable. Nothing is synced or automated.

const VIEWS = [
  { id: "daily", label: "Daily" },
  { id: "monthly", label: "Monthly" },
  { id: "script", label: "Script" },
] as const;

type View = (typeof VIEWS)[number]["id"];

export function resolveSmsView(param: string | null): View {
  return VIEWS.find((v) => v.id === param)?.id ?? "daily";
}

export default function ColdSmsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const view = resolveSmsView(searchParams.get("view"));

  const setView = (next: View) =>
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        params.set("view", next);
        return params;
      },
      { replace: true },
    );

  return (
    <>
      <SheetStyle />
      <nav aria-label="Cold SMS pages" className="mb-5 flex">
        <div className={TAB_TRACK}>
          {VIEWS.map((v) => (
            <TabButton key={v.id} active={view === v.id} onClick={() => setView(v.id)}>
              {v.label}
            </TabButton>
          ))}
        </div>
      </nav>
      {view === "daily" && <SmsDailySheet />}
      {view === "monthly" && <SmsMonthlySheet />}
      {view === "script" && <SmsScriptSheet />}
    </>
  );
}
