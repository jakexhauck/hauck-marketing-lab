import { useEffect, useState } from "react";
import { Bell, BellOff, Mail, MessageSquare, Smartphone } from "lucide-react";
import { Switch } from "../ui/Switch";
import { Segmented } from "../ui/Segmented";
import { Button } from "../ui/Button";
import { api } from "../../lib/api";
import { useTheme, type ThemePref } from "../../context/ThemeContext";
import {
  enablePush,
  hasPushSubscription,
  isInstalledPwa,
  pushAlreadyGranted,
  type PushEnableResult,
} from "../../lib/push";

// Shared Settings controls. Both the phone (Settings.tsx) and desktop
// (SettingsDesktop.tsx) layouts render these inside their own section headers,
// so the channel/push/theme/password logic lives in exactly one place. Each
// control renders its own bordered panel using shared tokens (border-border,
// bg-surface) that resolve identically in both layouts.

const PANEL =
  "overflow-hidden rounded-[18px] border border-border bg-surface shadow-[var(--shadow-sm)]";
const ROW = "flex items-center gap-3.5 px-4 py-3.5";

// ---- Appearance: light / dark / system -----------------------------------

export function AppearanceControl() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="rounded-[18px] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold text-text">Theme</div>
          <div className="mt-0.5 text-[12px] text-muted">
            How the app looks on this device
          </div>
        </div>
        <Segmented<ThemePref>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
            { value: "system", label: "Auto" },
          ]}
        />
      </div>
    </div>
  );
}

// ---- This device: web-push enablement + status ----------------------------

type PushUiState =
  | "loading"
  | "on" // granted + subscribed
  | "off" // can enable (default/denied-recoverable or granted-but-unsubscribed)
  | "needs-install" // iOS: must be an installed PWA first
  | "unsupported";

