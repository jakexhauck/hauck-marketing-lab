import { SheetStyle } from "./SheetStyle";
import SmsDailySheet from "./SmsDailySheet";
import SmsMonthlySheet from "./SmsMonthlySheet";
import SmsScriptSheet from "./SmsScriptSheet";
import SmsBudgetSheet from "./SmsBudgetSheet";

// Acquisition > Cold SMS. The SMS Tracking tab of the Master Data Tracker
// Google Sheet, rebuilt so Jake types his SMS numbers here instead (Jake,
// 2026-10-01). One page: Daily with Script beside it at the top, then
// Monthly, then the SMS Budget (the month's estimated cost) as one horizontal
// band (Jake, 2026-10-05; no sub-pages since 2026-10-02). Script drops under
// Daily on a narrow screen. Daily keeps its own scroll box so the tables below
// stay reachable. Nothing is synced or automated.

export default function ColdSmsPage() {
  return (
    <>
      <SheetStyle />
      <div className="flex flex-col gap-6 pb-12">
        <div className="flex flex-wrap items-start gap-3">
          <SmsDailySheet />
          <SmsScriptSheet />
        </div>
        <SmsMonthlySheet />
        <SmsBudgetSheet />
      </div>
    </>
  );
}
