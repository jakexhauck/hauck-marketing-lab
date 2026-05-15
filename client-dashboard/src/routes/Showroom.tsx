import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Pause, Play, X } from "lucide-react";
import Dashboard from "./Dashboard";
import { useClient } from "../context/ClientContext";
import { useAuth } from "../context/AuthContext";

const CYCLE_MS = 5000;

function FadeContent({ clientId, children }: { clientId: string; children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useLayoutEffect(() => {
    setVisible(false);
    const id = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(id);
  }, [clientId]);
  return (
    <div
      key={clientId}
      className={`transition-opacity duration-300 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {children}
    </div>
  );
}

export default function Showroom() {
  const navigate = useNavigate();
  const { client, setClient, allClients } = useClient();
  const { currentUser, signIn } = useAuth();
  const [paused, setPaused] = useState(false);

  // Ensure a signed-in user so Dashboard renders fully.
  useEffect(() => {
    if (!currentUser) {
      signIn("demo@hauck.dev");
    }
  }, [currentUser, signIn]);

  const index = useMemo(
    () => allClients.findIndex((c) => c.id === client.id),
    [allClients, client.id]
  );

  // Keep a ref to the latest index so the interval can advance without re-creating.
  const indexRef = useRef(index);
  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const advance = (delta: number) => {
    const len = allClients.length;
    if (len === 0) return;
    const next = (indexRef.current + delta + len) % len;
    setClient(allClients[next].id);
  };

  // Auto-cycle interval. Restarts when paused state flips.
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      advance(1);
    }, CYCLE_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, allClients.length]);

  const handleExit = () => navigate("/dashboard");

  return (
    <div className="relative min-h-dvh bg-[var(--bg)]">
      {/* Overlay strip */}
      <div
        className="fixed inset-x-0 top-0 z-[100] border-b border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="mx-auto flex max-w-md flex-col gap-2 px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span
                className="label-cap"
                style={{ color: "var(--brand-primary)" }}
              >
                Showroom
              </span>
              <span className="font-display text-lg font-bold tracking-tight text-[var(--text)]">
                {client.name}
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => advance(-1)}
                aria-label="Previous client"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
              >
                <ChevronLeft size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={paused ? "Resume showroom" : "Pause showroom"}
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
              >
                {paused ? (
                  <Play size={20} aria-hidden="true" />
                ) : (
                  <Pause size={20} aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => advance(1)}
                aria-label="Next client"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
              >
                <ChevronRight size={20} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={handleExit}
                aria-label="Exit showroom"
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-2)] active:scale-[0.96] active:bg-[var(--surface-2)]"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Progress dots */}
          <div className="flex items-center gap-1" aria-hidden="true">
            {allClients.map((c, i) => (
              <span
                key={c.id}
                className="h-2 w-2 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i === index ? "var(--brand-primary)" : "var(--border)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Spacer so the dashboard content begins below the fixed overlay strip. */}
      <div aria-hidden="true" className="h-[92px]" />

      {/* Re-key on client.id for a quick cross-fade. */}
      <FadeContent clientId={client.id}>
        {currentUser ? <Dashboard /> : null}
      </FadeContent>
    </div>
  );
}
