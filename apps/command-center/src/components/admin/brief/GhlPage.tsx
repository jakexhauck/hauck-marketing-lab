import type { BriefLive, BriefSection } from "../../../lib/agentWire";
import { taskArea } from "../../../lib/briefPages";
import type { ClientTask } from "../../../lib/clientTasks";
import { NotesBlock } from "./NotesBlock";

const isLive = (status: string) => /publish|active|live/i.test(status);

export function GhlPage({
  tenantId,
  live,
  liveLoading,
  tasks,
  sections,
}: {
  tenantId: string;
  live: BriefLive | undefined;
  liveLoading: boolean;
  tasks: ClientTask[];
  sections: BriefSection[];
}) {
  const ghl = live?.ghl ?? null;
  const area = tasks.filter((t) => t.state !== "cut" && taskArea(t) === "ghl");
  const doing = area.filter((t) => t.state === "doing");
  const yours = area.filter((t) => (t.owner === "jake" || t.owner === "client") && t.state !== "done");
  const setValues = ghl?.customValues.filter((v) => v.value.trim()).length ?? 0;
  const liveFlows = ghl?.workflows.filter((w) => isLive(w.status)).length ?? 0;

  return (
    <div className="mcb-page">
      <div className="mcb-sum">
        <div className="mcb-card">
          {ghl ? <span className="mcb-tag ok">Connected</span> : <span className="mcb-tag bad">Not connected</span>}
          <b>{area.filter((t) => t.state === "done").length}</b>
          {ghl && (
            <>
              <div className="li">
                Custom values {setValues} / {ghl.customValues.length}
              </div>
              <div className="li">
                Workflows {liveFlows} / {ghl.workflows.length} live
              </div>
              <div className="li">{ghl.pipelines.length === 1 ? "1 pipeline" : `${ghl.pipelines.length} pipelines`}</div>
            </>
          )}
        </div>
        <div className="mcb-card">
          <span className="mcb-tag">Agent doing</span>
          <b>{doing.length}</b>
          {doing.slice(0, 4).map((t) => (
            <div key={t.id} className="li">
              {t.name}
            </div>
          ))}
        </div>
        <div className="mcb-card">
          <span className="mcb-tag wait">Your move</span>
          <b>{yours.length}</b>
          {yours.slice(0, 4).map((t) => (
            <div key={t.id} className="li">
              {t.name}
            </div>
          ))}
        </div>
      </div>

      {!ghl ? (
        <div className="mcb-card mcb-sec">
          <div className="mcb-empty">{liveLoading ? "Loading..." : live?.ghlError ? `Not connected: ${live.ghlError}` : "Not connected"}</div>
        </div>
      ) : (
        <>
          <section className="mcb-sec">
            <h3 className="mcb-h">Custom values</h3>
            <div className="mcb-card flush">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key</th>
                    <th>Value</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {ghl.customValues.map((v) => (
                    <tr key={`${v.key}-${v.name}`}>
                      <td>{v.name}</td>
                      <td className="mono">{v.key}</td>
                      <td style={{ overflowWrap: "anywhere" }}>{v.value}</td>
                      <td>{v.value.trim() ? <span className="mcb-tag ok">Set</span> : <span className="mcb-tag bad">Empty</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!ghl.customValues.length && <div className="mcb-empty" style={{ padding: 12 }}>None</div>}
            </div>
          </section>

          <section className="mcb-sec">
            <h3 className="mcb-h">Pipelines</h3>
            {ghl.pipelines.map((p, pi) => (
              <div key={`${p.name}-${pi}`} className="mcb-card" style={{ marginBottom: 10 }}>
                <div className="mcb-ch">{p.name}</div>
                <div className="mcb-stages">
                  {p.stages.map((s, i) => (
                    <span key={`${s}-${i}`} style={{ display: "inline-flex", alignItems: "center" }}>
                      {i > 0 && <span className="mcb-arrow">›</span>}
                      <span className="mcb-stage">{s}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!ghl.pipelines.length && <div className="mcb-empty">None</div>}
          </section>

          <section className="mcb-sec">
            <h3 className="mcb-h">Calendars</h3>
            <div className="mcb-card">
              {ghl.calendars.map((c, ci) => (
                <div key={`${c.name}-${ci}`} className="mcb-kv">
                  <span style={{ width: "auto", flex: 1, color: "var(--text)" }}>{c.name}</span>
                  <span style={{ flex: "none" }}>{c.active ? <span className="mcb-tag ok">Live</span> : <span className="mcb-tag plain">Off</span>}</span>
                </div>
              ))}
              {!ghl.calendars.length && <div className="mcb-empty">None</div>}
            </div>
          </section>

          <section className="mcb-sec">
            <h3 className="mcb-h">Automations</h3>
            <div className="mcb-card">
              {ghl.workflows.map((w, wi) => (
                <div key={`${w.name}-${wi}`} className="mcb-kv">
                  <span style={{ width: "auto", flex: 1, color: "var(--text)" }}>{w.name}</span>
                  <span style={{ flex: "none" }}>{isLive(w.status) ? <span className="mcb-tag ok">Live</span> : <span className="mcb-tag plain">Draft</span>}</span>
                </div>
              ))}
              {!ghl.workflows.length && <div className="mcb-empty">None</div>}
            </div>
          </section>
        </>
      )}

      <NotesBlock tenantId={tenantId} sections={sections} ids={["ghl"]} />
    </div>
  );
}
