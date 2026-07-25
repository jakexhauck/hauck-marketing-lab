import ScriptEditor from "../script/ScriptEditor";
import { useColdCallScriptQuery, useSaveColdCallScriptMutation } from "../../../hooks/useApi";

// Cold Call > Settings. Owner-only, and the only thing on it today is the
// dialing script: what Jake writes, and what the caller reads in the floating
// panel while he is on the phone.
//
// Same editor as the Setter Suite's script (components/admin/script), pointed at
// the one agency document instead of a per-client one.
export default function ColdCallSettings() {
  const scriptQuery = useColdCallScriptQuery();
  const saveMutation = useSaveColdCallScriptMutation();

  return (
    <ScriptEditor
      title="Dialing script"
      subtitle="What the caller reads on every call. He can open it from any page in here, but only you can edit it."
      html={scriptQuery.data?.html}
      isLoading={scriptQuery.isLoading}
      isError={scriptQuery.isError}
      save={(html) => saveMutation.mutateAsync(html)}
    />
  );
}
