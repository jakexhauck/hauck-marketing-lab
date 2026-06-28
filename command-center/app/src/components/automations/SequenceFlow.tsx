import { MessageSquare, Mail, Phone, Clock, type LucideIcon } from "lucide-react";
import type { AutomationStep, Channel } from "../../lib/automations";

// Channel identity: each touch type reads at a glance by icon + colour. Indigo
// is the brand (text), email teal, call amber; wait is muted and dashed. Gold
// is reserved for money elsewhere, so it never appears here.
const CHANNEL: Record<Channel, { icon: LucideIcon; label: string; color: string; tint: string }> = {
  sms: { icon: MessageSquare, label: "Text", color: "#4f46e5", tint: "rgba(79,70,229,0.12)" },
  email: { icon: Mail, label: "Email", color: "#0d9488", tint: "rgba(13,148,136,0.12)" },
  call: { icon: Phone, label: "Call", color: "#d97706", tint: "rgba(217,119,6,0.12)" },
  wait: { icon: Clock, label: "Wait", color: "var(--text-faint)", tint: "transparent" },
};

// The signature element: a sequence rendered as a circuit line of channel nodes.
// Delay above each node, the touch label below, connectors between. Read-only;
// nothing here is interactive beyond a tooltip on the preview text.
export default function SequenceFlow({ steps }: { steps: AutomationStep[] }) {
  return (
    <ol className="flex items-center overflow-x-auto pb-9 pt-6">
      {steps.map((step, i) => {
        const meta = CHANNEL[step.channel];
        const Icon = meta.icon;
        const isWait = step.channel === "wait";
        return (
          <li key={i} className="flex shrink-0 items-center">
            {i > 0 && (
              <span
                aria-hidden="true"
                className="h-[2px] w-10 shrink-0 sm:w-14"
                style={{ background: "var(--border-strong)" }}
              />
            )}
            <span className="relative flex shrink-0 flex-col items-center">
              {/* delay, above (centered on the node) */}
              <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-data text-[10px] uppercase tracking-wide text-faint">
                {step.delay}
              </span>
              {/* node */}
              <span
                title={step.preview ?? undefined}
                className={
                  "flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface)] " +
                  (isWait ? "border border-dashed" : "border-2")
                }
                style={{ borderColor: meta.color, background: isWait ? "var(--surface)" : meta.tint }}
              >
                <Icon size={18} style={{ color: meta.color }} aria-hidden="true" />
              </span>
              {/* label, below (centered on the node) */}
              <span className="absolute top-[54px] left-1/2 w-24 -translate-x-1/2 text-center text-[11px] font-medium leading-tight text-text">
                {step.label}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// A compact legend of the channels in use, for the page header.
export function ChannelLegend({ channels }: { channels: Channel[] }) {
  const seen = Array.from(new Set(channels));
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {seen.map((c) => {
        const meta = CHANNEL[c];
        const Icon = meta.icon;
        return (
          <span key={c} className="flex items-center gap-1.5 text-[12px] text-muted">
            <Icon size={13} style={{ color: meta.color }} aria-hidden="true" />
            {meta.label}
          </span>
        );
      })}
    </div>
  );
}
