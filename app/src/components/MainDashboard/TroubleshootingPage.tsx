import { useState } from "react";

interface BulletItem {
  label: string;
  body: string;
}

interface Section {
  id: string;
  number: string;
  title: string;
  intro?: string;
  blocks: Array<
    | { kind: "para"; body: string }
    | { kind: "heading"; body: string }
    | { kind: "bullets"; items: BulletItem[] }
    | { kind: "callout"; body: string }
  >;
}

const SECTIONS: Section[] = [
  {
    id: "ad-account-disabled",
    number: "01",
    title: "Ad Account Disabled",
    intro:
      "Meta disables accounts frequently. It affects most media buyers at some point and is usually fixable. Don't panic.",
    blocks: [
      { kind: "heading", body: "Initial steps" },
      {
        kind: "para",
        body:
          "Review the explanatory email from Meta. The reason is almost always one of: suspicious payment activity, policy violation, or account quality issues.",
      },
      { kind: "heading", body: "Recovery process" },
      {
        kind: "bullets",
        items: [
          {
            label: "Submit an appeal",
            body:
              "Go to the Account Quality page in Business Manager and file an appeal within 24–48 hours.",
          },
          {
            label: "Escalate via live chat",
            body:
              "If the appeal stalls, open live chat support through Business Manager. A human reviewer can often reverse a wrongful disable.",
          },
          {
            label: "Backup ad account",
            body:
              "Create a new ad account under the same Business Manager so campaigns can keep running while the appeal is in flight.",
          },
        ],
      },
      { kind: "heading", body: "Prevention" },
      {
        kind: "callout",
        body:
          "Business verification, legitimate payment methods, avoiding dramatic budget swings, and strict policy compliance reduce disable risk by ~90%.",
      },
    ],
  },
  {
    id: "policy-violations",
    number: "02",
    title: "Common Policy Violations",
    intro: "Five categories trigger the vast majority of disapprovals. Audit creative against each before launch.",
    blocks: [
      {
        kind: "bullets",
        items: [
          {
            label: "Before/after imagery",
            body:
              "Don't show transformation comparisons. Demonstrate the methodology instead: the process, the work, the system.",
          },
          {
            label: "Income / earnings claims",
            body:
              "Avoid specific dollar amounts. Use general growth language (\"more leads\", \"steadier pipeline\") rather than \"$10k/month\".",
          },
          {
            label: "Misleading claims",
            body: "Keep claims accurate and substantiated. No exaggeration, no implied guarantees.",
          },
          {
            label: "Personal attributes",
            body:
              "Don't call out the viewer's characteristics (\"struggling with debt?\", \"are you overweight?\"). Reframe as benefits the audience opts into.",
          },
          {
            label: "Special Ad Category",
            body:
              "Housing, credit, employment, and political content require explicit classification in the campaign settings. Miss this and the ad gets pulled.",
          },
        ],
      },
    ],
  },
  {
    id: "learning-stuck",
    number: "03",
    title: "Campaign Stuck in Learning",
    intro: "Meta needs ~50 conversions per week to exit the Learning phase. Diagnose before reflexively rebuilding.",
    blocks: [
      { kind: "heading", body: "Wait conditions" },
      {
        kind: "bullets",
        items: [
          { label: "Under 7 days elapsed", body: "Learning needs time. Don't touch it before the window closes." },
          { label: "Some conversions coming in", body: "Volume is low but non-zero, the algorithm is gathering signal." },
          { label: "Cost-per-conversion acceptable", body: "Even on the high end of target range, hold the line." },
          { label: "Minimal edits", body: "Each edit restarts Learning. If you've been patient, keep being patient." },
        ],
      },
      { kind: "heading", body: "Reset conditions" },
      {
        kind: "bullets",
        items: [
          { label: "10+ days without progress", body: "If Learning hasn't exited and conversions aren't trending, it's not coming back." },
          { label: "Zero conversions", body: "No signal at all. The targeting or creative is the problem, not patience." },
          { label: "Cost-per-conversion 3x+ over target", body: "Bleeding budget on the wrong audience. Cut your losses." },
          { label: "Multiple edits already made", body: "Learning has been restarted enough times that it's never going to settle." },
        ],
      },
      {
        kind: "callout",
        body:
          "Significant edits (budget increases over 20%, new creative, audience changes) restart the Learning cycle. Plan edits in batches, not one at a time.",
      },
    ],
  },
  {
    id: "cpm-spike",
    number: "04",
    title: "CPM Suddenly Spikes",
    intro: "Run through these four causes in order. The first to match is usually the answer.",
    blocks: [
      {
        kind: "bullets",
        items: [
          {
            label: "Creative fatigue",
            body:
              "Frequency at 3+ means the audience has seen it too many times. Launch fresh creative: new hooks, new angles, new formats.",
          },
          {
            label: "Audience saturation",
            body:
              "If the audience is too small relative to spend, the algorithm runs out of efficient delivery. Expand geographic targeting or broaden the audience.",
          },
          {
            label: "Competition",
            body:
              "Other advertisers are bidding the same auction harder. The fix is better creative: winning the auction with stronger performance, not higher bids.",
          },
          {
            label: "Seasonality",
            body:
              "Q4 sees 30–50% CPM increases industry-wide. January normalizes. If timing matches, ride it out or rebalance budget.",
          },
        ],
      },
    ],
  },
  {
    id: "lead-form-broken",
    number: "05",
    title: "Lead Form Not Working",
    intro: "Test end-to-end before assuming the ad is broken. Most \"no leads\" problems are downstream of the form.",
    blocks: [
      { kind: "heading", body: "Testing checklist" },
      {
        kind: "bullets",
        items: [
          { label: "Click the live ad", body: "Verify the form opens, not a stale draft, not a broken creative." },
          { label: "Submit test data", body: "Run a real submission through the form yourself." },
          {
            label: "Check Leads Center",
            body: "In Business Manager → Leads Center, confirm the test lead lands.",
          },
          {
            label: "CRM integration",
            body: "If a CRM is connected (Zapier, native integration, webhook), confirm the lead reaches it.",
          },
          {
            label: "Email notifications",
            body: "In Page Settings, confirm lead notification emails are routing to the right inbox.",
          },
          {
            label: "Mobile + desktop",
            body: "Test on both platforms: mobile is where most leads come from, but desktop catches different bugs.",
          },
        ],
      },
      {
        kind: "callout",
        body:
          "Keep forms to 3–4 fields max (name, phone, email, one qualifying question). Longer forms tank submission rates.",
      },
    ],
  },
];

