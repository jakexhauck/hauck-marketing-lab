import { useCallback, useEffect, useRef, useState } from "react";
import { Check, LogOut, Mail } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  useAttachSocialPage,
  useSocialPages,
  useStartSocialConnect,
  useStartGoogleCalendarConnect,
  type ConnectablePage,
  type ConnectPlatform,
  type SocialGate,
} from "../../hooks/useApi";

// The blocking connect gate. A client cannot reach any part of the app until
// their Facebook page AND Instagram account are linked to their sub-account
// (Jake, 2026-08-09).
//
// It is an early return inside ProtectedRoute rather than a modal over the app,
// which is what makes "they cannot do anything else" structurally true: there is
// no app rendered behind this to reach. Same shape as SetupHoldingScreen, which
// gates the same way for a different reason.
//
// THE ONLY WAY PAST IS TO CONNECT, or for an admin to set social_gate_waived on
// the client (0094). That waiver exists because a hard gate has failure modes
// the client cannot fix from inside it: no page yet, not an admin of the page, a
// personal rather than Business Instagram, or Meta being down.

// Numbered rather than brand-marked: this icon set carries no Facebook or
// Instagram glyph, and a stand-in symbol beside a platform name reads as a
// broken image rather than as decoration.
//
// A third step joined the two Meta ones: linking the owner's Google Calendar,
// which is what keeps their real commitments out of the slots customers can
// book. It is NOT a ConnectPlatform: Meta's flow is a pop-up carrying an
// accountId back by postMessage, Google's is a full-page redirect through
// Composio, and pretending they are the same shape is how one of them would
// quietly stop working.
type StepId = ConnectPlatform | "calendar";

const META_STEPS: { platform: ConnectPlatform; label: string }[] = [
  { platform: "facebook", label: "Facebook page" },
  { platform: "instagram", label: "Instagram account" },
];

const CALENDAR_LABEL = "Google Calendar";

