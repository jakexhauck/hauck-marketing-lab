import ScriptEditor from "../script/ScriptEditor";
import { useColdCallScriptQuery, useSaveColdCallScriptMutation } from "../../../hooks/useApi";
import SalesCallSettingsPanel from "../sales/SalesCallSettingsPanel";

// Cold Call > Settings. Owner-only. Everything about how the agency sells its
// own work, as opposed to how it delivers a client's:
//
//   the dialing script      what a caller reads on every cold call
//   the demo call settings  which agency calendar holds the meetings those
//                           calls book, and the prompts Jake fills in while
//                           running one
//
// The second half belongs here rather than on the Sales pillar because it
// configures the same agency GoHighLevel account a cold caller books into, and
// splitting one account's settings across two pillars means two places to look
// when a booking lands somewhere unexpected.
//
// Same script editor as the Setter Suite's (components/admin/script), pointed
// at the one agency document instead of a per-client one.
export default function ColdCallSettings() {
  const scriptQuery = useColdCallScriptQuery();
  const saveMutation = useSaveColdCallScriptMutation();

  return (
    <div className="flex flex-col gap-4">
      <ScriptEditor
        title="Dialing script"
        subtitle="What the caller reads on every call. He can open it from any page in here, but only you can edit it."
        html={scriptQuery.data?.html}
        isLoading={scriptQuery.isLoading}
        isError={scriptQuery.isError}
        save={(html) => saveMutation.mutateAsync(html)}
      />

      <SalesCallSettingsPanel />
    </div>
  );
}
