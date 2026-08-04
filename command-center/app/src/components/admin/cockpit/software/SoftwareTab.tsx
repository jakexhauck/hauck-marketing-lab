import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import PagePreviewFrame from "./PagePreviewFrame";
import { useClientPreviewToken } from "../../../../hooks/useApi";
import {
  buildSoftwareMap,
  allSoftwarePages,
  resolveRecordPath,
  type SoftwarePage,
} from "../../../../lib/softwareMap";
import { fetchRecordIds, type RecordIds } from "../../../../lib/softwareRecords";
import { ApiError } from "../../../../lib/api";

// Software tab in the Fulfillment cockpit (/admin/delivery/:tenantId?tab=software).
//
// A read-only inventory of the entire client app for one client: every page in
// the rail on the left, the selected one rendered live on the right. The list
// derives itself from nav.ts + pageTabs.ts (see softwareMap.ts), so it stays
// complete without anyone maintaining it.
//
// The frame authenticates with a short-lived preview token carried in the URL
// fragment, never a cookie, so paging through the whole app never disturbs the
// admin session this page is running in.

export default function SoftwareTab({ tenantId }: { tenantId: string }) {
  const groups = useMemo(() => buildSoftwareMap(), []);
  const pages = useMemo(() => allSoftwarePages(groups), [groups]);
  const [selectedId, setSelectedId] = useState<string>(pages[0]?.id ?? "");

  const tokenQuery = useClientPreviewToken(tenantId);
  const token = tokenQuery.data?.token ?? null;

  // Record ids are looked up once per token, using that same token.
  const recordsQuery = useQuery<RecordIds>({
    queryKey: ["admin", "clients", tenantId, "software-records"],
    enabled: !!token,
    staleTime: 5 * 60_000,
    queryFn: () => fetchRecordIds(token as string),
  });
  const recordIds = recordsQuery.data ?? {};

  const selected = pages.find((p) => p.id === selectedId) ?? pages[0];
  const selectedPath = selected ? resolveRecordPath(selected, recordIds) : null;

  const tokenError = tokenQuery.isError
    ? tokenQuery.error instanceof ApiError && tokenQuery.error.status === 404
      ? "This client could not be found."
      : "Could not start the preview. Try reloading the page."
    : null;

  // A record page whose client has no such record yet: say so plainly instead of
  // framing a page that would only 404.
  const waitingOnRecords = Boolean(selected?.needsRecord) && recordsQuery.isLoading;
  const missingRecord = Boolean(selected?.needsRecord) && !waitingOnRecords && !selectedPath;

  return (
    <div>
      <div className="flex min-h-[70vh] gap-5">
        <nav
          aria-label="Client app pages"
          className="w-[230px] shrink-0 self-start overflow-y-auto rounded-[var(--radius-lg)] border border-border bg-surface p-2"
          style={{ maxHeight: "78vh" }}
        >
          {groups.map((group) => (
            <div key={group.id} className="mb-1.5 last:mb-0">
              <div className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
                {group.label}
              </div>
              {group.pages.map((page) => (
                <PageRow
                  key={page.id}
                  page={page}
                  active={page.id === selected?.id}
                  unavailable={
                    Boolean(page.needsRecord) &&
                    !recordsQuery.isLoading &&
                    !resolveRecordPath(page, recordIds)
                  }
                  onSelect={() => setSelectedId(page.id)}
                />
              ))}
            </div>
          ))}
          <div className="px-2.5 py-2 text-[11.5px] text-faint">{pages.length} pages</div>
        </nav>

        {waitingOnRecords ? (
          <div className="pk-empty flex-1">Finding a record to show...</div>
        ) : missingRecord ? (
          <div className="pk-empty flex-1">
            This client has no {recordNoun(selected)} yet, so there is nothing to preview here.
          </div>
        ) : (
          <PagePreviewFrame
            path={selectedPath ?? "/home"}
            label={selected?.label ?? "Home"}
            token={token}
            tokenError={tokenError}
          />
        )}
      </div>
    </div>
  );
}

function recordNoun(page: SoftwarePage | undefined): string {
  switch (page?.needsRecord) {
    case "lead":
      return "leads";
    case "contact":
      return "contacts";
    case "customer":
      return "customers";
    case "conversation":
      return "conversations";
    default:
      return "records";
  }
}

function PageRow({
  page,
  active,
  unavailable,
  onSelect,
}: {
  page: SoftwarePage;
  active: boolean;
  unavailable: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? "page" : undefined}
      className={`flex w-full items-center justify-between gap-2 rounded-[var(--radius)] px-2.5 py-[7px] text-left text-[13px] transition-colors ${
        page.child ? "pl-5" : ""
      } ${
        active
          ? "bg-brand-tint font-semibold text-brand-text"
          : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      <span className="truncate">{page.label}</span>
      {unavailable && (
        <span className="shrink-0 text-[10.5px] font-semibold text-faint">none</span>
      )}
    </button>
  );
}
