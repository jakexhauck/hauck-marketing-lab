import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { cn } from "../../../lib/cn";
import { COPY_ITEMS, type CopyItemDef, type CopyKind, type LeadPhoto } from "../../../lib/followUpCopy";
import { checkSms, segmentInfo } from "../../../lib/smsRules";
import { useCopyQuery, useSaveCopy, useWriteCopy } from "../../../hooks/useSopApi";
import { CopyButton, SOP_FIELD, SopButton, SopCard, SopError, SopHeading } from "./sopKit";

// Client > GHL > Follow-up Texts. Two sections, each a set of texts Claude
// writes for this client and Jake copies into the GHL workflow:
//   Long Term Nurture   the four LTN texts
//   Lead Form           first text, SMS 3 (+ photo idea), Hail Mary, and the
//                       two alerts (templates, no Claude)
// Every text is editable in place and saved on blur. The checks under a text
// are warnings (src/lib/smsRules.ts), never blocks.

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function FollowUpTextsPanel({ tenantId }: { tenantId: string }) {
  return (
    <div className="flex flex-col gap-6">
      <CopySection tenantId={tenantId} kind="ltn" title="Long Term Nurture" />
      <CopySection tenantId={tenantId} kind="lead_fu" title="Lead Form" />
    </div>
  );
}

function CopySection({ tenantId, kind, title }: { tenantId: string; kind: CopyKind; title: string }) {
  const q = useCopyQuery(tenantId, kind);
  const write = useWriteCopy(tenantId, kind);
  const save = useSaveCopy(tenantId, kind);

  if (q.isLoading) return <SopCard><div className="text-[13px] text-muted">Loading...</div></SopCard>;
  if (q.isError || !q.data) return <SopCard><div className="text-[13px] text-danger">{title} did not load.</div></SopCard>;
  const rec = q.data;
  const hasAny = rec.items.some((i) => i.text.trim() && COPY_ITEMS[kind].find((d) => d.key === i.key)?.ai);
  const busyKey = write.isPending ? (write.variables?.only ?? "all") : null;

  return (
    <SopCard>
      <SopHeading
        right={
          <>
            {rec.writtenAt && <span className="text-[12.5px] text-faint">Written {when(rec.writtenAt)}</span>}
            {kind === "lead_fu" && (
              <PhotoChoice
                value={rec.settings.photo ?? "crew"}
                onChange={(photo) => save.mutate({ settings: { photo } })}
              />
            )}
            <SopButton primary onClick={() => write.mutate({})} disabled={write.isPending}>
              <Sparkles size={14} aria-hidden />
              {busyKey === "all" ? "Writing..." : hasAny ? "Rewrite all" : "Write"}
            </SopButton>
          </>
        }
      >
        {title}
      </SopHeading>
      <SopError error={write.error ?? save.error} />

      <div className="flex flex-col gap-3">
        {COPY_ITEMS[kind].map((def) => {
          const item = rec.items.find((i) => i.key === def.key);
          return (
            <TextCard
              key={def.key}
              def={def}
              text={item?.text ?? ""}
              busy={busyKey === "all" || busyKey === def.key}
              onSave={(text) => save.mutate({ items: [{ key: def.key, text }] })}
              onRewrite={def.ai && !def.note ? () => write.mutate({ only: def.key }) : undefined}
              disabled={write.isPending}
            />
          );
        })}
      </div>
    </SopCard>
  );
}

function PhotoChoice({ value, onChange }: { value: LeadPhoto; onChange: (v: LeadPhoto) => void }) {
  const opts: { v: LeadPhoto; label: string }[] = [
    { v: "crew", label: "Owner and crew" },
    { v: "owner", label: "Owner alone" },
  ];
  return (
    <div className="flex rounded-[var(--radius)] border border-border bg-surface-2 p-0.5" role="radiogroup" aria-label="Photo">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          role="radio"
          aria-checked={value === o.v}
          onClick={() => value !== o.v && onChange(o.v)}
          className={cn(
            "rounded-[calc(var(--radius)-2px)] px-2.5 py-1 text-[12px] font-semibold transition-colors",
            value === o.v ? "bg-surface text-text shadow-[var(--shadow-sm)]" : "text-muted hover:text-text",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TextCard({
  def,
  text,
  busy,
  disabled,
  onSave,
  onRewrite,
}: {
  def: CopyItemDef;
  text: string;
  busy: boolean;
  disabled: boolean;
  onSave: (text: string) => void;
  onRewrite?: () => void;
}) {
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const seg = segmentInfo(draft);
  const problems = def.note || !draft.trim() ? [] : checkSms(draft, { maxSegments: def.ai ? 2 : 4 });

  return (
    <div className={cn("rounded-[var(--radius)] border border-border bg-bg p-3", busy && "opacity-60")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-text">{def.label}</span>
          <span className="text-[12px] text-faint">{def.when}</span>
        </div>
        <div className="flex items-center gap-2">
          {!def.note && draft && (
            <span className="font-data text-[11.5px] text-faint">
              {seg.chars} chars, {seg.segments} {seg.segments === 1 ? "text" : "texts"}
            </span>
          )}
          {onRewrite && (
            <SopButton onClick={onRewrite} disabled={disabled}>
              <RefreshCw size={13} aria-hidden /> Rewrite
            </SopButton>
          )}
          <CopyButton text={draft} />
        </div>
      </div>
      <textarea
        className={cn(SOP_FIELD, "min-h-[84px] resize-y font-body leading-relaxed")}
        value={draft}
        readOnly={!def.ai}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft !== text && onSave(draft)}
        aria-label={def.label}
        rows={def.note ? 2 : 5}
      />
      {problems.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {problems.map((p) => (
            <li key={p} className="text-[12px] text-warning">
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
