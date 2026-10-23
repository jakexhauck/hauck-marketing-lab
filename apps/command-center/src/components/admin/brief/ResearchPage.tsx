import { useState } from "react";
import type { BriefSection } from "../../../lib/agentWire";
import type { Quote, ResearchPage as Research } from "../../../lib/briefPages";
import { count, freshClass } from "./missionHelpers";
import { NotesBlock } from "./NotesBlock";

const stars = (r: number | null) => {
  if (r === null) return "";
  const full = Math.max(0, Math.min(5, Math.round(r)));
  return "★".repeat(full) + "☆".repeat(Math.max(0, 5 - full));
};
const reviews = (n: number | null) => (n === null ? "" : `${count(n)} review${n === 1 ? "" : "s"}`);
const STAGE = { tof: "TOF", mof: "MOF", bof: "BOF" } as const;

function Quotes({ quotes }: { quotes: Quote[] }) {
  return (
    <>
      {quotes.map((q, i) => (
        <p key={i} className="mcb-quote">
          "{q.text}"
          {(q.stars !== null || q.from) && (
            <span className="who">
              {q.stars !== null && <span className="mcb-stars">{stars(q.stars)}</span>} {q.from}
            </span>
          )}
        </p>
      ))}
    </>
  );
}

type Tab = "pain" | "goal" | "benefit";

// Market Research v2 (docs/build-plans/market-research-v2.md, mockup
// docs/mockups/market-research-v2.html). fresh: what the last approve changed,
// tinted for a moment (AgentBriefPage); the tabs open on the one it touched.
export function ResearchPage({ tenantId, page, sections, fresh }: { tenantId: string; page: Research; sections: BriefSection[]; fresh?: Set<string> }) {
  const f = (...parts: string[]) => freshClass(fresh, ...parts);
  const touched = (kind: string) => [...(fresh ?? [])].some((k) => k.startsWith(`${kind.toLowerCase()}|`));
  const [tab, setTab] = useState<Tab>(touched("goal") ? "goal" : touched("benefit") ? "benefit" : "pain");
  const empty = (["competitors", "painPoints", "goals", "benefits", "angles", "offers", "funnel"] as const).every((k) => !page[k].length);
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "pain", label: "Pain points", n: page.painPoints.length },
    { id: "goal", label: "Goals", n: page.goals.length },
    { id: "benefit", label: "Benefits", n: page.benefits.length },
  ];
  const stagesOrder = { tof: 0, mof: 1, bof: 2 };
  const funnel = [...page.funnel].sort((a, b) => stagesOrder[a.stage] - stagesOrder[b.stage]);
  return (
    <div className="mcb-page">
      {empty ? (
        <div className="mcb-card mcb-sec">
          <div className="mcb-empty">No research yet</div>
        </div>
      ) : (
        <div className="mcb-cols">
          <div>
            {page.competitors.length > 0 && (
              <section className="mcb-sec">
                <h3 className="mcb-h">
                  Competitors <span className="mcb-n">{page.competitors.length}</span>
                  {page.sourcesNote && (
                    <span className="act">
                      <span className={`mcb-tag plain${f("sourcesNote")}`}>{page.sourcesNote}</span>
                    </span>
                  )}
                </h3>
                <div className="mcb-card mcb-list">
                  {page.competitors.map((c, i) => (
                    <div key={`${c.name}-${i}`} className={`mcb-row${c.isClient ? " me" : ""}${f("competitor", c.name)}`}>
                      <div className="top">
                        <b>{c.name}</b>
                        {c.isClient && <span className="mcb-tag">Client</span>}
                        <span className="grow" />
                        {c.googleRating !== null && <span className="mcb-stars">{stars(c.googleRating)}</span>}
                        <span className="faint">{[c.googleRating ?? "", count(c.googleReviews)].filter((x) => x !== "").join(" · ")}</span>
                        {c.websiteUrl && (
                          <a className="mcb-btn" href={/^https?:\/\//i.test(c.websiteUrl) ? c.websiteUrl : `https://${c.websiteUrl}`} target="_blank" rel="noopener noreferrer">
                            Site
                          </a>
                        )}
                      </div>
                      {c.offer && <div className="offer">{c.offer}</div>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {page.angles.length > 0 && (
              <section className="mcb-sec">
                <h3 className="mcb-h">
                  Angles <span className="mcb-n">{page.angles.length}</span>
                </h3>
                <div className="mcb-card mcb-list">
                  {page.angles.map((a, i) => (
                    <div key={`${a.name}-${i}`} className={`mcb-row${f("angle", a.name)}`}>
                      <div className="top">
                        <b>{a.name}</b>
                        <span className="grow" />
                        <span className="faint">{reviews(a.reviews)}</span>
                      </div>
                      <Quotes quotes={a.quotes} />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {page.offers.length > 0 && (
              <section className="mcb-sec">
                <h3 className="mcb-h">
                  Offers to run <span className="mcb-n">{page.offers.length}</span>
                </h3>
                <div className="mcb-card mcb-list">
                  {page.offers.map((o, i) => (
                    <div key={`${o.offer}-${i}`} className={`mcb-row${f("offer", o.offer)}`}>
                      <b>{o.offer}</b>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          <div>
            {tabs.some((t) => t.n > 0) && (
              <section className="mcb-sec">
                <div className="mcb-tabs" role="tablist">
                  {tabs.map((t) => (
                    <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : undefined} onClick={() => setTab(t.id)}>
                      {t.label} <span className="mcb-n">{t.n}</span>
                    </button>
                  ))}
                </div>
                <div className="mcb-card mcb-list">
                  {tab === "pain" &&
                    page.painPoints.map((p, i) => (
                      <div key={`${p.title}-${i}`} className={`mcb-row${f("painPoint", p.title)}`}>
                        <div className="top">
                          <b>{p.title}</b>
                          <span className="grow" />
                          <span className="faint">{reviews(p.reviews)}</span>
                        </div>
                        <Quotes quotes={p.quotes} />
                      </div>
                    ))}
                  {tab === "goal" &&
                    page.goals.map((g, i) => (
                      <div key={`${g.title}-${i}`} className={`mcb-row${f("goal", g.title)}`}>
                        <div className="top">
                          <b>{g.title}</b>
                          <span className="grow" />
                          <span className="faint">{reviews(g.reviews)}</span>
                        </div>
                        <Quotes quotes={g.quotes} />
                      </div>
                    ))}
                  {tab === "benefit" &&
                    page.benefits.map((b, i) => (
                      <div key={`${b.benefit}-${i}`} className={`mcb-row${f("benefit", b.benefit)}`}>
                        <div className="top">
                          <span className="muted">{b.benefit}</span>
                          <span className="arrow">→</span>
                          <b>{b.dimensionalized}</b>
                        </div>
                        <Quotes quotes={b.quotes} />
                      </div>
                    ))}
                  {tabs.find((t) => t.id === tab)!.n === 0 && <div className="mcb-empty">None yet</div>}
                </div>
              </section>
            )}

            {funnel.length > 0 && (
              <section className="mcb-sec">
                <h3 className="mcb-h">Ad angles by funnel</h3>
                <div className="mcb-card mcb-list">
                  {funnel.map((x, i) => (
                    <div key={`${x.name}-${i}`} className={`mcb-row${f("funnel", x.name)}`}>
                      <span className={`mcb-fstage ${x.stage}`}>{STAGE[x.stage]}</span> <b>{x.name}</b>
                      {x.quote && <span className="line">"{x.quote}"</span>}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      <NotesBlock tenantId={tenantId} sections={sections} ids={["research"]} />
    </div>
  );
}
