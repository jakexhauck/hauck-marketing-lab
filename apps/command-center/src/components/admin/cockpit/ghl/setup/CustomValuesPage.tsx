import { useState } from "react";
import { Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { CopyButton, SopButton, SOP_FIELD } from "../../../sop/sopKit";
import { useCustomValues, useSaveCustomValue } from "../../../../../hooks/useSopApi";
import { useGhlForm, useGhlNumbers } from "../../../../../hooks/useGhlSetup";
import type { MirrorValue } from "../../../../../../functions/lib/customValuesMirror";
import { Chip, Drawer, ErrorLine, Field, GhlPage, IconBtn, OpenInGhl, PageState, SaveButton, Search, Table, TD, fmtPhone } from "./kit";

// GHL Settings > Custom Values: Name, Key, Value, row actions and the edit
// slide-over, on the live mirror (functions/lib/customValuesMirror.ts). The v13
// snapshot ships 12; checklist B3 says where each one comes from, and the ones
// the onboarding form or the bought number answer fill themselves.

type Edit = { id?: string; name: string; value: string };

export default function CustomValuesPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useCustomValues(tenantId);
  const save = useSaveCustomValue(tenantId);
  const facts = useGhlForm(tenantId).data?.facts ?? null;
  const ghlNumber = useGhlNumbers(tenantId).data?.numbers.find((n) => n.isDefault)?.number ?? "";
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [fillError, setFillError] = useState<unknown>(null);

  if (!q.data) return <PageState title="Custom Values" loading={q.isLoading} error={q.error} />;
  const values = q.data.values;

  // What each snapshot value is filled from, when the source has an answer.
  const sources: Record<string, string> = {};
  if (facts) {
    sources["business name"] = facts.businessName;
    sources["business owner first name"] = facts.ownerFirst;
    sources["business owner full name"] = facts.ownerFull;
    sources["business owner cell number"] = facts.phone ? fmtPhone(facts.phone) : "";
    sources["business phone number"] = facts.phone ? fmtPhone(facts.phone) : "";
  }
  if (ghlNumber) sources["ghl phone number"] = fmtPhone(ghlNumber);
  const fillOf = (v: MirrorValue) => (!v.locked && !v.value.trim() ? sources[v.name.trim().toLowerCase()] ?? "" : "");
  const fillable = values.filter((v) => fillOf(v));
  const setCount = values.filter((v) => v.value.trim()).length;
  const shown = values.filter((v) => `${v.name} ${v.value}`.toLowerCase().includes(search.toLowerCase()));

  // One at a time, so a refusal part way says which value it stopped on.
  const fillAll = async () => {
    setFilling(true);
    setFillError(null);
    try {
      for (const v of fillable) await save.mutateAsync({ id: v.id, name: v.name, value: fillOf(v) });
    } catch (err) {
      setFillError(err);
    } finally {
      setFilling(false);
    }
  };

  return (
    <GhlPage
      title="Custom Values"
      status={<Chip tone={setCount === values.length ? "ok" : "warn"}>{setCount} / {values.length} set</Chip>}
      actions={
        <>
          <SopButton disabled={!fillable.length || filling} onClick={() => void fillAll()}>
            {filling ? "Filling..." : `Fill ${fillable.length || ""} from form`}
          </SopButton>
          <OpenInGhl locationId={locationId} path="settings/custom_values" />
          <SopButton primary onClick={() => setEdit({ name: "", value: "" })}>
            <Plus size={13} aria-hidden /> Add Custom Value
          </SopButton>
        </>
      }
    >
      <ErrorLine error={fillError ?? (!edit ? save.error : null)} />
      <Table head={["Name", "Key", "Value", ""]} toolbar={<Search value={search} onChange={setSearch} placeholder="Search custom values" />}>
        {shown.map((v) => (
          <tr key={v.id}>
            <td className={`${TD} font-semibold`}>
              <span className="flex items-center gap-1.5">
                {v.locked && <Lock size={12} className="text-faint" aria-hidden />}
                {v.name}
              </span>
            </td>
            <td className={TD}>
              <span className="flex items-center gap-1.5">
                <code className="font-data text-[11.5px] text-muted">{v.merge}</code>
                <CopyButton text={v.merge} label="" />
              </span>
            </td>
            <td className={`${TD} max-w-[300px]`}>
              {v.value.trim() ? (
                <span className="block truncate font-data text-[12.5px]" title={v.value}>
                  {v.value}
                </span>
              ) : (
                <Chip tone="warn">Empty</Chip>
              )}
            </td>
            <td className={`${TD} w-[190px]`}>
              {!v.locked && (
                <div className="flex justify-end gap-1">
                  {confirm === v.id ? (
                    <>
                      <SopButton onClick={() => setConfirm(null)}>Keep</SopButton>
                      <SopButton primary disabled={save.isPending} onClick={() => save.mutate({ id: v.id, name: v.name, value: v.value, remove: true }, { onSettled: () => setConfirm(null) })}>
                        Delete
                      </SopButton>
                    </>
                  ) : (
                    <>
                      <IconBtn label="Edit" onClick={() => setEdit({ id: v.id, name: v.name, value: v.value })}>
                        <Pencil size={14} aria-hidden />
                      </IconBtn>
                      <IconBtn label="Delete" onClick={() => setConfirm(v.id)}>
                        <Trash2 size={14} aria-hidden />
                      </IconBtn>
                    </>
                  )}
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>

      <Drawer
        open={!!edit}
        title={edit?.id ? "Edit Custom Value" : "Add Custom Value"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <SopButton onClick={() => setEdit(null)}>Cancel</SopButton>
            <SaveButton busy={save.isPending} disabled={!edit?.name.trim()} onClick={() => edit && save.mutate(edit, { onSuccess: () => setEdit(null) })} />
          </>
        }
      >
        {edit && (
          <div className="flex flex-col gap-3.5">
            <Field label="Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} />
            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between text-[12.5px] font-semibold text-muted">
                Value
                {(() => {
                  const fill = sources[edit.name.trim().toLowerCase()];
                  return fill && fill !== edit.value ? (
                    <button type="button" onClick={() => setEdit({ ...edit, value: fill })} className="text-[11.5px] font-semibold text-warning hover:underline">
                      Form: {fill}
                    </button>
                  ) : null;
                })()}
              </span>
              <textarea className={`${SOP_FIELD} min-h-[110px] font-data text-[12.5px]`} value={edit.value} onChange={(e) => setEdit({ ...edit, value: e.target.value })} />
            </label>
            <ErrorLine error={save.error} />
          </div>
        )}
      </Drawer>
    </GhlPage>
  );
}
