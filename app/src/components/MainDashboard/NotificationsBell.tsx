import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
import { IconBell } from "../icons";
import { api } from "../../lib/tauri";
import {
  activityDotColor,
  activityLabel,
  relativeTime,
  type ActivityEvent,
} from "../../lib/activity";
import type { DataChangedEvent } from "../../lib/types";

interface Props {
  root: string | null;
  /** How many events to surface in the popover. Defaults to 10. */
  popoverLimit?: number;
  /** How many to fetch into memory for unread computation. Defaults to 50. */
  tailLimit?: number;
}

export function NotificationsBell({
  root,
  popoverLimit = 10,
  tailLimit = 50,
}: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    if (!root) {
      setEvents([]);
      setLastSeenAt(null);
      return;
    }
    try {
      const [tail, state] = await Promise.all([
        api.tailActivity(root, tailLimit),
        api.readActivityState(root),
      ]);
      setEvents(tail.events);
      setLastSeenAt(state.lastSeenAt ?? null);
    } catch (e) {
      console.warn("notifications: load failed", e);
    }
  }, [root, tailLimit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let mounted = true;
    api
      .onDataChanged((evt: DataChangedEvent) => {
        if (!mounted) return;
        if (evt.kind === "activity") void refresh();
      })
      .then((un) => {
        if (!mounted) un();
        else unlistenFn = un;
      });
    return () => {
      mounted = false;
      if (unlistenFn) unlistenFn();
    };
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const node = containerRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) {
        void closeAndMarkSeen();
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closeAndMarkSeen = async () => {
    setOpen(false);
    if (!root) return;
    try {
      await api.markActivitySeen(root);
      const state = await api.readActivityState(root);
      setLastSeenAt(state.lastSeenAt ?? null);
    } catch (e) {
      console.warn("notifications: mark seen failed", e);
    }
  };

  const unreadCount = useMemo(() => {
    if (events.length === 0) return 0;
    // Fresh install: surface only `hot: true` until first bell click.
    if (!lastSeenAt) {
      return events.filter((e) => e.hot === true).length;
    }
    const seen = new Date(lastSeenAt).getTime();
    if (Number.isNaN(seen)) return 0;
    return events.filter((e) => {
      if (!e.ts) return false;
      const t = new Date(e.ts).getTime();
      return Number.isFinite(t) && t > seen;
    }).length;
  }, [events, lastSeenAt]);

  const popoverEvents = events.slice(0, popoverLimit);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        className="hml-icon-btn"
        title="Notifications"
        onClick={() => {
          if (open) void closeAndMarkSeen();
          else setOpen(true);
        }}
        style={{ position: "relative" }}
      >
        <IconBell size={15} />
        {unreadCount > 0 ? (
          <span
            aria-label={`${unreadCount} unread`}
            style={{
              position: "absolute",
              top: -2,
              right: -2,
              minWidth: 14,
              height: 14,
              padding: "0 3px",
              borderRadius: 7,
              background: "var(--warning)",
              color: "var(--brand-fg)",
              fontSize: 9.5,
              fontWeight: 700,
              lineHeight: "14px",
              textAlign: "center",
              letterSpacing: 0,
              boxShadow: "0 0 0 2px var(--hml-bg-elev-0, var(--bg))",
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Recent notifications"
          className="hml-chrome-popover"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 360,
            maxHeight: 440,
            overflow: "auto",
            background: "var(--hml-bg-elev-1)",
            border: "1px solid var(--hml-border-subtle)",
            borderRadius: 10,
            boxShadow: "0 14px 36px rgba(var(--shadow-rgb),0.45)",
            zIndex: 50,
          }}
        >
          <div
            style={{
              padding: "12px 14px 10px",
              borderBottom: "1px solid var(--hml-border-subtle)",
              fontSize: 12,
              fontWeight: 500,
              color: "var(--hml-text-primary)",
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>Notifications</span>
            <span style={{ color: "var(--hml-text-tertiary)", fontSize: 11 }}>
              {unreadCount > 0 ? `${unreadCount} unread` : "all caught up"}
            </span>
          </div>

          {popoverEvents.length === 0 ? (
            <div className="hml-empty" style={{ padding: "20px 16px" }}>
              <div className="hml-empty-title">Nothing yet</div>
              <div className="hml-empty-sub">
                Activity events appear here as the OS runs.
              </div>
            </div>
          ) : (
            popoverEvents.map((ev, i) => {
              const isHot = ev.hot === true;
              return (
                <div
                  key={`${ev.ts ?? i}-${i}`}
                  className="hml-activity"
                  style={{
                    cursor: ev.refPath ? "pointer" : "default",
                    padding: "10px 14px",
                  }}
                  onClick={() => {
                    if (ev.refPath) {
                      void openPath(ev.refPath).catch(() => undefined);
                    }
                  }}
                  title={ev.refPath ?? ""}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      background: activityDotColor(ev.type),
                      flexShrink: 0,
                      marginTop: 6,
                    }}
                  />
                  <div className="hml-activity-body">
                    <div className="hml-activity-title">
                      <span className="hml-em">{ev.summary}</span>
                    </div>
                    <div className="hml-activity-meta">
                      <span>{activityLabel(ev.type)}</span>
                      {ev.clientSlug ? (
                        <>
                          <span className="hml-sep">·</span>
                          <span>{ev.clientSlug}</span>
                        </>
                      ) : ev.prospectSlug ? (
                        <>
                          <span className="hml-sep">·</span>
                          <span>{ev.prospectSlug}</span>
                        </>
                      ) : null}
                      <span className="hml-sep">·</span>
                      <span>{relativeTime(ev.ts)}</span>
                      {isHot ? (
                        <span
                          style={{
                            marginLeft: "auto",
                            color: "var(--brand-fg)",
                            background: "var(--warning)",
                            padding: "1px 6px",
                            borderRadius: 4,
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                          }}
                        >
                          HOT
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
