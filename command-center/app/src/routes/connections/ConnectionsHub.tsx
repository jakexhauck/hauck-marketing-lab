import { useState } from "react";
import { RefreshCw, ShieldCheck, CheckCircle2 } from "lucide-react";
import Shell from "../../components/Shell";
import { PageHeader } from "../../components/PageHeader";
import { Panel, Button } from "../../components/ui";
import { demoMode } from "../../demo/demoMode";
import { useToast } from "../../context/ToastContext";
import { PAGE_CONTAINER } from "../../lib/layout";
import {
  CONNECTIONS,
  mergeStatus,
  allConnected,
  type ConnState,
} from "../../lib/connectionsModel";
import { useConnections, startConnect } from "../../hooks/useConnections";
import ConnectionCard from "./ConnectionCard";

// Company > Connections. The client links their own Facebook, Instagram and
// Google Business Profile from here. Each Connect opens that provider's own
// consent page; the connection lands in the client's account and the card flips
// to Connected on return. Demo/preview renders an all-connected state; a real
// session shows live status and never a fabricated "connected".
export default function ConnectionsHub() {
  const demo = demoMode();
  const { showToast } = useToast();
  const { data, isLoading, isFetching, refetch } = useConnections(!demo);
  const [busy, setBusy] = useState<string | null>(null);

  const status = mergeStatus(data?.connections);
  const stateFor = (id: (typeof CONNECTIONS)[number]["id"]): ConnState =>
    demo ? "connected" : status[id];
  const everyConnected = demo || allConnected(status);

  async function connect(id: string, label: string) {
    if (demo) {
      showToast(`Connecting ${label} (demo)`);
      return;
    }
    setBusy(id);
    const err = await startConnect(id);
    setBusy(null);
    if (err) showToast(err);
  }

  return (
    <Shell>
      <div className={PAGE_CONTAINER}>
        <PageHeader
          title="Connections"
          description="Link your accounts so your posts, reviews and leads flow automatically."
          actions={
            !demo ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RefreshCw size={15} className={isFetching ? "animate-spin" : undefined} />
                Refresh
              </Button>
            ) : undefined
          }
        />

        {everyConnected ? (
          <Panel className="mb-4 flex items-center gap-3 border-positive/30 bg-positive-tint px-4 py-3">
            <CheckCircle2 size={18} className="shrink-0 text-positive" />
            <p className="flex-1 text-[13px] leading-snug text-text">
              <span className="font-semibold">You're all set.</span> Your accounts are connected and working.
            </p>
          </Panel>
        ) : (
          <Panel className="mb-4 flex items-center gap-3 border-brand/30 bg-brand-tint px-4 py-3">
            <ShieldCheck size={18} className="shrink-0 text-brand-text" />
            <p className="flex-1 text-[13px] leading-snug text-text">
              You connect on each provider's own secure page. We never see your password, and you can disconnect anytime from that provider.
            </p>
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTIONS.map((meta) => (
            <ConnectionCard
              key={meta.id}
              meta={meta}
              state={stateFor(meta.id)}
              busy={busy === meta.id}
              onConnect={() => connect(meta.id, meta.label)}
            />
          ))}
        </div>

        {!demo && isLoading && (
          <p className="mt-4 text-[13px] text-faint">Checking your connections…</p>
        )}
      </div>
    </Shell>
  );
}
