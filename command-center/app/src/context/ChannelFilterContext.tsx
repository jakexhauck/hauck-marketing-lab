import { createContext, useContext, useState, type ReactNode } from "react";

// Shared "active channel" between the composer and the thread. The composer
// writes the channel the user taps; the thread reads it to show only that
// channel's history (switch SMS -> Email and the email back-and-forth replaces
// the texts). `selected` is null until the user picks one manually, so each
// consumer falls back to the thread's own default channel.
interface ChannelFilterValue {
  selected: string | null;
  select: (channel: string) => void;
}

const ChannelFilterContext = createContext<ChannelFilterValue | null>(null);

// `initial` seeds the active channel (the inbox pages pass their page channel so
// the thread + composer default to SMS or Email accordingly). Remount the
// provider (via `key`) to re-seed it when the page channel changes.
export function ChannelFilterProvider({
  children,
  initial = null,
}: {
  children: ReactNode;
  initial?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(initial);
  return (
    <ChannelFilterContext.Provider value={{ selected, select: setSelected }}>
      {children}
    </ChannelFilterContext.Provider>
  );
}

// Components rendered outside a provider keep working with no filtering applied.
export function useChannelFilter(): ChannelFilterValue {
  return (
    useContext(ChannelFilterContext) ?? { selected: null, select: () => {} }
  );
}
