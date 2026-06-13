import { useState } from "react";
import { X, Phone, Mail, Copy, Check, StickyNote, ListTodo } from "lucide-react";
import type { ApiContact } from "@hauck/core";
import { cn } from "@/lib/cn";
import { formatDate, formatPhone, relativeTime } from "@/lib/format";
import { Avatar, Badge, Drawer, Segmented, type SegmentOption } from "@/components/ui";
import { NotesPanel } from "@/components/shared/NotesPanel";
import { TasksPanel } from "@/components/shared/TasksPanel";

type Tab = "notes" | "tasks";

const TABS: SegmentOption<Tab>[] = [
  { value: "notes", label: "Notes" },
  { value: "tasks", label: "Tasks" },
];

// The contacts list endpoint already returns the full ApiContact, so the drawer
// renders straight from the row object: no per-contact fetch. The shared Notes
// and Tasks panels own their own data via contactId.
export function ContactDrawer({
  contact,
  onClose,
}: {
  contact: ApiContact;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("notes");

  return (
    <Drawer open onClose={onClose} width="max-w-xl" className="overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={contact.name} size="lg" />
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg text-text">
              {contact.name || "Unnamed contact"}
            </h2>
            <span className="font-data text-[11px] text-faint">#{contact.id.slice(-6)}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border px-5 py-4">
          {/* Quick contact actions */}
          <div className="grid gap-2">
            {contact.email && (
              <CopyRow
                icon={<Mail size={14} />}
                href={`mailto:${contact.email}`}
                display={contact.email}
                copyText={contact.email}
              />
            )}
            {contact.phone && (
              <CopyRow
                icon={<Phone size={14} />}
                href={`tel:${contact.phone}`}
                display={formatPhone(contact.phone)}
                copyText={contact.phone}
                mono
              />
            )}
          </div>

          {/* Meta grid */}
          <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-sm)] border border-border bg-border sm:grid-cols-3">
            <MetaCell label="Source" value={contact.source || "Unknown"} />
            <MetaCell label="Created" value={formatDate(contact.createdAt)} mono />
            <MetaCell label="Last activity" value={relativeTime(contact.lastActivityAt)} mono />
          </dl>

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="mt-4">
              <div className="label-cap mb-2">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Notes / Tasks */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pt-4">
          <Segmented options={TABS} value={tab} onChange={setTab} size="sm" />
          <span className="text-faint">
            {tab === "notes" ? <StickyNote size={14} /> : <ListTodo size={14} />}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {tab === "notes" ? (
            <NotesPanel contactId={contact.id} />
          ) : (
            <TasksPanel contactId={contact.id} />
          )}
        </div>
      </div>
    </Drawer>
  );
}

function MetaCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface px-3 py-2">
      <dt className="label-cap mb-0.5">{label}</dt>
      <dd className={cn("truncate text-[12.5px] text-text", mono && "font-data")}>{value}</dd>
    </div>
  );
}

function CopyRow({
  icon,
  href,
  display,
  copyText,
  mono,
}: {
  icon: React.ReactNode;
  href: string;
  display: string;
  copyText: string;
  mono?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard can be blocked; the mailto/tel link is the fallback path.
    }
  }
  return (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface-2/40 px-3 py-2">
      <span className="text-faint">{icon}</span>
      <a
        href={href}
        className={cn("flex-1 truncate text-[13px] text-text hover:text-brand-text", mono && "font-data")}
      >
        {display}
      </a>
      <button
        onClick={copy}
        className="shrink-0 text-faint transition-colors hover:text-text"
        aria-label={copied ? "Copied" : "Copy"}
      >
        {copied ? <Check size={13} className="text-positive" /> : <Copy size={13} />}
      </button>
    </div>
  );
}
