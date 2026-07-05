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

export function ChannelFilterProvider({
  children,
  initial = null,
}: {
  children: ReactNode;
  // Seeds the active channel (e.g. the page's channel) before the user taps a
  // chip. Null keeps the old behaviour: fall back to the thread's own default.
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
