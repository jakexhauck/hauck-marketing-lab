import { ExternalLink, Plus, X } from "lucide-react";
import {
  LIMITS,
  type AdCompetitor,
  type AdWorkspace,
} from "../../../../../functions/lib/adWorkspace";
import { BlockInput, LineInput, SectionLabel, SlotNumber } from "./adBuilderShared";
import type { SaveBlock } from "./adBuilderShared";

// Page 1 of 3: Copy & Angles (0091).
//
// What the ads are written FROM and what they are written AS: the competitors
// worth reading, the angles those produce, and the three primaries and three
// headlines that get launched.
//
// Three of each, still, and there is no Add button for a fourth. That is the
// one rule 0088 got right and it survived the batch being retired: an array
// with an Add button quietly becomes nine of each by March.
//
// Saving is on blur, one block per PATCH, exactly as the rest of the builder.
// Structural edits (removing a competitor or an angle) save at once, because a
// row that disappears from the screen but not from the table is the one edit
// nobody thinks to check.

const EMPTY_COMPETITOR: AdCompetitor = { name: "", url: "", notes: "" };

export default function AdCopyPanel({
  draft,
  saved,
  setDraft,
  save,
}: {
  draft: AdWorkspace;
  // What the server last confirmed, for the "did this actually change" test.
  saved: AdWorkspace;
  setDraft: (fn: (d: AdWorkspace) => AdWorkspace) => void;
  save: SaveBlock;
}) {
  const saveCompetitors = (next?: AdCompetitor[]) => {
    const value = next ?? draft.competitors;
    if (JSON.stringify(value) === JSON.stringify(saved.competitors)) return;
    save({ competitors: value });
  };

  const saveAngles = (next?: string[]) => {
    const value = next ?? draft.angles;
    if (JSON.stringify(value) === JSON.stringify(saved.angles)) return;
    save({ angles: value });
  };

  const saveCopy = () => {
    if (JSON.stringify(draft.copy) === JSON.stringify(saved.copy)) return;
    save({ copy: draft.copy });
  };

  const saveHeadlines = () => {
    if (JSON.stringify(draft.headlines) === JSON.stringify(saved.headlines)) return;
    save({ headlines: draft.headlines });
  };

  const setCompetitor = (i: number, field: keyof AdCompetitor, value: string) => {
    setDraft((d) => ({
      ...d,
      competitors: d.competitors.map((c, j) => (j === i ? { ...c, [field]: value } : c)),
    }));
  };

  const addCompetitor = () =>
    setDraft((d) => ({ ...d, competitors: [...d.competitors, { ...EMPTY_COMPETITOR }] }));

  const removeCompetitor = (i: number) => {
    const next = draft.competitors.filter((_, j) => j !== i);
    setDraft((d) => ({ ...d, competitors: next }));
    saveCompetitors(next);
  };

  const setAngle = (i: number, value: string) =>
    setDraft((d) => ({ ...d, angles: d.angles.map((a, j) => (j === i ? value : a)) }));

  const addAngle = () => setDraft((d) => ({ ...d, angles: [...d.angles, ""] }));

  const removeAngle = (i: number) => {
    const next = draft.angles.filter((_, j) => j !== i);
    setDraft((d) => ({ ...d, angles: next }));
    saveAngles(next);
  };

  const setSlot = (key: "copy" | "headlines", i: number, value: string) => {
    setDraft((d) => {
      const next = [...d[key]] as [string, string, string];
      next[i] = value;
      return { ...d, [key]: next };
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <SectionLabel>Competitors</SectionLabel>
        <div className="flex flex-col gap-2.5">
          {draft.competitors.map((c, i) => (
            <div key={i} className="rounded-[var(--radius)] border border-border bg-surface-2 p-3">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <LineInput
                    value={c.name}
                    onChange={(v) => setCompetitor(i, "name", v)}
                    onBlur={() => saveCompetitors()}
                    placeholder="Renewal by Andersen"
                    maxLength={LIMITS.competitorName}
                    ariaLabel={`Competitor ${i + 1} name`}
                  />
                  <div className="flex items-center gap-1.5">
                    <LineInput
                      value={c.url}
                      onChange={(v) => setCompetitor(i, "url", v)}
                      onBlur={() => saveCompetitors()}
                      placeholder="Link to their ad"
                      maxLength={LIMITS.competitorUrl}
                      ariaLabel={`Competitor ${i + 1} ad link`}
                    />
                    {/* Only once the link is saved and therefore real. */}
                    {saved.competitors[i]?.url ? (
                      <a
                        href={saved.competitors[i].url}
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
                  onBlur={() => saveCompetitors()}
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

      <div>
        <SectionLabel>Angles</SectionLabel>
        <div className="flex flex-col gap-2">
          {draft.angles.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <LineInput
                value={a}
                onChange={(v) => setAngle(i, v)}
                onBlur={() => saveAngles()}
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
          {draft.angles.length < LIMITS.angles && <AddRow label="Add angle" onClick={addAngle} />}
        </div>
      </div>

      <div>
        <SectionLabel>Primary copy</SectionLabel>
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
        <SectionLabel>Headlines</SectionLabel>
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
