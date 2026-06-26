import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import { demoMode } from "../demo/demoMode";
import {
  fetchTourProgress,
  saveTourProgress,
  type TourProgress,
} from "../lib/api";
import {
  visibleSteps,
  CURRENT_TOUR_VERSION,
  type TourStep,
} from "../lib/tourSteps";

type Phase = "idle" | "active";

interface TourContextValue {
  active: boolean;
  steps: TourStep[];
  index: number;
  step: TourStep | null;
  next: () => void;
  back: () => void;
  // End the tour and mark this person caught up to the current version.
  skip: () => void;
  // Replay the full tour on demand (Settings). Records completion if finished.
  startFull: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const { status, isOwner, can, currentUser, preview, isAdmin, needsIdentity } =
    useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [steps, setSteps] = useState<TourStep[]>([]);
  const [index, setIndex] = useState(0);
  // Guards the one-time auto-evaluation so the tour decides exactly once per
  // signed-in session (re-renders must not re-trigger the fetch).
  const evaluatedRef = useRef(false);

  // A stable per-person bucket. Staff send their id; an owner sends their chosen
  // identity id (or "owner" when skipped). The server is authoritative for staff
  // and only trusts this value for owner sessions.
  const personKey = currentUser?.id ?? "owner";

  const persist = useCallback(
    (version: number) => {
      // Best-effort: a failed write just means the tour may re-offer next login.
      void saveTourProgress(personKey, version).catch(() => {});
    },
    [personKey],
  );

  const end = useCallback(
    (markCaughtUp: boolean) => {
      setPhase("idle");
      setSteps([]);
      setIndex(0);
      if (markCaughtUp) persist(CURRENT_TOUR_VERSION);
    },
    [persist],
  );

  const next = useCallback(() => {
    setIndex((i) => {
      if (i + 1 >= steps.length) {
        end(true);
        return i;
      }
      return i + 1;
    });
  }, [steps.length, end]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const skip = useCallback(() => end(true), [end]);

  const startFull = useCallback(() => {
    const full = visibleSteps({ isOwner, can, sinceVersion: null });
    if (full.length === 0) return;
    setSteps(full);
    setIndex(0);
    setPhase("active");
  }, [isOwner, can]);

  // One-time auto-evaluation: when a real client session has fully settled,
  // decide whether to run the full tour (never seen) or a "what's new" run
  // (newer steps since they last finished). Suppressed for demo, admin,
  // preview, offline, and before the identity picker resolves.
  useEffect(() => {
    if (evaluatedRef.current) return;
    if (demoMode()) return;
    if (status !== "authenticated") return; // not offline-grace, not loading
    if (isAdmin || preview || needsIdentity) return;

    evaluatedRef.current = true;
    let cancelled = false;
    (async () => {
      let progress: TourProgress;
      try {
        progress = await fetchTourProgress(personKey);
      } catch {
        return; // backend unreachable: stay quiet, try again next session
      }
      if (cancelled) return;
      if (progress.unavailable) return; // cannot persist => never run

      const completed = progress.completedVersion;
      if (completed !== null && completed >= CURRENT_TOUR_VERSION) return; // caught up

      const sinceVersion = completed; // null => full tour; N => newer than N
      const toShow = visibleSteps({ isOwner, can, sinceVersion });
      if (toShow.length === 0) {
        // Nothing new is visible to this user (e.g. the new step is a surface
        // they cannot see). Mark them caught up so we do not re-check forever.
        persist(CURRENT_TOUR_VERSION);
        return;
      }
      setSteps(toShow);
      setIndex(0);
      setPhase("active");
    })();
    return () => {
      cancelled = true;
    };
  }, [status, isAdmin, preview, needsIdentity, isOwner, can, personKey, persist]);

  const value = useMemo<TourContextValue>(
    () => ({
      active: phase === "active",
      steps,
      index,
      step: phase === "active" ? steps[index] ?? null : null,
      next,
      back,
      skip,
      startFull,
    }),
    [phase, steps, index, next, back, skip, startFull],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error("useTour must be used inside TourProvider");
  return ctx;
}
