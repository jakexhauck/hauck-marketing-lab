import { useEffect, useState } from "react";
import { MessagesSquare } from "lucide-react";
import Conversation from "./Conversation";
import { useOpenHauck } from "../../hooks/useChat";

// The agency chat, top-right. Replaces the old docked right rail: one icon that
// opens the single "line to the agency" thread in a popover. No channel list,
// no roster, just the conversation. Rendered in the desktop chrome (DesktopPage)
// beside the notification bell.
export default function ChatLauncher() {
  const [open, setOpen] = useState(false);
  const openHauck = useOpenHauck();
  const channelId = openHauck.data?.channel.id ?? null;
  const channelName = openHauck.data?.channel.name ?? "Hauck Marketing";

  // Resolve (get-or-create) the agency thread the first time the panel opens.
  useEffect(() => {
    if (open && !channelId && !openHauck.isPending) openHauck.mutate();
    // openHauck is a stable mutation object; intentionally not a dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, channelId]);

  // Close on Escape for parity with the notification center and sheets.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Message the agency"
        aria-expanded={open}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] border border-border bg-surface text-muted transition-colors hover:border-border-strong hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      >
        <MessagesSquare size={18} />
      </button>

      {open && (
        <>
          {/* Click-away scrim (transparent): closes the panel without dimming. */}
          <div
            className="fixed inset-0 z-30"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <div className="fixed right-4 top-[68px] z-40 flex h-[min(640px,calc(100dvh-88px))] w-[380px] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
            {channelId ? (
              <Conversation
                channelId={channelId}
                title={channelName}
                onClose={() => setOpen(false)}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-[13px] text-[var(--text-muted)]">
                {openHauck.isError ? "Couldn't open chat." : "Opening chat..."}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
