/**
 * ClientDashboard — per-client surface with sub-nav (Profile/Memory/Drive/
 * Media Buying/Website).
 */

import { useEffect, useState } from "react";
import type { ClientEntry, VaultNote } from "../../lib/types";
import type { ClientSection } from "../../lib/navigation";
import type { FormSurfaceId } from "../../lib/formConfigs";
import { api } from "../../lib/tauri";
import { parseDriveFolders, type DriveFolder } from "../../lib/driveIndex";
import { ClientMediaBuying } from "./ClientMediaBuying";
import { WebDesignerPage } from "./WebDesignerPage";
import {
  IconBarChart,
  IconFolder,
  IconGlobe,
  IconMore,
  IconPen,
  IconUser,
} from "../icons";

interface ClientDashboardProps {
  client: ClientEntry;
  section: ClientSection;
  root: string | null;
  onSelectSection: (section: ClientSection) => void;
  onOpenForm: (id: FormSurfaceId, clientSlug: string, clientName: string) => void;
  onOpenDrive?: () => void;
}

const TABS: ReadonlyArray<{
  id: ClientSection;
  label: string;
  Icon: typeof IconUser;
}> = [
  { id: "profile", label: "Profile", Icon: IconUser },
  { id: "memory", label: "Memory", Icon: IconPen },
  { id: "drive", label: "Drive", Icon: IconFolder },
  { id: "media-buying", label: "Media Buying", Icon: IconBarChart },
  { id: "website", label: "Website", Icon: IconGlobe },
];

function clientPill(status: ClientEntry["status"]) {
  switch (status) {
    case "live":
      return { className: "hml-green", label: "Live" };
    case "pre-launch":
      return { className: "hml-amber", label: "Pre-launch" };
    case "paused":
      return { className: "hml-neutral", label: "Paused" };
  }
}

function avatarChar(name: string): string {
  return name?.charAt(0)?.toUpperCase() ?? "•";
}

export function ClientDashboard({
  client,
  section,
  root,
  onSelectSection,
  onOpenForm,
  onOpenDrive,
}: ClientDashboardProps) {
  const pill = clientPill(client.status);

  return (
    <div className="hml-content">
      <section className="hml-client-header">
        <div className="hml-client-header-top">
          <div className="hml-client-avatar">{avatarChar(client.name)}</div>
          <div className="hml-client-name-block">
            <h1 className="hml-client-name">{client.name}</h1>
            <span className={`hml-pill ${pill.className}`}>
              <span className="hml-pill-dot" />
              {pill.label}
            </span>
          </div>
          <div className="hml-client-actions">
            {client.drive_folder_url && onOpenDrive && (
              <button type="button" className="hml-btn" onClick={onOpenDrive}>
                <IconFolder size={13} />
                Open Drive
              </button>
            )}
            <button type="button" className="hml-icon-btn" aria-label="More">
              <IconMore size={14} />
            </button>
          </div>
        </div>
        <div className="hml-client-meta-row">
          {client.created_at && (
            <>
              <div className="hml-item">
                <span className="hml-label">Started</span>
                <span className="hml-v">
                  {new Date(client.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <span className="hml-sep">·</span>
            </>
          )}
          <div className="hml-item">
            <span className="hml-label">Slug</span>
            <span className="hml-v">{client.slug}</span>
          </div>
          {client.benchmarks && (
            <>
              <span className="hml-sep">·</span>
              <div className="hml-item">
                <span className="hml-label">Benchmarks</span>
                <span className="hml-v">{client.benchmarks}</span>
              </div>
            </>
          )}
        </div>
      </section>

      <nav className="hml-subnav">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`hml-subnav-item${section === id ? " hml-active" : ""}`}
            onClick={() => onSelectSection(id)}
          >
            <Icon className="hml-nav-icon" />
            {label}
          </button>
        ))}
      </nav>

      <div>
        {section === "profile" && (
          <ClientNoteView root={root} clientSlug={client.slug} match="profile" emptyLabel="No Profile.md found yet." />
        )}
        {section === "memory" && (
          <ClientNoteView root={root} clientSlug={client.slug} match="memory" emptyLabel="No Memory.md found yet." />
        )}
        {section === "drive" && (
          <ClientDriveView root={root} clientSlug={client.slug} driveUrl={client.drive_folder_url ?? null} />
        )}
        {section === "media-buying" && (
          <ClientMediaBuying
            clientName={client.name}
            onOpenForm={(id) => onOpenForm(id, client.slug, client.name)}
          />
        )}
        {section === "website" && (
          <WebDesignerPage
            root={root}
            clientSlug={client.slug}
            clientName={client.name}
          />
        )}
      </div>
    </div>
  );
}

