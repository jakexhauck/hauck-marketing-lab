import { useState } from "react";
import { Pencil, Plus, UserMinus } from "lucide-react";
import { CopyButton, SopButton } from "../../../sop/sopKit";
import { useGhlForm, useGhlStaff, useGhlStaffAction } from "../../../../../hooks/useGhlSetup";
import type { StaffInput, StaffUser } from "../../../../../../functions/lib/ghlSetup";
import { Avatar, Chip, Drawer, ErrorLine, Field, GhlPage, IconBtn, OpenInGhl, PageState, SaveButton, Search, Table, TD, fmtPhone, samePhone } from "./kit";

// GHL Settings > My Staff (Team Management): the staff table and the Add
// Employee slide-over. Checklist B2: Jake, the owner with their real cell (the
// auto-calls ring it), and a dialer only if someone else calls new leads.
// Before Workflows and Calendars, because both pick these users.

type Edit = { id: string | null; input: StaffInput };

const blank: StaffInput = { firstName: "", lastName: "", email: "", phone: "", role: "user" };

export default function StaffPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useGhlStaff(tenantId);
  const facts = useGhlForm(tenantId).data?.facts ?? null;
  const act = useGhlStaffAction(tenantId);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [password, setPassword] = useState<{ email: string; password: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  if (!q.data) return <PageState title="Team Management" loading={q.isLoading} error={q.error} />;
  const { users, jakeIn } = q.data;
  const isOwner = (u: StaffUser) => !!facts && ((!!facts.email && u.email.toLowerCase() === facts.email.toLowerCase()) || samePhone(u.phone, facts.phone));
  const ownerIn = users.some(isOwner);
  const shown = users.filter((u) => `${u.firstName} ${u.lastName} ${u.email}`.toLowerCase().includes(search.toLowerCase()));

  const submit = () => {
    if (!edit) return;
    if (edit.id) {
      act.mutate({ kind: "edit", id: edit.id, input: edit.input }, { onSuccess: () => setEdit(null) });
    } else {
      act.mutate(
        { kind: "new", input: edit.input },
        {
          onSuccess: (d) => {
            setEdit(null);
            if (d.password) setPassword({ email: edit.input.email, password: d.password });
          },
        },
      );
    }
  };
  const patch = (k: keyof StaffInput) => (v: string) => setEdit((e) => (e ? { ...e, input: { ...e.input, [k]: v } } : e));

  return (
    <GhlPage
      title="Team Management"
      status={
        <>
          {!jakeIn && <Chip tone="warn">Jake not added</Chip>}
          {facts && <Chip tone={ownerIn ? "ok" : "warn"}>{ownerIn ? "Owner added" : "Owner not added"}</Chip>}
        </>
      }
      actions={
        <>
          {!jakeIn && (
            <SopButton disabled={act.isPending} onClick={() => act.mutate({ kind: "jake" })}>
              Add Jake
            </SopButton>
          )}
          {facts && !ownerIn && (
            <SopButton onClick={() => setEdit({ id: null, input: { firstName: facts.ownerFirst, lastName: facts.ownerLast, email: facts.email, phone: facts.phone, role: "admin" } })}>
              Add owner from form
            </SopButton>
          )}
          <OpenInGhl locationId={locationId} path="settings/staff/team" />
          <SopButton primary onClick={() => setEdit({ id: null, input: blank })}>
            <Plus size={13} aria-hidden /> Add Employee
          </SopButton>
        </>
      }
    >
      <ErrorLine error={!edit ? act.error : null} />
      {password && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand bg-brand-tint px-4 py-3 text-[13px] text-text">
          <span className="font-semibold">{password.email}</span>
          <code className="font-data">{password.password}</code>
          <CopyButton text={password.password} />
          <button type="button" onClick={() => setPassword(null)} className="ml-auto text-[12px] font-semibold text-muted hover:text-text">
            Done
          </button>
        </div>
      )}
      <Table head={["Name", "Email", "Phone", "User Type", ""]} toolbar={<Search value={search} onChange={setSearch} placeholder="Search staff" />}>
        {shown.map((u) => (
          <tr key={u.id}>
            <td className={TD}>
              <div className="flex items-center gap-2.5">
                <Avatar name={`${u.firstName} ${u.lastName}`} />
                <span className="font-semibold capitalize">
                  {u.firstName} {u.lastName}
                </span>
                {isOwner(u) && <Chip tone="ok">Owner</Chip>}
              </div>
            </td>
            <td className={`${TD} text-muted`}>{u.email}</td>
            <td className={`${TD} font-data`}>{u.phone ? fmtPhone(u.phone) : <span className="text-danger">No phone</span>}</td>
            <td className={TD}>
              <Chip tone={u.role === "admin" ? "info" : "idle"}>
                {u.type === "agency" ? "Agency" : "Account"} {u.role === "admin" ? "Admin" : "User"}
              </Chip>
            </td>
            <td className={`${TD} w-[200px]`}>
              <div className="flex justify-end gap-1">
                {removing === u.id ? (
                  <>
                    <SopButton onClick={() => setRemoving(null)}>Keep</SopButton>
                    <SopButton primary disabled={act.isPending} onClick={() => act.mutate({ kind: "remove", id: u.id }, { onSettled: () => setRemoving(null) })}>
                      Remove from account
                    </SopButton>
                  </>
                ) : (
                  <>
                    <IconBtn label="Edit" onClick={() => setEdit({ id: u.id, input: { firstName: u.firstName, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role === "admin" ? "admin" : "user" } })}>
                      <Pencil size={14} aria-hidden />
                    </IconBtn>
                    <IconBtn label="Remove from this account" onClick={() => setRemoving(u.id)}>
                      <UserMinus size={14} aria-hidden />
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
        title={edit?.id ? "Edit Employee" : "Add Employee"}
        onClose={() => setEdit(null)}
        footer={
          <>
            <SopButton onClick={() => setEdit(null)}>Cancel</SopButton>
            <SaveButton label={edit?.id ? "Save" : "Add Employee"} busy={act.isPending} disabled={!edit?.input.firstName.trim() || !edit?.input.email.trim()} onClick={submit} />
          </>
        }
      >
        {edit && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="First Name" value={edit.input.firstName} onChange={patch("firstName")} />
              <Field label="Last Name" value={edit.input.lastName} onChange={patch("lastName")} />
              <Field label="Email" value={edit.input.email} onChange={edit.id ? undefined : patch("email")} className="sm:col-span-2" />
              <Field label="Phone" value={edit.input.phone} onChange={patch("phone")} form={facts && !edit.id && edit.input.email === facts.email && !samePhone(edit.input.phone, facts.phone) ? facts.phone : undefined} />
              <Field label="User Role" value={edit.input.role === "admin" ? "Admin" : "User"} options={["Admin", "User"]} onChange={(v) => patch("role")(v === "Admin" ? "admin" : "user")} />
            </div>
            <ErrorLine error={act.error} />
          </div>
        )}
      </Drawer>
    </GhlPage>
  );
}
