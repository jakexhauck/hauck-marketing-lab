import { Fragment, useState } from "react";
import type { BriefSection } from "../../../lib/agentWire";
import type { AdsCampaign, AdsPage as Ads } from "../../../lib/briefPages";
import { adsStats, count, freshClass, money, STATUS_LABEL, statusTone } from "./missionHelpers";
import { NotesBlock } from "./NotesBlock";

function Campaign({ c, fresh }: { c: AdsCampaign; fresh?: Set<string> }) {
  const f = (...parts: string[]) => freshClass(fresh, c.name, ...parts);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const flip = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="mcb-sec">
      {c.offer && (
        <section className="mcb-sec">
          <h3 className="mcb-h">Offer{c.name ? ` · ${c.name}` : ""}</h3>
          <div className={`mcb-card mcb-offer${f("offer")}`}>{c.offer}</div>
        </section>
      )}

      <div className="mcb-two mcb-sec">
        <div>
          <h3 className="mcb-h">Campaign structure</h3>
          <div className="mcb-tree">
            <div className={`node${f("dailySpend") || f("budgetType")}`}>
              <span className="lvl">Campaign</span>
              <b>{c.name || "Campaign"}</b>
              <span className="mcb-grow" />
              {(c.budgetType || c.dailySpend !== null) && (
                <span className="mcb-tag plain">{[c.budgetType, c.dailySpend !== null ? `${money(c.dailySpend)}/day` : ""].filter(Boolean).join(" ")}</span>
              )}
            </div>
            {c.adSets.map((s, si) => (
              <Fragment key={`${s.name}-${si}`}>
                <div className={`node i1${f("adSet", s.name)}`}>
                  <span className="lvl">Ad set</span>
                  {[s.name, s.targeting].filter(Boolean).join(" · ")}
                  <span className="mcb-grow" />
                  {s.form && <span className="mcb-tag plain">{s.form}</span>}
                </div>
                {c.ads
                  .filter((a) => a.adSet === s.name || (!a.adSet && c.adSets.length === 1))
                  .map((a, ai) => (
                    <div key={`${a.name}-${ai}`} className={`node i2${f("ad", a.name)}`}>
                      <span className="lvl">Ad</span>
                      {a.name}
                      <span className="mcb-grow" />
                      {a.type && <span className="mcb-tag">{a.type}</span>}
                    </div>
                  ))}
              </Fragment>
            ))}
            {!c.adSets.length && <div className="mcb-empty">No ad sets yet</div>}
          </div>
        </div>
        <div>
          <h3 className="mcb-h">Creatives</h3>
          {c.creatives.length ? (
            <div className="mcb-stats" style={{ marginBottom: 0 }}>
              {c.creatives.map((k, i) => (
                <div key={`${k.type}-${i}`} className={`mcb-card mcb-stat${f("creative", k.type)}`}>
                  <span>{k.type}</span>
                  <b>{count(k.count) || "·"}</b>
                  {k.note && <span>{k.note}</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="mcb-empty">No creatives planned yet</div>
          )}
        </div>
      </div>

      {c.angles.length > 0 && (
        <section className="mcb-sec">
          <h3 className="mcb-h">Angles</h3>
          <div className="mcb-angles">
            {c.angles.map((a, i) => {
              const used = c.ads.filter((ad) => ad.angle === a.name).length;
              return (
                <div key={`${a.name}-${i}`} className={`mcb-card${f("angle", a.name)}`}>
                  <div className="mcb-ch">{a.name}</div>
                  <p>{a.pitch}</p>
                  <span className="mcb-tag">{used === 1 ? "1 ad" : `${used} ads`}</span>{" "}
                  <span className={`mcb-tag ${statusTone(a.status)}`}>{STATUS_LABEL[a.status]}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {c.ads.length > 0 && (
        <section className="mcb-sec">
          <h3 className="mcb-h">Ads</h3>
          <div className="mcb-card flush">
            <table>
              <thead>
                <tr>
                  <th>Ad</th>
                  <th>Type</th>
                  <th>Angle</th>
                  <th>Headline</th>
                  <th>Primary text</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {c.ads.map((a, i) => (
                  <Fragment key={`${a.name}-${i}`}>
                    <tr className={`ad${f("ad", a.name)}`} onClick={() => flip(i)} aria-expanded={open.has(i)}>
                      <td>
                        <b>{a.name}</b>
                      </td>
                      <td>{a.type && <span className="mcb-tag">{a.type}</span>}</td>
                      <td>{a.angle}</td>
                      <td>{a.headline}</td>
                      <td>
                        <div className="clip">{a.primaryText}</div>
                      </td>
                      <td>
                        <span className={`mcb-tag ${statusTone(a.status)}`}>{STATUS_LABEL[a.status]}</span>
                      </td>
                    </tr>
                    {open.has(i) && (
                      <tr className="full">
                        <td colSpan={6}>
                          <div className="copy">{a.primaryText || "No primary text yet"}</div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// fresh: what the last approve changed, tinted for a moment (AgentBriefPage).
export function AdsPage({ tenantId, page, sections, fresh }: { tenantId: string; page: Ads; sections: BriefSection[]; fresh?: Set<string> }) {
  const stats = adsStats(page);
  const anyCampaign = (field: string) => page.campaigns.map((c) => freshClass(fresh, c.name, field)).find(Boolean) ?? "";
  // Every headline: the ads' own, then any spares the Ads Agent listed.
  const headlines = [
    ...page.campaigns.flatMap((c) => c.ads.filter((a) => a.headline).map((a) => ({ angle: a.angle, text: a.headline }))),
    ...page.headlines,
  ].filter((h, i, all) => h.text && all.findIndex((x) => x.text === h.text) === i);

  return (
    <div className="mcb-page">
      {!page.campaigns.length ? (
        <div className="mcb-card mcb-sec">
          <div className="mcb-empty">No ads planned yet</div>
        </div>
      ) : (
        <>
          <div className="mcb-stats">
            <div className={`mcb-card mcb-stat${anyCampaign("dailySpend")}`}>
              <span>Daily spend</span>
              <b>{money(stats.dailySpend) || "·"}</b>
            </div>
            <div className="mcb-card mcb-stat">
              <span>Ads at launch</span>
              <b>{stats.adsAtLaunch}</b>
            </div>
            <div className={`mcb-card mcb-stat${anyCampaign("objective")}`}>
              <span>Objective</span>
              <b>{stats.objective || "·"}</b>
            </div>
            <div className={`mcb-card mcb-stat${anyCampaign("launchDate")}`}>
              <span>Launch date</span>
              <b>{stats.launchDate || "·"}</b>
            </div>
          </div>
          {page.campaigns.map((c, i) => (
            <Campaign key={`${c.name}-${i}`} c={c} fresh={fresh} />
          ))}
          {headlines.length > 0 && (
            <section className="mcb-sec">
              <h3 className="mcb-h">Headlines</h3>
              <div className="mcb-card">
                {headlines.map((h, i) => (
                  <div key={`${h.text}-${i}`} className={`mcb-kv${freshClass(fresh, "headline", h.text)}`}>
                    <span>{h.angle}</span>
                    <span>{h.text}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <NotesBlock tenantId={tenantId} sections={sections} ids={["ads"]} />
    </div>
  );
}
