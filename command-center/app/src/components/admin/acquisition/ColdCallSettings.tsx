import ScriptEditor from "../script/ScriptEditor";
import StagesPanel from "./StagesPanel";
import { useColdCallScriptQuery, useSaveColdCallScriptMutation } from "../../../hooks/useApi";

// Cold Call > Settings. Owner-only: the dialing script Jake writes and the
// caller reads in the floating panel mid-call, and underneath it, whether this
// app and GoHighLevel still agree on what the stages are.
//
// Same editor as the Setter Suite's script (components/admin/script), pointed at
// the one agency document instead of a per-client one.
export default function ColdCallSettings() {
  const scriptQuery = useColdCallScriptQuery();
  const saveMutation = useSaveColdCallScriptMutation();

  return (
    <div className="flex flex-col gap-5">
      <ScriptEditor
        title="Dialing script"
        subtitle="What the caller reads on every call. He can open it from any page in here, but only you can edit it."
        html={scriptQuery.data?.html}
        isLoading={scriptQuery.isLoading}
        isError={scriptQuery.isError}
        save={(html) => saveMutation.mutateAsync(html)}
      />
      <StagesPanel />
    </div>
  );
}
