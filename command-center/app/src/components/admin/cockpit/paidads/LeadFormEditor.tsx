import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Plus, Upload, X } from "lucide-react";
import {
  COMPLETION_CTAS,
  COMPLETION_CTA_LABELS,
  FORM_LIMITS,
  INTENT_LABEL,
  INTENT_NOTE,
  LEAD_FORM_INTENTS,
  ctaNeeds,
  formToText,
  type CompletionCta,
  type Consent,
  type IntroLayout,
  type LeadForm,
  type LeadFormIntent,
  type LeadFormPatch,
  type LeadQuestion,
  type TrackingParam,
} from "../../../../../functions/lib/adLeadForms";
import { uploadAssetPhoto, useUpdateLeadForm } from "../../../../hooks/useApi";
import { cn } from "../../../../lib/cn";
import { BlockInput, LineInput, SectionLabel, Toggle } from "./adBuilderShared";
import LeadFormQuestions from "./LeadFormQuestions";
import LeadFormPreview, { META_ACCENT, META_ACCENT_FG } from "./LeadFormPreview";

// One lead form, open for writing. Meta's builder, in Meta's order (0099).
//
// The frame is the conversion-asset studio's: form on the left, the thing being
// built drawing itself on the right, one panel with a divider down the middle
// and the whole viewport to work in. What is inside the left pane is Meta's
// instant form builder, section for section, so building the real form is a walk
// down this page rather than a hunt for which box matches which.
//
// NOT a wizard. Meta shows the whole form at once and so does this: a form is
// edited by jumping to the part you are unhappy with, and a Next button between
// Intro and Questions would be a step nobody asked for.
//
// SAVING: no Save button, same contract as before. Each block writes itself when
// it is left and only when it changed; structural edits (a toggle, an added row,
// a reordered question) write at once. The editor holds the draft and the list
// query is never refetched under a live cursor.

type SectionId = "type" | "intro" | "questions" | "privacy" | "completion" | "settings";

// Meta's own language list is long and changes. These are the ones a US local
// service business will ever pick, offered as suggestions on a free-text box.
const LOCALES = ["English (US)", "English (UK)", "Spanish", "French", "German", "Portuguese"];

