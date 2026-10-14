import ScriptPanel from "../script/ScriptPanel";
import { useSetterScriptQuery } from "../../../hooks/useApi";

// The client's dialing script, floating over the cockpit. All of the panel
// behaviour (drag, resize, safe rendering) lives in the shared ScriptPanel,
// which Cold Calling uses too; this file only loads the right document.

interface Props {
  tenantId: string;
  clientName: string;
  onClose: () => void;
}

export default function SetterScriptOverlay({ tenantId, clientName, onClose }: Props) {
  const scriptQuery = useSetterScriptQuery(tenantId, true);

  return (
    <ScriptPanel
      html={scriptQuery.data?.html ?? ""}
      subtitle={clientName}
      isLoading={scriptQuery.isLoading}
      isError={scriptQuery.isError}
      emptyHint="No script yet. Write it in the Settings tab and it will show here."
      onClose={onClose}
    />
  );
}
