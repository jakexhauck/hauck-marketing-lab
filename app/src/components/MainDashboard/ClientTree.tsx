import { useEffect, useState } from "react";
import { api } from "../../lib/tauri";
import { openInAppWindow } from "../../lib/openInApp";
import { parseDriveFolders, type DriveFolder } from "../../lib/driveIndex";
import type { ClientV1 } from "./v1Data";

export type ClientSection = "overview";

interface ClientTreeProps {
  client: ClientV1;
  root: string | null;
  driveFolderUrl: string | null;
  defaultExpanded?: boolean;
  onSelect: (slug: string, section: ClientSection) => void;
}

type FoldersState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; folders: DriveFolder[] }
  | { kind: "no-index" }
  | { kind: "error"; message: string };

export function ClientTree({
  client,
  root,
  driveFolderUrl,
  defaultExpanded = true,
  onSelect,
}: ClientTreeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [folders, setFolders] = useState<FoldersState>({ kind: "idle" });

  useEffect(() => {
    if (!expanded || !root) return;
    let cancelled = false;
    setFolders({ kind: "loading" });
    api
      .readDriveIndex(root, client.slug)
      .then((idx) => {
        if (cancelled) return;
        if (!idx) {
          setFolders({ kind: "no-index" });
          return;
        }
        setFolders({ kind: "ready", folders: parseDriveFolders(idx.body) });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setFolders({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [expanded, root, client.slug]);

  return (
    <div className={`md-client-block${expanded ? " md-expanded" : ""}`}>
      <button
        type="button"
        className={`md-client-row${expanded ? " md-expanded" : ""}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="md-caret">▸</span>
        <span className={`md-dot md-${client.status}`} />
        <span>{client.name}</span>
      </button>
      {expanded && (
        <div className="md-client-sub">
          <button
            type="button"
            className="md-client-sub-item"
            onClick={() => onSelect(client.slug, "overview")}
          >
            <span className="md-micro">▸</span>
            Overview
          </button>
          <DriveSection
            state={folders}
            hasDriveUrl={!!driveFolderUrl}
          />
        </div>
      )}
    </div>
  );
}

function DriveSection({
  state,
  hasDriveUrl,
}: {
  state: FoldersState;
  hasDriveUrl: boolean;
}) {
  if (!hasDriveUrl) {
    return <SubHint text="No Drive folder linked" />;
  }
  if (state.kind === "idle" || state.kind === "loading") {
    return <SubHint text="Loading Drive…" />;
  }
  if (state.kind === "error") {
    return <SubHint text="Drive index failed to load" />;
  }
  if (state.kind === "no-index") {
    return <SubHint text="Drive not indexed yet" />;
  }
  if (state.folders.length === 0) {
    return <SubHint text="No folders found in Drive index" />;
  }
  return (
    <>
      {state.folders.map((folder) => (
        <a
          key={folder.id}
          className="md-client-sub-item"
          href={folder.url}
          target="_blank"
          rel="noreferrer"
          title={`Open ${folder.name} in Google Drive`}
          onClick={(e) => {
            e.preventDefault();
            openInAppWindow(folder.url, folder.name);
          }}
        >
          <span className="md-micro">▸</span>
          {folder.name}
        </a>
      ))}
    </>
  );
}

function SubHint({ text }: { text: string }) {
  return (
    <div
      className="md-client-sub-item"
      style={{ opacity: 0.55, cursor: "default", fontStyle: "italic" }}
    >
      <span className="md-micro">·</span>
      {text}
    </div>
  );
}
