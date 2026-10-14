import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// A minute-resolution clock for relative-time rendering. Components that show
// "3m ago" or the Home greeting consume useNow() instead of Date.now() so an
// app left open does not freeze in time. One interval for the whole tree.
const NowContext = createContext<number>(Date.now());

export function NowProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}

export function useNow(): number {
  return useContext(NowContext);
}
