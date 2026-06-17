import { useState } from "react";
import { api } from "../lib/tauri";

type Props = {
  clientName: string;
  clientSlug: string;
  onClose: () => void;
  /** Fires after a successful provision so the parent can tick the task. */
  onProvisioned: (result: ProvisionResult) => void;
};

type ProvisionResult = {
  tenantId: string;
  userId: string;
  userEmail: string;
  invited: boolean;
  alreadyExisted: boolean;
};

function defaultInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "??";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; result: ProvisionResult }
  | { kind: "error"; message: string };

export default function ProvisionMobileAppForm({
  clientName,
  clientSlug,
  onClose,
  onProvisioned,
}: Props) {
  const [clientEmail, setClientEmail] = useState("");
  const [appName, setAppName] = useState(`${clientName} Leads`);
  const [brandColor, setBrandColor] = useState("#1d6fb8");
  const [brandInitials, setBrandInitials] = useState(defaultInitials(clientName));
  const [wonLabel, setWonLabel] = useState("Booked & Paid");
  const [valueLabel, setValueLabel] = useState("Service Total");
  const [niche, setNiche] = useState("");
  const [monthlySpend, setMonthlySpend] = useState<number>(0);
  const [ghlLocationId, setGhlLocationId] = useState("");
  const [ghlToken, setGhlToken] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const canSubmit =
    status.kind !== "submitting" &&
    clientEmail.trim() !== "" &&
    appName.trim() !== "" &&
    brandColor.trim() !== "" &&
    brandInitials.trim() !== "" &&
    wonLabel.trim() !== "" &&
    valueLabel.trim() !== "" &&
    niche.trim() !== "" &&
    ghlLocationId.trim() !== "" &&
    ghlToken.trim() !== "";

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setStatus({ kind: "submitting" });
    try {
      const result = await api.provisionMobileTenant({
        clientEmail: clientEmail.trim(),
        slug: clientSlug,
        name: clientName,
        niche: niche.trim(),
        brandColor: brandColor.trim(),
        brandInitials: brandInitials.trim(),
        appName: appName.trim(),
        wonLabel: wonLabel.trim(),
        valueLabel: valueLabel.trim(),
        ghlLocationId: ghlLocationId.trim(),
        ghlToken: ghlToken.trim(),
        monthlySpend: Number.isFinite(monthlySpend) ? monthlySpend : 0,
        sendInvite,
      });
      setStatus({ kind: "success", result });
      onProvisioned(result);
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  return (
    <div className="hml-content">
      <header className="hml-page-header">
        <div>
          <div className="hml-page-eyebrow">
            <span>▸ PROVISION MOBILE APP · ADMIN</span>
            <span aria-hidden="true">·</span>
            <span>ONBOARDING · LAUNCH</span>
            <span aria-hidden="true">·</span>
            <span>CLIENT · {clientName.toUpperCase()}</span>
          </div>
          <h1 className="hml-page-title">Mobile app provisioning</h1>
          <div className="hml-page-subtitle">
            Creates the tenant in the client-dashboard Supabase project and
            links {clientName}'s email so they can sign in to their leads app.
          </div>
        </div>
        <div className="hml-page-header-actions">
          <button
            type="button"
            className="hml-btn"
            onClick={onClose}
            disabled={status.kind === "submitting"}
          >
            Close
          </button>
        </div>
      </header>

      {status.kind === "success" ? (
        <div className="os-card">
          <div className="os-card-eyebrow">▸ PROVISIONED</div>
          <p style={{ marginTop: 8 }}>
            Tenant <code>{status.result.tenantId.slice(0, 8)}…</code> linked to{" "}
            <strong>{status.result.userEmail}</strong>.
          </p>
          <ul style={{ marginTop: 8, paddingLeft: 18 }}>
            <li>
              {status.result.alreadyExisted
                ? "User already existed in Supabase, reused that account."
                : status.result.invited
                  ? "Invite email sent. Client clicks the link to set up access."
                  : "User created silently. Client requests a magic link from the app login page."}
            </li>
            <li>
              Tenant record upserted with the brand + GHL credentials you
              entered. Rerunning this form updates the values.
            </li>
            <li>
              <code>tenant_users</code> row inserted with role = owner.
            </li>
          </ul>
          <div className="os-card-actions" style={{ marginTop: 12 }}>
            <button type="button" className="os-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="os-card">
            <div className="os-card-eyebrow">▸ CLIENT LOGIN</div>
            <p className="os-hint" style={{ marginBottom: 10 }}>
              Whichever email you enter here is the one the client uses to sign in
              to the mobile app.
            </p>
            <div style={{ display: "grid", gap: 14 }}>
              <label className="os-field">
                <span className="os-field-label">Client email</span>
                <input
                  className="os-input"
                  type="email"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                  placeholder="owner@theirbusiness.com"
                  autoComplete="off"
                  required
                />
              </label>
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={sendInvite}
                  onChange={(e) => setSendInvite(e.target.checked)}
                />
                <span>
                  Send Supabase invite email now (recommended). Uncheck to
                  create silently. Client requests a magic link themselves.
                </span>
              </label>
            </div>
          </div>

          <div className="os-card">
            <div className="os-card-eyebrow">▸ APP BRANDING</div>
            <div style={{ display: "grid", gap: 14 }}>
              <label className="os-field">
                <span className="os-field-label">App name (header on phone)</span>
                <input
                  className="os-input"
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Willis Leads"
                  required
                />
              </label>
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
                <label className="os-field">
                  <span className="os-field-label">Brand color (hex)</span>
                  <input
                    className="os-input"
                    type="text"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    placeholder="#1d6fb8"
                    required
                  />
                </label>
                <label className="os-field">
                  <span className="os-field-label">Brand initials</span>
                  <input
                    className="os-input"
                    type="text"
                    value={brandInitials}
                    onChange={(e) =>
                      setBrandInitials(e.target.value.toUpperCase().slice(0, 3))
                    }
                    placeholder="WW"
                    required
                  />
                </label>
              </div>
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
                <label className="os-field">
                  <span className="os-field-label">Won label</span>
                  <input
                    className="os-input"
                    type="text"
                    value={wonLabel}
                    onChange={(e) => setWonLabel(e.target.value)}
                    placeholder="Booked & Paid"
                    required
                  />
                </label>
                <label className="os-field">
                  <span className="os-field-label">Value label</span>
                  <input
                    className="os-input"
                    type="text"
                    value={valueLabel}
                    onChange={(e) => setValueLabel(e.target.value)}
                    placeholder="Service Total"
                    required
                  />
                </label>
              </div>
              <div style={{ display: "grid", gap: 14, gridTemplateColumns: "1fr 1fr" }}>
                <label className="os-field">
                  <span className="os-field-label">Niche</span>
                  <input
                    className="os-input"
                    type="text"
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder="Window Cleaning"
                    required
                  />
                </label>
                <label className="os-field">
                  <span className="os-field-label">Monthly ad spend (USD)</span>
                  <input
                    className="os-input"
                    type="number"
                    min={0}
                    step={50}
                    value={monthlySpend}
                    onChange={(e) =>
                      setMonthlySpend(parseInt(e.target.value, 10) || 0)
                    }
                    placeholder="1500"
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="os-card">
            <div className="os-card-eyebrow">▸ GHL ACCESS</div>
            <p className="os-hint" style={{ marginBottom: 10 }}>
              From the client's GHL sub-account. Settings → Private Integrations
              → New. Token needs read+write on contacts, opportunities, conversations.
            </p>
            <div style={{ display: "grid", gap: 14 }}>
              <label className="os-field">
                <span className="os-field-label">GHL location ID</span>
                <input
                  className="os-input"
                  type="text"
                  value={ghlLocationId}
                  onChange={(e) => setGhlLocationId(e.target.value)}
                  placeholder="abc123XYZ..."
                  required
                />
              </label>
              <label className="os-field">
                <span className="os-field-label">GHL private integration token</span>
                <input
                  className="os-input"
                  type="password"
                  value={ghlToken}
                  onChange={(e) => setGhlToken(e.target.value)}
                  placeholder="pit-..."
                  autoComplete="off"
                  required
                />
              </label>
            </div>
          </div>

          {status.kind === "error" && (
            <div className="os-card" style={{ borderColor: "var(--danger)" }}>
              <div className="os-card-eyebrow os-warn">▸ PROVISION FAILED</div>
              <p style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                {status.message}
              </p>
              <p className="os-hint" style={{ marginTop: 6 }}>
                If this mentions secrets: paste your Supabase URL + service-role key
                into <code>app/src-tauri/src/supabase_secrets.rs</code> and rebuild
                the desktop app.
              </p>
            </div>
          )}

          <div className="os-card-actions" style={{ margin: "4px 0 24px" }}>
            <button
              type="button"
              className="os-primary"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              {status.kind === "submitting"
                ? "Provisioning…"
                : "Provision mobile app"}
            </button>
            <button
              type="button"
              className="hml-btn"
              onClick={onClose}
              disabled={status.kind === "submitting"}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
