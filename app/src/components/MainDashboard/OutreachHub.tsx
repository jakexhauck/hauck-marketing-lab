/**
 * OutreachHub — the landing page for the Outreach pillar. Three tool tiles
 * (Lead Scraper / Web Designer / Prospects) and a manually-managed booked-call
 * list. Jake cold-calls and adds a prospect only when he books a discovery —
 * this hub is for tracking those calls, not a full CRM pipeline.
 */

import { useRef, useState } from "react";
import type {
  OutreachSection,
  ProspectEntry,
  ProspectStatus,
} from "../../lib/navigation";
import { prospectStatusPill } from "../../lib/navigation";
import { api } from "../../lib/tauri";
import {
  IconChevronRight,
  IconFilter,
  IconList,
  IconPhone,
  IconPlus,
} from "../icons";

interface OutreachHubProps {
  root: string | null;
  prospects: ProspectEntry[];
  onSelectSection: (
    section: Exclude<OutreachSection, "prospect" | "overview">,
  ) => void;
  onSelectProspect: (slug: string) => void;
  onProspectsChanged: () => void;
}

/* Hub layout (cold-call first):
 *   - Headline tile: Cold Call Sequence (scrape -> dial -> book -> websites)
 *   - Three tool tiles: Lead Scraper, Web Designer, Prospects (booked list)
 *   - Booked-calls table
 *   - Footer: Personalized DMs tab (kept around but not part of the main flow) */

function avatarText(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const BOOKED_STATUSES: ProspectStatus[] = [
  "scheduled",
  "showed",
  "closed",
  "no-show",
];

function isBookedStatus(s: ProspectStatus): boolean {
  return BOOKED_STATUSES.includes(s);
}

function formatScheduled(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const date = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const time = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    return `${date} · ${time}`;
  } catch {
    return iso;
  }
}

