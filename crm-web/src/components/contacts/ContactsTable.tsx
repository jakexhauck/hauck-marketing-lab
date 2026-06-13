import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ApiContact } from "@hauck/core";
import { cn } from "@/lib/cn";
import { formatDate, formatPhone, relativeTime } from "@/lib/format";
import { Avatar, Badge, Skeleton } from "@/components/ui";

type SortKey = "name" | "created" | "lastActivity";
type SortDir = "asc" | "desc";

function compare(a: ApiContact, b: ApiContact, key: SortKey): number {
  switch (key) {
    case "name":
      return (a.name || "").localeCompare(b.name || "");
    case "created":
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    case "lastActivity":
      return new Date(a.lastActivityAt).getTime() - new Date(b.lastActivityAt).getTime();
  }
}

export function ContactsTable({
  contacts,
  onOpen,
}: {
  contacts: ApiContact[];
  onOpen: (contact: ApiContact) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const rows = [...contacts];
    rows.sort((a, b) => {
      const c = compare(a, b, sortKey);
      return sortDir === "asc" ? c : -c;
    });
    return rows;
  }, [contacts, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Text column defaults A to Z, date columns to newest first.
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-surface-2">
            <tr className="border-b border-border">
              <Th label="Name" sortKey="name" active={sortKey} dir={sortDir} onSort={toggleSort} />
              <th className="label-cap hidden whitespace-nowrap px-3 py-2.5 md:table-cell">Email</th>
              <th className="label-cap hidden whitespace-nowrap px-3 py-2.5 sm:table-cell">Phone</th>
              <th className="label-cap hidden whitespace-nowrap px-3 py-2.5 lg:table-cell">Source</th>
              <th className="label-cap hidden whitespace-nowrap px-3 py-2.5 lg:table-cell">Tags</th>
              <Th
                label="Created"
                sortKey="created"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
                className="hidden md:table-cell"
              />
              <Th
                label="Last activity"
                sortKey="lastActivity"
                active={sortKey}
                dir={sortDir}
                onSort={toggleSort}
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((contact) => (
              <tr
                key={contact.id}
                onClick={() => onOpen(contact)}
                className="cursor-pointer border-b border-divider transition-colors last:border-0 hover:bg-surface-2/60"
              >
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar name={contact.name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-medium text-text">
                        {contact.name || "Unnamed contact"}
                      </div>
                      {/* On narrow widths the email column hides; surface it here. */}
                      <div className="truncate text-[12px] text-faint md:hidden">
                        {contact.email || formatPhone(contact.phone) || ""}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="hidden max-w-[220px] px-3 py-2.5 md:table-cell">
                  <span className="block truncate text-[13px] text-muted">
                    {contact.email || <span className="text-faint">No email</span>}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 sm:table-cell">
                  <span className="font-data text-[12.5px] text-muted">
                    {formatPhone(contact.phone) || <span className="text-faint">No phone</span>}
                  </span>
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 lg:table-cell">
                  <span className="text-[13px] text-muted">
                    {contact.source || <span className="text-faint">Unknown</span>}
                  </span>
                </td>
                <td className="hidden px-3 py-2.5 lg:table-cell">
                  <TagCells tags={contact.tags} />
                </td>
                <td className="hidden whitespace-nowrap px-3 py-2.5 font-data text-[12px] text-muted md:table-cell">
                  {formatDate(contact.createdAt)}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 font-data text-[12px] text-faint">
                  {relativeTime(contact.lastActivityAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TagCells({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return <span className="text-faint">No tags</span>;
  const shown = tags.slice(0, 2);
  const overflow = tags.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((t) => (
        <Badge key={t}>{t}</Badge>
      ))}
      {overflow > 0 && (
        <span className="font-data text-[11px] text-faint">+{overflow}</span>
      )}
    </div>
  );
}

function Th({
  label,
  sortKey,
  active,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const on = active === sortKey;
  return (
    <th className={cn("whitespace-nowrap px-3 py-2.5", className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "label-cap inline-flex items-center gap-1 transition-colors hover:text-text",
          on && "text-text",
        )}
      >
        {label}
        {on ? (
          dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />
        ) : (
          <span className="w-3" aria-hidden />
        )}
      </button>
    </th>
  );
}

export function ContactsTableSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sm)]">
      <div className="border-b border-border bg-surface-2 px-3 py-3">
        <Skeleton className="h-3 w-40" />
      </div>
      <div className="divide-y divide-divider">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-44" />
            <Skeleton className="hidden h-3 w-52 md:block" />
            <Skeleton className="ml-auto h-3 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