/** Lightweight vault-note display for the Profile/Memory tabs. Renders
 *  pre-wrapped markdown for now — a richer renderer can replace this. */
function ClientNoteView({
  root,
  clientSlug,
  match,
  emptyLabel,
}: {
  root: string | null;
  clientSlug: string;
  match: "profile" | "memory";
  emptyLabel: string;
}) {
  const [notes, setNotes] = useState<VaultNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) {
      setNotes([]);
      return;
    }
    let cancelled = false;
    setNotes(null);
    setError(null);
    api
      .readClientNotes(root, clientSlug)
      .then((list) => {
        if (cancelled) return;
        setNotes(list);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  if (notes === null) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading…</div></div>;
  }

  const note = notes.find((n) => {
    const lower = n.path.toLowerCase();
    return lower.endsWith(`/${match}.md`) || lower.endsWith(`\\${match}.md`);
  });

  if (error) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't load notes</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">{emptyLabel}</div>
        <div className="hml-empty-sub">
          Create it at vault/Clients/{clientSlug}/{match.charAt(0).toUpperCase() + match.slice(1)}.md.
        </div>
      </div>
    );
  }

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" />
          {match === "profile" ? "Profile" : "Memory"}
        </div>
        <span className="hml-panel-action">
          {note.path.split(/[/\\]/).slice(-3).join(" / ")}
        </span>
      </div>
      <pre
        style={{
          padding: "18px 22px",
          margin: 0,
          fontFamily: "var(--hml-font-sans)",
          fontSize: 13.5,
          lineHeight: 1.6,
          color: "var(--hml-text-secondary)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {note.body}
      </pre>
    </div>
  );
}

function ClientDriveView({
  root,
  clientSlug,
  driveUrl,
}: {
  root: string | null;
  clientSlug: string;
  driveUrl: string | null;
}) {
  const [folders, setFolders] = useState<DriveFolder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!root) {
      setFolders([]);
      return;
    }
    let cancelled = false;
    setFolders(null);
    setError(null);
    api
      .readDriveIndex(root, clientSlug)
      .then((idx) => {
        if (cancelled) return;
        if (!idx) {
          setFolders([]);
          return;
        }
        setFolders(parseDriveFolders(idx.body));
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setFolders([]);
      });
    return () => {
      cancelled = true;
    };
  }, [root, clientSlug]);

  if (folders === null) {
    return <div className="hml-empty"><div className="hml-empty-sub">Loading Drive index…</div></div>;
  }

  if (!driveUrl && (!folders || folders.length === 0)) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">No Drive folder linked</div>
        <div className="hml-empty-sub">
          Link a Drive folder from Settings, then refresh the index here.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="hml-empty">
        <div className="hml-empty-title">Couldn't load Drive index</div>
        <div className="hml-empty-sub">{error}</div>
      </div>
    );
  }

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" style={{ background: "var(--hml-blue)" }} />
          Drive folders
        </div>
        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noreferrer"
            className="hml-panel-action"
          >
            Open root ↗
          </a>
        )}
      </div>
      <div className="hml-panel-body">
        {folders.length === 0 ? (
          <div className="hml-empty">
            <div className="hml-empty-sub">
              No folders indexed yet. Run the Drive index refresh from Settings.
            </div>
          </div>
        ) : (
          folders.map((f) => (
            <a
              key={f.id}
              href={f.url}
              target="_blank"
              rel="noreferrer"
              className="hml-activity"
              style={{ textDecoration: "none" }}
            >
              <div className="hml-activity-icon hml-blue">
                <IconFolder size={13} />
              </div>
              <div className="hml-activity-body">
                <div className="hml-activity-title">
                  <span className="hml-em">{f.name}</span>
                </div>
                <div className="hml-activity-meta">
                  <span>{f.url.replace(/^https?:\/\/(www\.)?drive\.google\.com/, "drive.google.com")}</span>
                </div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}
