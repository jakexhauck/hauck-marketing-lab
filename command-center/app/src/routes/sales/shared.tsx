import { Link2 } from "lucide-react";
import { Panel, Button } from "../../components/ui";

// Shared bits for the Sales surfaces (Estimate Forms, Chat Widget, …). The
// golden rule, same as every other section: a real (connected) client must
// never see fabricated content. Pages render their designed, populated inbox
// only in demo/preview mode (`?demo=1`); in a real session they show the empty
// state plus <NotConnectedNotice/> until the website forms + phone are linked
// through GoHighLevel.

// The standing "nothing is connected yet" banner. Shown on the Estimate Forms
// surface in a real session so the empty inbox is never mistaken for a bug.
export function NotConnectedNotice({ message }: { message?: string }) {
  return (
    <Panel className="flex flex-col gap-3 border-brand/30 bg-brand-tint p-4 sm:flex-row sm:items-center">
      <Link2 size={20} className="shrink-0 text-brand-text" />
      <div className="flex-1 text-[13px] leading-snug text-text">
        <span className="font-semibold">Not connected yet.</span>{" "}
        {message ??
          "Estimate requests from your website land here automatically once your forms and phone are connected through GoHighLevel."}
      </div>
      <Button variant="secondary" size="sm" disabled className="shrink-0">
        Connect (coming soon)
      </Button>
    </Panel>
  );
}

// The message shown when a terminal action (call, schedule, book, send) is
// tapped in the demo. The real action turns on once the backend is wired.
export const GATED_NOTE =
  "This turns on once your phone and website forms are connected.";
