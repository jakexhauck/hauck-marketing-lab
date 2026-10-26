import { useState } from "react";
import { MessageSquare, Phone, Plus } from "lucide-react";
import { SopButton } from "../../../sop/sopKit";
import { useBuyGhlNumber, useGhlAvailableNumbers, useGhlForm, useGhlNumbers } from "../../../../../hooks/useGhlSetup";
import type { AvailableNumber } from "../../../../../../functions/lib/ghlSetup";
import { Chip, Drawer, ErrorLine, Field, GhlPage, OpenInGhl, PageState, Table, Tabs, TD, fmtPhone, samePhone } from "./kit";

// GHL Settings > Phone Numbers: the numbers table, the Add Number slide-over,
// and the settings GHL keeps beside them. Checklist A2 + A3: one local number on
// the client's area code, made the default (the Tracking auto-calls dial from
// it), calls forwarded to the owner's cell, message compliance off, recording
// and transcription on, A2P submitted. The API buys numbers and reads them; the
// default, forwarding and the rest have no API, so those rows open GHL.

const TABS = [
  { id: "numbers", label: "Phone Numbers" },
  { id: "settings", label: "Settings" },
] as const;

export default function PhoneNumbersPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useGhlNumbers(tenantId);
  const facts = useGhlForm(tenantId).data?.facts ?? null;
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("numbers");
  const [adding, setAdding] = useState(false);

  if (!q.data) return <PageState title="Phone Numbers" loading={q.isLoading} error={q.error} />;
  const numbers = q.data.numbers;
  const def = numbers.find((n) => n.isDefault);
  const forwarded = !!def && !!facts?.phone && samePhone(def.forwarding, facts.phone);

  const settings: { label: string; state: "ok" | "warn" | "check"; detail?: string; path: string }[] = [
    { label: "A local number", state: numbers.length ? "ok" : "warn", detail: numbers.length ? fmtPhone(numbers[0].number) : "None", path: "settings/phone_number" },
    { label: "Default number", state: def ? "ok" : "warn", detail: def ? fmtPhone(def.number) : "None set", path: "settings/phone_number" },
    { label: "Inbound calls forwarded to the owner's cell", state: forwarded ? "ok" : def?.forwarding ? "warn" : "check", detail: def?.forwarding ? fmtPhone(def.forwarding) : undefined, path: "settings/phone_number" },
    { label: "Message compliance off (all 3 boxes, type CONFIRM)", state: "check", path: "settings/phone_number" },
    { label: "Call recording and transcription on", state: "check", path: "settings/phone_number" },
    { label: "A2P registration submitted", state: "check", path: "settings/phone_number" },
  ];

  return (
    <GhlPage
      title="Phone Numbers"
      status={!numbers.length ? <Chip tone="warn">No number</Chip> : !def ? <Chip tone="warn">No default number</Chip> : <Chip tone="ok">{fmtPhone(def.number)}</Chip>}
      actions={
        <>
          <OpenInGhl locationId={locationId} path="settings/phone_number" />
          <SopButton primary onClick={() => setAdding(true)}>
            <Plus size={13} aria-hidden /> Add Number
          </SopButton>
        </>
      }
    >
      <Tabs tabs={TABS} active={tab} onChange={setTab} />

      {tab === "numbers" && (
        <Table head={["Phone Number", "Capabilities", "Type", "Forwarding Number", ""]}>
          {numbers.length === 0 && (
            <tr>
              <td colSpan={5} className={`${TD} py-8 text-center text-muted`}>
                No numbers
              </td>
            </tr>
          )}
          {numbers.map((n) => (
            <tr key={n.number}>
              <td className={TD}>
                <div className="flex flex-col">
                  <span className="font-data font-semibold">{fmtPhone(n.number)}</span>
                  <span className="text-[11.5px] text-faint">{n.name}</span>
                </div>
              </td>
              <td className={TD}>
                <span className="flex gap-1.5 text-muted">
                  {n.voice && <Phone size={14} aria-label="Voice" />}
                  {n.sms && <MessageSquare size={14} aria-label="SMS" />}
                </span>
              </td>
              <td className={`${TD} capitalize text-muted`}>{n.type}</td>
              <td className={`${TD} font-data`}>{n.forwarding ? fmtPhone(n.forwarding) : <span className="text-faint">None</span>}</td>
              <td className={TD}>{n.isDefault && <Chip tone="ok">Default</Chip>}</td>
            </tr>
          ))}
        </Table>
      )}

      {tab === "settings" && (
        <div className="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {settings.map((s) => (
            <div key={s.label} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="text-[13px] font-semibold text-text">{s.label}</span>
              {s.detail && <span className="font-data text-[12.5px] text-muted">{s.detail}</span>}
              <span className="ml-auto flex items-center gap-2">
                {s.state === "ok" ? <Chip tone="ok">Done</Chip> : s.state === "warn" ? <Chip tone="warn">To do</Chip> : <Chip>Check in GHL</Chip>}
                <OpenInGhl locationId={locationId} path={s.path} label="Open" />
              </span>
            </div>
          ))}
        </div>
      )}

      {adding && <AddNumber tenantId={tenantId} defaultArea={facts?.phone ? facts.phone.slice(2, 5) : ""} onClose={() => setAdding(false)} />}
    </GhlPage>
  );
}

function AddNumber({ tenantId, defaultArea, onClose }: { tenantId: string; defaultArea: string; onClose: () => void }) {
  const [area, setArea] = useState(defaultArea);
  const offered = useGhlAvailableNumbers(tenantId, area);
  const buy = useBuyGhlNumber(tenantId);
  const [confirm, setConfirm] = useState<AvailableNumber | null>(null);

  return (
    <Drawer open title="Add Number" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Area Code" value={area} onChange={(v) => setArea(v.replace(/\D/g, "").slice(0, 3))} />
        <ErrorLine error={offered.error ?? buy.error} />
        {offered.isFetching ? (
          <div className="py-6 text-center text-[13px] text-muted">Searching...</div>
        ) : offered.data && !offered.data.available.length ? (
          <div className="py-6 text-center text-[13px] text-muted">No numbers on {area}</div>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {(offered.data?.available ?? []).map((n) => (
              <div key={n.number} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="flex flex-col">
                  <span className="font-data text-[13px] font-semibold text-text">{n.label}</span>
                  <span className="text-[11.5px] text-faint">
                    {[n.locality, n.region].filter(Boolean).join(", ")}
                  </span>
                </span>
                {confirm?.number === n.number ? (
                  <span className="flex items-center gap-2">
                    <SopButton onClick={() => setConfirm(null)}>Cancel</SopButton>
                    <SopButton primary disabled={buy.isPending} onClick={() => buy.mutate({ number: n.number, fingerprintId: offered.data?.fingerprintId ?? "" }, { onSuccess: onClose })}>
                      {buy.isPending ? "Buying..." : `Buy${n.price !== null ? ` for $${n.price.toFixed(2)}/mo` : ""}`}
                    </SopButton>
                  </span>
                ) : (
                  <SopButton onClick={() => setConfirm(n)}>Buy</SopButton>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
