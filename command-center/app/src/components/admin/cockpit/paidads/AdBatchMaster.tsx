import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type { AdBatch } from "../../../../../functions/lib/adBatches";
import { ReadBlock, SectionLabel, SlotNumber, batchDate, batchTitle } from "./adBuilderShared";

// Master: everything written for this client, static and video in one list,
// newest first, and READ ONLY.
//
// Read only on purpose. Two boxes that write the same row from two pages is how
// one of them ends up showing yesterday's text, and the point of this page is
// to be the one place you can trust to be the whole picture. Editing happens on
// Static or Video.

export default function AdBatchMaster({ batches }: { batches: AdBatch[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      {batches.map((batch) => {
        const open = openId === batch.id;
        return (
          <div key={batch.id} className="overflow-hidden rounded-lg border border-border bg-surface">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : batch.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-2.5 px-3 py-3 text-left"
            >
              {open ? (
                <ChevronDown size={15} className="shrink-0 text-faint" />
              ) : (
                <ChevronRight size={15} className="shrink-0 text-faint" />
              )}
              <KindChip kind={batch.kind} />
              <span className="truncate text-[13.5px] font-semibold text-text">
                {batchTitle(batch)}
              </span>
              <span className="ml-auto shrink-0 text-[11.5px] text-faint">
                {batchDate(batch.createdAt)}
              </span>
            </button>

            {open && (
              <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
                <div>
                  <SectionLabel>Competitors</SectionLabel>
                  {batch.competitors.length === 0 ? (
                    <p className="text-[13px] italic text-faint">None recorded.</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {batch.competitors.map((c, i) => (
                        <li
                          key={i}
                          className="rounded-[var(--radius)] border border-border bg-surface-2 p-3"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-text">
                              {c.name || "Unnamed"}
                            </span>
                            {c.url ? (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="flex items-center gap-1 text-[12px] font-medium text-brand hover:underline"
                              >
                                Their ad
                                <ExternalLink size={12} />
                              </a>
                            ) : null}
                          </div>
                          {c.notes ? (
                            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-snug text-muted">
                              {c.notes}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <SectionLabel>Angles</SectionLabel>
                  {batch.angles.length === 0 ? (
                    <p className="text-[13px] italic text-faint">None recorded.</p>
                  ) : (
                    <ul className="flex list-disc flex-col gap-1 pl-5">
                      {batch.angles.map((a, i) => (
                        <li key={i} className="text-[13.5px] leading-snug text-text">
                          {a}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {batch.kind === "video" && (
                  <>
                    <div>
                      <SectionLabel>Hook</SectionLabel>
                      <ReadBlock value={batch.hook} empty="No hook written." />
                    </div>
                    <div>
                      <SectionLabel>Script</SectionLabel>
                      <ReadBlock value={batch.script} empty="No script written." />
                    </div>
                  </>
                )}

                <div>
                  <SectionLabel>Primary copy</SectionLabel>
                  <div className="flex flex-col gap-3">
                    {batch.copy.map((value, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <SlotNumber n={i + 1} />
                        <div className="min-w-0 flex-1">
                          <ReadBlock value={value} empty="Empty." />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <SectionLabel>Headlines</SectionLabel>
                  <div className="flex flex-col gap-1.5">
                    {batch.headlines.map((value, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <SlotNumber n={i + 1} />
                        <div className="min-w-0 flex-1">
                          <ReadBlock value={value} empty="Empty." />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Master is the only view holding both kinds, so it is the only one that has to
// say which is which.
function KindChip({ kind }: { kind: AdBatch["kind"] }) {
  return (
    <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
      {kind}
    </span>
  );
}
