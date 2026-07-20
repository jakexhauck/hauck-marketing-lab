import { computeSetterRateStrip } from "../../lib/setterRates";
import type { ApiSetterLead } from "../../lib/api";

interface Props {
  leads: ApiSetterLead[];
  // True while the leads fetch that would populate `leads` has failed: every
  // tile goes pending with failure copy instead of computing off an empty
  // array, so a dead request never reads as an honest "zero leads in".
  failed?: boolean;
}

// The Setter Suite's headline rate strip (Task 9): five tiles, in the exact
// order and wording the client specified. Lives outside
// src/components/admin/setter/ deliberately: two other fix tasks are editing
// that folder concurrently.
//
// Show rate and Close rate have no data behind them yet (they need the
// Estimate and Job close-out flows, which do not exist), so they always
// render with the shared `.pk-report-tile.pk-pending` treatment instead of a
// number. A synthetic zero here would read as "our show rate is 0 percent",
// a catastrophe, when the truth is "we are not measuring this yet." Contact
// rate and Booking rate get the same pending treatment for the narrower case
// of a zero-lead denominator, since 0/0 is undefined, not 0.
//
// All the math is pure and unit-tested in src/lib/setterRates.ts; this
// component only renders what that function returns.
export default function SetterRateStrip({ leads, failed = false }: Props) {
  const tiles = computeSetterRateStrip(
    leads.map((l) => ({ contacted: l.contacted, lastOutcome: l.lastOutcome })),
    failed,
  );

  return (
    <div className="pk-report" aria-label="Headline rates">
      {tiles.map((tile) => (
        <div key={tile.key} className={`pk-report-tile${tile.pending ? " pk-pending" : ""}`}>
          <div className={`pk-report-val font-data${tile.pending ? "" : " tabular-figs"}`}>
            {tile.pending ? tile.pendingReason : tile.value}
          </div>
          <div className="pk-report-label">{tile.label}</div>
          <div className="mt-1.5 font-data text-[10.5px] text-faint">{tile.formula}</div>
        </div>
      ))}
    </div>
  );
}
