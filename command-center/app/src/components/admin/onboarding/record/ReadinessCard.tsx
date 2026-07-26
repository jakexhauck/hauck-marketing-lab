import { PlugZap, RefreshCw } from "lucide-react";
import { Card } from "./OnboardingKit";
import type { AdminOnboardingReadinessCheck } from "../../../../lib/api";

// What GHL says right now, not what we saved. Every load of this card reaches
// into the client's sub-account for custom values and calendars, so it is driven
// by an explicit Re-check button rather than refetching in the background.

const CHECK_NAMES: Record<string, string> = {
  token: "API token",
  custom_values: "Custom values",
  calendars: "Calendars",
};

export default function ReadinessCard({
  checks,
  loading,
  error,
  onRecheck,
}: {
  checks: AdminOnboardingReadinessCheck[];
  loading: boolean;
  error: string | null;
  onRecheck: () => void;
}) {
  return (
    <Card
      icon={<PlugZap />}
      tone="sky"
      title="Live from GHL"
      note="Checked against the client's sub-account"
      right={
        <button type="button" className="onb-btn ghost" onClick={onRecheck} disabled={loading}>
          <RefreshCw size={15} />
          {loading ? "Checking..." : "Re-check"}
        </button>
      }
    >
      {error ? (
        <p className="onb-empty">{error}</p>
      ) : loading && checks.length === 0 ? (
        <p className="onb-empty">Asking GHL...</p>
      ) : checks.length === 0 ? (
        <p className="onb-empty">Nothing checked yet.</p>
      ) : (
        checks.map((check) => (
          <div key={check.key} className={`onb-check${check.ok ? " ok" : ""}`}>
            <span className="onb-check-dot" aria-hidden />
            <div className="min-w-0">
              <div className="onb-check-name">
                {CHECK_NAMES[check.key] ?? check.key}
              </div>
              <div className="onb-check-detail">{check.detail}</div>
            </div>
          </div>
        ))
      )}
    </Card>
  );
}
