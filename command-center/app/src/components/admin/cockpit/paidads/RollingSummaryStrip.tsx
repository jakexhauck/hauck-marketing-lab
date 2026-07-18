import {
  SUMMARY_CHIPS,
  formatMetric,
  type AdTrackingInputs,
  type AdTrackingRatios,
  type SummaryWindow,
} from "../../../../lib/adTrackingMetrics";

// The rolling-window summary above the Ad Tracking table: a 4 / 7 / 30 / MTD
// selector and the eight chips it drives. Ported from the .stripwrap block of
// docs/mockups/admin-redesign/ad-tracking-A.html.
//
// The chips read already-rolled numbers (sums and the ratios computed FROM those
// sums, in adTrackingMetrics.rollupWindow), so this component does no math of
// its own: a window is a true ratio of sums, never an average of daily ratios.

const WINDOWS: { value: SummaryWindow; label: string }[] = [
  { value: 4, label: "4-day" },
  { value: 7, label: "7-day" },
  { value: 30, label: "30-day" },
  { value: "mtd", label: "MTD" },
];

export default function RollingSummaryStrip({
  window,
  onWindowChange,
  sums,
  ratios,
}: {
  window: SummaryWindow;
  onWindowChange: (window: SummaryWindow) => void;
  sums: AdTrackingInputs;
  ratios: AdTrackingRatios;
}) {
  return (
    <div className="adt-stripwrap">
      <StripStyle />

      <div className="adt-winsel" role="group" aria-label="Summary window">
        {WINDOWS.map((w) => (
          <button
            key={String(w.value)}
            type="button"
            className={`adt-winbtn${window === w.value ? " on" : ""}`}
            aria-pressed={window === w.value}
            onClick={() => onWindowChange(w.value)}
          >
            {w.label}
          </button>
        ))}
      </div>

      <div className="adt-strip">
        {SUMMARY_CHIPS.map((chip) => (
          <div key={chip.key} className={`adt-schip ${chip.tone}`}>
            <span className="k">{chip.label}</span>
            <span className="v">{formatMetric(chip.format, chip.get(sums, ratios))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function StripStyle() {
  return (
    <style>{`
      .pk-kit .adt-stripwrap { display: flex; align-items: center; gap: 14px; margin-top: 16px; flex-wrap: wrap; }

      .pk-kit .adt-winsel {
        display: inline-flex; gap: 3px; background: var(--adt-head-bg);
        border: 1px solid var(--border); padding: 4px; border-radius: 12px;
      }
      .pk-kit .adt-winbtn {
        border: 0; background: transparent; cursor: pointer; font: inherit; font-size: 12.5px;
        font-weight: 600; color: var(--text-muted); padding: 6px 13px; border-radius: 9px; transition: .15s;
      }
      .pk-kit .adt-winbtn:hover { color: var(--text); }
      .pk-kit .adt-winbtn.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow-sm); }

      /* The chip row scrolls on its own so a narrow cockpit never pushes the
         page sideways. */
      .pk-kit .adt-strip { flex: 1; min-width: 0; display: flex; gap: 10px; overflow-x: auto; padding-bottom: 2px; }
      .pk-kit .adt-schip {
        flex-shrink: 0; display: flex; flex-direction: column; gap: 1px; padding: 9px 15px;
        border-radius: 14px; background: var(--surface); border: 1px solid var(--border);
        box-shadow: var(--shadow-sm); border-left: 3px solid var(--border);
      }
      .pk-kit .adt-schip.indigo { border-left-color: var(--adt-indigo); }
      .pk-kit .adt-schip.sky { border-left-color: var(--adt-sky); }
      .pk-kit .adt-schip.amber { border-left-color: var(--adt-amber); }
      .pk-kit .adt-schip.green { border-left-color: var(--adt-green); }
      .pk-kit .adt-schip .k {
        font-size: 10.5px; font-weight: 600; letter-spacing: .04em;
        text-transform: uppercase; color: var(--text-faint); white-space: nowrap;
      }
      .pk-kit .adt-schip .v {
        font-family: var(--font-display); font-weight: 700; font-size: 19px;
        letter-spacing: -.02em; color: var(--text); font-variant-numeric: tabular-nums;
      }
    `}</style>
  );
}
