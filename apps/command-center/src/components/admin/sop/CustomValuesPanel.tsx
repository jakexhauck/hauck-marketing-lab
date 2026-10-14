import { useEffect, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCustomValues, useSaveCustomValue } from "../../../hooks/useSopApi";
import type { MirrorValue } from "../../../../functions/lib/customValuesMirror";
import { CopyButton, SOP_FIELD, SopButton, SopCard, SopError, SopHeading } from "./sopKit";

// Client > GHL > Custom Values. A live mirror of the sub-account's own Custom
// Values settings page (Jake, 2026-10-14). Read from GHL on every open and on
// window focus, saved straight back; nothing is kept on our side, so this and
// GHL can never disagree for longer than one refresh.

export default function CustomValuesPanel({ tenantId }: { tenantId: string }) {
  const q = useCustomValues(tenantId);
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  if (q.isLoading) return <div className="pk-empty">Loading...</div>;
  if (q.isError || !q.data) {
    return (
      <SopCard className="max-w-[900px]">
        <SopHeading>Custom Values</SopHeading>
        <SopError error={q.error ?? new Error("Custom values did not load.")} />
      </SopCard>
    );
  }

  const needle = search.trim().toLowerCase();
  const rows = needle
    ? q.data.values.filter(
        (v) => v.name.toLowerCase().includes(needle) || v.value.toLowerCase().includes(needle),
      )
    : q.data.values;

  return (
    <SopCard className="max-w-[900px]">
      <SopHeading
        right={
          <>
            <input
              className={`${SOP_FIELD} w-[200px] py-1.5`}
              placeholder="Search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SopButton onClick={() => void q.refetch()} disabled={q.isFetching} title="Refresh">
              <RefreshCw size={13} className={q.isFetching ? "animate-spin" : undefined} aria-hidden />
            </SopButton>
            <SopButton primary onClick={() => setAdding(true)} disabled={adding}>
              <Plus size={13} aria-hidden /> Add
            </SopButton>
          </>
        }
      >
        Custom Values
      </SopHeading>
      <div className="flex flex-col divide-y divide-border">
        {adding && <ValueRow tenantId={tenantId} onDone={() => setAdding(false)} />}
        {rows.map((v) => (
          <ValueRow key={v.id} tenantId={tenantId} row={v} />
        ))}
        {rows.length === 0 && !adding && (
          <div className="pk-empty">{needle ? "No matches." : "No custom values."}</div>
        )}
      </div>
    </SopCard>
  );
}

function ValueRow({
  tenantId,
  row,
  onDone,
}: {
  tenantId: string;
  row?: MirrorValue;
  onDone?: () => void;
}) {
  const save = useSaveCustomValue(tenantId);
  const [name, setName] = useState(row?.name ?? "");
  const [value, setValue] = useState(row?.value ?? "");
  const [confirming, setConfirming] = useState(false);

  // The query re-reads on focus. Follow GHL only when its copy actually
  // changed, so a refetch mid-edit does not wipe what is being typed.
  const ghlName = row?.name;
  const ghlValue = row?.value;
  useEffect(() => {
    if (ghlName === undefined || ghlValue === undefined) return;
    setName(ghlName);
    setValue(ghlValue);
  }, [ghlName, ghlValue]);

  // Open Lead is written by the app (server refuses edits too). Copy gives the
  // plain tag: the automations add "&c={{contact.id}}" themselves (Jake).
  const locked = !!row?.locked;
  const dirty = !locked && (!row || name !== row.name || value !== row.value);
  const submit = () =>
    save.mutate({ id: row?.id, name, value }, { onSuccess: () => onDone?.() });

  return (
    <div className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${SOP_FIELD} min-w-0 flex-1 py-1.5 font-semibold`}
          placeholder="Name"
          value={name}
          autoFocus={!row}
          readOnly={locked}
          onChange={(e) => setName(e.target.value)}
        />
        {row && (
          <span className="flex items-center gap-1.5">
            <code className="max-w-[260px] truncate font-data text-[12px] text-faint" title={row.merge}>
              {row.merge}
            </code>
            <CopyButton text={row.merge} />
          </span>
        )}
      </div>
      <textarea
        className={`${SOP_FIELD} min-h-[38px] font-data text-[12.5px]`}
        rows={Math.min(6, Math.max(1, Math.ceil(value.length / 90), value.split("\n").length))}
        placeholder="Value"
        value={value}
        readOnly={locked}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SopError error={save.error} />
        {row && !locked && !confirming && (
          <SopButton onClick={() => setConfirming(true)} disabled={save.isPending} title="Delete">
            <Trash2 size={13} aria-hidden />
          </SopButton>
        )}
        {row && confirming && (
          <>
            <SopButton onClick={() => setConfirming(false)}>Keep</SopButton>
            <SopButton
              primary
              disabled={save.isPending}
              onClick={() => save.mutate({ id: row.id, name: row.name, value: row.value, remove: true })}
            >
              Delete
            </SopButton>
          </>
        )}
        {!row && <SopButton onClick={() => onDone?.()}>Cancel</SopButton>}
        {dirty && (
          <SopButton primary onClick={submit} disabled={save.isPending || !name.trim()}>
            {save.isPending ? "Saving..." : "Save"}
          </SopButton>
        )}
      </div>
    </div>
  );
}