export function TroubleshootingPage() {
  const [selectedId, setSelectedId] = useState<string>(SECTIONS[0].id);
  const current = SECTIONS.find((s) => s.id === selectedId) ?? SECTIONS[0];

  return (
    <div className="md-ts-page">
      <style>{troubleshootingCSS}</style>

      <div className="ts-head">
        <span className="md-page-head-eyebrow">▸ Media Buying</span>
        <h1>
          Trouble<span className="md-copper-text">shooting</span>
        </h1>
        <p className="ts-subtitle">
          Common Meta Ads issues and how to resolve them. Diagnose fast, fix faster.
        </p>
      </div>

      <div className="ts-shell">
        <aside className="ts-rail">
          <div className="ts-rail-head">
            <span>{SECTIONS.length} topics</span>
          </div>
          <ul className="ts-list">
            {SECTIONS.map((s) => {
              const isActive = s.id === selectedId;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`ts-list-item${isActive ? " is-active" : ""}`}
                    onClick={() => setSelectedId(s.id)}
                  >
                    <span className="ts-list-num">{s.number}</span>
                    <span className="ts-list-title">{s.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="ts-pane">
          <div className="ts-pane-head">
            <span className="ts-pane-num">SECTION {current.number}</span>
            <h2>{current.title}</h2>
            {current.intro && <p className="ts-pane-intro">{current.intro}</p>}
          </div>

          <div className="ts-body">
            {current.blocks.map((block, idx) => {
              if (block.kind === "heading") {
                return (
                  <h3 key={idx} className="ts-section-heading">
                    {block.body}
                  </h3>
                );
              }
              if (block.kind === "para") {
                return (
                  <p key={idx} className="ts-para">
                    {block.body}
                  </p>
                );
              }
              if (block.kind === "callout") {
                return (
                  <div key={idx} className="ts-callout">
                    {block.body}
                  </div>
                );
              }
              return (
                <ul key={idx} className="ts-bullets">
                  {block.items.map((item, j) => (
                    <li key={j}>
                      <span className="ts-bullet-label">{item.label}</span>
                      <span className="ts-bullet-body">{item.body}</span>
                    </li>
                  ))}
                </ul>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

const troubleshootingCSS = `
.md-ts-page {
  padding: 32px 0 80px;
  max-width: 1280px;
}
.ts-head { margin-bottom: 22px; }
.ts-head h1 {
  margin: 6px 0 0;
  font-family: var(--sans);
  font-size: 32px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.ts-subtitle {
  margin: 8px 0 0;
  font-family: var(--sans);
  font-size: 13px;
  color: var(--text-muted);
}
.ts-shell {
  display: grid;
  grid-template-columns: 300px 1fr;
  gap: 22px;
  align-items: start;
}
.ts-rail {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 14px;
  position: sticky;
  top: 16px;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
}
.ts-rail-head {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}
.ts-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ts-list-item {
  width: 100%;
  background: transparent;
  border: 1px solid transparent;
  text-align: left;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: center;
  padding: 9px 10px;
  cursor: pointer;
  color: var(--text);
  transition: background 120ms ease, border-color 120ms ease;
}
.ts-list-item:hover {
  background: rgba(255, 255, 255, 0.02);
  border-color: var(--border);
}
.ts-list-item.is-active {
  background: rgba(184, 115, 51, 0.08);
  border-color: var(--copper);
}
.ts-list-num {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  color: var(--text-faint);
}
.ts-list-item.is-active .ts-list-num {
  color: var(--copper);
}
.ts-list-title {
  font-family: var(--sans);
  font-size: 13.5px;
  font-weight: 500;
  color: var(--text);
}
.ts-pane {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 26px 30px;
  min-height: 480px;
}
.ts-pane-head {
  border-bottom: 1px solid var(--border);
  padding-bottom: 16px;
  margin-bottom: 20px;
}
.ts-pane-num {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--copper);
}
.ts-pane-head h2 {
  margin: 6px 0 0;
  font-family: var(--sans);
  font-size: 24px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.005em;
}
.ts-pane-intro {
  margin: 10px 0 0;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}
.ts-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ts-section-heading {
  margin: 14px 0 2px;
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--copper);
}
.ts-para {
  margin: 0;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.62;
  color: var(--text-muted);
}
.ts-bullets {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ts-bullets li {
  position: relative;
  padding: 2px 0 2px 18px;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
}
.ts-bullets li::before {
  content: "›";
  position: absolute;
  left: 0;
  top: 2px;
  color: var(--copper);
}
.ts-bullet-label {
  display: block;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}
.ts-bullet-body {
  display: block;
  color: var(--text-muted);
}
.ts-callout {
  background: rgba(184, 115, 51, 0.06);
  border-left: 2px solid var(--copper);
  padding: 12px 14px;
  font-family: var(--sans);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text);
}

@media (max-width: 980px) {
  .ts-shell { grid-template-columns: 1fr; }
  .ts-rail { position: static; max-height: none; }
}
`;
