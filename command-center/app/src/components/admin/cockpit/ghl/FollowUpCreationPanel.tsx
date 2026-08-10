import { useMemo, useState } from "react";
import { Check, Copy, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { cn } from "../../../../lib/cn";
import {
  BlockInput,
  LineInput,
  SectionLabel,
} from "../paidads/adBuilderShared";
import {
  uploadFollowupAsset,
  useCreateFollowupPage,
  useDeleteFollowupPage,
  useFollowupPagesQuery,
  useUpdateFollowupPage,
} from "../../../../hooks/useApi";
import {
  COLOR_SOURCES,
  COLOR_SOURCE_LABELS,
  DESIGN_SOURCES,
  DESIGN_SOURCE_LABELS,
  FOLLOWUP_STEP_CAP,
  FOLLOWUP_TYPES,
  FOLLOWUP_TYPE_LABELS,
  GALLERY_MINIMUM,
  LIMITS,
  MEDIA_TREATMENTS,
  MEDIA_TREATMENT_LABELS,
  PAGE_TYPES,
  PAGE_TYPE_LABELS,
  WIZARD_STEPS,
  assetsInSlot,
  emptyFollowupPage,
  needsColors,
  nextStep,
  requirementText,
  sequenceIsFull,
  slotsFor,
  smsSegments,
  stepIsComplete,
  type AssetSlot,
  type FollowupPage,
  type FollowupPagePatch,
  type WizardStepId,
} from "../../../../../functions/lib/followupPages";
import {
  SMS_STARTERS,
  buildBrief,
  carryForward,
  missingFields,
} from "../../../../lib/followUpDrafts";
import { parseVariations, promptForDraft } from "../../../../lib/followUpCopyPrompt";

// Fulfillment > GHL > Follow Up Creation.
//
// The followup-page skill, as a screen. The skill's intake is a list of
// questions asked in a fixed order, and asking them in a chat window means the
// answers live in a transcript that is gone the next morning. Here they land in
// a row (0093) and come back out as a brief.
//
// THE ORDER IS THE DESIGN. Client, then which follow-up, then the message.
// Nothing about design, assets or booking is asked until the SMS is approved,
// because the approved message is what decides the page type, and a page type
// picked before the copy exists is a guess that the copy then has to live with.
//
// What this screen does NOT do: write the copy or build the page. The starter
// messages below are patterns lifted off the two live Willis follow-ups, meant
// to be edited. The build is done by running the skill against the brief.

export default function FollowUpCreationPanel({
  tenantId,
  clientName,
  clientSlug,
  clientNiche,
}: {
  tenantId: string;
  clientName: string;
  clientSlug: string;
  clientNiche: string;
}) {
  const query = useFollowupPagesQuery(tenantId);
  const create = useCreateFollowupPage(tenantId);
  const update = useUpdateFollowupPage(tenantId);
  const remove = useDeleteFollowupPage(tenantId);

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);

  // The wizard's working copy. Null means the list is showing. A saved row and
  // an unsaved one are the same shape, so nothing below branches on which it is
  // holding: only `id` being empty says the row has never been written.
  const [draft, setDraft] = useState<FollowupPage | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const step = WIZARD_STEPS[stepIdx];
  const busy = create.isPending || update.isPending;

  const patch = (fields: Partial<FollowupPage>) => {
    setDraft((prev) => (prev ? { ...prev, ...fields } : prev));
  };

  // Everything the row carries, sent whole. One operator drives one wizard, so
  // there is no second writer to race, and sending the full set means a step
  // that quietly changed something upstream cannot be left behind.
  const asPatch = (page: FollowupPage): FollowupPagePatch => ({
    followupType: page.followupType,
    step: page.step,
    slug: page.slug,
    smsBody: page.smsBody,
    pageType: page.pageType,
    designSource: page.designSource,
    designRef: page.designRef,
    colorSource: page.colorSource,
    colors: page.colors,
    designKitUrl: page.designKitUrl,
    logoUrl: page.logoUrl,
    mediaTreatment: page.mediaTreatment,
    assets: page.assets,
    appointmentType: page.appointmentType,
    calendarEmbed: page.calendarEmbed,
    status: page.status,
  });

  // Write the draft. Creates on first save, updates after. The server's cleaned
  // answer is folded back over the draft, which is what makes a pasted
  // "williswindows.com" come back as a real URL and "/Phone Estimate" come back
  // as "phone-estimate" in front of the person who typed it.
  const persist = async (page: FollowupPage): Promise<FollowupPage | null> => {
    setError(null);
    try {
      const res = page.id
        ? await update.mutateAsync({ id: page.id, patch: asPatch(page) })
        : await create.mutateAsync(asPatch(page));
      setDraft(res.page);
      return res.page;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this page.");
      return null;
    }
  };

  const goNext = async () => {
    if (!draft) return;
    // The row is written from the second step on, once there is a sequence to
    // put it in. Starting the wizard and closing it again leaves nothing
    // behind; getting as far as choosing the follow-up leaves a draft that the
    // list can show and delete.
    if (stepIdx >= 1) {
      const saved = await persist(draft);
      if (!saved) return;
    }
    setStepIdx((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  };

  const startNew = (seed?: FollowupPagePatch) => {
    const base = emptyFollowupPage(tenantId);
    const type = (seed?.followupType as FollowupPage["followupType"]) ?? base.followupType;
    setDraft({
      ...base,
      ...(seed as Partial<FollowupPage>),
      followupType: type,
      step: nextStep(pages, type),
    });
    setStepIdx(0);
    setError(null);
  };

  if (query.isLoading) return <div className="pk-empty">Loading follow-ups...</div>;
  if (query.isError) return <div className="pk-empty">Could not load follow-up pages.</div>;

  if (!draft) {
    return (
      <SequenceList
        pages={pages}
        clientName={clientName}
        onNew={() => startNew()}
        onOpen={(page) => {
          setDraft(page);
          setStepIdx(0);
          setError(null);
        }}
        onDelete={(id) => remove.mutate({ id })}
        deleting={remove.isPending}
      />
    );
  }

  const complete = stepIsComplete(step.id, draft);
  const last = stepIdx === WIZARD_STEPS.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <Stepper
        activeIdx={stepIdx}
        draft={draft}
        onJump={(i) => setStepIdx(i)}
        onClose={() => setDraft(null)}
      />

      <div className="rounded-lg border border-border bg-surface p-5">
        <StepBody
          step={step.id}
          draft={draft}
          patch={patch}
          pages={pages}
          clientName={clientName}
          clientSlug={clientSlug}
          clientNiche={clientNiche}
        />
      </div>

      {error && <p className="text-[12.5px] text-danger">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => (stepIdx === 0 ? setDraft(null) : setStepIdx((i) => i - 1))}
          className="rounded-[var(--radius)] border border-border bg-surface px-4 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
        >
          {stepIdx === 0 ? "Cancel" : "Back"}
        </button>

        {last ? (
          <button
            type="button"
            onClick={() => void persist(draft).then((s) => s && setDraft(null))}
            disabled={busy}
            className="rounded-[var(--radius)] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Saving..." : "Save and close"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void goNext()}
            disabled={!complete || busy}
            className="rounded-[var(--radius)] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Next"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

// The client's follow-up pages, in the order they are sent. This is the screen
// the panel opens on, because "what does this client already have" is the
// question that decides whether a new one is even needed.
function SequenceList({
  pages,
  clientName,
  onNew,
  onOpen,
  onDelete,
  deleting,
}: {
  pages: FollowupPage[];
  clientName: string;
  onNew: () => void;
  onOpen: (page: FollowupPage) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[14px] font-semibold text-text">{clientName}</h3>
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Plus size={15} aria-hidden /> New follow-up page
        </button>
      </div>

      {pages.length === 0 ? (
        <div className="pk-empty">No follow-up pages yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {pages.map((page) => (
            <li
              key={page.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3"
            >
              <span className="w-4 shrink-0 font-data text-[12px] font-semibold text-faint tnum">
                {page.step}
              </span>
              <button
                type="button"
                onClick={() => onOpen(page)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-[13.5px] font-semibold text-text">
                  {page.slug ? `/${page.slug}` : "Untitled"}
                </span>
                <span className="block truncate text-[12px] text-faint">
                  {FOLLOWUP_TYPE_LABELS[page.followupType]}
                  {page.pageType ? ` · ${PAGE_TYPE_LABELS[page.pageType]}` : ""}
                </span>
              </button>
              <span className="shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-faint">
                {page.hasSource ? "built" : page.status}
              </span>
              <button
                type="button"
                onClick={() => onDelete(page.id)}
                disabled={deleting}
                aria-label={`Delete ${page.slug || "this page"}`}
                className="shrink-0 rounded-[var(--radius)] border border-border p-1.5 text-faint transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The rail across the top. Only steps already satisfied can be jumped back to:
// the order is the design, and a rail that lets you open Booking before the
// message exists is a rail that undoes it.
function Stepper({
  activeIdx,
  draft,
  onJump,
  onClose,
}: {
  activeIdx: number;
  draft: FollowupPage;
  onJump: (i: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <ol className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
        {WIZARD_STEPS.map((s, i) => {
          const done = stepIsComplete(s.id, draft);
          const active = i === activeIdx;
          const reachable = i <= activeIdx || done;
          return (
            <li key={s.id}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onJump(i)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                  active
                    ? "border-brand bg-brand text-white"
                    : reachable
                      ? "border-border bg-surface text-text hover:border-brand"
                      : "border-border bg-surface text-faint",
                )}
              >
                {s.label}
              </button>
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close the wizard"
        className="shrink-0 rounded-[var(--radius)] border border-border p-1.5 text-faint transition-colors hover:border-brand hover:text-text"
      >
        <X size={15} aria-hidden />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function StepBody({
  step,
  draft,
  patch,
  pages,
  clientName,
  clientSlug,
  clientNiche,
}: {
  step: WizardStepId;
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
  pages: FollowupPage[];
  clientName: string;
  clientSlug: string;
  clientNiche: string;
}) {
  switch (step) {
    case "client":
      return <ClientStep clientName={clientName} count={pages.length} />;
    case "type":
      return <TypeStep draft={draft} patch={patch} pages={pages} />;
    case "sms":
      return (
        <SmsStep
          draft={draft}
          patch={patch}
          clientName={clientName}
          clientNiche={clientNiche}
        />
      );
    case "design":
      return <DesignStep draft={draft} patch={patch} tenantId={draft.tenantId} />;
    case "assets":
      return <AssetsStep draft={draft} patch={patch} tenantId={draft.tenantId} />;
    case "booking":
      return <BookingStep draft={draft} patch={patch} />;
    case "slug":
      return <SlugStep draft={draft} patch={patch} clientSlug={clientSlug} />;
    case "review":
      return <ReviewStep draft={draft} clientName={clientName} clientSlug={clientSlug} />;
    default:
      return null;
  }
}

// Step one confirms rather than picks. The client is already chosen by the
// picker on the title line, and a second picker here would be two controls that
// can disagree about who the work is for.
function ClientStep({ clientName, count }: { clientName: string; count: number }) {
  return (
    <div>
      <SectionLabel>Building for</SectionLabel>
      <p className="text-[15px] font-semibold text-text">{clientName}</p>
      <p className="mt-1 text-[12.5px] text-faint">
        {count === 0
          ? "No follow-up pages yet."
          : `${count} follow-up ${count === 1 ? "page" : "pages"} already.`}{" "}
        Switch client with the picker above.
      </p>
    </div>
  );
}

function TypeStep({
  draft,
  patch,
  pages,
}: {
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
  pages: FollowupPage[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Which follow-up</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {FOLLOWUP_TYPES.map((type) => {
            const full = sequenceIsFull(pages, type) && draft.followupType !== type;
            const cap = FOLLOWUP_STEP_CAP[type];
            return (
              <button
                key={type}
                type="button"
                disabled={full}
                onClick={() =>
                  patch({ followupType: type, step: draft.id ? draft.step : nextStep(pages, type) })
                }
                className={cn(
                  "rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                  draft.followupType === type
                    ? "border-brand bg-brand text-white"
                    : "border-border bg-surface text-text hover:border-brand disabled:opacity-50",
                )}
              >
                {FOLLOWUP_TYPE_LABELS[type]}
                {cap !== null && (
                  <span className="ml-1.5 font-normal opacity-70">{cap} sends</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <SectionLabel>Which send</SectionLabel>
        <div className="flex gap-2">
          {Array.from(
            { length: FOLLOWUP_STEP_CAP[draft.followupType] ?? 4 },
            (_, i) => i + 1,
          ).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => patch({ step: n })}
              className={cn(
                "h-9 w-9 rounded-[var(--radius)] border font-data text-[13px] font-semibold tnum transition-colors",
                draft.step === n
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-text hover:border-brand",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// The gate. The angle is picked first because it is what the copy is written
// FROM, then the starter drops into the box to be edited into a real message.
// Nothing downstream is asked until both exist.
function SmsStep({
  draft,
  patch,
  clientName,
  clientNiche,
}: {
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
  clientName: string;
  clientNiche: string;
}) {
  const seg = smsSegments(draft.smsBody);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>What kind of message</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {PAGE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() =>
                patch({
                  pageType: type,
                  // A starter only ever fills an EMPTY box. Changing the angle
                  // after writing must not throw the writing away.
                  smsBody: draft.smsBody.trim() ? draft.smsBody : SMS_STARTERS[type],
                })
              }
              className={cn(
                "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                draft.pageType === type
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-text hover:border-brand",
              )}
            >
              {PAGE_TYPE_LABELS[type]}
            </button>
          ))}
        </div>
      </div>

      <CopyGenerator
        draft={draft}
        clientName={clientName}
        clientNiche={clientNiche}
        onUse={(text) => patch({ smsBody: text })}
      />

      <div>
        <SectionLabel hint={`${seg.chars} chars, ${seg.segments} ${seg.segments === 1 ? "segment" : "segments"}${seg.unicode ? ", unicode" : ""}`}>
          The message
        </SectionLabel>
        <BlockInput
          value={draft.smsBody}
          onChange={(v) => patch({ smsBody: v })}
          onBlur={() => {}}
          maxLength={LIMITS.sms}
          rows={5}
          ariaLabel="The follow-up SMS"
          placeholder="Hey {{contact.first_name}}!"
        />
        <p className="mt-2 text-[12px] text-faint">
          The link goes on its own line at the end. It is added once the slug is set.
        </p>
      </div>

      <div className="rounded-lg border border-border bg-surface-2 p-3.5">
        <SectionLabel>The two live Willis messages</SectionLabel>
        <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-muted">
          {
            "Hey {{contact.first_name}}! Did you know that we give home estimates over the phone? If you are interested in finding out how exactly we quote houses (and apply the $100 discount), Click here to give this a read \u{1F449} /phone-estimate\n\n{{contact.first_name}}, this one's one of my favorites! A recent full window cleaning near you. Check it out and when you are ready send us a reply and we can get started!\n\n\u{1F449} /recent-cleaning"
          }
        </p>
      </div>
    </div>
  );
}

function DesignStep({
  draft,
  patch,
  tenantId,
}: {
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
  tenantId: string;
}) {
  const askColors = needsColors(draft.designSource, draft.colorSource);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Where the look comes from</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {DESIGN_SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => patch({ designSource: source })}
              className={cn(
                "rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                draft.designSource === source
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-text hover:border-brand",
              )}
            >
              {DESIGN_SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
      </div>

      {draft.designSource === "website" && (
        <>
          <div>
            <SectionLabel>Their website</SectionLabel>
            <LineInput
              value={draft.designRef}
              onChange={(v) => patch({ designRef: v })}
              onBlur={() => {}}
              maxLength={LIMITS.designRef}
              ariaLabel="The website to pull the look from"
              placeholder="williswindows.com"
            />
          </div>

          {/* Lifting a site's palette and being handed exact hexes are
              different instructions, so the wizard asks which one this is. */}
          <div>
            <SectionLabel>Colours</SectionLabel>
            <div className="flex flex-wrap gap-2">
              {COLOR_SOURCES.map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => patch({ colorSource: source })}
                  className={cn(
                    "rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                    draft.colorSource === source
                      ? "border-brand bg-brand text-white"
                      : "border-border bg-surface text-text hover:border-brand",
                  )}
                >
                  {COLOR_SOURCE_LABELS[source]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* A kit carries its own palette and typography, so the upload IS the
          answer and nothing else is asked. */}
      {draft.designSource === "kit" && (
        <FileField
          label="Design kit"
          hint="image, PDF or zip"
          tenantId={tenantId}
          slot="kit"
          accept="image/*,application/pdf,application/zip,.zip"
          url={draft.designKitUrl}
          onChange={(url) => patch({ designKitUrl: url })}
        />
      )}

      {askColors && <ColorPicker draft={draft} patch={patch} />}

      <FileField
        label="Logo"
        tenantId={tenantId}
        slot="logo"
        accept="image/*"
        url={draft.logoUrl}
        onChange={(url) => patch({ logoUrl: url })}
      />
    </div>
  );
}

function ColorPicker({
  draft,
  patch,
}: {
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
}) {
  const [entry, setEntry] = useState("#");

  const addColor = () => {
    const next = entry.trim();
    if (!next || next === "#") return;
    patch({ colors: [...draft.colors, next] });
    setEntry("#");
  };

  return (
    <div>
      <SectionLabel>Colours to use</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        {draft.colors.map((color) => (
          <span
            key={color}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1.5 pr-2.5"
          >
            <span
              aria-hidden
              className="h-4 w-4 rounded-full border border-border"
              style={{ backgroundColor: color }}
            />
            <span className="font-data text-[12px] text-text">{color}</span>
            <button
              type="button"
              onClick={() => patch({ colors: draft.colors.filter((c) => c !== color) })}
              aria-label={`Remove ${color}`}
              className="text-faint transition-colors hover:text-danger"
            >
              <X size={13} aria-hidden />
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(entry) ? entry : "#000000"}
          onChange={(e) => setEntry(e.target.value)}
          aria-label="Pick a colour"
          className="h-9 w-12 shrink-0 cursor-pointer rounded-[var(--radius)] border border-border bg-surface"
        />
        <input
          type="text"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addColor();
            }
          }}
          maxLength={7}
          aria-label="Colour hex"
          placeholder="#4dbb83"
          className="w-32 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 font-data text-[13px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={addColor}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
        >
          <Plus size={14} aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}

// One upload target. Shows a thumbnail once something is there, because the
// single most useful confirmation that the right photo went into the "before"
// slot is seeing the photo in the "before" slot.
function FileField({
  label,
  hint,
  tenantId,
  slot,
  accept,
  url,
  onChange,
}: {
  label: string;
  hint?: string;
  tenantId: string;
  slot: string;
  accept: string;
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
      onChange(await uploadFollowupAsset({ tenantId, slot, file }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const isImage = /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(url);

  return (
    <div>
      <SectionLabel hint={hint}>{label}</SectionLabel>
      <div className="flex flex-wrap items-center gap-3">
        {url && isImage && (
          <img
            src={url}
            alt={label}
            className="h-14 w-14 shrink-0 rounded-[var(--radius)] border border-border object-cover"
          />
        )}
        {url && !isImage && (
          <span className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-2 text-[12.5px] text-muted">
            File attached
          </span>
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
            accept={accept}
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void take(e.target.files?.[0]);
              // Clear it, so choosing the SAME file again after a failure
              // still fires a change event.
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

function AssetsStep({
  draft,
  patch,
  tenantId,
}: {
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
  tenantId: string;
}) {
  // One asset per named slot. Setting an empty url clears the slot, which is
  // what Remove does.
  const setSlot = (slot: AssetSlot, url: string, label = "") => {
    const rest = draft.assets.filter((a) => a.slot !== slot);
    patch({ assets: url ? [...rest, { slot, url, label }] : rest });
  };

  // Gallery and extra are lists, so they append and remove by url rather than
  // replacing the slot.
  const addToList = (slot: AssetSlot, url: string) => {
    patch({ assets: [...draft.assets, { slot, url, label: "" }] });
  };
  const removeFromList = (url: string) => {
    patch({ assets: draft.assets.filter((a) => a.url !== url) });
  };

  const first = (slot: AssetSlot) => assetsInSlot(draft.assets, slot)[0]?.url ?? "";
  const gallery = assetsInSlot(draft.assets, "gallery");
  const extras = assetsInSlot(draft.assets, "extra");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>What this page shows</SectionLabel>
        <div className="flex flex-wrap gap-2">
          {MEDIA_TREATMENTS.map((treatment) => (
            <button
              key={treatment}
              type="button"
              onClick={() => patch({ mediaTreatment: treatment })}
              className={cn(
                "rounded-[var(--radius)] border px-4 py-2.5 text-[13px] font-semibold transition-colors",
                draft.mediaTreatment === treatment
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-surface text-text hover:border-brand",
              )}
            >
              {MEDIA_TREATMENT_LABELS[treatment]}
            </button>
          ))}
        </div>
        {/* Said out loud rather than left to be inferred from the number of
            boxes below it. */}
        <p className="mt-2 text-[13px] font-semibold text-text">
          {requirementText(draft.mediaTreatment)}
        </p>
      </div>

      {/* The named slots. A before/after pair is asked for in order and by
          name, so it cannot be stored the wrong way round. */}
      {slotsFor(draft.mediaTreatment).map((spec) =>
        spec.input === "url" ? (
          <div key={spec.slot}>
            <SectionLabel hint={spec.required ? "required" : "optional"}>
              {spec.label}
            </SectionLabel>
            <LineInput
              value={first(spec.slot)}
              onChange={(v) => setSlot(spec.slot, v)}
              onBlur={() => {}}
              maxLength={LIMITS.designRef}
              ariaLabel={spec.label}
              placeholder="YouTube or Vimeo link"
            />
          </div>
        ) : (
          <FileField
            key={spec.slot}
            label={spec.label}
            hint={spec.required ? "required" : "optional"}
            tenantId={tenantId}
            slot={spec.slot}
            accept="image/*"
            url={first(spec.slot)}
            onChange={(url) => setSlot(spec.slot, url)}
          />
        ),
      )}

      {draft.mediaTreatment === "gallery" && (
        <PhotoList
          label="Gallery photos"
          hint={`${gallery.length} of ${GALLERY_MINIMUM} minimum`}
          tenantId={tenantId}
          slot="gallery"
          urls={gallery.map((a) => a.url)}
          onAdd={(url) => addToList("gallery", url)}
          onRemove={removeFromList}
        />
      )}

      <PhotoList
        label="Any other photos"
        hint="optional"
        tenantId={tenantId}
        slot="extra"
        urls={extras.map((a) => a.url)}
        onAdd={(url) => addToList("extra", url)}
        onRemove={removeFromList}
      />
    </div>
  );
}

// A growing row of thumbnails with one upload button. Used for the gallery and
// for the catch-all extras.
function PhotoList({
  label,
  hint,
  tenantId,
  slot,
  urls,
  onAdd,
  onRemove,
}: {
  label: string;
  hint: string;
  tenantId: string;
  slot: AssetSlot;
  urls: string[];
  onAdd: (url: string) => void;
  onRemove: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Several files at once: picking eight gallery photos one at a time is a
  // chore nobody should be asked to do.
  const take = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        onAdd(await uploadFollowupAsset({ tenantId, slot, file }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <SectionLabel hint={hint}>{label}</SectionLabel>
      <div className="flex flex-wrap items-center gap-2">
        {urls.map((url) => (
          <span key={url} className="relative">
            <img
              src={url}
              alt=""
              className="h-14 w-14 rounded-[var(--radius)] border border-border object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(url)}
              aria-label="Remove photo"
              className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-surface p-0.5 text-faint transition-colors hover:border-danger hover:text-danger"
            >
              <X size={12} aria-hidden />
            </button>
          </span>
        ))}
        <label
          className={cn(
            "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand",
            busy && "opacity-60",
          )}
        >
          <Upload size={14} aria-hidden />
          {busy ? "Uploading..." : "Add photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={busy}
            onChange={(e) => {
              void take(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}

function BookingStep({
  draft,
  patch,
}: {
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>What the appointment is</SectionLabel>
        <LineInput
          value={draft.appointmentType}
          onChange={(v) => patch({ appointmentType: v })}
          onBlur={() => {}}
          maxLength={LIMITS.appointmentType}
          ariaLabel="Appointment type"
          placeholder="Phone estimate"
        />
        <p className="mt-2 text-[12px] text-faint">
          Every line of the page's call to action depends on this. Willis quotes over the phone;
          the next client may send somebody out.
        </p>
      </div>

      <div>
        <SectionLabel>GHL calendar embed</SectionLabel>
        <BlockInput
          value={draft.calendarEmbed}
          onChange={(v) => patch({ calendarEmbed: v })}
          onBlur={() => {}}
          maxLength={LIMITS.calendarEmbed}
          rows={4}
          ariaLabel="GHL calendar embed code"
          placeholder="Paste the embed code from GHL"
        />
        <p className="mt-2 text-[12px] text-faint">
          The calendar sits on the page itself, so the lead reads and books in one place.
        </p>
      </div>
    </div>
  );
}

function SlugStep({
  draft,
  patch,
  clientSlug,
}: {
  draft: FollowupPage;
  patch: (fields: Partial<FollowupPage>) => void;
  clientSlug: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel hint="cleaned on save">The page slug</SectionLabel>
        <LineInput
          value={draft.slug}
          onChange={(v) => patch({ slug: v })}
          onBlur={() => {}}
          maxLength={LIMITS.slug}
          ariaLabel="Page slug"
          placeholder="phone-estimate"
        />
        <p className="mt-2 text-[12px] text-faint">
          Clean and readable. No reference number. The domain is the client's own GHL domain.
        </p>
      </div>

      {draft.slug && <StubBlock slug={draft.slug} clientSlug={clientSlug} />}
    </div>
  );
}

// The two lines that go into the GHL page. Shown as soon as there is a slug,
// because it is the one thing on this screen that gets pasted somewhere else.
function StubBlock({ slug, clientSlug }: { slug: string; clientSlug: string }) {
  const mount = `${clientSlug.replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()}fu`;
  const stub =
    `<div id="${mount}"></div>\n` +
    `<script src="https://app.hauckmarketing.com/sites/${clientSlug}/fu/${slug}.js"></script>`;
  return (
    <div>
      <SectionLabel>The GHL stub</SectionLabel>
      <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-data text-[12px] leading-relaxed text-text">
        {stub}
      </pre>
      <CopyButton text={stub} label="Copy stub" />
    </div>
  );
}

function ReviewStep({
  draft,
  clientName,
  clientSlug,
}: {
  draft: FollowupPage;
  clientName: string;
  clientSlug: string;
}) {
  const missing = missingFields(draft);
  const brief = buildBrief(draft, clientName);

  return (
    <div className="flex flex-col gap-4">
      {missing.length > 0 && (
        <div className="rounded-lg border border-danger/40 bg-surface-2 p-3.5">
          <SectionLabel>Still missing</SectionLabel>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {missing.map((m) => (
              <li key={m} className="text-[13px] text-danger">
                {m}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionLabel>The build brief</SectionLabel>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-surface-2 p-3.5 text-[12.5px] leading-relaxed text-text">
          {brief}
        </pre>
        <CopyButton text={brief} label="Copy brief" />
      </div>

      {draft.slug && <StubBlock slug={draft.slug} clientSlug={clientSlug} />}

      <div className="rounded-lg border border-border bg-surface-2 p-3.5">
        <SectionLabel>Build</SectionLabel>
        <p className="text-[13px] leading-relaxed text-muted">
          {draft.hasSource
            ? "A build exists for this page."
            : "No build yet. Copy the brief and run the followup-page skill against it."}
        </p>
      </div>
    </div>
  );
}

// Generate three messages with Claude, pick one.
//
// This calls the dev-server plugin (vite-plugins/followupCopy.ts), which shells
// out to the local `claude` CLI. No API key: the tokens come out of Jake's own
// Claude allowance.
//
// IT ONLY EXISTS ON LOCALHOST. Cloudflare's runtime cannot spawn a process, so
// in production the route is not there and the panel offers the prompt on the
// clipboard instead. Detection is by CONTENT TYPE, not status code: the deployed
// app answers 200 with the SPA shell for any unknown path, so a status check
// would read "available" and then fail on the JSON parse.
function CopyGenerator({
  draft,
  clientName,
  clientNiche,
  onUse,
}: {
  draft: FollowupPage;
  clientName: string;
  clientNiche: string;
  onUse: (text: string) => void;
}) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [variations, setVariations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [cost, setCost] = useState<number | null>(null);

  const prompt = promptForDraft(draft, clientName, clientNiche, notes);

  const generate = async () => {
    if (!prompt) return;
    setBusy(true);
    setError(null);
    setVariations([]);
    try {
      const res = await fetch("/__local/followup-copy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.headers.get("content-type")?.includes("application/json")) {
        setUnavailable(true);
        return;
      }
      const body = (await res.json()) as { text?: string; costUsd?: number; error?: string };
      if (!res.ok || !body.text) {
        setError(body.error ?? "Could not generate.");
        return;
      }
      const parsed = parseVariations(body.text);
      if (parsed.length === 0) {
        setError("Claude replied, but not in a shape this could read. Try again.");
        return;
      }
      setVariations(parsed);
      setCost(body.costUsd ?? null);
    } catch {
      // A network-level failure here is the dev server being gone, which is the
      // same practical state as the route not existing.
      setUnavailable(true);
    } finally {
      setBusy(false);
    }
  };

  if (!draft.pageType) return null;

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3.5">
      <SectionLabel hint={cost !== null ? `last run $${cost.toFixed(2)}` : undefined}>
        Write it with Claude
      </SectionLabel>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Anything to steer it (optional)"
          aria-label="Extra direction for the copywriter"
          className="min-w-[14rem] flex-1 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13.5px] text-text placeholder:text-faint focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy || unavailable}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] bg-brand px-3.5 py-2 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <Sparkles size={14} aria-hidden />
          {busy ? "Writing three..." : "Generate 3"}
        </button>
      </div>

      {unavailable && prompt && (
        <div className="mt-3">
          <p className="text-[12.5px] text-muted">
            Generating only runs on localhost. Copy the brief and paste it into Claude.
          </p>
          <CopyButton text={prompt} label="Copy prompt" />
        </div>
      )}

      {error && <p className="mt-2 text-[12.5px] text-danger">{error}</p>}

      {variations.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {variations.map((text, i) => (
            <li
              key={i}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text">{text}</p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onUse(text)}
                  className="rounded-[var(--radius)] border border-border bg-surface-2 px-3 py-1.5 text-[12.5px] font-semibold text-text transition-colors hover:border-brand hover:text-brand"
                >
                  Use this
                </button>
                <span className="font-data text-[11.5px] text-faint tnum">
                  {smsSegments(text).chars} chars, {smsSegments(text).segments} seg
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        });
      }}
      className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[13px] font-semibold text-text transition-colors hover:border-brand"
    >
      {done ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {done ? "Copied" : label}
    </button>
  );
}

// Exported for the tab so page two can be started with page one's settings
// already filled in.
export { carryForward };
