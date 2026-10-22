import type { BriefSection } from "../../../lib/agentWire";
import type { ResearchPage as Research } from "../../../lib/briefPages";
import { count, freshClass, money } from "./missionHelpers";
import { NotesBlock } from "./NotesBlock";

const stars = (r: number | null) => {
  if (r === null) return "";
  const full = Math.max(0, Math.min(5, Math.round(r)));
  return "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full));
};
const pct = (n: number | null) => (n === null ? "" : `${n}%`);
const competition = { low: "Low", medium: "Medium", high: "High" } as const;

function ExtLink({ href, label }: { href: string; label: string }) {
  if (!href) return null;
  return (
    <a className="mcb-btn" href={/^https?:\/\//i.test(href) ? href : `https://${href}`} target="_blank" rel="noopener noreferrer">
      {label}
    </a>
  );
}

// fresh: what the last approve changed, tinted for a moment (AgentBriefPage).
export function ResearchPage({ tenantId, page, sections, fresh }: { tenantId: string; page: Research; sections: BriefSection[]; fresh?: Set<string> }) {
  const f = (...parts: string[]) => freshClass(fresh, ...parts);
  const empty = !page.zips.length && !page.competitors.length && !page.painPoints.length && !page.websites.clientUrl;
  const w = page.websites;
  return (
    <div className="mcb-page">
      {empty ? (
        <div className="mcb-card mcb-sec">
          <div className="mcb-empty">No research yet</div>
        </div>
      ) : (
        <>
          <div className="mcb-stats">
            <div className={`mcb-card mcb-stat${f("stats.population")}`}>
              <span>Population, target ZIPs</span>
              <b>{count(page.stats.population) || "·"}</b>
            </div>
            <div className={`mcb-card mcb-stat${f("stats.olderHomesPct")}`}>
              <span>Homes built before 1995</span>
              <b>{pct(page.stats.olderHomesPct) || "·"}</b>
            </div>
            <div className={`mcb-card mcb-stat${f("stats.competitorsOnMeta")}`}>
              <span>Competitors on Meta</span>
              <b>{count(page.stats.competitorsOnMeta) || "·"}</b>
            </div>
            <div className={`mcb-card mcb-stat${f("stats.competition")}`}>
              <span>Competition</span>
              <b>{page.stats.competition ? competition[page.stats.competition] : "·"}</b>
            </div>
          </div>

          {page.zips.length > 0 && (
            <section className="mcb-sec">
              <h3 className="mcb-h">Market</h3>
              <div className="mcb-card flush">
                <table>
                  <thead>
                    <tr>
                      <th>ZIP</th>
                      <th>Area</th>
                      <th>Population</th>
                      <th>Median home value</th>
                      <th>Owner occupied</th>
                      <th>Competitors serving</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.zips.map((z, i) => (
                      <tr key={`${z.zip}-${i}`} className={f("zip", z.zip).trim() || undefined}>
                        <td className="num">{z.zip}</td>
                        <td>{z.area}</td>
                        <td className="num">{count(z.population)}</td>
                        <td className="num">{money(z.medianHomeValue)}</td>
                        <td className="num">{pct(z.ownerOccupiedPct)}</td>
                        <td className="num">{count(z.competitors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {page.competitors.length > 0 && (
            <section className="mcb-sec">
              <h3 className="mcb-h">Competitors</h3>
              <div className="mcb-card flush">
                <table>
                  <thead>
                    <tr>
                      <th>Competitor</th>
                      <th>Google</th>
                      <th>Reviews</th>
                      <th>Ads live on Meta</th>
                      <th>Running since</th>
                      <th>Main angle</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {page.competitors.map((c, i) => (
                      <tr key={`${c.name}-${i}`} className={`${c.isClient ? "me" : ""}${f("competitor", c.name)}`.trim() || undefined}>
                        <td>
                          <b>{c.name}</b> {c.isClient && <span className="mcb-tag">Client</span>}
                        </td>
                        <td>
                          {c.googleRating !== null && (
                            <>
                              <span className="mcb-stars">{stars(c.googleRating)}</span> {c.googleRating}
                            </>
                          )}
                        </td>
                        <td className="num">{count(c.googleReviews)}</td>
                        <td className="num">{count(c.metaAdsLive)}</td>
                        <td>{c.runningSince}</td>
                        <td>{c.mainAngle}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <ExtLink href={c.adLibraryUrl} label="Ad Library" /> <ExtLink href={c.websiteUrl} label="Site" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {(w.clientUrl || w.strong || w.weak || w.commonOffer || w.commonPromise || w.gap) && (
            <div className="mcb-two mcb-sec">
              <div className={`mcb-card${f("websites.clientUrl") || f("websites.strong") || f("websites.weak")}`}>
                <div className="mcb-ch">Client website</div>
                <div className="mcb-kv">
                  <span>Site</span>
                  <span>{w.clientUrl}</span>
                </div>
                <div className="mcb-kv">
                  <span>Strong</span>
                  <span>{w.strong}</span>
                </div>
                <div className="mcb-kv">
                  <span>Weak</span>
                  <span>{w.weak}</span>
                </div>
              </div>
              <div className={`mcb-card${f("websites.commonOffer") || f("websites.commonPromise") || f("websites.gap")}`}>
                <div className="mcb-ch">Competitor websites</div>
                <div className="mcb-kv">
                  <span>Common offer</span>
                  <span>{w.commonOffer}</span>
                </div>
                <div className="mcb-kv">
                  <span>Common promise</span>
                  <span>{w.commonPromise}</span>
                </div>
                <div className="mcb-kv">
                  <span>Nobody says</span>
                  <span>{w.gap}</span>
                </div>
              </div>
            </div>
          )}

          {page.painPoints.length > 0 && (
            <section className="mcb-sec">
              <h3 className="mcb-h">
                Pain points
                {page.sourcesNote && (
                  <span className="act">
                    <span className={`mcb-tag plain${f("sourcesNote")}`}>{page.sourcesNote}</span>
                  </span>
                )}
              </h3>
              <div className="mcb-card">
                {page.painPoints.map((p, i) => (
                  <div key={`${p.title}-${i}`} className={`mcb-pain${f("painPoint", p.title)}`}>
                    <span className="n">{pct(p.sharePct)}</span>
                    <div>
                      <b>{p.title}</b>
                      {p.detail}
                      {p.quote && <q>{p.quote}</q>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <NotesBlock tenantId={tenantId} sections={sections} ids={["research"]} />
    </div>
  );
}
