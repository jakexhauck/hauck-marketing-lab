import type { CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { MissionStyle } from "../brief/missionStyle";
import { MissionDocWizard } from "../brief/MissionDocWizard";
import { clientPath } from "../../../lib/clientNav";

// Client > Grok Bot > Mission Control Upload (Jake, 2026-10-27). A Grok Bot (or
// Jake) links the client's Drive folder and picks which doc in it is their
// Mission Control, in the same wizard the Mission Control page shows when it has
// none (brief/MissionDocWizard.tsx). A pick lands on the Mission Control page,
// so the bot sees the doc it chose.
export default function MissionControlUpload({ tenantId, brandColor }: { tenantId: string; brandColor?: string }) {
  const navigate = useNavigate();
  const style = brandColor ? ({ "--brand": brandColor } as CSSProperties) : undefined;

  return (
    <div className="mcb" style={style}>
      <MissionStyle />
      <div className="mcb-head">
        <h2 className="mcb-title">Mission Control Upload</h2>
      </div>
      <MissionDocWizard tenantId={tenantId} onDone={() => navigate(clientPath(tenantId, "brief"))} />
    </div>
  );
}
