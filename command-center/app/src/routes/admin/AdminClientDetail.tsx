import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";
import ClientConfigPanel, { type DetailClient } from "../../components/admin/ClientConfigPanel";

// The standalone client hub at /admin/clients/:id. Since Task 3.2 this is a
// thin wrapper: the DesktopPage chrome (title, slug, "Preview as client") plus
// the shared ClientConfigPanel, which owns the actual config cards and their
// load/save. The identical panel also renders inside the Service Delivery
// cockpit's Config tab, so both surfaces stay in lock-step. The panel reports
// the loaded client back up via onClientChange so the header (and its live
// rename) stays in sync.

export default function AdminClientDetail() {
  const { id = "" } = useParams();
  const [client, setClient] = useState<DetailClient | null>(null);

  return (
    <DesktopPage
      title={
        client ? (
          <span className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius)] text-[13px] font-bold"
              style={{ background: client.brandColor || "var(--brand-primary)", color: "var(--brand-fg)" }}
            >
              {client.brandInitials || client.name.slice(0, 2).toUpperCase()}
            </span>
            {client.name}
          </span>
        ) : (
          "Client"
        )
      }
      subtitle={client ? <span className="font-data">{client.slug}</span> : undefined}
      actions={<PreviewButton tenantId={id} />}
    >
      <BackLink />
      <div className="mt-4">
        <ClientConfigPanel tenantId={id} onClientChange={setClient} />
      </div>
    </DesktopPage>
  );
}

function BackLink() {
  return (
    <Link to="/admin/clients" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-text">
      <ArrowLeft size={15} /> All clients
    </Link>
  );
}

// Enter a read-only preview of this client. Swaps the admin session for a
// preview session (AuthContext) and routes into the client's home, where the
// app-wide PreviewBanner offers the way back.
function PreviewButton({ tenantId }: { tenantId: string }) {
  const { previewClient } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    setBusy(true);
    setErr(null);
    const res = await previewClient(tenantId);
    if (res.ok) {
      navigate("/home", { replace: true });
    } else {
      setErr(res.error ?? "Could not start preview");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        onClick={() => void onClick()}
        loading={busy}
        title="View this client's app read-only"
      >
        {!busy && <Eye size={15} />}
        {busy ? "Opening..." : "Preview as client"}
      </Button>
      {err && <span className="text-[12px] text-danger">{err}</span>}
    </div>
  );
}
