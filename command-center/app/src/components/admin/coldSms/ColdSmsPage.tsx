import { SheetStyle } from "./SheetStyle";
import SmsDailySheet from "./SmsDailySheet";
import SmsMonthlySheet from "./SmsMonthlySheet";
import SmsScriptSheet from "./SmsScriptSheet";
import SmsBudgetSheet from "./SmsBudgetSheet";

// Acquisition > Cold SMS. The SMS Tracking tab of the Master Data Tracker
// Google Sheet, rebuilt so Jake types his SMS numbers here instead (Jake,
// 2026-10-01). One page, the sheet's three tables stacked: Daily on top, then
// Monthly, then Script (Jake, 2026-10-02: no sub-pages), then the SMS Budget,
// the month's estimated cost (Jake, 2026-10-05). Daily keeps its own scroll
// box so the tables below stay reachable. Nothing is synced or automated.

export default function ColdSmsPage() {
  return (
    <>
      <SheetStyle />
      <div className="flex flex-col gap-6">
        <SmsDailySheet />
        <SmsMonthlySheet />
        <SmsScriptSheet />
        <SmsBudgetSheet />
      </div>
    </>
  );
}
