interface ResourcesPageProps {
  root: string | null;
}

export function ResourcesPage(_props: ResourcesPageProps) {
  return (
    <div className="hml-content">
      <style>{resourcesPageCSS}</style>

      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span className="hml-eyebrow-dot" />
            Workspace
          </div>
          <h1 className="hml-page-title">Resources</h1>
          <div className="hml-page-subtitle">
            The plain-English reference shelf. Start here if you're new to Meta
            ads — every concept is explained once, with no jargon left
            unexplained.
          </div>
        </div>
      </section>

      {/* ── Quick nav ─────────────────────────────────────── */}
      <nav className="rsc-toc">
        <a className="rsc-toc-chip" href="#rsc-how-ads-work">How ads work</a>
        <a className="rsc-toc-chip" href="#rsc-glossary">Glossary</a>
        <a className="rsc-toc-chip" href="#rsc-benchmarks">Health benchmarks</a>
        <a className="rsc-toc-chip" href="#rsc-sales-scripts">Sales scripts</a>
      </nav>

      {/* ── How online advertising actually works ─────────── */}
      <section id="rsc-how-ads-work" className="rsc-section">
        <div className="rsc-section-head">
          <div className="rsc-section-eyebrow">Fundamentals</div>
          <h2 className="rsc-section-title">How online advertising actually works</h2>
          <p className="rsc-section-lede">
            Stripped to its bones, every ad campaign is the same six-step
            machine. We'll use a pizza shop as the example, but the same
            machine runs for a window cleaner, a plumber, or any other
            local business.
          </p>
        </div>

        <div className="rsc-card">
          <h3 className="rsc-card-title">The six pieces of any ad campaign</h3>
          <ol className="rsc-steps">
            <li>
              <span className="rsc-step-label">Budget</span>
              <span className="rsc-step-body">
                You pay Meta (Facebook + Instagram's parent company) to
                show ads to people. Think of it as paying someone to put
                flyers on doors.
              </span>
            </li>
            <li>
              <span className="rsc-step-label">Targeting</span>
              <span className="rsc-step-body">
                You pick <em>who</em> sees the ad — location, age, interests.
                Meta does most of the heavy lifting from there.
              </span>
            </li>
            <li>
              <span className="rsc-step-label">Creative</span>
              <span className="rsc-step-body">
                The ad itself — image, video, headline, text. This is
                the flyer.
              </span>
            </li>
            <li>
              <span className="rsc-step-label">Click</span>
              <span className="rsc-step-body">
                When someone taps the ad. Most people won't. That's normal.
              </span>
            </li>
            <li>
              <span className="rsc-step-label">Conversion</span>
              <span className="rsc-step-body">
                When someone does the thing you actually want — calls,
                books, or fills out a form.
              </span>
            </li>
            <li>
              <span className="rsc-step-label">ROAS</span>
              <span className="rsc-step-body">
                What you got back vs. what you spent. The whole point of
                running ads.
              </span>
            </li>
          </ol>
        </div>

        <div className="rsc-card">
          <h3 className="rsc-card-title">What the funnel looks like on $10/day</h3>
          <p className="rsc-card-lede">
            Most of the people who see the ad won't click. Most who click
            won't convert. That's the shape of the funnel, not a problem
            to fix.
          </p>
          <div className="rsc-funnel">
            <div className="rsc-funnel-row">
              <span className="rsc-funnel-tier">$10</span>
              <span className="rsc-funnel-text">spent on the day</span>
            </div>
            <div className="rsc-funnel-row">
              <span className="rsc-funnel-tier">500–1,000</span>
              <span className="rsc-funnel-text">people see the ad <em>(impressions)</em></span>
            </div>
            <div className="rsc-funnel-row">
              <span className="rsc-funnel-tier">15–25</span>
              <span className="rsc-funnel-text">tap the ad <em>(clicks)</em></span>
            </div>
            <div className="rsc-funnel-row">
              <span className="rsc-funnel-tier">3–5</span>
              <span className="rsc-funnel-text">turn into leads</span>
            </div>
            <div className="rsc-funnel-row">
              <span className="rsc-funnel-tier">1–2</span>
              <span className="rsc-funnel-text">become paying customers</span>
            </div>
          </div>
          <p className="rsc-card-foot">
            If each customer is worth $40+, that's $80+ back on $10 spent.
            An 8x return.
          </p>
        </div>

        <div className="rsc-card">
          <h3 className="rsc-card-title">What this looks like over 30 days (real numbers)</h3>
          <div className="rsc-stat-grid">
            <div className="rsc-stat">
              <span className="rsc-stat-value">$312</span>
              <span className="rsc-stat-label">spent</span>
            </div>
            <div className="rsc-stat">
              <span className="rsc-stat-value">$4,200</span>
              <span className="rsc-stat-label">revenue back</span>
            </div>
            <div className="rsc-stat">
              <span className="rsc-stat-value">31,400</span>
              <span className="rsc-stat-label">people reached</span>
            </div>
            <div className="rsc-stat">
              <span className="rsc-stat-value">847</span>
              <span className="rsc-stat-label">clicks</span>
            </div>
            <div className="rsc-stat">
              <span className="rsc-stat-value">47</span>
              <span className="rsc-stat-label">leads</span>
            </div>
            <div className="rsc-stat">
              <span className="rsc-stat-value">31</span>
              <span className="rsc-stat-label">booked jobs</span>
            </div>
            <div className="rsc-stat rsc-stat-hero">
              <span className="rsc-stat-value">13.5x</span>
              <span className="rsc-stat-label">return on ad spend</span>
            </div>
            <div className="rsc-stat">
              <span className="rsc-stat-value">$6.64</span>
              <span className="rsc-stat-label">cost per lead</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Glossary ──────────────────────────────────────── */}
      <section id="rsc-glossary" className="rsc-section">
        <div className="rsc-section-head">
          <div className="rsc-section-eyebrow">Reference</div>
          <h2 className="rsc-section-title">Glossary</h2>
          <p className="rsc-section-lede">
            The terms you'll hear in every Meta ads conversation. Memorise
            these and you'll never feel lost on a strategy call.
          </p>
        </div>

        <div className="rsc-card">
          <table className="rsc-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>What it means</th>
                <th>What's normal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Impression</strong></td>
                <td>Someone saw the ad while scrolling.</td>
                <td className="rsc-dim">—</td>
              </tr>
              <tr>
                <td><strong>CTR</strong></td>
                <td>Click-through rate — % of viewers who tapped the ad.</td>
                <td>2–5%</td>
              </tr>
              <tr>
                <td><strong>CPM</strong></td>
                <td>Cost per 1,000 views.</td>
                <td>$5–$15</td>
              </tr>
              <tr>
                <td><strong>CPC</strong></td>
                <td>Cost per click.</td>
                <td>$0.50–$3</td>
              </tr>
              <tr>
                <td><strong>CPL</strong></td>
                <td>Cost per lead.</td>
                <td>$5–$25 (local)</td>
              </tr>
              <tr>
                <td><strong>CPA</strong></td>
                <td>Cost per paying customer — the one that actually matters.</td>
                <td className="rsc-dim">varies</td>
              </tr>
              <tr>
                <td><strong>ROAS</strong></td>
                <td>Return on ad spend — dollars back per dollar in.</td>
                <td>3x+</td>
              </tr>
              <tr>
                <td><strong>Pixel</strong></td>
                <td>Tracking code installed on the client's site so we can measure conversions.</td>
                <td className="rsc-dim">—</td>
              </tr>
              <tr>
                <td><strong>Learning phase</strong></td>
                <td>The first 3–7 days of a new campaign — results are unstable. Don't panic, don't tinker.</td>
                <td className="rsc-dim">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Health benchmarks ─────────────────────────────── */}
      <section id="rsc-benchmarks" className="rsc-section">
        <div className="rsc-section-head">
          <div className="rsc-section-eyebrow">Client health</div>
          <h2 className="rsc-section-title">Campaign health benchmarks</h2>
          <p className="rsc-section-lede">
            A fast read on whether a campaign is healthy or in trouble.
            Anchored on ROAS because that's what clients actually care
            about.
          </p>
        </div>

        <div className="rsc-benchmark-grid">
          <div className="rsc-benchmark rsc-bm-good">
            <div className="rsc-bm-value">5x+</div>
            <div className="rsc-bm-label">Loyalty range</div>
            <div className="rsc-bm-body">
              Clients renew without thinking about it. This is where the
              relationship becomes durable.
            </div>
          </div>
          <div className="rsc-benchmark rsc-bm-ok">
            <div className="rsc-bm-value">3x+</div>
            <div className="rsc-bm-label">Retention floor</div>
            <div className="rsc-bm-body">
              Above this line and you'll keep them. They're making money
              — they just may not be excited yet.
            </div>
          </div>
          <div className="rsc-benchmark rsc-bm-warn">
            <div className="rsc-bm-value">&lt;2x</div>
            <div className="rsc-bm-label">Churn risk</div>
            <div className="rsc-bm-body">
              Find the bottleneck and fix it before the client notices.
              At this level they're not really winning.
            </div>
          </div>
        </div>
      </section>

      {/* ── Sales scripts ─────────────────────────────────── */}
      <section id="rsc-sales-scripts" className="rsc-section">
        <div className="rsc-section-head">
          <div className="rsc-section-eyebrow">Sales</div>
          <h2 className="rsc-section-title">Sales scripts</h2>
          <p className="rsc-section-lede">
            Memorable language for cold calls, first meetings, and anyone
            who asks "so what do you actually do?"
          </p>
        </div>

        <div className="rsc-card">
          <h3 className="rsc-card-title">The 60-second pitch</h3>
          <blockquote className="rsc-quote">
            I put an ad for your business on Facebook and Instagram. That
            ad shows up on the phone of people in your area who are
            already looking for what you sell. When they see it, they
            tap on it and either call you, book online, or fill out a
            form. You get the customer, you make money.
            <br /><br />
            My job is to make sure you're getting way more back than
            you're spending on the ads. Most of our clients see a 5 to
            10x return — meaning for every dollar they put in, they get
            five to ten dollars back. And I handle everything. You just
            answer the phone.
          </blockquote>
        </div>
      </section>
    </div>
  );
}