export default function LeadFormEditor({
  tenantId,
  clientName,
  form,
  onClose,
}: {
  tenantId: string;
  clientName: string;
  form: LeadForm;
  onClose: () => void;
}) {
  const update = useUpdateLeadForm(tenantId);

  const [draft, setDraft] = useState<LeadForm>(form);
  // What the server last confirmed. Every "did this actually change" question is
  // asked against this, never against the draft.
  const saved = useRef<LeadForm>(form);
  // Settings is shut by default: it is the only section a form can ship without
  // anybody opening. Everything above it is the form.
  const [open, setOpen] = useState<Set<SectionId>>(
    new Set<SectionId>(["type", "intro", "questions", "privacy", "completion"]),
  );

  const toggleSection = (id: SectionId) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = (patch: LeadFormPatch) => {
    update.mutate(
      { formId: form.id, patch },
      {
        onSuccess: ({ form: server }) => {
          saved.current = server;
          // Fold back only the keys that were sent, so a block being typed in
          // another section is left exactly as typed.
          setDraft((d) => {
            const next: Record<string, unknown> = { ...d };
            const fresh = server as unknown as Record<string, unknown>;
            for (const key of Object.keys(patch)) next[key] = fresh[key];
            return next as unknown as LeadForm;
          });
        },
      },
    );
  };

  // One helper per plain-text field: compare against what the server confirmed,
  // send only that key.
  type TextKey = keyof LeadFormPatch & keyof LeadForm;
  const commit = (key: TextKey) => () => {
    if (draft[key] === saved.current[key]) return;
    save({ [key]: draft[key] } as LeadFormPatch);
  };

  const set = (key: keyof LeadForm) => (v: string) => setDraft((d) => ({ ...d, [key]: v }));

  // A structural edit: written into the draft and sent in the same breath,
  // because it is a click with a visible result and there is no blur coming.
  const setNow = <K extends TextKey>(key: K, value: LeadForm[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    save({ [key]: value } as LeadFormPatch);
  };

  const saveQuestions = (questions: LeadQuestion[]) => {
    if (JSON.stringify(questions) === JSON.stringify(saved.current.questions)) return;
    save({ questions });
  };

  const saveError = update.isError
    ? ((update.error as Error | null)?.message ?? "Could not save that.")
    : null;

  const needs = ctaNeeds(draft.completionCtaType);

  return (
    // The Meta scope. Overriding --brand here repaints every accent inside the
    // editor in one place rather than threading a colour through twenty
    // components, and it is Facebook's blue because this screen is a Facebook
    // surface being drafted.
    //
    // The height is what makes it "fill the page": the admin page is a normally
    // flowing document, so without one this is a short card floating in a tall
    // page and the preview gets a few hundred pixels to draw a whole form in.
    // Only from xl up: below that the two panes stack, and a stacked pair inside
    // a fixed height is two scrollbars fighting over one screen.
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-border bg-surface",
        "xl:flex xl:h-[calc(100vh-13rem)] xl:min-h-[34rem] xl:flex-col",
      )}
      style={{ "--brand": META_ACCENT, "--brand-fg": META_ACCENT_FG } as CSSProperties}
    >
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row xl:items-stretch">
        <div className="flex min-w-0 flex-col border-border xl:w-[46%] xl:shrink-0 xl:border-r">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            {/* The name is the title, so it is edited as the title rather than
                as the first field of the first section. */}
            <input
              type="text"
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              onBlur={commit("name")}
              placeholder="Untitled form"
              maxLength={FORM_LIMITS.name}
              aria-label="Form name"
              className="min-w-0 flex-1 rounded-[var(--radius)] border border-transparent bg-transparent px-2 py-1.5 text-[14px] font-semibold text-text placeholder:text-faint hover:border-border focus:border-brand focus:outline-none"
            />
            <CopyFormButton form={draft} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close this form"
              className="shrink-0 rounded-[var(--radius)] border border-border p-1.5 text-faint transition-colors hover:border-brand hover:text-text"
            >
              <X size={14} aria-hidden />
            </button>
          </div>

          {/* min-w-0 is load-bearing: without it a long URL stops this flex
              child shrinking and shoves the preview off. min-h-0 is the
              vertical twin, or the sections do not scroll, they just grow. */}
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
            <Section
              id="type"
              title="Form type"
              summary={INTENT_LABEL[draft.intent]}
              open={open}
              onToggle={toggleSection}
            >
              <div className="flex flex-col gap-2">
                {LEAD_FORM_INTENTS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setNow("intent", k as LeadFormIntent)}
                    aria-pressed={draft.intent === k}
                    className={cn(
                      "rounded-[var(--radius)] border px-3.5 py-2.5 text-left transition-colors",
                      draft.intent === k
                        ? "border-brand bg-brand/10"
                        : "border-border bg-surface hover:border-brand",
                    )}
                  >
                    <span className="block text-[13px] font-semibold text-text">
                      {INTENT_LABEL[k]}
                    </span>
                    <span className="block text-[12px] text-faint">{INTENT_NOTE[k]}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section
              id="intro"
              title="Intro"
              summary={draft.introHeadline.trim() ? "written" : "empty"}
              open={open}
              onToggle={toggleSection}
            >
              <div className="flex flex-col gap-3.5">
                <ImageField
                  tenantId={tenantId}
                  url={draft.introImageUrl}
                  onChange={(url) => setNow("introImageUrl", url)}
                />

                <div>
                  <SectionLabel>Greeting headline</SectionLabel>
                  <LineInput
                    value={draft.introHeadline}
                    onChange={set("introHeadline")}
                    onBlur={commit("introHeadline")}
                    placeholder="Get your free storm damage assessment"
                    maxLength={FORM_LIMITS.introHeadline}
                    ariaLabel="Greeting headline"
                  />
                </div>

                <div>
                  <SectionLabel hint="one line per item when it is a list">
                    Description
                  </SectionLabel>
                  <BlockInput
                    value={draft.introDescription}
                    onChange={set("introDescription")}
                    onBlur={commit("introDescription")}
                    placeholder="Free, no obligation&#10;Same-week appointments"
                    maxLength={FORM_LIMITS.introDescription}
                    ariaLabel="Intro description"
                    rows={3}
                  />
                  <div className="mt-2 flex gap-1">
                    {(["paragraph", "list"] as IntroLayout[]).map((layout) => (
                      <button
                        key={layout}
                        type="button"
                        onClick={() => setNow("introLayout", layout)}
                        aria-pressed={draft.introLayout === layout}
                        className={cn(
                          "rounded-full px-3 py-1 text-[11.5px] font-semibold capitalize transition-colors",
                          draft.introLayout === layout
                            ? "bg-brand text-brand-fg"
                            : "bg-surface-2 text-muted hover:text-text",
                        )}
                      >
                        {layout}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Section>

            <Section
              id="questions"
              title="Questions"
              summary={`${draft.questions.length}`}
              open={open}
              onToggle={toggleSection}
            >
              <LeadFormQuestions
                questions={draft.questions}
                onChange={(questions) => setDraft((d) => ({ ...d, questions }))}
                onCommit={saveQuestions}
              />
            </Section>

            <Section
              id="privacy"
              title="Privacy"
              summary={draft.privacyUrl ? "linked" : "no link"}
              open={open}
              onToggle={toggleSection}
            >
              <div className="flex flex-col gap-3.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <SectionLabel>Policy URL</SectionLabel>
                    <LineInput
                      value={draft.privacyUrl}
                      onChange={set("privacyUrl")}
                      onBlur={commit("privacyUrl")}
                      placeholder="williswindows.com/privacy"
                      maxLength={500}
                      ariaLabel="Privacy policy URL"
                    />
                  </div>
                  <div>
                    <SectionLabel>Shown as</SectionLabel>
                    <LineInput
                      value={draft.privacyLinkText}
                      onChange={set("privacyLinkText")}
                      onBlur={commit("privacyLinkText")}
                      placeholder="Privacy policy"
                      maxLength={FORM_LIMITS.privacyLinkText}
                      ariaLabel="Privacy link text"
                    />
                  </div>
                </div>

                <div>
                  <SectionLabel hint="optional">Custom disclaimer</SectionLabel>
                  <div className="flex flex-col gap-2">
                    <LineInput
                      value={draft.disclaimerTitle}
                      onChange={set("disclaimerTitle")}
                      onBlur={commit("disclaimerTitle")}
                      placeholder="Title"
                      maxLength={FORM_LIMITS.disclaimerTitle}
                      ariaLabel="Disclaimer title"
                    />
                    <BlockInput
                      value={draft.privacyDisclaimer}
                      onChange={set("privacyDisclaimer")}
                      onBlur={commit("privacyDisclaimer")}
                      placeholder="Your own notice, if this offer needs one."
                      maxLength={FORM_LIMITS.disclaimer}
                      ariaLabel="Privacy disclaimer"
                      rows={2}
                    />
                  </div>
                </div>

                <ConsentList
                  consents={draft.consents}
                  onDraft={(consents) => setDraft((d) => ({ ...d, consents }))}
                  onCommit={(consents) => setNow("consents", consents)}
                />
              </div>
            </Section>

            <Section
              id="completion"
              title="Completion"
              summary={COMPLETION_CTA_LABELS[draft.completionCtaType]}
              open={open}
              onToggle={toggleSection}
            >
              <div className="flex flex-col gap-3.5">
                <div>
                  <SectionLabel>Headline</SectionLabel>
                  <LineInput
                    value={draft.completionHeadline}
                    onChange={set("completionHeadline")}
                    onBlur={commit("completionHeadline")}
                    placeholder="Thanks, we will call within 24 hours"
                    maxLength={FORM_LIMITS.completionHeadline}
                    ariaLabel="Completion headline"
                  />
                </div>

                <div>
                  <SectionLabel>Description</SectionLabel>
                  <BlockInput
                    value={draft.completionBody}
                    onChange={set("completionBody")}
                    onBlur={commit("completionBody")}
                    placeholder="Anything they should do or expect next."
                    maxLength={FORM_LIMITS.completionBody}
                    ariaLabel="Completion body"
                    rows={2}
                  />
                </div>

                <div>
                  <SectionLabel>Button</SectionLabel>
                  <div className="flex flex-wrap gap-1">
                    {COMPLETION_CTAS.map((cta) => (
                      <button
                        key={cta}
                        type="button"
                        onClick={() => setNow("completionCtaType", cta as CompletionCta)}
                        aria-pressed={draft.completionCtaType === cta}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                          draft.completionCtaType === cta
                            ? "bg-brand text-brand-fg"
                            : "bg-surface-2 text-muted hover:text-text",
                        )}
                      >
                        {COMPLETION_CTA_LABELS[cta]}
                      </button>
                    ))}
                  </div>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <LineInput
                      value={draft.completionCta}
                      onChange={set("completionCta")}
                      onBlur={commit("completionCta")}
                      placeholder={COMPLETION_CTA_LABELS[draft.completionCtaType]}
                      maxLength={FORM_LIMITS.completionCta}
                      ariaLabel="Button text"
                    />
                    {/* Only the field this button kind actually uses. Meta hides
                        the other one and so does this: a URL box beside a Call
                        business button is a box somebody fills in for nothing. */}
                    {needs === "url" && (
                      <LineInput
                        value={draft.completionUrl}
                        onChange={set("completionUrl")}
                        onBlur={commit("completionUrl")}
                        placeholder="williswindows.com"
                        maxLength={500}
                        ariaLabel="Button URL"
                      />
                    )}
                    {needs === "phone" && (
                      <LineInput
                        value={draft.completionPhone}
                        onChange={set("completionPhone")}
                        onBlur={commit("completionPhone")}
                        placeholder="(609) 555 0142"
                        maxLength={FORM_LIMITS.completionPhone}
                        ariaLabel="Button phone number"
                      />
                    )}
                  </div>
                </div>
              </div>
            </Section>

            <Section
              id="settings"
              title="Settings"
              summary={draft.sharing === "open" ? "shared" : "restricted"}
              open={open}
              onToggle={toggleSection}
            >
              <div className="flex flex-col gap-3.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <SectionLabel>Language</SectionLabel>
                    <input
                      list="meta-form-locales"
                      value={draft.locale}
                      onChange={(e) => set("locale")(e.target.value)}
                      onBlur={commit("locale")}
                      placeholder="English (US)"
                      maxLength={FORM_LIMITS.locale}
                      aria-label="Form language"
                      className="w-full rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
                    />
                    <datalist id="meta-form-locales">
                      {LOCALES.map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <SectionLabel>Sharing</SectionLabel>
                    <div className="flex gap-1">
                      {(["restricted", "open"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setNow("sharing", s)}
                          aria-pressed={draft.sharing === s}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-[11.5px] font-semibold capitalize transition-colors",
                            draft.sharing === s
                              ? "bg-brand text-brand-fg"
                              : "bg-surface-2 text-muted hover:text-text",
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <TrackingList
                  params={draft.trackingParams}
                  onDraft={(trackingParams) => setDraft((d) => ({ ...d, trackingParams }))}
                  onCommit={(trackingParams) => setNow("trackingParams", trackingParams)}
                />
              </div>
            </Section>
          </div>

          {/* A save that failed has to be visible: everything else about this
              editor is silent, so silence must only ever mean success. */}
          {saveError && (
            <p className="border-t border-border px-4 py-2.5 text-[12.5px] text-danger">
              {saveError} Your text is still on screen, try leaving the box again.
            </p>
          )}
        </div>

        <LeadFormPreview form={draft} clientName={clientName} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  summary: string;
  open: Set<SectionId>;
  onToggle: (id: SectionId) => void;
  children: ReactNode;
}) {
  const isOpen = open.has(id);
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        {isOpen ? (
          <ChevronDown size={14} className="shrink-0 text-faint" aria-hidden />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-faint" aria-hidden />
        )}
        <span className="text-[13px] font-semibold text-text">{title}</span>
        <span className="ml-auto shrink-0 text-[11.5px] text-faint">{summary}</span>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// The intro background image. Uploaded to the same public bucket the conversion
// assets use, because it is the same thing: a tenant's marketing image that has
// to resolve from a plain URL. The paste-out carries the link, and the person
// building the real form uploads it in Ads Manager.
function ImageField({
  tenantId,
  url,
  onChange,
}: {
  tenantId: string;
  url: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await uploadAssetPhoto({ tenantId, slot: "extra", file }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionLabel hint="optional">Background image</SectionLabel>
      <div className="flex flex-wrap items-center gap-3">
        {url && (
          <img
            src={url}
            alt="Intro background"
            className="h-14 w-20 shrink-0 rounded-[var(--radius)] border border-border object-cover"
          />
        )}
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand",
            busy && "opacity-60",
          )}
        >
          <Upload size={14} aria-hidden />
          {busy ? "Uploading..." : url ? "Replace" : "Upload"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void take(e.target.files?.[0]);
              // Cleared, so choosing the SAME file again after a failure still
              // fires a change event.
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="text-[12.5px] text-faint transition-colors hover:text-danger"
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

// Meta's consent checkboxes. A list rather than another paragraph because each
// one is its own tick with its own wording, and whether it may be skipped is
// per tick.
function ConsentList({
  consents,
  onDraft,
  onCommit,
}: {
  consents: Consent[];
  onDraft: (c: Consent[]) => void;
  onCommit: (c: Consent[]) => void;
}) {
  return (
    <div>
      <SectionLabel hint={consents.length ? `${consents.length} of ${FORM_LIMITS.consents}` : "optional"}>
        Consent checkboxes
      </SectionLabel>

      <div className="flex flex-col gap-2">
        {consents.map((c, i) => (
          <div key={i} className="flex items-start gap-2">
            <BlockInput
              value={c.text}
              onChange={(text) => onDraft(consents.map((x, j) => (j === i ? { ...x, text } : x)))}
              onBlur={() => onCommit(consents)}
              placeholder="I agree to be contacted about my quote."
              maxLength={FORM_LIMITS.consentText}
              ariaLabel={`Consent ${i + 1}`}
              rows={2}
            />
            <span className="mt-1 flex shrink-0 items-center gap-1.5">
              <Toggle
                on={c.optional}
                onClick={() =>
                  onCommit(consents.map((x, j) => (j === i ? { ...x, optional: !x.optional } : x)))
                }
                label="Optional"
              />
              <button
                type="button"
                onClick={() => onCommit(consents.filter((_, j) => j !== i))}
                aria-label={`Remove consent ${i + 1}`}
                className="text-faint transition-colors hover:text-danger"
              >
                <X size={14} aria-hidden />
              </button>
            </span>
          </div>
        ))}
      </div>

      {consents.length < FORM_LIMITS.consents && (
        <button
          type="button"
          onClick={() => onDraft([...consents, { text: "", optional: false }])}
          className="mt-2 flex items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Plus size={13} aria-hidden />
          Add checkbox
        </button>
      )}
    </div>
  );
}

// Meta's tracking parameters, which come back attached to every lead. Keys are
// narrowed to a key on the way in, so what is typed here is what arrives.
function TrackingList({
  params,
  onDraft,
  onCommit,
}: {
  params: TrackingParam[];
  onDraft: (p: TrackingParam[]) => void;
  onCommit: (p: TrackingParam[]) => void;
}) {
  return (
    <div>
      <SectionLabel hint={params.length ? `${params.length}` : "optional"}>
        Tracking parameters
      </SectionLabel>

      <div className="flex flex-col gap-2">
        {params.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <LineInput
              value={p.key}
              onChange={(key) => onDraft(params.map((x, j) => (j === i ? { ...x, key } : x)))}
              onBlur={() => onCommit(params)}
              placeholder="source"
              maxLength={FORM_LIMITS.trackingKey}
              ariaLabel={`Parameter ${i + 1} key`}
            />
            <LineInput
              value={p.value}
              onChange={(value) => onDraft(params.map((x, j) => (j === i ? { ...x, value } : x)))}
              onBlur={() => onCommit(params)}
              placeholder="storm_q3"
              maxLength={FORM_LIMITS.trackingValue}
              ariaLabel={`Parameter ${i + 1} value`}
            />
            <button
              type="button"
              onClick={() => onCommit(params.filter((_, j) => j !== i))}
              aria-label={`Remove parameter ${i + 1}`}
              className="shrink-0 text-faint transition-colors hover:text-danger"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      {params.length < FORM_LIMITS.trackingParams && (
        <button
          type="button"
          onClick={() => onDraft([...params, { key: "", value: "" }])}
          className="mt-2 flex items-center gap-1.5 rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1 text-[12px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
        >
          <Plus size={13} aria-hidden />
          Add parameter
        </button>
      )}
    </div>
  );
}

// The whole draft as plain text. This is what the screen exists to produce.
//
// Deliberately not a toast: the button becomes a tick for a moment and goes
// back. A toast for something this frequent is noise.
function CopyFormButton({ form }: { form: LeadForm }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    try {
      // Can reject on an insecure origin or a denied permission, and a silent
      // no-op would read as the button being broken.
      await navigator.clipboard.writeText(formToText(form));
      setFailed(false);
      setDone(true);
      window.setTimeout(() => setDone(false), 1600);
    } catch {
      setFailed(true);
      window.setTimeout(() => setFailed(false), 2600);
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${form.name.trim() || "this form"} as text`}
      className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface-2 px-2.5 py-1.5 text-[12px] font-semibold text-text transition-colors hover:border-brand"
    >
      {done ? <Check size={13} className="text-success" /> : <Copy size={13} />}
      {failed ? "Could not copy" : done ? "Copied" : "Copy form"}
    </button>
  );
}
