import { createContext, useContext } from "react";

export interface PaneContextValue {
  paneId: string;
  isPrimary: boolean;
  isDetached: boolean;
  width: number;
  compact: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
}

export const PaneContext = createContext<PaneContextValue | null>(null);

export function usePane(): PaneContextValue {
  const ctx = useContext(PaneContext);
  if (!ctx) {
    return {
      paneId: "default",
      isPrimary: true,
      isDetached: false,
      width: typeof window !== "undefined" ? window.innerWidth : 1440,
      compact: false,
      rootRef: { current: null },
    };
  }
  return ctx;
}

export function usePaneCompact(): boolean {
  return usePane().compact;
}
