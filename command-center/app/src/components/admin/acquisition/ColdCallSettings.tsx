import ScriptsPanel from "./ScriptsPanel";
import AssetsPanel from "./AssetsPanel";
import StagesPanel from "./StagesPanel";

// Cold Call > Settings. Owner-only, and it holds three things now:
//
//   1. The dialing scripts, four variations of one pitch running against each
//      other, each carrying the dials it actually earned.
//   2. Everything else a caller reaches for mid-call, under headings Jake types
//      himself.
//   3. Whether this app and GoHighLevel still agree on what the stages are.
//
// The single-script editor that used to be the whole page is gone: it could hold
// one script and could not say whether it worked. Migration 0058 carried its
// contents forward as the first variation.
export default function ColdCallSettings() {
  return (
    <div className="flex flex-col gap-5">
      <ScriptsPanel />
      <AssetsPanel />
      <StagesPanel />
    </div>
  );
}
