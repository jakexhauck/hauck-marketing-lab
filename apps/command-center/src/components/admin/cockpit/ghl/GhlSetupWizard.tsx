import { useState } from "react";
import { ArrowRight, Check, ChevronRight, ExternalLink } from "lucide-react";
import SetupWizard from "../paidads/SetupWizard";
import { Button } from "../../../ui/Button";
import { useAdminGhlConnectionQuery, useSaveGhlCreds } from "../../../../hooks/useApi";

// Fulfillment > GHL > Connect. Where the page opens for a client whose
// GoHighLevel sub-account is not wired yet, and the only thing on offer besides
// Conversion Assets until it is.
//
// The same shell and the same shape as the Meta connect screen, because it is
// the same job: paste what the integration needs, watch a bar, get a tick. The
// difference is that GHL credentials are per client rather than agency-wide, so
// there are two fields here instead of none, and both belong to whoever is in
// the picker above.
//
// Nothing is stored until GoHighLevel has answered with the pair. A saved pair
// that does not work is worse than none: every surface that reads the
// sub-account reports an empty client rather than a broken connection.

export default function GhlSetupWizard({
  tenantId,
  clientName,
  onFinished,
}: {
  tenantId: string;
  clientName: string;
  /** Jump the page to a real sub-tab once the client is wired. */
  onFinished: (sub: string) => void;
}) {
  const state = useAdminGhlConnectionQuery(tenantId);
  const connected = state.data?.connected === true;

  return (
    <SetupWizard
      title={
        connected
          ? `${clientName || "This client"} is connected`
          : `Connect ${clientName || "this client"}'s GoHighLevel`
      }
    >
      {connected ? (
        <Connected
          locationName={state.data?.locationName ?? null}
          locationId={state.data?.locationId ?? ""}
          onFinished={onFinished}
        />
      ) : (
        <CredsConnect
          tenantId={tenantId}
          locationId={state.data?.locationId ?? ""}
          tokenSet={state.data?.tokenSet === true}
          rejection={state.data?.error ?? null}
          loading={state.isLoading}
          onConnected={() => void state.refetch()}
        />
      )}
    </SetupWizard>
  );
}

// The end of the job, in one line and one button.
function Connected({
  locationName,
  locationId,
  onFinished,
}: {
  locationName: string | null;
  locationId: string;
  onFinished: (sub: string) => void;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius)] border border-positive/40 bg-positive-tint px-3.5 py-3">
        <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-text">
          <span className="grid h-5 w-5 place-items-center rounded-full bg-positive text-white" aria-hidden>
            <Check size={13} />
          </span>
          {locationName ? `Wired to ${locationName}` : "Their CRM is wired"}
        </span>
        <span className="font-data text-[12px] text-muted">{locationId}</span>
      </div>
      <div className="mt-4">
        <Button variant="primary" onClick={() => onFinished("calendars")}>
          Open their Calendars
          <ArrowRight size={14} aria-hidden />
        </Button>
      </div>
    </div>
  );
}

// Two moves, both quick: prove the pair against GoHighLevel, then store it. The
// bar is there because a press with no visible answer feels broken.
type Phase = "idle" | "checking" | "saving" | "done";

const PROGRESS: Record<Phase, number> = {
  idle: 0,
  checking: 45,
  saving: 80,
  done: 100,
};

const PHASE_TEXT: Record<Phase, string> = {
  idle: "",
  checking: "Checking it with GoHighLevel...",
  saving: "Saving it...",
  done: "Saved. The connection works.",
};

