import { useEffect, useState } from "react";
import { SopButton } from "../../../sop/sopKit";
import { useGhlForm, useGhlProfile, useSaveGhlProfile } from "../../../../../hooks/useGhlSetup";
import type { ProfileInput } from "../../../../../../functions/lib/ghlSetup";
import { Chip, ErrorLine, Field, GhlPage, OpenInGhl, PageState, Panel, SaveButton, fmtPhone, samePhone } from "./kit";

// GHL Settings > Business Profile: General Information beside Business Physical
// Address, each card with its own update button. Checklist B1: fill from the
// onboarding form, never Allen Park, and the timezone is the one that matters
// (the call window and every calendar run on it).

type Key = keyof ProfileInput;

export default function BusinessProfilePage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useGhlProfile(tenantId);
  const facts = useGhlForm(tenantId).data?.facts ?? null;
  const save = useSaveGhlProfile(tenantId);
  const [draft, setDraft] = useState<ProfileInput | null>(null);

  const p = q.data?.profile;
  useEffect(() => {
    if (p) setDraft({ name: p.name, phone: p.phone, website: p.website, address: p.address, city: p.city, state: p.state, postalCode: p.postalCode, country: p.country, timezone: p.timezone });
  }, [p]);

  if (!p || !draft) return <PageState title="Business Profile" loading={q.isLoading} error={q.error} />;

  const form: Partial<ProfileInput> = facts
    ? { name: facts.businessName, phone: facts.phone, website: facts.website, address: facts.street, city: facts.city, state: facts.state, postalCode: facts.zip, country: facts.country, timezone: facts.timezone }
    : {};
  const same = (k: Key) => {
    const f = form[k];
    if (!f) return true;
    return k === "phone" ? samePhone(f, draft[k]) : f.trim().toLowerCase() === draft[k].trim().toLowerCase();
  };
  const differ = (Object.keys(form) as Key[]).filter((k) => !same(k)).length;
  const dirty = (Object.keys(draft) as Key[]).some((k) => draft[k] !== ((p as unknown as Record<string, string>)[k] ?? ""));
  const set = (k: Key) => (v: string) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const f = (k: Key, label: string, extra?: { options?: string[]; className?: string }) => (
    <Field
      label={label}
      value={k === "phone" ? fmtPhone(draft[k]) : draft[k]}
      onChange={set(k)}
      form={form[k] && !same(k) ? (k === "phone" ? fmtPhone(form[k]!) : form[k]) : undefined}
      {...extra}
    />
  );
  const timezones = Array.from(new Set([...(q.data?.timezones ?? []), draft.timezone, form.timezone ?? ""].filter(Boolean)));
  const submit = () => save.mutate(draft);

  return (
    <GhlPage
      title="Business Profile"
      status={!facts ? <Chip>No onboarding form</Chip> : differ ? <Chip tone="warn">{differ} differ from the form</Chip> : <Chip tone="ok">Matches the form</Chip>}
      actions={
        <>
          <SopButton disabled={!differ} onClick={() => setDraft((d) => (d ? { ...d, ...Object.fromEntries(Object.entries(form).filter(([, v]) => v)) } : d))}>
            Fill from form
          </SopButton>
          <OpenInGhl locationId={locationId} path="settings/company" />
        </>
      }
    >
      <ErrorLine error={save.error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="General Information" footer={<SaveButton label="Update Information" busy={save.isPending} disabled={!dirty} onClick={submit} />}>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {f("name", "Business Name", { className: "sm:col-span-2" })}
            {f("phone", "Business Phone")}
            <Field label="Business Email" value={p.email} />
            {f("website", "Business Website", { className: "sm:col-span-2" })}
          </div>
        </Panel>

        <Panel title="Business Physical Address" footer={<SaveButton label="Update Address" busy={save.isPending} disabled={!dirty} onClick={submit} />}>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {f("address", "Street Address", { className: "sm:col-span-2" })}
            {f("city", "City")}
            {f("postalCode", "Postal/Zip Code")}
            {f("state", "State/Prov/Region")}
            {f("country", "Country", { options: ["US", "CA"] })}
            {f("timezone", "Time Zone", { options: timezones, className: "sm:col-span-2" })}
          </div>
        </Panel>
      </div>
    </GhlPage>
  );
}
