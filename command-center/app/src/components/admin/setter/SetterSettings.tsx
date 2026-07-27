import ScriptEditor from "../script/ScriptEditor";
import { useSaveSetterScriptMutation, useSetterScriptQuery } from "../../../hooks/useApi";

interface Props {
  tenantId: string;
  clientName: string;
}

// The Setter Suite Settings tab (replaced the Dialing Hub). One setting so far:
// the client's dialing script, written here and read by the cockpit's script
// panel.
//
// The editor itself is shared with Cold Calling's Management > Scripts page
// (components/admin/script/ScriptEditor); this file only supplies the client's
// document and where it saves to. The parent keys this component on the tenant,
// so switching client remounts and reseeds the editor cleanly.
export default function SetterSettings({ tenantId, clientName }: Props) {
  const scriptQuery = useSetterScriptQuery(tenantId, true);
  const saveMutation = useSaveSetterScriptMutation(tenantId);

  return (
    <ScriptEditor
      title="Dialing script"
      subtitle={`${clientName}'s full script. Setters open this from the lead cockpit.`}
      html={scriptQuery.data?.html}
      isLoading={scriptQuery.isLoading}
      isError={scriptQuery.isError}
      save={(html) => saveMutation.mutateAsync({ tenantId, html })}
    />
  );
}
