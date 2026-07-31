import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Rocket,
  Sparkles,
} from "lucide-react";
import {
  useAgencySecrets,
  useApplyAgencySecrets,
  useDeployStatus,
  useGenerateAgencySecret,
  useSaveAgencySecret,
} from "../../../hooks/useApi";
import {
  groupedKeys,
  keyStatus,
  pendingKeys,
  LOCK_REASON,
  STATUS_LABEL,
  type AgencyKeyDef,
  type KeyStatus,
} from "../../../lib/agencyKeys";
import type { AgencySecretRow } from "../../../lib/secretsApi";
import { KeysPanelStyle } from "./KeysPanelStyle";

// The agency keys, in one panel, rendered by both Onboarding > Keys and
// Settings > Secrets.
//
// It replaces a table that told the truth and then stopped short: it wrote a
// key to Doppler and printed a shell command, so "saved" and "working" were two
// different states separated by a terminal. Here they are separated by a button.
//
// Three states per key, and the middle one is the point:
//   Not set                  nowhere
//   Saved, pending restart   Doppler has it, the running app does not
//   Live                     both, and matching
//
// Carries its own styles because it renders inside two different shells. The
// Settings page wraps everything in .pk-kit; the Onboarding page does not.

export default function KeysPanel() {
  const { data, isLoading } = useAgencySecrets();
  const apply = useApplyAgencySecrets();

  const rows = useMemo(() => data?.rows ?? [], [data?.rows]);
  const pending = useMemo(() => pendingKeys(rows), [rows]);
  const groups = useMemo(() => groupedKeys(rows), [rows]);

  const deployment = apply.data?.deployment ?? null;
  const inFlight = deployment?.state === "queued" || deployment?.state === "building";
  const status = useDeployStatus(inFlight);
  const live = status.data?.deployment ?? deployment;
  const canDeploy = status.data?.canDeploy ?? true;

  const counts = {
    live: rows.filter((r) => keyStatus(r) === "live").length,
    pending: pending.length,
    missing: rows.filter((r) => keyStatus(r) === "missing").length,
  };

  return (
    <div className="kp">
      <KeysPanelStyle />

      <header className="kp-head">
        <span className="kp-icon" aria-hidden>
          <KeyRound size={17} />
        </span>
        <div>
          <h2 className="kp-title">Keys</h2>
          <p className="kp-blurb">
            Everything the agency needs, grouped by what it switches on. Paste a value, press Apply,
            and it is live. No terminal.
          </p>
        </div>
        {!isLoading && (
          <div className="kp-counts">
            <span className="kp-count kp-count-live">{counts.live} live</span>
            {counts.pending > 0 && (
              <span className="kp-count kp-count-pending">{counts.pending} pending</span>
            )}
            {counts.missing > 0 && (
              <span className="kp-count kp-count-missing">{counts.missing} not set</span>
            )}
          </div>
        )}
      </header>

      {data && !data.canRead && (
        <Note tone="warn">
          No Doppler token set, so this only shows what the running app has. Add{" "}
          <code>DOPPLER_TOKEN</code> to see the real values.
        </Note>
      )}

      {data?.readError && <Note tone="bad">Could not reach Doppler: {data.readError}</Note>}

      {data && data.canRead && !data.canEdit && (
        <Note tone="warn">
          Editing is off. Add <code>DOPPLER_WRITE_TOKEN</code> to turn it on. Until then this is a
          status board.
        </Note>
      )}

      {isLoading ? (
        <p className="kp-loading">Reading Doppler.</p>
      ) : (
        groups.map((g) => (
          <section key={g.group.id} className="kp-group">
            <div className="kp-grouphead">
              <h3>{g.group.label}</h3>
              <p>{g.group.blurb}</p>
            </div>
            <div className="kp-rows">
              {g.keys.map(({ def, row }) => (
                <KeyRow key={def.name} def={def} row={row} canEdit={!!data?.canEdit} />
              ))}
            </div>
          </section>
        ))
      )}

      <ApplyBar
        pending={pending}
        canDeploy={canDeploy}
        applying={apply.isPending}
        error={(apply.error as { body?: { error?: string } } | null)?.body?.error ?? null}
        result={apply.data ?? null}
        deployment={live}
        onApply={() => apply.mutate()}
      />
    </div>
  );
}