// GHL's finish page hands the new connection back by postMessage and nothing
// else: there is no endpoint that lists an oauth record before it is attached,
// so this id cannot be recovered any other way if the message is missed.
//
// The payload's exact shape has never been seen (proving it needs a human to
// complete a real Facebook consent screen), so this reads liberally: anything
// carrying an id-shaped accountId counts, at either the top level or one deep.
export function readAccountId(data: unknown): string | null {
  let payload = data;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const nested = (row.data ?? row.payload ?? row.account ?? {}) as Record<string, unknown>;
  for (const candidate of [row.accountId, row.account_id, row.id, nested.accountId, nested.id]) {
    if (typeof candidate === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

type Phase = "idle" | "opening" | "waiting" | "choosing" | "attaching" | "failed";

export default function SocialConnectGate({ gate }: { gate: SocialGate }) {
  const { signOut } = useAuth();
  const start = useStartSocialConnect();
  const loadPages = useSocialPages();
  const attach = useAttachSocialPage();

  const startCalendar = useStartGoogleCalendarConnect();

  // The calendar step only exists for clients it is required of. Every client
  // that predates it was grandfathered by migration 0101, so they never see a
  // third card appear one morning demanding something new of them.
  const steps: { id: StepId; label: string }[] = [
    ...META_STEPS.map((s) => ({ id: s.platform as StepId, label: s.label })),
    ...(gate.calendarRequired ? [{ id: "calendar" as StepId, label: CALENDAR_LABEL }] : []),
  ];

  const done: Record<StepId, boolean> = {
    facebook: gate.facebook,
    instagram: gate.instagram,
    calendar: gate.calendar,
  };
  // The step being worked on: the first one not yet done.
  const current: StepId = steps.find((s) => !done[s.id])?.id ?? "facebook";
  const onCalendar = current === "calendar";

  const [phase, setPhase] = useState<Phase>("idle");
  const [problem, setProblem] = useState<string>("");
  const [pages, setPages] = useState<ConnectablePage[]>([]);
  const accountId = useRef<string>("");
  const popup = useRef<Window | null>(null);

  const fail = useCallback((message: string) => {
    setPhase("failed");
    setProblem(message);
    accountId.current = "";
  }, []);

  // Listen only while a connection is actually in flight, so a stray message
  // from any other tab is ignored rather than acted on.
  useEffect(() => {
    if (phase !== "waiting") return;

    const onMessage = (e: MessageEvent) => {
      const id = readAccountId(e.data);
      if (!id || accountId.current) return;
      accountId.current = id;
      setPhase("choosing");
      loadPages.mutate(
        { platform: current as ConnectPlatform, accountId: id },
        {
          onSuccess: ({ pages: found }) => {
            if (found.length === 0) {
              fail(
                current === "instagram"
                  ? "Facebook did not offer an Instagram account. Instagram has to be a Business account linked to your Facebook page."
                  : "Facebook did not offer any pages. You need to be an admin of the page you want to connect.",
              );
              return;
            }
            setPages(found);
          },
          onError: () => fail("We could not read your pages. Try again."),
        },
      );
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [phase, current, loadPages, fail]);

  // If the window closes without ever sending us anything, say so rather than
  // spinning forever. The client has no way to tell a hung wizard from a slow one.
  useEffect(() => {
    if (phase !== "waiting") return;
    const timer = window.setInterval(() => {
      if (popup.current && popup.current.closed && !accountId.current) {
        window.clearInterval(timer);
        fail("That window closed before finishing. Try again.");
      }
    }, 800);
    return () => window.clearInterval(timer);
  }, [phase, fail]);

  // Google's flow is a full-page redirect, not a pop-up: Composio's consent
  // round trip returns to /jobs, not to an opener window, so there is nothing
  // for a postMessage to come back to.
  const connectCalendar = async () => {
    setProblem("");
    try {
      const res = await startCalendar.mutateAsync();
      if (res?.redirectUrl) {
        window.location.href = res.redirectUrl;
        return;
      }
      fail("We could not reach Google. Try again.");
    } catch {
      fail("We could not reach Google. Try again.");
    }
  };

  const connect = async () => {
    if (onCalendar) return connectCalendar();

    setProblem("");
    setPages([]);
    accountId.current = "";

    // Opened BEFORE the await, empty, then pointed at the real URL once it
    // arrives. A window.open that happens after an await is a pop-up the
    // browser did not see the click for, and it gets blocked.
    const win = window.open("", "hm_social_connect", "width=620,height=780");
    if (!win) {
      fail("Your browser blocked the pop-up. Allow pop-ups for this site and try again.");
      return;
    }
    popup.current = win;
    setPhase("opening");

    try {
      const { url } = await start.mutateAsync(current as ConnectPlatform);
      win.location.href = url;
      setPhase("waiting");
    } catch {
      win.close();
      fail("We could not reach Facebook. Try again.");
    }
  };

  const choose = (pageId: string) => {
    setPhase("attaching");
    attach.mutate(
      { platform: current as ConnectPlatform, accountId: accountId.current, pageId },
      {
        // No success branch: attaching invalidates the gate query, the gate
        // re-answers, and this component either advances to Instagram or stops
        // rendering entirely. Nothing here should decide that.
        onError: () => fail("We could not connect that. Try again."),
      },
    );
  };

  const busy =
    phase === "opening" ||
    phase === "waiting" ||
    phase === "attaching" ||
    startCalendar.isPending;
  const label = steps.find((s) => s.id === current)?.label ?? "Facebook page";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-5 py-12">
      <div className="w-full max-w-[560px]">
        <div className="rounded-[var(--radius-lg)] border border-border bg-surface p-7 shadow-[var(--shadow-sm)] sm:p-9">
          <p className="label-cap">Hauck Marketing</p>
          <h1 className="mt-2 font-display text-[26px] leading-tight font-semibold text-text">
            Connect your {label}.
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-muted">
            {onCalendar
              ? "So the times you are already busy never get offered to a customer, and every booking lands in your calendar."
              : "We post and reply on your behalf, so your app needs access to both accounts before you can use it."}
          </p>

          <ol className="mt-7 flex flex-col gap-3">
            {steps.map(({ id, label: stepLabel }, i) => {
              const complete = done[id];
              const active = id === current;
              return (
                <li
                  key={id}
                  className={`flex items-center gap-3 rounded-[var(--radius)] border px-3.5 py-3 ${
                    active ? "border-brand bg-brand/5" : "border-border"
                  }`}
                >
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${
                      complete ? "bg-positive/15 text-positive" : "border border-border text-faint"
                    }`}
                    aria-hidden
                  >
                    {complete ? <Check size={15} /> : i + 1}
                  </span>
                  <span
                    className={`text-[14px] font-medium ${complete ? "text-muted" : "text-text"}`}
                  >
                    {stepLabel}
                  </span>
                  {complete && (
                    <span className="ml-auto text-[12.5px] font-medium text-positive">
                      Connected
                    </span>
                  )}
                </li>
              );
            })}
          </ol>

          {/* The consent screen is Facebook's and it names our scheduling
              partner, not us. Saying so first costs one line and saves the
              email asking who LeadConnector is. */}
          {phase === "idle" && !onCalendar && (
            <p className="mt-5 text-[13px] leading-relaxed text-faint">
              Facebook will ask you to approve <strong className="text-muted">LeadConnector</strong>
              , the scheduling partner we post through. That is expected.
            </p>
          )}

          {pages.length > 0 && phase === "choosing" ? (
            <div className="mt-6">
              <p className="text-[13px] font-semibold text-text">
                Which one should we connect?
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choose(p.id)}
                    className="flex items-center gap-3 rounded-[var(--radius)] border border-border px-3.5 py-3 text-left transition-colors hover:border-brand hover:bg-brand/5"
                  >
                    {p.avatar ? (
                      <img
                        src={p.avatar}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <span className="h-8 w-8 shrink-0 rounded-full bg-surface-2" aria-hidden />
                    )}
                    <span className="text-[14px] font-medium text-text">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void connect()}
              disabled={busy}
              className="mt-6 w-full rounded-[var(--radius)] bg-brand px-4 py-3 font-display text-[14px] font-semibold text-brand-fg transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {!onCalendar && phase === "opening" && "Opening Facebook..."}
              {!onCalendar && phase === "waiting" && "Waiting for Facebook..."}
              {!onCalendar && phase === "attaching" && "Connecting..."}
              {onCalendar && startCalendar.isPending && "Opening Google..."}
              {(onCalendar ? !startCalendar.isPending : phase === "idle" || phase === "failed") &&
                `Connect ${label}`}
            </button>
          )}

          {problem && (
            <p role="alert" className="mt-3 text-[13px] leading-relaxed text-danger">
              {problem}
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <a
              href="mailto:jake@hauckmarketing.com"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-brand-text underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
            >
              <Mail size={15} aria-hidden />
              I need help with this
            </a>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
            >
              <LogOut size={15} aria-hidden />
              Sign out
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
