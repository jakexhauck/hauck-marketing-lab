// Team tab content for a pillar. Lists the people and Hermes agents assigned to
// the pillar as person cards. Tab content only: the parent AdminPillar provides
// the page shell.

import type { Pillar, TeamMember } from "../../../lib/pillars";
import { NeedsSetup } from "../PillarKit";

// First letters of up to two name words, e.g. "Jake Hauck" -> "JH".
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export default function TeamTab({ pillar }: { pillar: Pillar }) {
  if (pillar.team.length === 0) {
    return <NeedsSetup>No one assigned yet.</NeedsSetup>;
  }

  return (
    <div>
      <p className="tm-intro">
        People and Hermes agents assigned to this pillar. Agents are the Hermes
        profiles that will run it.
      </p>
      <div className="pk-people">
        {pillar.team.map((member: TeamMember, i) => {
          const notDeployed = member.kind === "agent" && member.status === "planned";
          return (
            <div className="pk-person" key={i}>
              <div className={`pk-person-av ${member.kind}`}>{initials(member.name)}</div>
              <div>
                <div className="pk-person-name">
                  {member.name}
                  <span className={`pk-kindtag ${member.kind}`}>
                    {member.kind === "agent" ? "Agent" : "Person"}
                  </span>
                </div>
                <div className="pk-person-role">
                  {member.role}
                  {notDeployed && (
                    <span className="tm-muted"> (not deployed yet)</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        .tm-intro { color: var(--text-muted); font-size: 14px; line-height: 1.6; margin: 0 0 16px; }
        .tm-muted { color: var(--text-faint); }
      `}</style>
    </div>
  );
}
