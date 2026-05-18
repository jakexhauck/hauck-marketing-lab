import { useCallback, useEffect, useState } from "react";
import { openPath } from "@tauri-apps/plugin-opener";
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
  /** How many to show. Defaults to 20. */
  limit?: number;
}

export function ActivityFeedPanel({ root, limit = 20 }: Props) {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    if (!root) {
      setEvents([]);
      setTotal(0);
      setLoaded(true);
      return;
    }
    try {
      const tail = await api.tailActivity(root, limit);
      setEvents(tail.events);
      setTotal(tail.total);
    } catch (e) {
      console.warn("tailActivity failed", e);
      setEvents([]);
      setTotal(0);
    } finally {
      setLoaded(true);
    }
  }, [root, limit]);

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

  const openRef = async (refPath?: string) => {
    if (!refPath) return;
    try {
      await openPath(refPath);
    } catch (e) {
      console.warn("openPath failed", e);
    }
  };

  return (
    <div className="hml-panel">
      <div className="hml-panel-header">
        <div className="hml-panel-title">
          <span className="hml-dot" style={{ background: "var(--hml-green, #22c55e)" }} />
          Recent activity
        </div>
        <span className="hml-panel-action" style={{ cursor: "default" }}>
          {total > 0 ? `${total} total` : "no events"}
        </span>
      </div>
      <div className="hml-panel-body">
        {!loaded ? null : events.length === 0 ? (
          <div className="hml-empty">
            <div className="hml-empty-title">No activity logged yet</div>
            <div className="hml-empty-sub">
              Form runs, scraper runs, mockups, and outreach events show up
              here as you work.
            </div>
          </div>
        ) : (
          events.map((ev, i) => (
            <div
              key={`${ev.ts ?? i}-${i}`}
              className="hml-activity"
              onClick={() => void openRef(ev.refPath)}
              style={{ cursor: ev.refPath ? "pointer" : "default" }}
              title={ev.refPath ?? ""}
            >
              <span
                aria-hidden
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: activityDotColor(ev.type),
                  flexShrink: 0,
                  marginTop: 7,
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
                  {ev.hot ? (
                    <>
                      <span className="hml-sep">·</span>
                      <span
                        style={{
                          color: "#f59e0b",
                          fontWeight: 600,
                          letterSpacing: "0.05em",
                        }}
                      >
                        HOT
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
