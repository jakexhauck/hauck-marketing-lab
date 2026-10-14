// The look of the SMS Tracking tab of the Master Data Tracker Google Sheet,
// copied off the sheet's own published HTML (2026-10-01): every fill, text
// colour, border and column width below is the sheet's value, not a theme
// token. That is deliberate (Jake: "the exact same as it is in the sheet"), so
// these pages stay a white spreadsheet in dark mode too, the way the sheet does.
//
// Class names follow the sheet's columns. .g is a default gridline cell, .bx a
// black-bordered cell (the monthly and script tables are boxed in black).
export function SheetStyle() {
  return (
    <style>{`
      .sms-sheet {
        background: #ffffff; color: #000000; overflow: auto;
        max-height: calc(100vh - 190px); border: 1px solid #c0c0c0;
        font-family: Arial, sans-serif; font-size: 10pt;
      }
      .sms-sheet table { border-collapse: collapse; table-layout: fixed; }
      .sms-sheet th, .sms-sheet td {
        height: 21px; padding: 0 3px; overflow: hidden; white-space: nowrap;
        vertical-align: bottom; font-weight: normal; text-align: left;
      }
      .sms-sheet .g { border: 1px solid #e2e3e3; }
      .sms-sheet .bx { border: 1px solid #000000; }

      /* Header cells: black, or the dark grey the daily rate headers use. */
      .sms-sheet thead th {
        position: sticky; top: 0; z-index: 2; background: #000000; color: #ffffff;
        font-weight: bold; text-align: center; vertical-align: middle;
        white-space: normal; height: 34px; line-height: 1.15;
      }
      .sms-sheet thead th.dk { background: #434343; }
      .sms-sheet thead th.bx { border-color: #000000; }

      /* Daily body. */
      .sms-sheet td.dow { background: #cccccc; }
      .sms-sheet td.r { text-align: right; }
      .sms-sheet td.c { text-align: center; }
      .sms-sheet td.yel { background: #fff2cc; }

      /* Monthly body. Blue text is the sheet's own (docs-Inter, 11pt). */
      .sms-sheet td.blu { color: #2563eb; font-family: Inter, Arial, sans-serif; font-size: 11pt; }
      .sms-sheet td.bluf { background: #dbeafe; color: #2563eb; font-family: Inter, Arial, sans-serif; font-size: 11pt; }
      .sms-sheet td.lime { background: #00ff00; text-align: center; }

      /* Script rows. */
      .sms-sheet td.b { font-weight: bold; }
      .sms-sheet td.sblue { background: #c9daf8; font-weight: bold; }
      .sms-sheet td.syel { background: #fff2cc; font-weight: bold; }
      .sms-sheet td.syel.c { text-align: center; }
      .sms-sheet td.sgrn { background: #d9ead3; font-weight: bold; }
      .sms-sheet td.sorg { background: #fce5cd; font-weight: bold; }

      /* Typed cells: an input that looks like the cell, with the sheet's blue
         selection ring while it has the cursor. */
      .sms-sheet td input {
        display: block; width: 100%; height: 20px; border: 0; padding: 0; margin: 0;
        background: transparent; color: inherit; font: inherit; text-align: inherit;
      }
      .sms-sheet td input:focus { outline: 2px solid #1a73e8; outline-offset: 1px; }
      .sms-sheet td.empty { color: #5f6368; text-align: center; height: 60px; }
    `}</style>
  );
}
