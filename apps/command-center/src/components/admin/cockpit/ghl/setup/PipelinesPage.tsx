import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useGhlPipelines } from "../../../../../hooks/useGhlSetup";
import { Chip, GhlPage, OpenInGhl, PageState, Table, TD } from "./kit";

// GHL Opportunities > Pipelines. Checklist B1: every pipeline but Sales
// Pipeline goes (GHL adds a Marketing Pipeline with example deals) and Sales
// Pipeline keeps its 9 stages. GHL's API reads pipelines but cannot change or
// delete them, so this checks and hands the delete to GHL.

const SALES_STAGES = ["Lead", "No Answer", "Estimate Booked", "Job Booked", "Job Completed", "Job/Estimate Cancelled", "Lost", "Follow Up", "Long Term Nurture"];

export default function PipelinesPage({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const q = useGhlPipelines(tenantId);
  const [open, setOpen] = useState<string | null>(null);

  if (!q.data) return <PageState title="Pipelines" loading={q.isLoading} error={q.error} />;
  const pipes = q.data.pipelines;
  const extra = pipes.filter((p) => !p.keep).length;
  const sales = pipes.find((p) => p.keep);

  return (
    <GhlPage
      title="Pipelines"
      status={
        <>
          {extra > 0 && <Chip tone="warn">{extra} to delete</Chip>}
          {!sales ? <Chip tone="bad">No Sales Pipeline</Chip> : sales.stagesMatch ? <Chip tone="ok">Sales Pipeline stages match</Chip> : <Chip tone="warn">Sales Pipeline stages changed</Chip>}
        </>
      }
      actions={<OpenInGhl locationId={locationId} path="opportunities/pipelines" />}
    >
      <Table head={["Pipeline Name", "No. of Stages", "Opportunities", "", ""]}>
        {pipes.map((p) => (
          <Fragment key={p.id}>
            <tr>
              <td className={TD}>
                <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="flex items-center gap-1.5 font-semibold text-text hover:text-brand-text">
                  {open === p.id ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                  {p.name}
                </button>
              </td>
              <td className={`${TD} text-muted`}>{p.stages.length}</td>
              <td className={`${TD} text-muted`}>{p.opportunities ?? ""}</td>
              <td className={TD}>{p.keep ? <Chip tone="ok">Keep</Chip> : <Chip tone="warn">Delete</Chip>}</td>
              <td className={`${TD} w-[170px] text-right`}>{!p.keep && <OpenInGhl locationId={locationId} path="opportunities/pipelines" label="Delete in GHL" />}</td>
            </tr>
            {open === p.id && (
              <tr>
                <td colSpan={5} className="bg-surface-2 px-4 py-3">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {p.stages.map((s, i) => {
                      const wrong = p.keep && s !== SALES_STAGES[i];
                      return (
                        <div key={`${s}${i}`} className={`flex min-w-[118px] flex-col gap-1 rounded-[var(--radius)] border bg-surface px-2.5 py-2 ${wrong ? "border-warning" : "border-border"}`}>
                          <span className="font-data text-[10.5px] text-faint">{i + 1}</span>
                          <span className="text-[12.5px] font-semibold text-text">{s}</span>
                          {wrong && <span className="text-[11px] font-semibold text-warning">{SALES_STAGES[i] ?? "Extra"}</span>}
                        </div>
                      );
                    })}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </Table>
    </GhlPage>
  );
}
