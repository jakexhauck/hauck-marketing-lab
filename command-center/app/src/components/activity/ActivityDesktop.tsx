import { useMemo, useState } from "react";
import { BellOff, CheckCheck, History } from "lucide-react";
import DesktopPage from "../desktop/DesktopPage";
import { Button, Segmented, type SegmentOption } from "../ui";
import { Timeline, TimelineSkeleton } from "./Timeline";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  useActivityQuery,
  useNotificationsQuery,
  useMarkNotificationsRead,
} from "../../hooks/useApi";
import type { ApiActivity, ApiNotification } from "../../lib/api";

type View = "notifications" | "activity";

// The Atelier desktop Activity surface (lg+). A calm, day-grouped event feed
// that reuses the shared Timeline. Two views share the same column: the
// notification center (carries read state) and the read-only activity log. The
// phone keeps its own layout; this renders only inside `hidden lg:flex`.
export default function ActivityDesktop() {
  const { session } = useAuth();
  const { showToast } = useToast();
  const useReal = Boolean(session);
  const [view, setView] = useState<View>("notifications");

  const notificationsQuery = useNotificationsQuery(useReal);
  const activityQuery = useActivityQuery(useReal);
  const markRead = useMarkNotificationsRead();

  const notifications = useMemo<ApiNotification[]>(
    () => notificationsQuery.data?.notifications ?? [],
    [notificationsQuery.data],
  );
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  const activity = useMemo<ApiActivity[]>(
    () => activityQuery.data?.activity ?? [],
    [activityQuery.data],
  );

  const options: SegmentOption<View>[] = [
    {
      value: "notifications",
      label: "Notifications",
      count: unreadCount || undefined,
    },
    { value: "activity", label: "All activity" },
  ];

  const markingAll =
    markRead.isPending &&
    markRead.variables != null &&
    "all" in markRead.variables;

  function markAll() {
    markRead.mutate(
      { all: true },
      { onSuccess: () => showToast("All notifications marked read") },
    );
  }

  return (
    <DesktopPage
      title="Activity"

    >
      {/* View toggle plus the one secondary action (mark all read). */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented options={options} value={view} onChange={setView} />
        {view === "notifications" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={markAll}
            loading={markingAll}
            disabled={unreadCount === 0}
          >
            <CheckCheck size={15} />
            Mark all read
          </Button>
        )}
      </div>

      <div className="max-w-[760px]">
        {view === "notifications" ? (
          <NotificationsView
            notifications={notifications}
            isLoading={notificationsQuery.isLoading}
            isError={notificationsQuery.isError}
            error={notificationsQuery.error}
            onRetry={() => notificationsQuery.refetch()}
            onMarkRead={(id) => markRead.mutate({ id })}
          />
        ) : (
          <ActivityLogView
            activity={activity}
            isLoading={activityQuery.isLoading}
            isError={activityQuery.isError}
            error={activityQuery.error}
            onRetry={() => activityQuery.refetch()}
          />
        )}
      </div>
    </DesktopPage>
  );
}

// Loading/empty/error treatments mirror ContactsDesktop: a centered spinner, a
// tinted danger panel, and a bordered surface around the empty message.

function NotificationsView({
  notifications,
  isLoading,
  isError,
  error,
  onRetry,
  onMarkRead,
}: {
  notifications: ApiNotification[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onMarkRead: (id: number) => void;
}) {
  if (isError) {
    return <FeedError message={(error as Error | null)?.message} onRetry={onRetry} />;
  }
  if (isLoading) return <TimelineSkeleton />;
  if (notifications.length === 0) {
    return (
      <FeedEmpty
        icon={<BellOff size={22} aria-hidden />}
        title="You are all caught up"
        message="New notifications from your pipelines will appear here."
      />
    );
  }
  return (
    <Timeline
      events={notifications}
      isUnread={(e) => "read_at" in e && e.read_at === null}
      onMarkRead={onMarkRead}
    />
  );
}

function ActivityLogView({
  activity,
  isLoading,
  isError,
  error,
  onRetry,
}: {
  activity: ApiActivity[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (isError) {
    return <FeedError message={(error as Error | null)?.message} onRetry={onRetry} />;
  }
  if (isLoading) return <TimelineSkeleton />;
  if (activity.length === 0) {
    return (
      <FeedEmpty
        icon={<History size={22} aria-hidden />}
        title="No activity yet"
        message="Account events will be recorded here as they happen."
      />
    );
  }
  return <Timeline events={activity} />;
}

function FeedError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3">
      <p className="text-sm text-danger">
        Could not load this feed. {message ?? "Try again."}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

function FeedEmpty({
  icon,
  title,
  message,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-border bg-surface px-6 py-16 text-center shadow-[var(--shadow-sm)]">
      <span className="text-faint">{icon}</span>
      <div className="font-display text-[15px] font-semibold text-text">
        {title}
      </div>
      <p className="max-w-[300px] text-sm text-muted">{message}</p>
    </div>
  );
}
