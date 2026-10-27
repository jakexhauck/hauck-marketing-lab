import { useState, type CSSProperties } from "react";
import { ExternalLink, Replace } from "lucide-react";
import { useMissionControlQuery } from "../../../hooks/useApi";
import { useAuth } from "../../../context/AuthContext";
import { asGoogleAccount } from "../../../lib/driveOpen";
import { MissionStyle } from "./missionStyle";
import { MissionDocWizard } from "./MissionDocWizard";

// The client's Mission Control Google Doc, embedded (Jake, 2026-10-26; the page
// was called Brief until 2026-10-27). The doc's own tabs are the pages. The CSM
// picks it in the wizard (MissionDocWizard.tsx, also Grok Bot > Mission Control
// Upload), or it is found by name in the client's Drive folder
// (functions/lib/missionControl.ts), so a copy a Grok Bot makes shows up too.
export function MissionBrief({ tenantId, brandColor }: { tenantId: string; brandColor?: string }) {
  const q = useMissionControlQuery(tenantId);
  const { admin } = useAuth();
  const [changing, setChanging] = useState(false);
  const doc = q.data?.doc ?? null;
  // Opened as the admin's own Google account, so it is editable rather than
  // "Request edit access" on a browser signed into two accounts.
  const url = doc ? asGoogleAccount(doc.url, admin?.email) : null;
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;

  return (
    <div className="mcb" style={style}>
      <MissionStyle />
      <div className="mcb-head">
        <h2 className="mcb-title">Mission Control</h2>
        <span className="mcb-grow" />
        {url && !changing && (
          <>
            <button type="button" className="mcb-btn" aria-label="Change doc" title="Change doc" onClick={() => setChanging(true)}>
              <Replace size={14} />
            </button>
            <a className="mcb-btn" href={url} target="_blank" rel="noopener noreferrer" aria-label="Open in Google Docs" title="Open in Google Docs">
              <ExternalLink size={14} />
            </a>
          </>
        )}
      </div>

      {q.isLoading ? (
        <div className="mcb-empty">Loading...</div>
      ) : q.isError ? (
        <div className="mcb-empty">Mission Control did not load.</div>
      ) : doc && url && !changing ? (
        <iframe key={doc.id} title="Mission Control" src={url} className="mcb-doc" />
      ) : (
        <MissionDocWizard tenantId={tenantId} onDone={changing ? () => setChanging(false) : undefined} />
      )}
    </div>
  );
}
