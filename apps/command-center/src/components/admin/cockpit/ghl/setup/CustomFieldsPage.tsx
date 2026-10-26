import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { CopyButton, SopButton } from "../../../sop/sopKit";
import { useGhlFields, useSaveGhlField } from "../../../../../hooks/useGhlSetup";
import { Chip, Drawer, ErrorLine, Field, GhlPage, IconBtn, OpenInGhl, PageState, SaveButton, Search, Table, TD } from "./kit";

// GHL Settings > Custom Fields: the fields table and the Add Field slide-over.
// Checklist B4: rename the snapshot's "ADD ADS FUNNEL QUESTIONS" placeholder to
// the client's real lead form question, one field per extra question. Mapping
// the Facebook form onto these fields has no API, so that step stays in GHL
// (Settings > Integrations > Facebook).

const TYPE_LABEL: Record<string, string> = {
  TEXT: "Single Line",
  LARGE_TEXT: "Multi Line",
  NUMERICAL: "Number",
  PHONE: "Phone",
  MONETORY: "Monetary",
  DATE: "Date Picker",
  CHECKBOX: "Checkbox",
  SINGLE_OPTIONS: "Dropdown (Single)",
  MULTIPLE_OPTIONS: "Dropdown (Multiple)",
  RADIO: "Radio Select",
  TEXTBOX_LIST: "Text Box List",
  FILE_UPLOAD: "File Upload",
};
const PLACEHOLDER = /add ads funnel questions/i;
// The types the server makes (functions/lib/ghlSetup.ts FIELD_TYPES).
const FIELD_TYPES = ["TEXT", "LARGE_TEXT", "NUMERICAL", "PHONE", "MONETORY", "DATE"] as const;

type Edit = { id?: string; name: string; dataType: string; placeholder: string };

export default function CustomFieldsPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useGhlFields(tenantId);
  const save = useSaveGhlField(tenantId);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  if (!q.data) return <PageState title="Custom Fields" loading={q.isLoading} error={q.error} />;
  const fields = q.data.fields;
  const placeholders = fields.filter((f) => PLACEHOLDER.test(f.name)).length;
  const shown = fields.filter((f) => `${f.name} ${f.fieldKey}`.toLowerCase().includes(search.toLowerCase()));
  const typeLabels = FIELD_TYPES.map((t) => TYPE_LABEL[t] ?? t);

  return (
    <GhlPage
      title="Custom Fields"
      status={placeholders ? <Chip tone="warn">Placeholder not renamed</Chip> : <Chip tone="ok">{fields.length} fields</Chip>}
      actions={
        <>
          <OpenInGhl locationId={locationId} path="settings/fields" />
          <OpenInGhl locationId={locationId} path="settings/integrations" label="Facebook form mapping" />
          <SopButton primary onClick={() => setEdit({ name: "", dataType: "TEXT", placeholder: "" })}>
            <Plus size={13} aria-hidden /> Add Field
          </SopButton>
        </>
      }
    >
      <ErrorLine error={!edit ? save.error : null} />
      <Table head={["Field Name", "Field Type", "Object", "Unique Key", ""]} toolbar={<Search value={search} onChange={setSearch} placeholder="Search fields" />}>
        {shown.map((f) => (
          <tr key={f.id}>
            <td className={`${TD} font-semibold`}>
              <span className="flex items-center gap-2">
                {f.name}
                {PLACEHOLDER.test(f.name) && <Chip tone="warn">Rename</Chip>}
              </span>
            </td>
            <td className={`${TD} text-muted`}>{TYPE_LABEL[f.dataType] ?? f.dataType}</td>
            <td className={`${TD} capitalize text-muted`}>{f.model}</td>
            <td className={TD}>
              <span className="flex items-center gap-1.5">
                <code className="max-w-[260px] truncate font-data text-[11.5px] text-muted">{`{{ ${f.fieldKey} }}`}</code>
                <CopyButton text={`{{ ${f.fieldKey} }}`} label="" />
              </span>
            </td>
            <td className={`${TD} w-[170px]`}>
              <div className="flex justify-end gap-1">
                {confirm === f.id ? (
                  <>
                    <SopButton onClick={() => setConfirm(null)}>Keep</SopButton>
                    <SopButton primary disabled={save.isPending} onClick={() => save.mutate({ id: f.id, name: f.name, dataType: f.dataType, placeholder: "", remove: true }, { onSettled: () => setConfirm(null) })}>
                      Delete
                    </SopButton>
                  </>
                ) : (
                  <>
                    <IconBtn label="Edit" onClick={() => setEdit({ id: f.id, name: f.name, dataType: f.dataType, placeholder: f.placeholder })}>
                      <Pencil size={14} aria-hidden />
                    </IconBtn>
                    <IconBtn label="Delete" onClick={() => setConfirm(f.id)}>
                      <Trash2 size={14} aria-hidden />
                    </IconBtn>
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </Table>

      <Drawer
        open={!!edit}
        title={edit?.id ? "Edit Custom Field" : "Add Custom Field"}
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
            <Field label="Field Name" value={edit.name} onChange={(name) => setEdit({ ...edit, name })} />
            {edit.id ? (
              <Field label="Field Type" value={TYPE_LABEL[edit.dataType] ?? edit.dataType} />
            ) : (
              <Field
                label="Field Type"
                value={TYPE_LABEL[edit.dataType] ?? edit.dataType}
                options={typeLabels}
                onChange={(label) => setEdit({ ...edit, dataType: FIELD_TYPES.find((t) => (TYPE_LABEL[t] ?? t) === label) ?? "TEXT" })}
              />
            )}
            <Field label="Placeholder" value={edit.placeholder} onChange={(placeholder) => setEdit({ ...edit, placeholder })} />
            <ErrorLine error={save.error} />
          </div>
        )}
      </Drawer>
    </GhlPage>
  );
}
