import { useRef, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Plus, X } from "lucide-react";
import {
  LIMITS,
  type AdBatch,
  type AdBatchPatch,
  type AdCompetitor,
} from "../../../../../functions/lib/adBatches";
import { useDeleteAdBatch, useUpdateAdBatch } from "../../../../hooks/useApi";
import { BlockInput, LineInput, SectionLabel, SlotNumber, batchDate, batchTitle } from "./adBuilderShared";

// One ad batch, open for writing. The Static and Video lists both draw this;
// Video is the only one that gets the Hook and Script block.
//
// SAVING: there is no Save button. Each block writes itself when it is left,
// and only when it actually changed, so the operator never has to remember
// anything. A PATCH carries exactly the block that was edited, which is what
// makes it safe for two of them to be in flight at once.
//
// The card holds the draft and the server holds the record, and the draft wins
// while the card is open: the list query is never refetched under a live
// cursor. What comes BACK from a save is folded in, because the server cleans
// what it stores (a pasted "facebook.com/x" becomes "https://facebook.com/x")
// and the box should show what was actually kept.

const EMPTY_COMPETITOR: AdCompetitor = { name: "", url: "", notes: "" };

export default function AdBatchCard({
  tenantId,
  batch,
  open,
  onToggle,
}: {
  tenantId: string;
  batch: AdBatch;
  open: boolean;
  onToggle: () => void;
}) {
  const update = useUpdateAdBatch(tenantId);
  const remove = useDeleteAdBatch(tenantId);

  const [draft, setDraft] = useState<AdBatch>(batch);
  // The last version the server confirmed. Every "did this change" question is
  // asked against this, not against the prop, which does not move while the
  // card is open.
  const saved = useRef<AdBatch>(batch);

  // Two-step, deliberately not window.confirm: a modal dialog blocks the whole
  // tab, and this is a button that destroys unlaunched copy.
  const [confirming, setConfirming] = useState(false);

  const save = (patch: AdBatchPatch, apply: (server: AdBatch) => void) => {
    update.mutate(
      { batchId: batch.id, patch },
      {
        onSuccess: ({ batch: server }) => {
          saved.current = server;
          apply(server);
        },
      },
    );
  };

  const saveName = () => {
    if (draft.name === saved.current.name) return;
    save({ name: draft.name }, (s) => setDraft((d) => ({ ...d, name: s.name })));
  };

  const saveCompetitors = () => {
    if (JSON.stringify(draft.competitors) === JSON.stringify(saved.current.competitors)) return;
    save({ competitors: draft.competitors }, (s) =>
      setDraft((d) => ({ ...d, competitors: s.competitors })),
    );
  };

  const saveAngles = () => {
    if (JSON.stringify(draft.angles) === JSON.stringify(saved.current.angles)) return;
    save({ angles: draft.angles }, (s) => setDraft((d) => ({ ...d, angles: s.angles })));
  };

  const saveCopy = () => {
    if (JSON.stringify(draft.copy) === JSON.stringify(saved.current.copy)) return;
    save({ copy: draft.copy }, (s) => setDraft((d) => ({ ...d, copy: s.copy })));
  };

  const saveHeadlines = () => {
    if (JSON.stringify(draft.headlines) === JSON.stringify(saved.current.headlines)) return;
    save({ headlines: draft.headlines }, (s) =>
      setDraft((d) => ({ ...d, headlines: s.headlines })),
    );
  };

  const saveHook = () => {
    if (draft.hook === saved.current.hook) return;
    save({ hook: draft.hook }, (s) => setDraft((d) => ({ ...d, hook: s.hook })));
  };

  const saveScript = () => {
    if (draft.script === saved.current.script) return;
    save({ script: draft.script }, (s) => setDraft((d) => ({ ...d, script: s.script })));
  };

  // Editing one competitor field. Removal saves straight away rather than on
  // blur: a row that disappears from the screen but not from the table is the
  // one edit an operator will never think to check.
  const setCompetitor = (i: number, field: keyof AdCompetitor, value: string) => {
    setDraft((d) => ({
      ...d,
      competitors: d.competitors.map((c, j) => (j === i ? { ...c, [field]: value } : c)),
    }));
  };

  const addCompetitor = () => {
    setDraft((d) => ({ ...d, competitors: [...d.competitors, { ...EMPTY_COMPETITOR }] }));
  };

  const removeCompetitor = (i: number) => {
    const next = draft.competitors.filter((_, j) => j !== i);
    setDraft((d) => ({ ...d, competitors: next }));
    save({ competitors: next }, (s) => setDraft((d) => ({ ...d, competitors: s.competitors })));
  };

  const setAngle = (i: number, value: string) => {
    setDraft((d) => ({ ...d, angles: d.angles.map((a, j) => (j === i ? value : a)) }));
  };

  const addAngle = () => setDraft((d) => ({ ...d, angles: [...d.angles, ""] }));

  const removeAngle = (i: number) => {
    const next = draft.angles.filter((_, j) => j !== i);
    setDraft((d) => ({ ...d, angles: next }));
    save({ angles: next }, (s) => setDraft((d) => ({ ...d, angles: s.angles })));
  };

  const setSlot = (key: "copy" | "headlines", i: number, value: string) => {
    setDraft((d) => {
      const next = [...d[key]] as [string, string, string];
      next[i] = value;
      return { ...d, [key]: next };
    });
  };

  const saveError = update.isError
    ? ((update.error as Error | null)?.message ?? "Could not save that.")
    : null;

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Row header. The whole strip toggles; the delete control sits outside
          the button so a click on it cannot also collapse the card. */}
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-left"
        >
          {open ? (
            <ChevronDown size={15} className="shrink-0 text-faint" />
          ) : (
            <ChevronRight size={15} className="shrink-0 text-faint" />
          )}
          <span className="truncate text-[13.5px] font-semibold text-text">
            {batchTitle(draft)}
          </span>
          <span className="ml-auto shrink-0 text-[11.5px] text-faint">
            {batchDate(batch.createdAt)}
          </span>
        </button>

        {confirming ? (
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => remove.mutate({ batchId: batch.id })}
              disabled={remove.isPending}
              className="text-[12px] font-semibold text-danger disabled:opacity-50"
            >
              Delete for good
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[12px] font-medium text-muted hover:text-text"
            >
              Keep
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={`Delete ${batchTitle(draft)}`}
            className="shrink-0 text-[12px] font-medium text-faint transition-colors hover:text-danger"
          >
            Delete
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <div>
            <SectionLabel hint="what this round is about">Name</SectionLabel>
            <LineInput
              value={draft.name}
              onChange={(v) => setDraft((d) => ({ ...d, name: v }))}
              onBlur={saveName}
              placeholder="Storm damage"
              maxLength={LIMITS.name}
              ariaLabel="Batch name"
              className="max-w-md"
            />
          </div>

          {/* Competitors */}
          <div>
            <SectionLabel hint="whose ads you are reading">Competitors</SectionLabel>
            <div className="flex flex-col gap-2.5">
              {draft.competitors.map((c, i) => (
                <div key={i} className="rounded-[var(--radius)] border border-border bg-surface-2 p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid flex-1 gap-2 sm:grid-cols-2">
                      <LineInput
                        value={c.name}
                        onChange={(v) => setCompetitor(i, "name", v)}
                        onBlur={saveCompetitors}
                        placeholder="Renewal by Andersen"
                        maxLength={LIMITS.competitorName}
                        ariaLabel={`Competitor ${i + 1} name`}
                      />
                      <div className="flex items-center gap-1.5">
                        <LineInput
                          value={c.url}
                          onChange={(v) => setCompetitor(i, "url", v)}
                          onBlur={saveCompetitors}
                          placeholder="Link to their ad"
                          maxLength={LIMITS.competitorUrl}
                          ariaLabel={`Competitor ${i + 1} ad link`}
                        />
                        {/* Only once the link is saved and therefore real. */}
                        {saved.current.competitors[i]?.url ? (
                          <a
                            href={saved.current.competitors[i].url}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Open competitor ${i + 1} ad`}
                            className="shrink-0 text-faint transition-colors hover:text-brand"
                          >
                            <ExternalLink size={15} />
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCompetitor(i)}
                      aria-label={`Remove competitor ${i + 1}`}
                      className="mt-2 shrink-0 text-faint transition-colors hover:text-danger"
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <div className="mt-2">
                    <BlockInput
                      value={c.notes}
                      onChange={(v) => setCompetitor(i, "notes", v)}
                      onBlur={saveCompetitors}
                      placeholder="What is working in it, and what you would do differently."
                      maxLength={LIMITS.competitorNotes}
                      ariaLabel={`Competitor ${i + 1} notes`}
                      rows={2}
                    />
                  </div>
                </div>
              ))}
              {draft.competitors.length < LIMITS.competitors && (
                <AddRow label="Add competitor" onClick={addCompetitor} />
              )}
            </div>
          </div>

          {/* Angles */}
          <div>
            <SectionLabel hint="one line each">Angles</SectionLabel>
            <div className="flex flex-col gap-2">
              {draft.angles.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <LineInput
                    value={a}
                    onChange={(v) => setAngle(i, v)}
                    onBlur={saveAngles}
                    placeholder="Insurance will not cover it next season"
                    maxLength={LIMITS.angle}
                    ariaLabel={`Angle ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeAngle(i)}
                    aria-label={`Remove angle ${i + 1}`}
                    className="shrink-0 text-faint transition-colors hover:text-danger"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
              {draft.angles.length < LIMITS.angles && (
                <AddRow label="Add angle" onClick={addAngle} />
              )}
            </div>
          </div>

          {/* Video only, and in production order: the hook exists before there
              is a script to hang off it. */}
          {batch.kind === "video" && (
            <>
              <div>
                <SectionLabel hint="the first three seconds">Hook</SectionLabel>
                <LineInput
                  value={draft.hook}
                  onChange={(v) => setDraft((d) => ({ ...d, hook: v }))}
                  onBlur={saveHook}
                  placeholder="Your windows are costing you $200 a month and you cannot see it."
                  maxLength={LIMITS.hook}
                  ariaLabel="Hook"
                />
              </div>
              <div>
                <SectionLabel hint="what gets read out">Script</SectionLabel>
                <BlockInput
                  value={draft.script}
                  onChange={(v) => setDraft((d) => ({ ...d, script: v }))}
                  onBlur={saveScript}
                  placeholder="Write it the way it will be said."
                  maxLength={LIMITS.script}
                  ariaLabel="Script"
                  rows={8}
                />
              </div>
            </>
          )}

          {/* The three that launch. */}
          <div>
            <SectionLabel hint="three, no more">Primary copy</SectionLabel>
            <div className="flex flex-col gap-2.5">
              {draft.copy.map((value, i) => (
                <div key={i} className="flex items-start gap-2">
                  <SlotNumber n={i + 1} />
                  <BlockInput
                    value={value}
                    onChange={(v) => setSlot("copy", i, v)}
                    onBlur={saveCopy}
                    placeholder={i === 0 ? "The one you expect to win." : ""}
                    maxLength={LIMITS.copy}
                    ariaLabel={`Primary copy ${i + 1}`}
                    rows={4}
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel hint="three, no more">Headlines</SectionLabel>
            <div className="flex flex-col gap-2">
              {draft.headlines.map((value, i) => (
                <div key={i} className="flex items-start gap-2">
                  <SlotNumber n={i + 1} />
                  <LineInput
                    value={value}
                    onChange={(v) => setSlot("headlines", i, v)}
                    onBlur={saveHeadlines}
                    placeholder={i === 0 ? "Storm-proof before the season turns" : ""}
                    maxLength={LIMITS.headline}
                    ariaLabel={`Headline ${i + 1}`}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* A save that failed has to be visible: everything else about this
              card is silent, so silence must only ever mean success. */}
          {saveError && (
            <p className="text-[12.5px] text-danger">
              {saveError} Your text is still on screen, try leaving the box again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function AddRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 self-start rounded-[var(--radius)] border border-dashed border-border px-2.5 py-1.5 text-[12.5px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
    >
      <Plus size={14} />
      {label}
    </button>
  );
}
