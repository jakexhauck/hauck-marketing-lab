import { Fragment, useEffect, useState } from "react";
import { Check, ChevronRight, FileText, Folder, LoaderCircle } from "lucide-react";
import {
  useAdminOnboardingDriveFolder,
  useChooseMissionDoc,
  useClientDriveQuery,
  useCreateMissionControl,
  useFolderLinkQuery,
  useLinkClientFolder,
} from "../../../hooks/useApi";
import type { ClientDriveFile } from "../../../lib/api";
import { FolderStyle } from "../folder/folderStyle";

// The Brief's Mission Control wizard (Jake, 2026-10-27): when a new client
// lands, the CSM puts the right Mission Control doc in the client's Drive
// folder and picks it here. Step 1 links the folder (Client > Folder reads the
// same link), step 2 browses it for the doc. Only Google Docs can be picked,
// and docs named like Mission Control sort first.

const DOC_MIME = "application/vnd.google-apps.document";
const isMission = (name: string) => /mission control/i.test(name);

export function sortForPicking(files: ClientDriveFile[]): ClientDriveFile[] {
  const folders = files.filter((f) => f.isFolder).sort((a, b) => a.name.localeCompare(b.name));
  const docs = files
    .filter((f) => !f.isFolder && f.mimeType === DOC_MIME)
    .sort((a, b) => Number(isMission(b.name)) - Number(isMission(a.name)) || (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""));
  return [...folders, ...docs];
}

export function MissionDocWizard({ tenantId, onDone }: { tenantId: string; onDone?: () => void }) {
  const link = useFolderLinkQuery(tenantId, true);
  const linked = link.data?.linked ?? null;
  return (
    <div className="mcb-card mdw cf">
      <FolderStyle />
      <WizardStyle />
      <FolderStep tenantId={tenantId} q={link} />
      <h3 className={`mcb-h${linked ? "" : " off"}`}>
        <span className="mdw-n">2</span>Mission Control doc
      </h3>
      {linked && <DocStep tenantId={tenantId} onDone={onDone} />}
    </div>
  );
}

