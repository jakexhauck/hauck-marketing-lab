import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  MessageSquare,
  Receipt,
  Send,
  Trophy,
  UserPlus,
} from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "../ui/Button";
import DesktopPage from "../desktop/DesktopPage";
import EmptyState from "../EmptyState";
import { useAuth } from "../../context/AuthContext";
import { useNow } from "../../context/NowContext";
import {
  useNotificationsQuery,
  useMarkNotificationsRead,
} from "../../hooks/useApi";
import { timeAgo } from "../../lib/timeAgo";
import { activityLabel } from "../../lib/activityLabels";
import { groupByDayKey } from "../../lib/dayGroups";
import type { ApiNotification } from "../../lib/api";

// The Atelier desktop Notifications center (lg+). The phone keeps its own
// (NavyHero) feed; this renders only inside `hidden lg:flex` from the route.
// Tones are semantic so the icon chips stay legible in light and dark.
type Tone = "positive" | "brand" | "warning" | "ledger" | "muted";

const TYPE_META: Record<
  string,
  { Icon: ComponentType<{ size?: number }>; tone: Tone }
> = {
  lead_created: { Icon: UserPlus, tone: "positive" },
  stage_changed: { Icon: ArrowLeftRight, tone: "brand" },
  status_changed: { Icon: Trophy, tone: "warning" },
  message_in: { Icon: MessageSquare, tone: "brand" },
  message_out: { Icon: Send, tone: "muted" },
  appointment_create: { Icon: CalendarDays, tone: "brand" },
  appointment_update: { Icon: CalendarDays, tone: "muted" },
  appointment_delete: { Icon: CalendarDays, tone: "warning" },
  invoice_create: { Icon: Receipt, tone: "muted" },
  invoice_sent: { Icon: Receipt, tone: "brand" },
  invoice_paid: { Icon: Receipt, tone: "ledger" },
};

// Tone -> chip classes. Ledger gold stays reserved for money (paid invoices).
const TONE_CHIP: Record<Tone, string> = {
  positive: "bg-positive-tint text-positive",
  brand: "bg-brand-tint text-brand-text",
  warning: "bg-warning-tint text-warning",
  ledger: "bg-ledger-tint text-ledger",
  muted: "bg-surface-2 text-muted",
};

function meta(action: string) {
  return TYPE_META[action] ?? { Icon: Bell, tone: "muted" as Tone };
}

function title(n: ApiNotification): string {
  return n.payload?.summary ?? activityLabel(n.action);
}

// Where opening a notification lands. Mirrors the push deep-link logic
// (functions/lib/push.ts): the opportunity wins, then the contact thread.
function targetOf(n: ApiNotification): string | null {
  if (n.lead_id) return `/lead/${n.lead_id}`;
  const contactId = n.payload?.contact_id;
  if (contactId) return `/conversations/${contactId}`;
  return null;
}

interface DayGroup {
  key: string;
  label: string;
  items: ApiNotification[];
}

function dayKeyOf(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export default function NotificationsDesktop() {
  const navigate = useNavigate();
  const now = useNow();
  const { session } = useAuth();
  const useReal = Boolean(session);

  const query = useNotificationsQuery(useReal);
  const markRead = useMarkNotificationsRead();

  const items = useMemo(() => query.data?.notifications ?? [], [query.data]);
  const unread = query.data?.unreadCount ?? 0;

  const groups = useMemo<DayGroup[]>(() => {
    const todayKey = dayKeyOf(new Date());
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = dayKeyOf(yesterday);

    const byDay = groupByDayKey(items, (n) => {
      const d = new Date(n.created_at);
      return Number.isNaN(d.getTime()) ? null : dayKeyOf(d);
    });

    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, list]) => {
        let label: string;
        if (key === todayKey) label = "Today";
        else if (key === yesterdayKey) label = "Yesterday";
        else
          label = new Date(list[0].created_at).toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          });
        return { key, label, items: list };
      });
  }, [items]);

  const openItem = (n: ApiNotification) => {
    if (!n.read_at) markRead.mutate({ id: n.id });
    const target = targetOf(n);
    if (target) navigate(target);
  };

  const subtitle = query.isLoading
    ? "Loading..."
    : unread > 0
      ? `${unread} unread`
      : "All caught up";

  return (
    <DesktopPage
      title="Notifications"
      subtitle={subtitle}
      actions={
        <>
          {unread > 0 && (
            <Button
              variant="secondary"
              onClick={() => markRead.mutate({ all: true })}
            >
              <CheckCheck size={16} />
              Mark all read
            </Button>
          )}
        </>
      }
    >
      {query.isError ? (
        <div className="rounded-[var(--radius-lg)] border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          Failed to load notifications.{" "}
          {(query.error as Error | null)?.message ?? "Try again."}
        </div>
      ) : query.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-brand"
            aria-hidden
          />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface py-6">
          <EmptyState
            title="No notifications"
            message="New leads, replies, wins, and appointments will show up here."
          />
        </div>
      ) : (
        <div className="mx-auto flex max-w-[760px] flex-col gap-7">
          {groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-2.5">
              <span className="label-cap px-1">{g.label}</span>
              <ul className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
                {g.items.map((n, idx) => {
                  const m = meta(n.action);
                  const isUnread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={
                          "group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-2" +
                          (idx === g.items.length - 1
                            ? ""
                            : " border-b border-divider") +
                          (isUnread ? " bg-brand-tint/40" : "")
                        }
                      >
                        <div
                          className={
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius)] " +
                            TONE_CHIP[m.tone]
                          }
                          aria-hidden
                        >
                          <m.Icon size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className={
                              "truncate text-[14.5px] text-text " +
                              (isUnread ? "font-bold" : "font-semibold")
                            }
                          >
                            {title(n)}
                          </div>
                          <div className="mt-0.5 font-data text-[12px] text-faint tabular-nums">
                            {timeAgo(n.created_at, now)}
                          </div>
                        </div>
                        {isUnread && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full bg-brand"
                            aria-label="Unread"
                          />
                        )}
                        <ChevronRight
                          size={16}
                          className="shrink-0 text-faint transition-colors group-hover:text-muted"
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </DesktopPage>
  );
}
