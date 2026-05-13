/**
 * OutreachHub — the landing page for the Outreach pillar. Action tiles for
 * Lead Scraper / Web Designer, a recent-runs strip, and a prospects table.
 * Functionality grows alongside the lead-scraper + outreach Rust commands;
 * for now this renders a clean placeholder with whatever prospects exist on
 * disk.
 */

import type {
  OutreachSection,
  ProspectEntry,
} from "../../lib/navigation";
import { prospectStatusPill } from "../../lib/navigation";
import {
  IconArrowRight,
  IconBroadcast,
  IconChevronRight,
  IconFilter,
  IconLayout,
  IconList,
  IconSend,
  IconTarget,
} from "../icons";

interface OutreachHubProps {
  prospects: ProspectEntry[];
  onSelectSection: (
    section: Exclude<OutreachSection, "prospect" | "overview">,
  ) => void;
  onSelectProspect: (slug: string) => void;
}

function avatarText(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function OutreachHub({
  prospects,
  onSelectSection,
  onSelectProspect,
}: OutreachHubProps) {
  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <IconBroadcast size={11} />
            Outreach
          </div>
          <h1 className="hml-page-title">Pipeline of prospects, cold to closed.</h1>
          <div className="hml-page-subtitle">
            {prospects.length} active prospect{prospects.length === 1 ? "" : "s"}.
            Run the scraper or generate a revamp mockup to fill the pipeline.
          </div>
        </div>
        <div className="hml-page-header-actions">
          <button type="button" className="hml-btn">
            <IconSend size={13} />
            Sequences
          </button>
          <button type="button" className="hml-btn">
            <IconList size={13} />
            All prospects
          </button>
        </div>
      </section>

      <section className="hml-action-tiles">
        <button
          type="button"
          className="hml-action-tile"
          onClick={() => onSelectSection("lead-scraper")}
        >
          <div className="hml-action-tile-top">
            <div className="hml-action-tile-icon">
              <IconTarget size={18} />
            </div>
          </div>
          <div className="hml-action-tile-title">Run Lead Scraper</div>
          <div className="hml-action-tile-desc">
            Pull a fresh batch from Google Places by niche and city. Dedupes
            against existing prospects automatically.
          </div>
          <div className="hml-action-tile-cta">
            Start a run
            <IconArrowRight size={11} className="hml-arrow" />
          </div>
        </button>
        <button
          type="button"
          className="hml-action-tile"
          onClick={() => onSelectSection("web-designer")}
        >
          <div className="hml-action-tile-top">
            <div className="hml-action-tile-icon">
              <IconLayout size={18} />
            </div>
          </div>
          <div className="hml-action-tile-title">New Revamp Mockup</div>
          <div className="hml-action-tile-desc">
            Spin up a one-page redesign of a prospect's site to attach to your
            first message. ~90 seconds.
          </div>
          <div className="hml-action-tile-cta">
            Choose a prospect
            <IconArrowRight size={11} className="hml-arrow" />
          </div>
        </button>
      </section>

      {prospects.length === 0 ? (
        <section className="hml-empty">
          <div className="hml-empty-title">No prospects yet</div>
          <div className="hml-empty-sub">
            Run the lead scraper, then promote a row to a prospect to see it here.
          </div>
        </section>
      ) : (
        <section className="hml-table">
          <div className="hml-table-meta">
            <div className="hml-table-meta-title">
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: "var(--hml-accent)",
                  display: "inline-block",
                }}
              />
              Prospects · {prospects.length}
            </div>
            <div className="hml-table-meta-actions">
              <div className="hml-chip">
                <IconFilter size={10} />
                All niches
              </div>
            </div>
          </div>
          <div className="hml-table-header-row">
            <span>Prospect</span>
            <span>Niche</span>
            <span>Status</span>
            <span>Last Touch</span>
            <span style={{ textAlign: "right" }}>Action</span>
          </div>
          {prospects.map((p) => {
            const pill = prospectStatusPill(p.status);
            return (
              <button
                key={p.slug}
                type="button"
                className="hml-table-row"
                onClick={() => onSelectProspect(p.slug)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--hml-border-subtle)",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                  width: "100%",
                }}
              >
                <div className="hml-table-row-name">
                  <div className="hml-table-row-avatar">{avatarText(p.name)}</div>
                  <div>
                    <div className="hml-table-row-name-text">{p.name}</div>
                    {p.url && (
                      <div
                        className="hml-table-row-meta"
                        style={{ fontSize: 10.5 }}
                      >
                        {p.url.replace(/^https?:\/\//, "")}
                      </div>
                    )}
                  </div>
                </div>
                <div className="hml-table-row-meta">{p.niche ?? "—"}</div>
                <div>
                  <span className={`hml-pill ${pill.className}`}>
                    <span className="hml-pill-dot" />
                    {pill.label}
                  </span>
                </div>
                <div className="hml-table-row-meta">
                  {p.lastTouchedAt
                    ? new Date(p.lastTouchedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })
                    : "—"}
                </div>
                <div className="hml-table-action">
                  Open
                  <IconChevronRight size={10} />
                </div>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}