export function ThisDeviceControl() {
  const [state, setState] = useState<PushUiState>("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const supported =
        typeof navigator !== "undefined" &&
        "serviceWorker" in navigator &&
        typeof window !== "undefined" &&
        "PushManager" in window;
      if (!supported) return mounted && setState("unsupported");
      if (!isInstalledPwa() && !pushAlreadyGranted()) {
        return mounted && setState("needs-install");
      }
      const has = await hasPushSubscription();
      if (mounted) setState(has && pushAlreadyGranted() ? "on" : "off");
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const enable = async () => {
    setBusy(true);
    setNote(null);
    const result: PushEnableResult = await enablePush();
    setBusy(false);
    if (result === "granted") {
      setState("on");
    } else if (result === "unsupported") {
      setState("unsupported");
    } else if (result === "denied") {
      setNote("Notifications are blocked. Allow them in your browser settings, then try again.");
    } else {
      setNote("Could not turn on notifications. Check your connection and try again.");
    }
  };

  const on = state === "on";
  const Icon = on ? Bell : BellOff;

  return (
    <div className={PANEL}>
      <div className={ROW}>
        <span
          className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl ${
            on ? "bg-brand-tint text-brand-text" : "bg-[var(--surface-2)] text-muted"
          }`}
        >
          <Icon size={18} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[15px] font-bold text-text">
            Notifications on this device
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {state === "loading" && "Checking..."}
            {state === "on" && "On. This device will buzz for new leads, messages, and wins."}
            {state === "off" && "Off. Turn on to get buzzed on this device."}
            {state === "needs-install" &&
              "Install the app to your home screen first, then turn this on."}
            {state === "unsupported" && "This browser cannot show notifications."}
          </div>
        </div>
        {(state === "off") && (
          <Button variant="primary" size="sm" onClick={() => void enable()} disabled={busy}>
            {busy ? "Turning on" : "Turn on"}
          </Button>
        )}
        {state === "on" && (
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
            On
          </span>
        )}
      </div>
      {note && (
        <div className="border-t border-border px-4 py-2.5 text-[12px] text-[#be123c]">
          {note}
        </div>
      )}
    </div>
  );
}

// ---- Channels: push / email / sms (owner) ---------------------------------

interface ChannelSettings {
  audience: "everyone" | "assigned";
  push: boolean;
  email: boolean;
  sms: boolean;
  emailTo: string | null;
  smsTo: string | null;
}

function useChannelSettings() {
  const [data, setData] = useState<ChannelSettings | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    api<ChannelSettings>("/api/settings/notifications")
      .then((r) => mounted && setData(r))
      .catch(() => mounted && setError(true));
    return () => {
      mounted = false;
    };
  }, []);

  const patch = async (body: Partial<ChannelSettings>) => {
    setError(false);
    try {
      const r = await api<ChannelSettings>("/api/settings/notifications", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setData(r);
      return true;
    } catch {
      setError(true);
      return false;
    }
  };

  return { data, error, patch };
}

const CHANNELS: {
  key: "push" | "email" | "sms";
  title: string;
  sub: string;
  icon: typeof Smartphone;
}[] = [
  { key: "push", title: "In-app push", sub: "Buzz on signed-in devices", icon: Smartphone },
  { key: "email", title: "Email", sub: "Send to your chosen inbox", icon: Mail },
  { key: "sms", title: "Text (SMS)", sub: "Text one number", icon: MessageSquare },
];

// A single editable destination (email address or phone) with its own draft +
// Save, shown when its channel is on. Saved value lives on the tenant; GHL's
// recipient custom value is set from it (or blanked when the channel is off).
function DestinationField({
  label,
  type,
  placeholder,
  saved,
  onSave,
}: {
  label: string;
  type: "email" | "tel";
  placeholder: string;
  saved: string | null;
  onSave: (value: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(saved ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(saved ?? "");
  }, [saved]);

  const save = async () => {
    setSaving(true);
    setMsg(null);
    const ok = await onSave(draft.trim() || null);
    setSaving(false);
    setMsg(ok ? "Saved" : "Could not save. Check the value.");
  };

  return (
    <div className="rounded-[18px] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <label className="font-display text-[14px] font-bold text-text">{label}</label>
      <div className="mt-2 flex items-center gap-2">
        <input
          type={type}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setMsg(null);
          }}
          placeholder={placeholder}
          className="min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={() => void save()}
          disabled={saving || draft.trim() === (saved ?? "")}
        >
          {saving ? "Saving" : "Save"}
        </Button>
      </div>
      {msg && (
        <div
          className={`mt-2 text-[12px] ${
            msg === "Saved" ? "text-emerald-600" : "text-[#be123c]"
          }`}
        >
          {msg}
        </div>
      )}
    </div>
  );
}

export function ChannelsControl() {
  const { data, error, patch } = useChannelSettings();
  const loading = !data && !error;

  return (
    <>
      <ul className={PANEL}>
        {CHANNELS.map((c) => {
          const on = data?.[c.key] === true;
          return (
            <li key={c.key} className="border-b border-border last:border-b-0">
              <div className={ROW}>
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand-text">
                  <c.icon size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[15px] font-bold text-text">
                    {c.title}
                  </div>
                  <div className="mt-0.5 text-[12px] text-muted">{c.sub}</div>
                </div>
                <Switch
                  checked={on}
                  disabled={loading}
                  label={c.title}
                  onChange={(next) => void patch({ [c.key]: next })}
                />
              </div>
            </li>
          );
        })}
        {error && (
          <li className="px-4 py-2.5 text-[12px] text-[#be123c]">
            Could not save. Check your connection and try again.
          </li>
        )}
      </ul>

      {/* Destinations, shown only when their channel is on. */}
      {data?.email && (
        <DestinationField
          label="Send email notifications to"
          type="email"
          placeholder="you@business.com"
          saved={data.emailTo}
          onSave={(value) => patch({ emailTo: value })}
        />
      )}
      {data?.sms && (
        <DestinationField
          label="Text notifications to"
          type="tel"
          placeholder="+1 555 123 4567"
          saved={data.smsTo}
          onSave={(value) => patch({ smsTo: value })}
        />
      )}
    </>
  );
}

// ---- Change password / PIN -------------------------------------------------

export function ChangePasswordControl() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const reset = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setMsg(null);
  };

  const submit = async () => {
    setMsg(null);
    if (next.length < 4) {
      return setMsg({ ok: false, text: "Use at least 4 characters." });
    }
    if (next !== confirm) {
      return setMsg({ ok: false, text: "New passwords do not match." });
    }
    setBusy(true);
    try {
      await api("/api/settings/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setBusy(false);
      reset();
      setOpen(false);
      setMsg({ ok: true, text: "Password updated." });
    } catch (e) {
      setBusy(false);
      const code = e instanceof Error ? e.message : "";
      const text =
        code === "incorrect_password"
          ? "Current password is wrong."
          : code === "same_password"
            ? "That is already your password."
            : code === "weak_password"
              ? "Use at least 4 characters."
              : "Could not update. Try again.";
      setMsg({ ok: false, text });
    }
  };

  const field =
    "w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-[14px] text-text outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <div className="rounded-[18px] border border-border bg-surface p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="font-display text-[15px] font-bold text-text">
            Password / PIN
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            Change how you sign in
          </div>
        </div>
        {!open && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            Change
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="Current password"
            className={field}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="New password"
            className={field}
          />
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            className={field}
          />
          <div className="flex items-center gap-2 pt-1">
            <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy}>
              {busy ? "Saving" : "Save"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {msg && (
        <div
          className={`mt-2 text-[12px] ${msg.ok ? "text-emerald-600" : "text-[#be123c]"}`}
        >
          {msg.text}
        </div>
      )}
    </div>
  );
}