const resourcesPageCSS = `
.rsc-toc {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0 0 28px;
}
.rsc-toc-chip {
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 7px 12px;
  border: 1px solid var(--border);
  background: var(--bg-void);
  text-decoration: none;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}
.rsc-toc-chip:hover {
  color: var(--copper);
  border-color: var(--copper);
  background: rgba(184, 115, 51, 0.06);
}

.rsc-section {
  margin: 0 0 40px;
}
.rsc-section-head {
  margin: 0 0 18px;
  max-width: 760px;
}
.rsc-section-eyebrow {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--copper);
  margin-bottom: 6px;
}
.rsc-section-title {
  margin: 0 0 8px;
  font-family: var(--sans);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--text);
}
.rsc-section-lede {
  margin: 0;
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.rsc-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 22px 26px;
  margin-bottom: 14px;
}
.rsc-card-title {
  margin: 0 0 12px;
  font-family: var(--sans);
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.rsc-card-lede {
  margin: 0 0 14px;
  font-family: var(--sans);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-muted);
}
.rsc-card-foot {
  margin: 12px 0 0;
  font-family: var(--sans);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text);
}

.rsc-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  counter-reset: rsc-step;
}
.rsc-steps li {
  counter-increment: rsc-step;
  display: grid;
  grid-template-columns: 36px 130px 1fr;
  gap: 14px;
  padding: 10px 0;
  border-top: 1px solid var(--border);
  align-items: baseline;
}
.rsc-steps li:first-child { border-top: none; padding-top: 0; }
.rsc-steps li::before {
  content: counter(rsc-step, decimal-leading-zero);
  font-family: var(--mono);
  font-size: 10.5px;
  letter-spacing: 0.18em;
  color: var(--copper);
}
.rsc-step-label {
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.rsc-step-body {
  font-family: var(--sans);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.rsc-funnel {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rsc-funnel-row {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 16px;
  align-items: baseline;
  padding: 10px 14px;
  background: var(--bg-void);
  border: 1px solid var(--border);
}
.rsc-funnel-tier {
  font-family: var(--mono);
  font-size: 15px;
  font-weight: 600;
  color: var(--copper);
  letter-spacing: 0.04em;
}
.rsc-funnel-text {
  font-family: var(--sans);
  font-size: 13.5px;
  color: var(--text);
}
.rsc-funnel-text em {
  color: var(--text-faint);
  font-style: normal;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  margin-left: 6px;
}

.rsc-stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.rsc-stat {
  background: var(--bg-void);
  border: 1px solid var(--border);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.rsc-stat-value {
  font-family: var(--sans);
  font-size: 22px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
}
.rsc-stat-label {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-faint);
}
.rsc-stat-hero {
  background: rgba(184, 115, 51, 0.08);
  border-color: var(--copper);
}
.rsc-stat-hero .rsc-stat-value { color: var(--copper); }

.rsc-table {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--sans);
  font-size: 13.5px;
}
.rsc-table thead th {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-faint);
  text-align: left;
  padding: 0 12px 10px;
  border-bottom: 1px solid var(--border);
  font-weight: 500;
}
.rsc-table tbody td {
  padding: 12px;
  vertical-align: top;
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  line-height: 1.55;
}
.rsc-table tbody tr:last-child td { border-bottom: none; }
.rsc-table tbody td:first-child {
  color: var(--text);
  width: 130px;
}
.rsc-table tbody td:last-child {
  font-family: var(--mono);
  font-size: 12px;
  letter-spacing: 0.06em;
  color: var(--copper);
  width: 140px;
}
.rsc-table .rsc-dim { color: var(--text-faint); }

.rsc-benchmark-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.rsc-benchmark {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  padding: 22px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rsc-bm-value {
  font-family: var(--sans);
  font-size: 36px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1;
}
.rsc-bm-label {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-faint);
  margin-bottom: 8px;
}
.rsc-bm-body {
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.55;
  color: var(--text-muted);
}
.rsc-bm-good .rsc-bm-value { color: var(--hml-green, #6ba368); }
.rsc-bm-good { border-left: 2px solid var(--hml-green, #6ba368); }
.rsc-bm-ok .rsc-bm-value { color: var(--copper); }
.rsc-bm-ok { border-left: 2px solid var(--copper); }
.rsc-bm-warn .rsc-bm-value { color: var(--hml-red, #d07a55); }
.rsc-bm-warn { border-left: 2px solid var(--hml-red, #d07a55); }

.rsc-quote {
  margin: 0;
  padding: 18px 22px;
  background: var(--bg-void);
  border-left: 2px solid var(--copper);
  font-family: var(--sans);
  font-size: 14.5px;
  line-height: 1.7;
  color: var(--text);
  font-style: normal;
}

@media (max-width: 900px) {
  .rsc-stat-grid { grid-template-columns: repeat(2, 1fr); }
  .rsc-benchmark-grid { grid-template-columns: 1fr; }
  .rsc-steps li { grid-template-columns: 28px 110px 1fr; gap: 10px; }
  .rsc-funnel-row { grid-template-columns: 100px 1fr; }
}
`;
