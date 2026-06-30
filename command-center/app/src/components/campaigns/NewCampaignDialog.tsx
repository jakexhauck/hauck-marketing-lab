import { useEffect, useState } from "react";
import { Mail, MessageSquare, Sparkles, Send, Link2, Check, Users } from "lucide-react";
import { Button } from "../ui";
import { useToast } from "../../context/ToastContext";
import { demoMode } from "../../demo/demoMode";
import CampaignDialog from "./CampaignDialog";
import { Channel, DEMO_AUDIENCES } from "../../routes/campaigns/shared";

// The "New campaign" flow: channel -> audience -> compose (with a live SMS/email
// preview) -> schedule. Interactive locally; the AI draft and the final Send are
// gated until the backend is wired (sending blasts to real customers is never a
// demo action). Optionally prefilled from a template or an Overview idea.
const STEPS = ["Channel", "Audience", "Compose", "Schedule"] as const;

const SMS_FG = "#0284c7";
const SMS_BG = "rgba(14,165,233,.12)";

const SAMPLE_SMS =
  "Hi {{first}}, it's Willis Plumbing. Beat the summer rush, book your AC tune-up and we'll keep it running cool all season. Reply YES for times.";
const SAMPLE_EMAIL =
  "A quick, clean fix before a small clog becomes a weekend emergency. $25 off drain cleaning this month, book online in under a minute.";

