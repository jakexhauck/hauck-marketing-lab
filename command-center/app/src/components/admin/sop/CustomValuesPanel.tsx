import { useEffect, useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "../../../lib/cn";
import type { RowState, SheetRow } from "../../../lib/customValuesSheet";
import { useCustomValuesSheet, usePushCustomValues, useSaveCustomValue } from "../../../hooks/useSopApi";
import { CopyButton, SOP_FIELD, SopButton, SopCard, SopError, SopHeading } from "./sopKit";

// Client > GHL > Custom Values. Every custom value the app pushes, the app's
// value beside GHL's, a Copy on each and one Push. The sheet is built on the
// server (src/lib/customValuesSheet.ts); this only draws it and saves edits.

const STATE_DOT: Record<RowState, { cls: string; label: string }> = {
  match: { cls: "bg-positive", label: "Matches GHL" },
  differs: { cls: "bg-warning", label: "Different in GHL" },
  "missing-in-ghl": { cls: "bg-danger", label: "Not in GHL" },
  empty: { cls: "bg-surface-3", label: "Empty" },
  unknown: { cls: "bg-surface-3", label: "GHL not linked" },
};

export default function CustomValuesPanel({ tenantId }: { tenantId: string }) {
  const sheetQ = useCustomValuesSheet(tenantId);
  const push = usePushCustomValues(tenantId);

  if (sheetQ.isLoading) return <div className="pk-empty">Loading...</div>;
  if (sheetQ.isError || !sheetQ.data) return <div className="pk-empty">Custom values did not load.</div>;
  const { sheet, linked } = sheetQ.data;
  const result = push.data;

  return (
    <div className="flex flex-col gap-4">
      <SopCard>
        <SopHeading
          right={
            <>
              <span className="text-[12.5px] text-muted">
                Location API Token: {sheet.token === "set" ? "Set" : sheet.token === "missing" ? "Missing" : "Unknown"}
              </span>
              <SopButton primary onClick={() => push.mutate()} disabled={!linked || push.isPending} title={linked ? undefined : "Link GHL first"}>
                <Upload size={14} aria-hidden /> {push.isPending ? "Pushing..." : "Push to GHL"}
              </SopButton>
            </>
          }
        >
          Custom Values
        </SopHeading>
        {!linked && <p className="text-[12.5px] text-muted">Link GHL first</p>}
        {result && (
          <p className="text-[12.5px] text-muted">
            {result.written.length} written
            {result.failed.length > 0 && `, ${result.failed.length} failed (${result.failed.map((f) => f.name).join(", ")})`}
            {result.notFound.length > 0 && `, not in GHL: ${result.notFound.join(", ")}`}
          </p>
        )}
        <SopError error={push.error} />
      </SopCard>

      {sheet.groups.map((group) => (
        <SopCard key={group.id}>
          <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-faint">{group.label}</h4>
          <div className="flex flex-col divide-y divide-border">
            {group.rows.map((row) => (
              <ValueRow key={row.key} tenantId={tenantId} row={row} />
            ))}
          </div>
        </SopCard>
      ))}
    </div>
  );
}

function ValueRow({ tenantId, row }: { tenantId: string; row: SheetRow }) {
  const save = useSaveCustomValue(tenantId);
  const [value, setValue] = useState(row.appValue);
  useEffect(() => setValue(row.appValue), [row.appValue]);
  const dirty = value.trim() !== row.appValue;
  const dot = STATE_DOT[row.state];

  return (
    <div className="grid grid-cols-1 gap-2 py-3 lg:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-4">
      <div className="flex items-center gap-2">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", dot.cls)} title={dot.label} aria-label={dot.label} />
        <span className="text-[13px] font-medium text-text">{row.customValue}</span>
      </div>
      <input
        className={SOP_FIELD}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => dirty && save.mutate({ key: row.key, value: value.trim() })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        aria-label={row.label}
      />
      <span
        className={cn("truncate text-[12.5px]", row.state === "differs" ? "text-warning" : "text-faint")}
        title={row.ghlValue ?? undefined}
      >
        {row.ghlValue === null ? "" : row.ghlValue || "Blank in GHL"}
      </span>
      <div className="flex items-center gap-2">
        <CopyButton text={value} />
        {save.isPending && <span className="text-[12px] text-faint">Saving</span>}
      </div>
      {save.error ? <SopError error={save.error} /> : null}
    </div>
  );
}