// --- One key -----------------------------------------------------------------

function KeyRow({
  def,
  row,
  canEdit,
}: {
  def: AgencyKeyDef;
  row: AgencySecretRow | null;
  canEdit: boolean;
}) {
  const save = useSaveAgencySecret();
  const generate = useGenerateAgencySecret();

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status: KeyStatus = row ? keyStatus(row) : "missing";
  const locked = def.entry === "locked";

  async function onSave() {
    setError(null);
    try {
      await save.mutateAsync({ name: def.name, value });
      setEditing(false);
      setValue("");
    } catch (e) {
      setError((e as { body?: { error?: string } }).body?.error ?? "Could not save.");
    }
  }

  async function onGenerate() {
    setError(null);
    setConfirming(false);
    try {
      const out = await generate.mutateAsync({ name: def.name });
      // Shown once. Both cron secrets have to be pasted into their Worker as
      // well, and a value you can never see again is useless for that.
      setRevealed(out.values);
    } catch (e) {
      setError((e as { body?: { error?: string } }).body?.error ?? "Could not generate.");
    }
  }

  return (
    <div className={`kp-row kp-row-${status}`}>
      <div className="kp-rowmain">
        <div className="kp-rowid">
          <code className="kp-name">{def.name}</code>
          <StatusPill status={status} />
          {locked && (
            <span className="kp-lockpill">
              <Lock size={10} aria-hidden /> read only
            </span>
          )}
          {row?.masked && <span className="kp-mask">{row.masked}</span>}
        </div>

        <p className="kp-help">{locked ? (LOCK_REASON[def.name] ?? def.help) : def.help}</p>

        {def.warning && !locked && (
          <p className="kp-warn">
            <AlertTriangle size={12} aria-hidden />
            {def.warning}
          </p>
        )}

        {error && <p className="kp-err">{error}</p>}

        {revealed && (
          <div className="kp-reveal">
            <div className="kp-revealhead">
              <Check size={13} aria-hidden />
              Saved to Doppler. Copy it now, it is masked from here on.
            </div>
            {Object.entries(revealed).map(([name, v]) => (
              <div key={name} className="kp-revealrow">
                <code>{name}</code>
                <input readOnly value={v} className="kp-input kp-revealval" onFocus={(e) => e.currentTarget.select()} />
                <button
                  type="button"
                  className="kp-ghost"
                  onClick={() => void navigator.clipboard.writeText(v)}
                >
                  <Copy size={12} aria-hidden /> copy
                </button>
              </div>
            ))}
            <button type="button" className="kp-ghost kp-dismiss" onClick={() => setRevealed(null)}>
              Done
            </button>
          </div>
        )}

        {confirming && (
          <div className="kp-confirm">
            <p>
              <AlertTriangle size={13} aria-hidden />
              {def.warning} Generate a new value anyway?
            </p>
            <div className="kp-confirmacts">
              <button type="button" className="kp-danger" onClick={() => void onGenerate()}>
                Yes, generate
              </button>
              <button type="button" className="kp-ghost" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="kp-rowact">
        {locked || !canEdit ? null : editing ? (
          <div className="kp-editrow">
            <input
              className="kp-input"
              type="password"
              autoComplete="off"
              autoFocus
              placeholder="Paste the new value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && value) void onSave();
                if (e.key === "Escape") setEditing(false);
              }}
            />
            <button
              type="button"
              className="kp-primary"
              disabled={!value || save.isPending}
              onClick={() => void onSave()}
            >
              {save.isPending ? "Saving" : "Save"}
            </button>
            <button type="button" className="kp-ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        ) : def.entry === "generate" ? (
          <button
            type="button"
            className="kp-ghost"
            disabled={generate.isPending}
            onClick={() => (status === "missing" ? void onGenerate() : setConfirming(true))}
          >
            {generate.isPending ? (
              <Loader2 size={12} className="kp-spin" aria-hidden />
            ) : (
              <Sparkles size={12} aria-hidden />
            )}
            {status === "missing" ? "Generate" : "Regenerate"}
          </button>
        ) : (
          <button type="button" className="kp-ghost" onClick={() => setEditing(true)}>
            {status === "missing" ? "Add" : "Replace"}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: KeyStatus }) {
  return <span className={`kp-pill kp-pill-${status}`}>{STATUS_LABEL[status]}</span>;
}

// --- The footer --------------------------------------------------------------

function ApplyBar({
  pending,
  canDeploy,
  applying,
  error,
  result,
  deployment,
  onApply,
}: {
  pending: AgencySecretRow[];
  canDeploy: boolean;
  applying: boolean;
  error: string | null;
  result: { set: number; added: string[]; skipped: string[]; refused: string[] } | null;
  deployment: { state: string; stage: string } | null;
  onApply: () => void;
}) {
  // Once a deploy lands, the saved keys become live keys. The list is refetched
  // so the rows above stop saying pending without anyone reloading the page.
  const [landed, setLanded] = useState(false);
  useEffect(() => {
    if (deployment?.state === "live") setLanded(true);
  }, [deployment?.state]);

  const busy = applying || deployment?.state === "queued" || deployment?.state === "building";

  if (!canDeploy) {
    return (
      <div className="kp-apply kp-apply-off">
        <AlertTriangle size={15} aria-hidden />
        <div>
          <strong>Apply is off.</strong> Saves reach Doppler but not the running app. Add{" "}
          <code>CF_DEPLOY_TOKEN</code>, scoped to Pages:Edit on this project only, to switch it on.
          Until then: <code>node scripts/cf-rebind.mjs --from-doppler</code> then redeploy.
        </div>
      </div>
    );
  }

  return (
    <div className={`kp-apply ${pending.length > 0 ? "kp-apply-hot" : ""}`}>
      <div className="kp-applytext">
        {busy ? (
          <>
            <Loader2 size={15} className="kp-spin" aria-hidden />
            <span>
              Restarting. {deployment?.stage ? `Cloudflare is at "${deployment.stage}".` : ""} This
              takes a couple of minutes.
            </span>
          </>
        ) : deployment?.state === "failed" ? (
          <>
            <AlertTriangle size={15} aria-hidden />
            <span>
              That deploy failed. The keys are safe in Doppler and Cloudflare; only the restart
              broke. Check the Cloudflare dashboard, then press Apply again.
            </span>
          </>
        ) : landed && pending.length === 0 ? (
          <>
            <Check size={15} aria-hidden />
            <span>Live. Everything saved is now what the app is running.</span>
          </>
        ) : pending.length === 0 ? (
          <span>Nothing waiting. Every saved key is live.</span>
        ) : (
          <>
            <RefreshCw size={15} aria-hidden />
            <span>
              <strong>
                {pending.length} key{pending.length === 1 ? "" : "s"}
              </strong>{" "}
              waiting on a restart: {pending.map((p) => p.name).join(", ")}
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        className="kp-primary kp-applybtn"
        disabled={busy || pending.length === 0}
        onClick={onApply}
      >
        <Rocket size={14} aria-hidden />
        {busy ? "Restarting" : "Apply and restart"}
      </button>

      {error && <p className="kp-err kp-applyerr">{error}</p>}

      {result && result.refused.length > 0 && (
        <p className="kp-err kp-applyerr">
          Not bound, because Doppler has no value for them: {result.refused.join(", ")}
        </p>
      )}

      {result && result.skipped.length > 0 && (
        <p className="kp-applynote">
          {result.skipped.length} secret{result.skipped.length === 1 ? "" : "s"} the deploy holds
          that Doppler cannot supply were left untouched, never blanked: {result.skipped.join(", ")}
        </p>
      )}
    </div>
  );
}

function Note({ tone, children }: { tone: "warn" | "bad"; children: React.ReactNode }) {
  return (
    <div className={`kp-note kp-note-${tone}`}>
      <AlertTriangle size={15} aria-hidden />
      <span>{children}</span>
    </div>
  );
}