function CredsConnect({
  tenantId,
  locationId: savedLocationId,
  tokenSet,
  rejection,
  loading,
  onConnected,
}: {
  tenantId: string;
  /** The id already on the client row, so a re-connect is not retyped. */
  locationId: string;
  /** A token is stored but the pair does not work, or is only half filled in. */
  tokenSet: boolean;
  /** What GoHighLevel said about the stored pair, when there is one. */
  rejection: string | null;
  loading: boolean;
  onConnected: () => void;
}) {
  const save = useSaveGhlCreds(tenantId);

  const [token, setToken] = useState("");
  const [locationId, setLocationId] = useState(savedLocationId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failure, setFailure] = useState<string | null>(null);

  const busy = phase === "checking" || phase === "saving";
  // The token box may be left empty on a client that already has one: that is
  // "keep the token, fix the location id", which the endpoint understands.
  const ready = Boolean(locationId.trim()) && (Boolean(token.trim()) || tokenSet);

  const connect = async () => {
    if (!ready) return;
    setFailure(null);
    setPhase("checking");
    try {
      await save.mutateAsync({ token: token.trim(), locationId: locationId.trim() });
      setPhase("saving");
      setToken("");
      setPhase("done");
      // Ask GoHighLevel again through the app itself. That answer is what turns
      // the tick on, not this component's own optimism.
      onConnected();
    } catch (err) {
      setPhase("idle");
      setFailure(err instanceof Error ? err.message : "That did not save.");
    }
  };

  return (
    <div>
      <h3 className="text-[14px] font-semibold text-text">
        Paste their private integration token
      </h3>

      <div className="mt-3 grid gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={tokenSet ? "Stored. Paste a new one to replace it" : "pit-..."}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
          aria-label="Private integration token"
          className="min-w-0 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 font-mono text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
        />
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={locationId}
            onChange={(e) => setLocationId(e.target.value)}
            placeholder="Location id"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-label="Location id"
            className="min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface px-3 py-2.5 font-mono text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
          />
          <Button
            variant="primary"
            loading={busy || loading}
            disabled={!ready && !busy}
            onClick={() => void connect()}
          >
            Connect
          </Button>
        </div>
      </div>

      {/* The bar, not a spinner: two moves happen, and the first one is a round
          trip to GoHighLevel. */}
      {(busy || phase === "done") && (
        <div className="mt-3">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
            role="progressbar"
            aria-valuenow={PROGRESS[phase]}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Connecting GoHighLevel"
          >
            <div
              className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                phase === "done" ? "bg-positive" : "bg-brand"
              }`}
              style={{ width: `${PROGRESS[phase]}%` }}
            />
          </div>
          <p
            className={`mt-2 flex items-center gap-1.5 text-[12.5px] ${
              phase === "done" ? "font-medium text-positive" : "text-muted"
            }`}
          >
            {phase === "done" && <Check size={13} aria-hidden />}
            {PHASE_TEXT[phase]}
          </p>
        </div>
      )}

      {/* Two things speak without being asked, and both are failures: why this
          press failed, and why the pair already on the row does not work. */}
      {failure && <p className="mt-3 text-[12.5px] text-danger">{failure}</p>}
      {!failure && !busy && rejection && (
        <p className="mt-3 text-[12.5px] text-danger">
          GoHighLevel rejected the saved connection: {rejection}
        </p>
      )}

      <Directions />
    </div>
  );
}

// Where the two values come from, folded away under the fields they fill.
//
// Closed by default and closed again on the next visit: these directions are
// read once and then never again, so they must not sit permanently between the
// boxes and the button.
const TOKEN_STEPS: { text: string; detail?: string }[] = [
  {
    text: "Open the client's sub-account in GoHighLevel",
    detail: "Switch into their location, not the agency view.",
  },
  {
    text: "Go to Settings, then Private Integrations",
    detail: "Left sidebar, near the bottom, under the other API settings.",
  },
  {
    text: "Press Create new integration and name it Command Center",
    detail: "One per client. The name is only ever read by you.",
  },
  {
    text: "Tick contacts, conversations, opportunities, calendars, locations and users",
    detail:
      "Read and write on each. Anything left off comes back later as one page in the app that cannot load.",
  },
  {
    text: "Copy the token it shows you and paste it above",
    detail: "It starts pit- and is shown exactly once. If you lose it, create another.",
  },
  {
    text: "Take the location id from Settings, Business Profile",
    detail:
      "It also sits in the browser address bar of any page in that sub-account, after /location/.",
  },
];

function Directions() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 overflow-hidden rounded-[var(--radius)] border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 bg-surface-2 px-3.5 py-2.5 text-left text-[13px] font-semibold text-text transition-colors hover:bg-surface-3"
      >
        <ChevronRight
          size={15}
          aria-hidden
          className={`shrink-0 text-muted transition-transform duration-150 ${open ? "rotate-90" : ""}`}
        />
        Where do I get these?
      </button>

      {open && (
        <div className="border-t border-border bg-surface px-3.5 py-3.5">
          <ol className="grid gap-3">
            {TOKEN_STEPS.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-3 text-[11px] font-semibold text-muted"
                  aria-hidden
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium leading-snug text-text">{step.text}</p>
                  {step.detail && (
                    <p className="mt-0.5 text-[12px] leading-snug text-muted">{step.detail}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <a
            href="https://app.gohighlevel.com/"
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border border-border bg-surface-2 px-3.5 py-2 text-[12.5px] font-semibold text-text transition-colors hover:border-brand hover:text-brand"
          >
            <ExternalLink size={13} aria-hidden />
            Open GoHighLevel
          </a>
        </div>
      )}
    </div>
  );
}