export default function NewCampaignDialog({
  open,
  onClose,
  initialChannel,
  initialSubject,
  initialBody,
}: {
  open: boolean;
  onClose: () => void;
  initialChannel?: Channel;
  initialSubject?: string;
  initialBody?: string;
}) {
  const demo = demoMode();
  const { showToast } = useToast();

  const [step, setStep] = useState(0);
  const [ch, setCh] = useState<Channel | null>(initialChannel ?? null);
  const [audId, setAudId] = useState(DEMO_AUDIENCES[0].id);
  const [subject, setSubject] = useState(initialSubject ?? "");
  const [body, setBody] = useState(initialBody ?? "");
  const [when, setWhen] = useState<"now" | "later">("now");

  // Reset to a clean slate (honouring any prefill) each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setStep(initialChannel ? 1 : 0);
    setCh(initialChannel ?? null);
    setAudId(DEMO_AUDIENCES[0].id);
    setSubject(initialSubject ?? "");
    setBody(initialBody ?? "");
    setWhen("now");
  }, [open, initialChannel, initialSubject, initialBody]);

  if (!open) return null;

  const aud = DEMO_AUDIENCES.find((a) => a.id === audId) ?? DEMO_AUDIENCES[0];
  const isSms = ch === "sms";
  const filled = body.replace(/{{first}}/g, "Mark");
  const segments = Math.max(1, Math.ceil(body.length / 160));

  function next() {
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  }
  function back() {
    setStep((s) => Math.max(0, s - 1));
  }
  function fillSample() {
    if (isSms) setBody(SAMPLE_SMS);
    else {
      if (!subject) setSubject("$25 off drain cleaning this month");
      setBody(SAMPLE_EMAIL);
    }
    showToast("Drafted with AI from your business (demo)");
  }

  const canContinue = step === 0 ? !!ch : true;

  return (
    <CampaignDialog
      open={open}
      onClose={onClose}
      title="New campaign"
      maxWidth="sm:max-w-3xl"
      footer={
        <>
          {step === STEPS.length - 1 ? (
            <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
              <Link2 size={13} /> Sending turns on once your account is connected
            </span>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="secondary" size="md" onClick={back}>
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button variant="primary" size="md" disabled={!canContinue} onClick={next}>
                Continue
              </Button>
            ) : (
              <Button variant="primary" size="md" disabled title="Connect your account to send">
                <Send size={15} /> Send campaign
              </Button>
            )}
          </div>
        </>
      }
    >
      <div className="p-5">
        {/* step rail */}
        <div className="mb-5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <span
                className={`flex items-center gap-1.5 text-[12px] font-semibold ${
                  i === step ? "text-text" : "text-faint"
                }`}
              >
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                    i < step
                      ? "bg-positive-tint text-positive"
                      : i === step
                        ? "text-white"
                        : "bg-surface-2 text-faint"
                  }`}
                  style={i === step ? { backgroundImage: "var(--grad-brand)" } : undefined}
                >
                  {i < step ? <Check size={12} /> : i + 1}
                </span>
                {s}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-border-strong" />}
            </div>
          ))}
        </div>

        {/* step 1 — channel */}
        {step === 0 && (
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-text">How do you want to reach them?</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["sms", "email"] as Channel[]).map((c) => {
                const sms = c === "sms";
                const sel = ch === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCh(c)}
                    className={`flex items-start gap-3 rounded-[14px] border p-4 text-left transition-colors ${
                      sel ? "border-brand bg-brand-tint" : "border-border-strong hover:border-brand"
                    }`}
                  >
                    <span
                      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]"
                      style={{
                        background: sms ? SMS_BG : "var(--brand-tint)",
                        color: sms ? SMS_FG : "var(--brand-text)",
                      }}
                    >
                      {sms ? <MessageSquare size={18} /> : <Mail size={18} />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-display text-[14.5px] font-semibold text-text">
                        {sms ? "Text message" : "Email"}
                        {sel && <Check size={15} className="text-brand-text" />}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                        {sms
                          ? "Lands instantly, best reply rate. Great for reminders and time-sensitive offers."
                          : "Room for detail and images. Best for newsletters, specials and longer updates."}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* step 2 — audience */}
        {step === 1 && (
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-text">Who should get this?</div>
            <div className="flex flex-col gap-2.5">
              {DEMO_AUDIENCES.map((a) => {
                const sel = audId === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAudId(a.id)}
                    className={`flex items-start gap-3 rounded-[14px] border p-3.5 text-left transition-colors ${
                      sel ? "border-brand bg-brand-tint" : "border-border-strong hover:border-brand"
                    }`}
                  >
                    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand-tint text-brand-text">
                      <Users size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-display text-[14px] font-semibold text-text">
                        {a.name} <span className="font-normal text-faint">· {a.count}</span>
                        {sel && <Check size={14} className="ml-auto text-brand-text" />}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">{a.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* step 3 — compose */}
        {step === 2 && (
          <div className="grid gap-5 lg:grid-cols-[1fr_240px]">
            <div>
              <div className="mb-3 flex justify-end">
                <Button variant="secondary" size="sm" disabled={!demo} onClick={fillSample}>
                  <Sparkles size={15} /> Write it for me
                </Button>
              </div>
              {!isSms && (
                <div className="mb-4">
                  <label className="mb-1.5 block text-[12.5px] font-semibold text-text">Subject line</label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. $25 off drain cleaning this month"
                    className="w-full rounded-[10px] border border-border-strong bg-surface px-3 py-2.5 text-[14px] text-text outline-none placeholder:text-faint focus:border-brand"
                  />
                </div>
              )}
              <label className="mb-1.5 block text-[12.5px] font-semibold text-text">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={isSms ? 320 : undefined}
                placeholder={
                  isSms
                    ? "Hi {{first}}, a quick note from your team…"
                    : "Write your email here. {{first}} fills in each customer's name."
                }
                className="min-h-[120px] w-full resize-y rounded-[10px] border border-border-strong bg-surface p-3 text-[14px] leading-relaxed text-text outline-none placeholder:text-faint focus:border-brand"
              />
              <div className="mt-1.5 flex items-center justify-between text-[11.5px] text-faint">
                {isSms ? (
                  <>
                    <span>{body.length} characters</span>
                    <span>
                      {segments} text{segments > 1 ? "s" : ""} per recipient
                    </span>
                  </>
                ) : (
                  <span>{"{{first}}"} fills in each customer's name.</span>
                )}
              </div>
            </div>

            {/* live preview */}
            <div>
              <div className="label-cap mb-2">Live preview</div>
              {isSms ? (
                <div className="rounded-[22px] border-[7px] border-[#1b1d29] bg-[#0c0d14] px-2 pb-3.5 pt-2.5">
                  <div className="mb-2 flex justify-center">
                    <span className="h-[5px] w-11 rounded-full bg-[#2a2c3a]" />
                  </div>
                  <div className="max-w-[88%] rounded-[14px] rounded-bl-[4px] bg-[#26283a] px-2.5 py-2 text-[12.5px] leading-snug text-white">
                    <div className="mb-1 text-[10px] text-[#9aa0b8]">Willis Plumbing</div>
                    {filled || "Your text will show here."}
                  </div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
                  <div className="border-b border-divider bg-surface-2 px-3 py-2.5">
                    <div className="font-display text-[13px] font-semibold text-text">{subject || "(no subject)"}</div>
                    <div className="mt-0.5 text-[11px] text-faint">Willis Plumbing</div>
                  </div>
                  <div className="px-3 py-2.5 text-[12px] leading-relaxed text-muted">
                    {filled || "Your email will show here."}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* step 4 — schedule */}
        {step === 3 && (
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-text">When should it go out?</div>
            <div className="mb-4 flex gap-2.5">
              {(["now", "later"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setWhen(w)}
                  className={`flex-1 rounded-[10px] border px-3 py-3 text-[13px] font-medium transition-colors ${
                    when === w ? "border-brand bg-brand-tint text-brand-text" : "border-border-strong text-muted"
                  }`}
                >
                  {w === "now" ? "Send now" : "Schedule"}
                </button>
              ))}
            </div>
            {when === "later" && (
              <div className="mb-4 flex gap-2.5">
                <input type="date" className="flex-1 rounded-[10px] border border-border-strong bg-surface px-3 py-2.5 text-[14px] text-text outline-none focus:border-brand" />
                <input type="time" defaultValue="09:00" className="rounded-[10px] border border-border-strong bg-surface px-3 py-2.5 text-[14px] text-text outline-none focus:border-brand" />
              </div>
            )}
            <div className="overflow-hidden rounded-[12px] border border-border">
              <div className="border-b border-divider px-4 py-2.5 font-display text-[14px] font-semibold text-text">Review</div>
              {[
                ["Channel", isSms ? "Text message" : "Email"],
                ["Audience", `${aud.name} (${aud.count})`],
                ["Goes to", `${aud.count} ${isSms ? "text messages" : "inboxes"}`],
                ["Sends", when === "now" ? "Right away" : "On your scheduled date"],
              ].map(([l, v]) => (
                <div key={l} className="flex items-center justify-between gap-3 border-b border-divider px-4 py-2.5 text-[13px] last:border-b-0">
                  <span className="text-muted">{l}</span>
                  <span className="font-semibold text-text">{v}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </CampaignDialog>
  );
}
