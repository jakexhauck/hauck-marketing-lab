import { useMemo } from "react";
import { FileText, ExternalLink } from "lucide-react";
import { useSopHub } from "../../../hooks/useSopHub";
import { allFolders, folderCrumbs, type SopEntry } from "../../../lib/sopHub";

// Pointing a cold-call document at a Google Doc in the SOP Hub.
//
// One control, used by every place that used to hold a rich-text editor: the
// script variations, the objections document and the SOPs the team reads. Jake
// writes in Google Docs; this only records which document plays which part.
//
// A flat <select> grouped by folder rather than a tree. The hub itself is the
// place to browse a folder structure five levels deep; this is the place to
// answer "which one", and a picker that makes you navigate to answer that is a
// picker that gets used once and then avoided.

export interface SopDocChoice {
  fileId: string;
  title: string;
}

/** Every Doc in the hub, flattened, with the folder path it came from. */
function useAllDocs() {
  const hub = useSopHub();
  const options = useMemo(() => {
    const out: { folder: string; entries: SopEntry[] }[] = [];
    // Loose documents at the root come first: they have no folder to file them
    // under and burying them under a made-up heading would be a small lie.
    if (hub.tree.sops.length > 0) out.push({ folder: "Top level", entries: hub.tree.sops });
    for (const folder of allFolders(hub.tree)) {
      if (folder.sops.length === 0) continue;
      out.push({ folder: folderCrumbs(folder).join(" / "), entries: folder.sops });
    }
    return out;
  }, [hub.tree]);
  return { hub, options };
}

export default function SopDocPicker({
  value,
  valueTitle,
  onChange,
  label = "Document",
  // What renders when nothing is picked. The scripts page says the stored text
  // is still being used; a brand new row says nothing is written yet.
  emptyLabel = "Not pointed at a document yet",
}: {
  value: string | null;
  valueTitle: string | null;
  onChange: (choice: SopDocChoice | null) => void;
  label?: string;
  emptyLabel?: string;
}) {
  const { hub, options } = useAllDocs();

  const byId = useMemo(() => {
    const map = new Map<string, SopEntry>();
    for (const group of options) for (const e of group.entries) map.set(e.fileId, e);
    return map;
  }, [options]);

  const picked = value ? byId.get(value) : undefined;
  // A pointer whose Doc has been renamed, moved out of the folder or deleted.
  // Named rather than silently blanked: "the document is gone" and "nothing was
  // ever picked" need different reactions from Jake.
  const missing = Boolean(value) && !picked && !hub.loading;

  const total = options.reduce((n, g) => n + g.entries.length, 0);

  return (
    <div className="sdp">
      <SopPickerStyle />
      <div className="sdp-row">
        <label className="sdp-field">
          <span className="sdp-label">{label}</span>
          <select
            className="pk-select pk-select-pill"
            value={value ?? ""}
            disabled={hub.loading || total === 0}
            onChange={(e) => {
              const id = e.target.value;
              if (!id) return onChange(null);
              const entry = byId.get(id);
              onChange(entry ? { fileId: entry.fileId, title: entry.title } : null);
            }}
          >
            <option value="">{emptyLabel}</option>
            {options.map((group) => (
              <optgroup key={group.folder} label={group.folder}>
                {group.entries.map((e) => (
                  <option key={e.fileId} value={e.fileId}>
                    {e.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        {picked?.webViewLink && (
          <a className="sdp-open" href={picked.webViewLink} target="_blank" rel="noreferrer">
            <ExternalLink size={12} aria-hidden />
            Edit in Docs
          </a>
        )}
      </div>

      {hub.loading && <p className="sdp-note">Reading the SOP Hub...</p>}

      {!hub.loading && hub.status !== "ok" && (
        <p className="sdp-note warn">
          {hub.status === "not_connected" || hub.status === "not_configured"
            ? "Google Drive is not connected, so there is nothing to point at yet. Connect it on Operations > SOPs."
            : hub.status === "no_access"
              ? `The connected Google account${hub.connectedEmail ? ` (${hub.connectedEmail})` : ""} cannot see the SOP folder.`
              : "Could not read the SOP Hub."}
        </p>
      )}

      {!hub.loading && hub.status === "ok" && total === 0 && (
        <p className="sdp-note">No documents in the SOP Hub yet. Add one in Google Drive.</p>
      )}

      {missing && (
        <p className="sdp-note warn">
          {valueTitle ? `"${valueTitle}" is` : "The document this points at is"} no longer in the
          SOP folder. Pick another, or move it back in Drive.
        </p>
      )}

      {picked && (
        <p className="sdp-note ok">
          <FileText size={12} aria-hidden />
          Reading from <b>{picked.title}</b>. Edit the words in Google Docs and they change here.
        </p>
      )}
    </div>
  );
}

function SopPickerStyle() {
  return (
    <style>{`
      .sdp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .sdp-field { display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
      .sdp-label { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-faint); white-space: nowrap; }
      .sdp-open { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; color: var(--brand-text); text-decoration: none; }
      .sdp-open:hover { text-decoration: underline; }
      .sdp-note { display: flex; align-items: center; gap: 6px; margin: 8px 0 0; font-size: 12px; color: var(--text-faint); }
      .sdp-note.ok { color: var(--text-muted); }
      .sdp-note.ok b { color: var(--text); font-weight: 600; }
      .sdp-note.warn { color: var(--danger, #c0392b); }
    `}</style>
  );
}
