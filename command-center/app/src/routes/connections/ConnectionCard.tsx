import { Check, Loader2, ArrowUpRight } from "lucide-react";
import { Panel, Button, Badge } from "../../components/ui";
import type { ConnectionMeta, ConnState } from "../../lib/connectionsModel";

// One integration card: brand glyph, label, what it unlocks, and a status-aware
// action. Connected shows a spent state; otherwise a Connect button that opens
// the provider consent flow.
function Glyph({ meta, size = 42 }: { meta: ConnectionMeta; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-[11px] font-bold text-white"
      style={{ width: size, height: size, background: meta.bg, fontSize: size * 0.38 }}
      aria-hidden
    >
      {meta.glyph}
    </span>
  );
}

export default function ConnectionCard({
  meta,
  state,
  busy,
  onConnect,
}: {
  meta: ConnectionMeta;
  state: ConnState;
  busy: boolean;
  onConnect: () => void;
}) {
  const connected = state === "connected";
  return (
    <Panel className="flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3.5">
        <Glyph meta={meta} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-[16px] text-text">{meta.label}</h3>
            {connected && (
              <Badge tone="positive">
                <Check size={12} /> Connected
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[13px] leading-snug text-muted">{meta.unlocks}</p>
        </div>
      </div>

      {connected ? (
        <Button variant="secondary" size="sm" disabled className="self-start">
          <Check size={15} /> Connected
        </Button>
      ) : (
        <Button
          variant="primary"
          size="sm"
          onClick={onConnect}
          disabled={busy}
          className="self-start"
        >
          {busy ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <ArrowUpRight size={15} />
          )}
          Connect {meta.label}
        </Button>
      )}
    </Panel>
  );
}
