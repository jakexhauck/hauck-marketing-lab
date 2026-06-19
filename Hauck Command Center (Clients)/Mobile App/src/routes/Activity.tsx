import { useMemo, useState } from "react";
import { BellOff, History, CheckCheck } from "lucide-react";
import type { ApiActivity, ApiNotification } from "../lib/api";
import { PageHeader } from "../components/PageHeader";
import {
  Button,
  Badge,
  Segmented,
  EmptyState,
  ErrorState,
  type SegmentOption,
} from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useAuth } from "../context/AuthContext";
import {
  useNotificationsQuery,
  useActivityQuery,
  useMarkNotificationsRead,
} from "../hooks/useApi";
import { Timeline, TimelineSkeleton } from "../components/activity/Timeline";

type View = "notifications" | "activity";

// Activity surface: a notification center (carries read state) with an optional
// full activity log (a read-only event log). Both render the same day-grouped
// timeline, so the route mostly orchestrates which query feeds it.
export function Activity() {
  const [view, setView] = useState<View>("notifications");
  const { showToast } = useToast();
  const { session } = useAuth();
  const enabled = Boolean(session);

  const notificationsQuery = useNotificationsQuery(enabled);
  const activityQuery = useActivityQuery(enabled);
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
    { value: "notifications", label: "Notifications", count: unreadCount || undefined },
    { value: "activity", label: "All activity" },
  ];

  function markOne(id: number) {
    markRead.mutate({ id });
  }

  function markAll() {
    markRead.mutate(
      { all: true },
      { onSuccess: () => showToast("All notifications marked read") },
    );
  }

  return (
    <div className="mx-auto w-full max-w-[760px]">
      <PageHeader
        title="Activity"
        description="Account events and notifications from your pipelines."
        count={
          view === "notifications" && unreadCount > 0 ? (
            <Badge tone="brand">{unreadCount} unread</Badge>
          ) : undefined
        }
        actions={
          view === "notifications" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={markAll}
              loading={markRead.isPending && markRead.variables != null && "all" in markRead.variables}
              disabled={unreadCount === 0}
            >
              <CheckCheck size={15} />
              Mark all read
            </Button>
          ) : undefined
        }
        filters={<Segmented options={options} value={view} onChange={setView} />}
      />

      {view === "notifications" ? (
        <NotificationsView
          notifications={notifications}
          isLoading={notificationsQuery.isLoading}
          isError={notificationsQuery.isError}
          onRetry={() => notificationsQuery.refetch()}
          onMarkRead={markOne}
        />
      ) : (
        <ActivityLogView
          activity={activity}
          isLoading={activityQuery.isLoading}
          isError={activityQuery.isError}
          onRetry={() => activityQuery.refetch()}
        />
      )}
    </div>
  );
}

function NotificationsView({
  notifications,
  isLoading,
  isError,
  onRetry,
  onMarkRead,
}: {
  notifications: ApiNotification[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onMarkRead: (id: number) => void;
}) {
  if (isLoading) return <TimelineSkeleton />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load notifications"
        description="The notification feed failed to load. Try again."
        onRetry={onRetry}
      />
    );
  }
  if (notifications.length === 0) {
    return (
      <EmptyState
        icon={<BellOff size={22} />}
        title="You're all caught up"
        description="New notifications from your pipelines will appear here."
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
  onRetry,
}: {
  activity: ApiActivity[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (isLoading) return <TimelineSkeleton />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load activity"
        description="The activity log failed to load. Try again."
        onRetry={onRetry}
      />
    );
  }
  if (activity.length === 0) {
    return (
      <EmptyState
        icon={<History size={22} />}
        title="No activity yet"
        description="Account events will be recorded here as they happen."
      />
    );
  }
  return <Timeline events={activity} />;
}
