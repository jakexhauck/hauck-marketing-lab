import { ExternalLink, FolderOpen, Globe, ListChecks, Megaphone, Plus, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BriefLive, BriefLiveLink, BriefSection } from "../../../lib/agentWire";
import { NotesBlock } from "./NotesBlock";

const LINK_ICONS: Record<BriefLiveLink["id"], LucideIcon> = {
  drive: FolderOpen,
  ads: Megaphone,
  ghl: Workflow,
  website: Globe,
  outcome: ListChecks,
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

export function ClientInfoPage({
  tenantId,
  live,
  liveLoading,
  sections,
}: {
  tenantId: string;
  live: BriefLive | undefined;
  liveLoading: boolean;
  sections: BriefSection[];
}) {
  const drive = live?.links.find((l) => l.id === "drive")?.url ?? null;
  return (
    <div className="mcb-page">
      <section className="mcb-sec">
        <h3 className="mcb-h">Links</h3>
        <div className="mcb-links">
          {(live?.links ?? []).map((l) => {
            const Icon = LINK_ICONS[l.id];
            const inner = (
              <>
                <span className="ic">
                  <Icon />
                </span>
                <span>
                  {l.label}
                  <small>{l.url ? host(l.url) : "Not set"}</small>
                </span>
              </>
            );
            return l.url ? (
              <a key={l.id} className="mcb-lk" href={l.url} target="_blank" rel="noopener noreferrer">
                {inner}
              </a>
            ) : (
              <div key={l.id} className="mcb-lk off">
                {inner}
              </div>
            );
          })}
        </div>
        {liveLoading && <div className="mcb-empty">Loading...</div>}
      </section>

      <section className="mcb-sec">
        <h3 className="mcb-h">
          Assets
          {drive && (
            <span className="act">
              <a className="mcb-btn" href={drive} target="_blank" rel="noopener noreferrer">
                <Plus size={14} /> Add
              </a>
            </span>
          )}
        </h3>
        {live?.assets?.length ? (
          <div className="mcb-assets">
            {live.assets.map((a) => (
              <a key={a.url} className="mcb-as" href={a.url} target="_blank" rel="noopener noreferrer" title={a.folder ? `${a.folder} / ${a.name}` : a.name}>
                <div className="img" style={a.thumbUrl ? { backgroundImage: `url("${a.thumbUrl}")` } : undefined} />
                <p>{a.name}</p>
              </a>
            ))}
          </div>
        ) : (
          <div className="mcb-empty">
            {live?.assetsError ? `Drive did not load: ${live.assetsError}` : drive ? "No images in the Drive folder yet" : liveLoading ? "" : "No Drive folder yet"}
          </div>
        )}
      </section>

      <section className="mcb-sec">
        <h3 className="mcb-h">Onboarding answers</h3>
        {live?.answers.length ? (
          <div className="mcb-grid">
            {live.answers.map((g) => (
              <div key={g.heading} className="mcb-card">
                <div className="mcb-ch">{g.heading}</div>
                {g.rows.map((r, i) => (
                  <div key={`${r.label}-${i}`} className="mcb-kv">
                    <span>{r.label}</span>
                    {/^https?:\/\//.test(r.value) ? (
                      <a href={r.value} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brand-text)" }}>
                        {host(r.value)} <ExternalLink size={11} />
                      </a>
                    ) : r.value === "on file" ? (
                      <span>
                        <span className="mcb-tag ok">On file</span>
                      </span>
                    ) : (
                      <span>{r.value}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          !liveLoading && <div className="mcb-empty">No onboarding form yet</div>
        )}
      </section>

      <NotesBlock tenantId={tenantId} sections={sections} ids={["client"]} />
    </div>
  );
}
