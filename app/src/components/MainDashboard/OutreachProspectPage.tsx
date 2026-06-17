/**
 * OutreachProspectPage — per-prospect surface. Light scaffold for now;
 * fills in as outreach sequence + contact features land.
 */

import type { ProspectEntry } from "../../lib/navigation";
import { prospectStatusPill } from "../../lib/navigation";
import { IconBroadcast, IconLayout, IconMore, IconSend } from "../icons";

interface OutreachProspectPageProps {
  prospect: ProspectEntry;
  onBack?: () => void;
  onOpenRevamp?: () => void;
}

function avatarText(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function OutreachProspectPage({
  prospect,
  onOpenRevamp,
}: OutreachProspectPageProps) {
  const pill = prospectStatusPill(prospect.status);
  return (
    <div className="hml-content">
      <section className="hml-client-header">
        <div className="hml-client-header-top">
          <div
            className="hml-client-avatar"
            style={{
              background: "linear-gradient(135deg, color-mix(in srgb, var(--hue-plum) 22%, var(--surface-2)), color-mix(in srgb, var(--hue-plum) 12%, var(--surface)))",
              color: "var(--hml-plum)",
            }}
          >
            {avatarText(prospect.name)}
          </div>
          <div className="hml-client-name-block">
            <h1 className="hml-client-name">{prospect.name}</h1>
            <span className={`hml-pill ${pill.className}`}>
              <span className="hml-pill-dot" />
              {pill.label}
            </span>
          </div>
          <div className="hml-client-actions">
            <button type="button" className="hml-btn">
              <IconSend size={13} />
              Send sequence
            </button>
            <button type="button" className="hml-icon-btn">
              <IconMore size={14} />
            </button>
          </div>
        </div>
        <div className="hml-client-meta-row">
          <div className="hml-item">
            <span className="hml-label">Niche</span>
            <span className="hml-v">{prospect.niche ?? "—"}</span>
          </div>
          {prospect.url && (
            <>
              <span className="hml-sep">·</span>
              <div className="hml-item">
                <span className="hml-label">Site</span>
                <span className="hml-v">
                  {prospect.url.replace(/^https?:\/\//, "")}
                </span>
              </div>
            </>
          )}
          <span className="hml-sep">·</span>
          <div className="hml-item">
            <span className="hml-label">Slug</span>
            <span className="hml-v">{prospect.slug}</span>
          </div>
        </div>
      </section>

      <section className="hml-action-tiles">
        <button
          type="button"
          className="hml-action-tile"
          onClick={onOpenRevamp}
        >
          <div className="hml-action-tile-top">
            <div className="hml-action-tile-icon">
              <IconLayout size={18} />
            </div>
          </div>
          <div className="hml-action-tile-title">Open Revamp Mockup</div>
          <div className="hml-action-tile-desc">
            Edit or regenerate the redesign for this prospect. Output lives in
            vault/Outreach/{prospect.slug}/revamp/.
          </div>
        </button>
        <button type="button" className="hml-action-tile">
          <div className="hml-action-tile-top">
            <div className="hml-action-tile-icon">
              <IconBroadcast size={18} />
            </div>
          </div>
          <div className="hml-action-tile-title">Outreach sequence</div>
          <div className="hml-action-tile-desc">
            Draft and send the first-touch message. Sequence builder lands in a
            follow-up release.
          </div>
        </button>
      </section>

      <div className="hml-empty">
        <div className="hml-empty-title">Prospect surface: more soon</div>
        <div className="hml-empty-sub">
          Contact info, sequence status, reply tracking will appear here.
        </div>
      </div>
    </div>
  );
}