export function OutreachHub({
  root,
  prospects,
  onSelectSection,
  onSelectProspect,
  onProspectsChanged,
}: OutreachHubProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [niche, setNiche] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [status, setStatus] = useState<ProspectStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tableRef = useRef<HTMLElement | null>(null);

  const bookedProspects = prospects.filter((p) => isBookedStatus(p.status));
  const otherProspects = prospects.filter((p) => !isBookedStatus(p.status));

  const resetForm = () => {
    setName("");
    setWebsite("");
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setNiche("");
    setScheduledAt("");
    setStatus("scheduled");
    setNotes("");
    setError(null);
  };

  const submitForm = async () => {
    if (!root) {
      setError("Pick a media-buying folder in Settings before adding prospects.");
      return;
    }
    if (!name.trim()) {
      setError("Business name is required.");
      return;
    }
    setSubmitting(true);
    try {
      // Convert local datetime-input value (no timezone) to RFC3339 so the
      // backend can store it predictably.
      const scheduledRfc = scheduledAt
        ? new Date(scheduledAt).toISOString()
        : null;
      await api.addProspect(root, {
        name: name.trim(),
        niche: niche.trim() || null,
        url: website.trim() || null,
        contactName: contactName.trim() || null,
        contactPhone: contactPhone.trim() || null,
        contactEmail: contactEmail.trim() || null,
        scheduledAt: scheduledRfc,
        status,
        notes: notes.trim() || null,
      });
      resetForm();
      setFormOpen(false);
      onProspectsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const changeStatus = async (slug: string, next: ProspectStatus) => {
    if (!root) return;
    try {
      await api.updateProspectStatus(root, slug, next);
      onProspectsChanged();
    } catch (err) {
      console.warn("Failed to update prospect status:", err);
    }
  };

  const deleteProspect = async (slug: string, label: string) => {
    if (!root) return;
    if (!window.confirm(`Delete "${label}"? This removes the vault folder.`)) {
      return;
    }
    try {
      await api.deleteProspect(root, slug);
      onProspectsChanged();
    } catch (err) {
      console.warn("Failed to delete prospect:", err);
    }
  };

  return (
    <div className="hml-content">
      <section className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <IconPhone size={11} />
            Cold-call outreach
          </div>
          <h1 className="hml-page-title">Cold-call workspace.</h1>
          <div className="hml-page-subtitle">
            {prospects.length} prospect{prospects.length === 1 ? "" : "s"}
            {bookedProspects.length > 0
              ? ` · ${bookedProspects.length} booked call${bookedProspects.length === 1 ? "" : "s"}`
              : ""}
            . Scrape a list, dial through it, book the ones that pick up.
          </div>
        </div>
        <div className="hml-page-header-actions">
          <button
            type="button"
            className="hml-btn"
            onClick={() => {
              setFormOpen((open) => !open);
              setError(null);
            }}
            title="Manually add a booked call"
          >
            <IconPlus size={13} />
            {formOpen ? "Close" : "Add booked call"}
          </button>
        </div>
      </section>

      {/* Inline "Add booked call" form */}
      {formOpen && (
        <section className="hml-prospect-form">
          <div className="hml-prospect-form-head">
            <span className="hml-prospect-form-title">+ New booked call</span>
            <span className="hml-prospect-form-hint">
              Only Business name is required. Everything else is optional.
            </span>
          </div>
          <div className="hml-prospect-form-grid">
            <FormField
              label="Business name"
              required
              value={name}
              onChange={setName}
              placeholder="Lakeside Dental"
            />
            <FormField
              label="Website"
              value={website}
              onChange={setWebsite}
              placeholder="https://lakesidedental.com"
            />
            <FormField
              label="Contact name"
              value={contactName}
              onChange={setContactName}
              placeholder="Dr. Sarah Kim"
            />
            <FormField
              label="Phone"
              value={contactPhone}
              onChange={setContactPhone}
              placeholder="(517) 555-0142"
            />
            <FormField
              label="Email"
              value={contactEmail}
              onChange={setContactEmail}
              placeholder="sarah@lakesidedental.com"
            />
            <FormField
              label="Niche"
              value={niche}
              onChange={setNiche}
              placeholder="Dental"
            />
            <FormField
              label="Scheduled call"
              value={scheduledAt}
              onChange={setScheduledAt}
              type="datetime-local"
            />
            <div className="hml-prospect-form-field">
              <label className="hml-prospect-form-label">
                Status
                <span className="hml-prospect-form-opt">default</span>
              </label>
              <select
                className="hml-prospect-form-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProspectStatus)}
              >
                <option value="scheduled">Scheduled</option>
                <option value="showed">Showed</option>
                <option value="closed">Closed</option>
                <option value="no-show">No-show</option>
              </select>
            </div>
            <div
              className="hml-prospect-form-field hml-prospect-form-full"
            >
              <label className="hml-prospect-form-label">
                Notes
                <span className="hml-prospect-form-opt">optional</span>
              </label>
              <textarea
                className="hml-prospect-form-input"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What you discussed on the call, follow-up actions, etc."
              />
            </div>
          </div>
          <div className="hml-prospect-form-actions">
            {error ? (
              <span className="hml-prospect-form-error">{error}</span>
            ) : (
              <span />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="hml-btn"
                onClick={() => {
                  resetForm();
                  setFormOpen(false);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="hml-btn hml-accent"
                onClick={submitForm}
                disabled={submitting || !name.trim()}
              >
                {submitting ? "Saving…" : "Save booking"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Booked calls table */}
      <section className="hml-table" ref={tableRef}>
        <div className="hml-table-meta">
          <div className="hml-table-meta-title">
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--hml-green)",
                display: "inline-block",
              }}
            />
            Booked calls · {bookedProspects.length}
          </div>
          <div className="hml-table-meta-actions">
            <div className="hml-chip">
              <IconFilter size={10} />
              All statuses
            </div>
          </div>
        </div>
        {bookedProspects.length === 0 ? (
          <div className="hml-empty">
            <div className="hml-empty-title">No bookings yet</div>
            <div className="hml-empty-sub">
              Click "+ Add booked call" above when a cold call lands. Only the
              business name is required.
            </div>
          </div>
        ) : (
          <>
            <div className="hml-table-header-row">
              <span>Business</span>
              <span>Contact</span>
              <span>Scheduled</span>
              <span>Status</span>
              <span style={{ textAlign: "right" }}>Action</span>
            </div>
            {bookedProspects.map((p) => {
              const pill = prospectStatusPill(p.status);
              return (
                <div
                  key={p.slug}
                  className="hml-table-row"
                  style={{
                    borderBottom: "1px solid var(--hml-border-subtle)",
                  }}
                >
                  <button
                    type="button"
                    className="hml-table-row-name"
                    onClick={() => onSelectProspect(p.slug)}
                    style={{
                      background: "transparent",
                      border: "none",
                      textAlign: "left",
                      font: "inherit",
                      color: "inherit",
                      padding: 0,
                      cursor: "pointer",
                    }}
                  >
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
                  </button>
                  <div className="hml-table-row-meta">
                    {p.niche ?? "—"}
                  </div>
                  <div className="hml-table-row-meta">
                    {formatScheduled(p.lastTouchedAt ?? null)}
                  </div>
                  <div>
                    <select
                      className="hml-prospect-status-select"
                      value={p.status}
                      onChange={(e) =>
                        changeStatus(p.slug, e.target.value as ProspectStatus)
                      }
                      title="Update status"
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="showed">Showed</option>
                      <option value="closed">Closed</option>
                      <option value="no-show">No-show</option>
                    </select>
                    <span
                      className={`hml-pill ${pill.className}`}
                      style={{ marginLeft: 8 }}
                    >
                      <span className="hml-pill-dot" />
                      {pill.label}
                    </span>
                  </div>
                  <div className="hml-table-action" style={{ gap: 6 }}>
                    <button
                      type="button"
                      className="hml-icon-btn"
                      onClick={() => onSelectProspect(p.slug)}
                      title="Open prospect"
                    >
                      <IconChevronRight size={11} />
                    </button>
                    <button
                      type="button"
                      className="hml-icon-btn"
                      onClick={() => deleteProspect(p.slug, p.name)}
                      title="Delete prospect"
                      style={{ color: "var(--hml-red, #c4847b)" }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </section>

      {/* Prospects list (everything that isn't a booked call) */}
      <section className="hml-table" style={{ marginTop: 18 }}>
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
            Prospects · {otherProspects.length}
          </div>
          <div className="hml-table-meta-actions">
            <button
              type="button"
              className="hml-btn"
              onClick={() => onSelectSection("lead-scraper")}
              style={{ fontSize: 11 }}
            >
              <IconList size={11} />
              Lead scraper
            </button>
          </div>
        </div>
        {otherProspects.length === 0 ? (
          <div className="hml-empty">
            <div className="hml-empty-title">No prospects yet</div>
            <div className="hml-empty-sub">
              Scrape a list via Lead scraper, or run a Cold call sequence to populate the pipeline.
            </div>
          </div>
        ) : (
          <>
            <div className="hml-table-header-row">
              <span>Prospect</span>
              <span>Niche</span>
              <span>Status</span>
              <span>Last touch</span>
              <span style={{ textAlign: "right" }}>Action</span>
            </div>
            {otherProspects.map((p) => {
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
          </>
        )}
      </section>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="hml-prospect-form-field">
      <label className="hml-prospect-form-label">
        {label}
        {required ? (
          <span className="hml-prospect-form-req" title="Required">
            *
          </span>
        ) : (
          <span className="hml-prospect-form-opt">optional</span>
        )}
      </label>
      <input
        className="hml-prospect-form-input"
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
