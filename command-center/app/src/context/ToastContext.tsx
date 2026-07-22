import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Toast, { type ToastAction } from "../components/Toast";

export interface ShowToastOptions {
  // A trailing button, e.g. "Undo" on a delete. Running it dismisses the toast.
  action?: ToastAction;
  // Override the auto-dismiss. Undo toasts need longer than a confirmation.
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, opts?: ShowToastOptions) => void;
}

interface ToastState {
  // Bumped on every show so an identical message restarts the timer instead of
  // riding out the previous one (deleting two rows in a row hits this).
  id: number;
  message: string;
  action?: ToastAction;
  durationMs: number;
}

const DEFAULT_DURATION_MS = 3000;

const ToastContext = createContext<ToastContextValue | null>(null);

// One global toast, mounted above the router so confirmations survive
// navigation (mark Won on a lead, land on the list, still see "Marked Won").
// Replaces the old navigate-with-location.state pattern nobody read.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, opts?: ShowToastOptions) => {
    setToast((prev) => ({
      id: (prev?.id ?? 0) + 1,
      message,
      action: opts?.action,
      durationMs: opts?.durationMs ?? DEFAULT_DURATION_MS,
    }));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast]);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          onDismiss={() => setToast(null)}
          action={
            toast.action && {
              label: toast.action.label,
              onAction: () => {
                toast.action?.onAction();
                setToast(null);
              },
            }
          }
        />
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
