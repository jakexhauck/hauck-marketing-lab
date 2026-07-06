import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import { HeroIconButton } from "../components/HeroUi";
import Avatar from "../components/Avatar";
import ConversationThread from "../components/ConversationThread";
import SourceBadge from "../components/conversations/SourceBadge";
import ThreadChannelTabs, {
  ActiveChannelComposer,
} from "../components/conversations/ThreadChannelTabs";
import { ChannelFilterProvider } from "../context/ChannelFilterContext";
import ConversationDetailDesktop from "../components/conversations/ConversationDetailDesktop";
import { useAuth } from "../context/AuthContext";
import { useConversationsQuery } from "../hooks/useApi";
import { convOrigin } from "../lib/inboxFilters";

// Keep the composer above the iOS keyboard: the visual viewport shrinks when
// the keyboard opens, the layout viewport does not. The difference becomes
// bottom padding on the pinned composer.
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => {
      setInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    };
    vv.addEventListener("resize", onChange);
    vv.addEventListener("scroll", onChange);
    onChange();
    return () => {
      vv.removeEventListener("resize", onChange);
      vv.removeEventListener("scroll", onChange);
    };
  }, []);
  return inset;
}

export default function ConversationDetail() {
  const { contactId = "" } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const useReal = Boolean(session);
  const listQuery = useConversationsQuery(useReal);
  const keyboardInset = useKeyboardInset();

  const conv = useMemo(
    () =>
      listQuery.data?.conversations.find((c) => c.contactId === contactId) ??
      null,
    [listQuery.data, contactId],
  );

  const name = conv?.name ?? "Conversation";

  return (
    <Shell>
      {/* Phone: full-height column minus the safe-area inset Shell already pads.
          overflow-hidden makes the thread the only scroll region, so the
          composer stays pinned to the bottom. */}
      <div
        className="flex flex-col overflow-hidden lg:hidden"
        style={{ height: "calc(100dvh - env(safe-area-inset-bottom))" }}
      >
        <NavyHero rounded={false}>
          <div className="flex items-center gap-3">
            <HeroIconButton label="Back" onClick={() => navigate("/conversations")}>
              <ChevronLeft size={20} />
            </HeroIconButton>
            <Avatar name={name} size="sm" />
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="truncate font-display text-base font-bold text-white">
                {name}
              </div>
              {conv && <SourceBadge origin={convOrigin(conv)} size="sm" />}
            </div>
          </div>
        </NavyHero>

        <ChannelFilterProvider key={contactId} initial={null}>
          <main className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4 pt-4">
            <ThreadChannelTabs contactId={contactId} />
            <ConversationThread contactId={contactId} fill />
            <div
              className="border-t border-[var(--border)] pt-3"
              style={{ paddingBottom: keyboardInset }}
            >
              <ActiveChannelComposer contactId={contactId} />
            </div>
          </main>
        </ChannelFilterProvider>
      </div>

      {/* Desktop (lg+): centered thread column inside the command-deck shell. */}
      <div className="hidden min-h-0 flex-1 lg:flex">
        <ConversationDetailDesktop />
      </div>
    </Shell>
  );
}
