interface TopBarProps {
  onBrandClick?: () => void;
  onCommand?: () => void;
  onSettings?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  onSync?: () => void;
  syncing?: boolean;
  syncStatus?: "idle" | "ok" | "error";
  syncTooltip?: string;
  /** Optional right-side label between JARVIS and the command/settings cluster. */
  rightLabel?: string;
}

export function TopBar({
  onBrandClick,
  onCommand,
  onSettings,
  onRefresh,
  refreshing,
  onSync,
  syncing,
  syncStatus,
  syncTooltip,
  rightLabel,
}: TopBarProps) {
  const syncClass =
    "md-icon-btn md-sync-btn" +
    (syncing ? " md-syncing" : "") +
    (syncStatus === "ok" ? " md-sync-ok" : "") +
    (syncStatus === "error" ? " md-sync-error" : "");

  return (
    <div className="md-topbar">
      <button type="button" className="md-brand" onClick={onBrandClick}>
        <span className="md-brand-dot" />
        HAUCK MARKETING OS
      </button>
      <div className="md-right">
        <span>
          <span className="md-pulse-dot" />
          JARVIS · ONLINE
        </span>
        {rightLabel && <span style={{ color: "var(--text-faint)" }}>{rightLabel}</span>}
        {onSync && (
          <button
            type="button"
            className={syncClass}
            onClick={onSync}
            disabled={syncing}
            title={syncTooltip || "Sync with GitHub"}
            aria-label="Sync with GitHub"
          >
            {syncing ? "⇅ SYNCING…" : "⇅ SYNC"}
          </button>
        )}
        {onRefresh && (
          <button
            type="button"
            className={`md-icon-btn${refreshing ? " md-refreshing" : ""}`}
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
            aria-label="Refresh"
          >
            ↻
          </button>
        )}
        {onCommand && (
          <button type="button" className="md-icon-btn" onClick={onCommand}>
            ⌘ K · COMMAND
          </button>
        )}
        {onSettings && (
          <button
            type="button"
            className="md-icon-btn"
            onClick={onSettings}
            aria-label="Settings"
          >
            ⚙
          </button>
        )}
      </div>
    </div>
  );
}
