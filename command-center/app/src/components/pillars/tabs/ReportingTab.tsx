// Reporting tab content for a pillar. Renders the pillar scoreboard as report
// tiles with a note that live reporting is not wired yet. Tab content only: the
// parent AdminPillar provides the page shell.

import type { Pillar, ScoreboardField } from "../../../lib/pillars";
import { NeedsSetup } from "../PillarKit";

export default function ReportingTab({ pillar }: { pillar: Pillar }) {
  const fields = pillar.scoreboard ?? [];

  return (
    <div>
      <p className="rp-intro">
        The numbers this pillar reports on, in one place.
      </p>
      {fields.length > 0 && (
        <div className="pk-report">
          {fields.map((field: ScoreboardField, i) => (
            <div className="pk-report-tile" key={i}>
              <div className="pk-report-val">{field.value ?? "·"}</div>
              <div className="pk-report-label">{field.label}</div>
            </div>
          ))}
        </div>
      )}
      <div className="rp-note">
        <NeedsSetup>
          Live reporting is not wired yet. These fill in automatically as each
          pillar's data connects.
        </NeedsSetup>
      </div>
      <style>{`
        .rp-intro { color: var(--text-muted); font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
        .rp-note { margin-top: 16px; }
      `}</style>
    </div>
  );
}
