import { useState } from "react";
import { Zap } from "lucide-react";
import { useGhlWorkflows } from "../../../../../hooks/useGhlSetup";
import { Chip, Drawer, GhlPage, OpenInGhl, PageState, Search, Table, TD } from "./kit";

// GHL Automation > Workflows: the workflows table with status. GHL's API lists
// workflows but cannot edit or publish them, so a row opens what checklist B6
// says to set in that workflow, and a way into GHL's builder.

// Checklist B6, by the words in each snapshot workflow's name.
const CHECKS: [RegExp, string[]][] = [
  [/appointment/i, ['Every "Client" notification goes to the owner', 'Every "Agency" notification goes to Jake', "Phone Appointment trigger on status new", "Home Estimate and Job triggers on status confirmed"]],
  [/tracking/i, ['"Dialer" notification goes to the dialer', '"Non Dialer" notification goes to the owner', "Assign to Dialer is the dialer", "Assign To Owner is the owner", "Assign to Owner/Dialer is whoever takes phone appointments"]],
  [/capi|conversions api/i, ["Lead Form Submitted trigger: the client's Page plus the live lead form", "Token and dataset left as custom values"]],
  [/outcome/i, ['All 3 "Owner" notifications go to the owner']],
  [/lf follow/i, ["Lead Form trigger: the same Page plus form", "Texts rewritten for this client", "Recent work photo swapped for a real job photo"]],
  [/lp follow/i, ["Inbound webhook URL sent to the landing page", "Texts rewritten for this client", "Recent work photo swapped"]],
  [/nurture/i, ["SMS 1 to 4 rewritten", "REWRITE taken off each step name"]],
];
const checksFor = (name: string) => CHECKS.find(([re]) => re.test(name))?.[1] ?? [];
const isLive = (status: string) => /publish|active|live/i.test(status);
const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");

export default function WorkflowsPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useGhlWorkflows(tenantId);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  if (!q.data) return <PageState title="Workflows" loading={q.isLoading} error={q.error} />;
  const flows = q.data.workflows;
  const live = flows.filter((w) => isLive(w.status)).length;
  const shown = flows.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
  const flow = flows.find((w) => w.id === open);

  return (
    <GhlPage
      title="Workflows"
      status={<Chip tone={live === flows.length && flows.length ? "ok" : "warn"}>{live} / {flows.length} published</Chip>}
      actions={<OpenInGhl locationId={locationId} path="automation/workflows" />}
    >
      <Table head={["Name", "Status", "Last Updated"]} toolbar={<Search value={search} onChange={setSearch} placeholder="Search workflows" />}>
        {shown.map((w) => (
          <tr key={w.id} onClick={() => setOpen(w.id)} className="cursor-pointer hover:bg-surface-2">
            <td className={`${TD} font-semibold`}>
              <span className="flex items-center gap-2">
                <Zap size={14} className="text-faint" aria-hidden />
                {w.name}
              </span>
            </td>
            <td className={TD}>{isLive(w.status) ? <Chip tone="ok">Published</Chip> : <Chip>Draft</Chip>}</td>
            <td className={`${TD} whitespace-nowrap text-muted`}>{date(w.updatedAt)}</td>
          </tr>
        ))}
      </Table>

      <Drawer open={!!flow} title={flow?.name ?? ""} onClose={() => setOpen(null)} footer={flow && <OpenInGhl locationId={locationId} path={`automation/workflows/${flow.id}`} label="Open in builder" />}>
        {flow && (
          <div className="flex flex-col gap-3">
            <div>{isLive(flow.status) ? <Chip tone="ok">Published</Chip> : <Chip>Draft</Chip>}</div>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {checksFor(flow.name).map((c) => (
                <li key={c} className="px-4 py-2.5 text-[13px] text-text">
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Drawer>
    </GhlPage>
  );
}
