import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  CheckCheck,
  UserPlus,
  ArrowLeftRight,
  MessageSquare,
  Send,
  Bell,
  Trophy,
  CalendarDays,
  Receipt,
} from "lucide-react";
import type { ComponentType } from "react";
import Shell from "../components/Shell";
import NavyHero from "../components/NavyHero";
import NotificationsDesktop from "../components/notifications/NotificationsDesktop";
import { HeroIconButton } from "../components/HeroUi";
import TestBanner from "../components/TestBanner";
import EmptyState from "../components/EmptyState";
import { useAuth } from "../context/AuthContext";
import {
  useNotificationsQuery,
  useMarkNotificationsRead,
} from "../hooks/useApi";
import { timeAgo } from "../lib/timeAgo";
import { useNow } from "../context/NowContext";
import { activityLabel } from "../lib/activityLabels";
import { groupByDayKey } from "../lib/dayGroups";
import type { ApiNotification } from "../lib/api";

// One icon per webhook action (see functions/api/webhook.ts); labels come
// from the shared activityLabels map, which humanizes unknown kinds.
const TYPE_META: Record<
  string,
  { Icon: ComponentType<{ size?: number }>; tint: string }
> = {
  lead_created: { Icon: UserPlus, tint: "#15803d" },
  stage_changed: { Icon: ArrowLeftRight, tint: "#7c3aed" },
  status_changed: { Icon: Trophy, tint: "#b45309" },
  message_in: { Icon: MessageSquare, tint: "#1d4ed8" },
  message_out: { Icon: Send, tint: "#0e7490" },
  appointment_create: { Icon: CalendarDays, tint: "#7c3aed" },
  appointment_update: { Icon: CalendarDays, tint: "#0e7490" },
  appointment_delete: { Icon: CalendarDays, tint: "#be123c" },
  invoice_create: { Icon: Receipt, tint: "#0e7490" },
  invoice_sent: { Icon: Receipt, tint: "#1d4ed8" },
  invoice_paid: { Icon: Receipt, tint: "#15803d" },
};

function meta(action: string) {
  return TYPE_META[action] ?? { Icon: Bell, tint: "#64748b" };
}

function title(n: ApiNotification): string {
  return n.payload?.summary ?? activityLabel(n.action);
}

// Where tapping a notification lands. Mirrors the push deep-link logic
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

export default function Notifications() {
  const navigate = useNavigate();
  const now = useNow();
  const { session, mode } = useAuth();
  const useReal = Boolean(session);
  const isTest = mode === "test";

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

  return (
    <Shell>
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
      {isTest && <TestBanner />}

      <NavyHero flushTop={isTest}>
        <div className="flex items-center gap-2.5">
          <HeroIconButton label="Back to home" onClick={() => navigate("/home")}>
            <ChevronLeft size={20} />
          </HeroIconButton>
          <div className="min-w-0 flex-1">
            <div className="font-display text-[17px] font-bold text-white">
              Notifications
            </div>
            <div className="truncate text-[12px] text-white/60">
              {query.isLoading
                ? "Loading..."
                : unread > 0
                  ? `${unread} unread`
                  : "All caught up"}
            </div>
          </div>
          {unread > 0 && (
            <HeroIconButton
              label="Mark all read"
              onClick={() => markRead.mutate({ all: true })}
            >
              <CheckCheck size={18} />
            </HeroIconButton>
          )}
        </div>
      </NavyHero>

      <main className="flex flex-1 flex-col gap-5 px-5 pb-28 pt-4">
        {query.isError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            Failed to load notifications.{" "}
            {(query.error as Error | null)?.message ?? "Try again."}
          </div>
        ) : query.isLoading ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--brand-primary)]"
              aria-hidden="true"
            />
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title="No notifications"
            message="New leads, replies, wins, and appointments will show up here."
          />
        ) : (
          groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              <span className="sec-kicker px-1">{g.label}</span>
              <ul className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
                {g.items.map((n, idx) => {
                  const m = meta(n.action);
                  const isUnread = !n.read_at;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openItem(n)}
                        className={
                          "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-[var(--surface-2)]" +
                          (idx === g.items.length - 1
                            ? ""
                            : " border-b border-[var(--divider)]") +
                          (isUnread ? " bg-[var(--surface-2)]" : "")
                        }
                      >
                        <div
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                          style={{ background: `${m.tint}1a`, color: m.tint }}
                        >
                          <m.Icon size={17} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className={
                              "truncate text-[14.5px] text-[var(--text)]" +
                              (isUnread ? " font-bold" : " font-semibold")
                            }
                          >
                            {title(n)}
                          </div>
                          <div className="mt-0.5 text-[12px] text-[var(--text-muted)]">
                            {timeAgo(n.created_at, now)}
                          </div>
                        </div>
                        {isUnread && (
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: "var(--brand-primary)" }}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </main>
      </div>

      <div className="hidden min-h-0 flex-1 lg:flex">
        <NotificationsDesktop />
      </div>
    </Shell>
  );
}