function FolderStep({ tenantId, q }: { tenantId: string; q: ReturnType<typeof useFolderLinkQuery> }) {
  const linkFolder = useLinkClientFolder(tenantId);
  const makeFolder = useAdminOnboardingDriveFolder(tenantId);
  const [pick, setPick] = useState<string | null>(null);
  const suggested = q.data?.suggested ?? null;
  useEffect(() => setPick((p) => p ?? suggested), [suggested]);
  const linked = q.data?.linked ?? null;
  const error = (linkFolder.error ?? makeFolder.error) as Error | null;

  return (
    <div className="mcb-sec">
      <h3 className="mcb-h">
        <span className={`mdw-n${linked ? " done" : ""}`}>{linked ? <Check size={13} /> : 1}</span>Folder
      </h3>
      {q.isLoading ? (
        <div className="mcb-empty">Loading...</div>
      ) : q.isError ? (
        <div className="cf-err">{(q.error as Error).message}</div>
      ) : linked ? (
        <div className="mdw-box">
          <div className="cf-row">
            <span className="cf-main">
              <span className="cf-ic">
                <Folder size={18} />
              </span>
              <span className="cf-name">{linked.name}</span>
            </span>
          </div>
        </div>
      ) : (
        <>
          {error && <div className="cf-err">{error.message}</div>}
          <div className="mdw-box mdw-scroll">
            {(q.data?.folders ?? []).map((f) => (
              <button
                key={f.id}
                type="button"
                className={`cf-row mdw-pick${pick === f.id ? " on" : ""}`}
                disabled={!!f.takenBy}
                onClick={() => setPick(f.id)}
              >
                <span className="cf-main">
                  <span className="cf-ic">
                    <Folder size={18} />
                  </span>
                  <span className="cf-name">{f.name}</span>
                </span>
                {f.takenBy ? <span className="mcb-tag plain">{f.takenBy}</span> : pick === f.id && <Check size={16} className="mdw-tick" />}
              </button>
            ))}
          </div>
          <div className="mdw-acts">
            <button
              type="button"
              className="mcb-btn mdw-go"
              disabled={!pick || linkFolder.isPending}
              onClick={() => pick && linkFolder.mutate(pick)}
            >
              {linkFolder.isPending ? "Linking..." : "Link folder"}
            </button>
            <button
              type="button"
              className="mcb-btn"
              disabled={makeFolder.isPending}
              onClick={() => makeFolder.mutate(undefined, { onSuccess: () => void q.refetch() })}
            >
              {makeFolder.isPending ? "Creating..." : "Create client folder"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DocStep({ tenantId, onDone }: { tenantId: string; onDone?: () => void }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const q = useClientDriveQuery(tenantId, folder);
  const choose = useChooseMissionDoc(tenantId);
  const create = useCreateMissionControl(tenantId);
  const rows = sortForPicking(q.data?.files ?? []);
  const error = (choose.error ?? create.error) as Error | null;
  const open = (id: string | null) => {
    setFolder(id);
    setPick(null);
  };

  return (
    <>
      {q.data && q.data.path.length > 1 && (
        <div className="cf-crumbs">
          {q.data.path.map((s, i) => {
            const last = i === q.data!.path.length - 1;
            return (
              <Fragment key={s.id}>
                {i > 0 && <ChevronRight size={14} className="cf-sep" />}
                {last ? (
                  <span className="cf-crumb on">{s.name}</span>
                ) : (
                  <button type="button" className="cf-crumb" onClick={() => open(i === 0 ? null : s.id)}>
                    {s.name}
                  </button>
                )}
              </Fragment>
            );
          })}
        </div>
      )}
      {error && <div className="cf-err">{error.message}</div>}
      <div className="mdw-box mdw-scroll">
        {q.isLoading ? (
          <div className="mcb-empty mdw-pad">
            <LoaderCircle size={14} className="cf-spin" />
          </div>
        ) : q.isError ? (
          <div className="cf-err">{(q.error as Error).message}</div>
        ) : rows.length === 0 ? (
          <div className="mcb-empty mdw-pad">No docs here.</div>
        ) : (
          rows.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`cf-row mdw-pick${pick === f.id ? " on" : ""}`}
              onClick={() => (f.isFolder ? open(f.id) : setPick(f.id))}
            >
              <span className="cf-main">
                <span className="cf-ic">
                  {f.isFolder ? <Folder size={18} /> : <FileText size={18} style={{ color: "#4285f4" }} />}
                </span>
                <span className="cf-name">{f.name}</span>
              </span>
              {f.isFolder ? <ChevronRight size={16} className="cf-sep" /> : pick === f.id && <Check size={16} className="mdw-tick" />}
            </button>
          ))
        )}
      </div>
      <div className="mdw-acts">
        <button
          type="button"
          className="mcb-btn mdw-go"
          disabled={!pick || choose.isPending}
          onClick={() => pick && choose.mutate(pick, { onSuccess: () => onDone?.() })}
        >
          {choose.isPending ? "Saving..." : "Use doc"}
        </button>
        <button
          type="button"
          className="mcb-btn"
          disabled={create.isPending}
          onClick={() => create.mutate(undefined, { onSuccess: () => onDone?.() })}
        >
          {create.isPending ? "Creating..." : "New from template"}
        </button>
        {onDone && (
          <button type="button" className="mcb-btn" onClick={onDone}>
            Cancel
          </button>
        )}
      </div>
    </>
  );
}

function WizardStyle() {
  return (
    <style>{`
      .mdw { max-width: 760px; }
      .mdw .mcb-h.off { opacity: .45; margin-bottom: 0; }
      .mdw-n { width: 22px; height: 22px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 12px; font-weight: 700; background: var(--brand-tint); color: var(--brand-text); flex-shrink: 0; }
      .mdw-n.done { background: color-mix(in srgb, var(--positive) 16%, transparent); color: var(--positive); }
      .mdw-box { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
      .mdw-scroll { max-height: 340px; overflow-y: auto; }
      .mdw-pick { width: 100%; text-align: left; }
      .mdw-pick:disabled { opacity: .5; cursor: default; }
      .mdw-pick:disabled:hover { background: none; }
      .mdw-pick.on, .mdw-pick.on:hover { background: var(--brand-tint); }
      .mdw-tick { color: var(--brand-text); flex-shrink: 0; margin-right: 6px; }
      .mdw-pad { padding: 14px 16px; display: flex; align-items: center; }
      .mdw-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
      .mdw .mcb-btn:disabled { opacity: .55; cursor: default; }
      .mdw .mdw-go { background: var(--grad-brand) !important; color: #fff; border-color: transparent !important; font-weight: 600; }
      .mdw .mdw-go:disabled { background: var(--surface-2) !important; color: var(--text-faint); }
    `}</style>
  );
}
