import { useEffect, useMemo, useState } from "react";
import {
  X,
  Phone,
  Mail,
  Copy,
  Check,
  Pencil,
  Trophy,
  XCircle,
  MessageSquare,
  StickyNote,
  ListTodo,
} from "lucide-react";
import type { ApiLead, ApiPipelineSummary } from "@hauck/core";
import { cn } from "@/lib/cn";
import { formatDate, formatPhone } from "@/lib/format";
import { leadStatus } from "@/lib/status";
import {
  useLeadQuery,
  useLeadMessagesQuery,
  useUpdateLead,
  useMoveLeadStage,
  useSendLeadMessage,
} from "@/hooks/useApi";
import { useTenant } from "@/context/TenantContext";
import { useToast } from "@/context/ToastContext";
import {
  Avatar,
  Button,
  StatusPill,
  Badge,
  Drawer,
  Modal,
  Field,
  Input,
  LoadingState,
  ErrorState,
} from "@/components/ui";
import { MessageThread } from "@/components/shared/MessageThread";
import { Composer } from "@/components/shared/Composer";
import { NotesPanel } from "@/components/shared/NotesPanel";
import { TasksPanel } from "@/components/shared/TasksPanel";
import { LedgerValue } from "./money";

type Tab = "messages" | "notes" | "tasks";

export function LeadDrawer({
  leadId,
  pipeline,
  onClose,
}: {
  leadId: string;
  pipeline: ApiPipelineSummary | undefined;
  onClose: () => void;
}) {
  const leadQ = useLeadQuery(leadId);
  const lead = leadQ.data?.lead;

  return (
    <Drawer open onClose={onClose} width="max-w-2xl" className="overflow-hidden">
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          {lead ? (
            <div className="flex items-center gap-3">
              <Avatar name={lead.name} size="lg" />
              <div className="min-w-0">
                <h2 className="truncate font-display text-lg text-text">{lead.name || "Unnamed lead"}</h2>
                <div className="mt-1 flex items-center gap-2">
                  <StatusPill meta={leadStatus(lead.status)} />
                  <span className="font-data text-[11px] text-faint">#{lead.id.slice(-6)}</span>
                </div>
              </div>
            </div>
          ) : (
            <h2 className="font-display text-lg text-text">Lead</h2>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-faint transition-colors hover:bg-surface-2 hover:text-text"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      {leadQ.isLoading ? (
        <LoadingState label="Loading lead" className="flex-1" />
      ) : leadQ.isError || !lead ? (
        <ErrorState
          title="Couldn't load this lead"
          description="The lead may have moved or the request failed."
          onRetry={() => void leadQ.refetch()}
          className="flex-1"
        />
      ) : (
        <LeadBody lead={lead} pipeline={pipeline} />
      )}
    </Drawer>
  );
}

function LeadBody({ lead, pipeline }: { lead: ApiLead; pipeline: ApiPipelineSummary | undefined }) {
  const { wonLabel, valueLabel } = useTenant();
  const { toast } = useToast();
  const update = useUpdateLead();
  const move = useMoveLeadStage(lead.pipelineId);
  const send = useSendLeadMessage();
  const messagesQ = useLeadMessagesQuery(lead.id);

  const [tab, setTab] = useState<Tab>("messages");
  const [wonOpen, setWonOpen] = useState(false);

  const stages = pipeline?.stages ?? [];
  const isWon = lead.status.toLowerCase() === "won";
  const isLost = lead.status.toLowerCase() === "lost";

  function onStageChange(stageId: string) {
    if (stageId === lead.pipelineStageId) return;
    move.mutate(
      { leadId: lead.id, pipelineStageId: stageId },
      { onError: () => toast("Couldn't move the lead. Try again.", "error") },
    );
  }

  function markLost() {
    update.mutate(
      { leadId: lead.id, status: "lost" },
      {
        onSuccess: () => toast("Marked lost.", "info"),
        onError: () => toast("Couldn't update the lead.", "error"),
      },
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="overflow-y-auto px-5 py-4">
        {/* Value + quick actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ValueEditor
            value={lead.value}
            label={valueLabel}
            saving={update.isPending}
            onSave={(value) =>
              update.mutate(
                { leadId: lead.id, value },
                {
                  onSuccess: () => toast(`${valueLabel} updated.`, "success"),
                  onError: () => toast(`Couldn't update the ${valueLabel.toLowerCase()}.`, "error"),
                },
              )
            }
          />
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWonOpen(true)}
              disabled={isWon}
              className={cn(!isWon && "text-positive")}
            >
              <Trophy size={14} />
              {isWon ? wonLabel : `Mark ${wonLabel}`}
            </Button>
            <Button variant="secondary" size="sm" onClick={markLost} disabled={isLost} loading={update.isPending}>
              {!update.isPending && <XCircle size={14} />}
              Mark lost
            </Button>
          </div>
        </div>

        {/* Stage move */}
        {stages.length > 0 && (
          <Field label="Stage" className="mt-4">
            <select
              value={lead.pipelineStageId}
              onChange={(e) => onStageChange(e.target.value)}
              disabled={move.isPending}
              className="h-9.5 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-sm text-text focus:border-brand focus:outline-none focus:ring-2 focus:ring-[var(--ring)] disabled:opacity-50"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Contact */}
        <ContactBlock lead={lead} />

        {/* Attribution */}
        {lead.attribution && <AttributionBlock attribution={lead.attribution} />}

        {/* Tags */}
        {lead.tags && lead.tags.length > 0 && (
          <div className="mt-4">
            <div className="label-cap mb-2">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {lead.tags.map((t) => (
                <Badge key={t}>{t}</Badge>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-center gap-2 text-[11px]">
          <span className="font-data text-faint">Created {formatDate(lead.createdAt)}</span>
        </div>
      </div>

      {/* Tabbed body */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-border">
        <div className="flex shrink-0 items-center gap-1 px-5 pt-3">
          <TabButton active={tab === "messages"} onClick={() => setTab("messages")} icon={<MessageSquare size={14} />}>
            Messages
          </TabButton>
          <TabButton active={tab === "notes"} onClick={() => setTab("notes")} icon={<StickyNote size={14} />}>
            Notes
          </TabButton>
          <TabButton active={tab === "tasks"} onClick={() => setTab("tasks")} icon={<ListTodo size={14} />}>
            Tasks
          </TabButton>
        </div>

        {tab === "messages" && (
          <div className="flex min-h-0 flex-1 flex-col">
            {messagesQ.isError ? (
              <ErrorState
                title="Couldn't load messages"
                onRetry={() => void messagesQ.refetch()}
                className="flex-1"
              />
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <MessageThread
                  messages={messagesQ.data?.messages ?? []}
                  loading={messagesQ.isLoading}
                />
              </div>
            )}
            <Composer
              availableChannels={messagesQ.data?.availableChannels}
              defaultChannel={messagesQ.data?.defaultChannel}
              sending={send.isPending}
              onSend={async (vars) => {
                try {
                  await send.mutateAsync({ leadId: lead.id, ...vars });
                } catch {
                  toast("Message failed to send.", "error");
                }
              }}
            />
          </div>
        )}

        {tab === "notes" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <NotesPanel contactId={lead.contactId} />
          </div>
        )}

        {tab === "tasks" && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <TasksPanel contactId={lead.contactId} />
          </div>
        )}
      </div>

      <MarkWonModal
        open={wonOpen}
        onClose={() => setWonOpen(false)}
        wonLabel={wonLabel}
        valueLabel={valueLabel}
        defaultValue={lead.value}
        saving={update.isPending}
        onConfirm={(value) =>
          update.mutate(
            { leadId: lead.id, status: "won", value },
            {
              onSuccess: () => {
                toast(`Marked ${wonLabel.toLowerCase()}.`, "success");
                setWonOpen(false);
              },
              onError: () => toast("Couldn't update the lead.", "error"),
            },
          )
        }
      />
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-2.5 pb-2.5 pt-1 text-[13px] font-medium transition-colors",
        active
          ? "border-brand text-text"
          : "border-transparent text-faint hover:text-muted",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// Inline ledger value with a click-to-edit affordance.
function ValueEditor({
  value,
  label,
  saving,
  onSave,
}: {
  value: number | null;
  label: string;
  saving: boolean;
  onSave: (value: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (editing) setDraft(value == null ? "" : String(value));
  }, [editing, value]);

  function commit() {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && Number.isNaN(parsed)) {
      setEditing(false);
      return;
    }
    if (parsed !== value) onSave(parsed);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="label-cap">{label}</span>
        <Input
          autoFocus
          type="number"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-8 w-32"
          placeholder="0"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={saving}
      className="group inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-1 py-0.5 text-left transition-colors hover:bg-surface-2"
    >
      <span className="label-cap">{label}</span>
      <LedgerValue value={value} className="text-[15px]" emptyLabel="set value" />
      <Pencil size={12} className="text-faint opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  );
}

function ContactBlock({ lead }: { lead: ApiLead }) {
  const hasPhone = !!lead.phone;
  const hasEmail = !!lead.email;
  if (!hasPhone && !hasEmail) return null;
  return (
    <div className="mt-4 grid gap-2">
      {hasPhone && (
        <CopyRow
          icon={<Phone size={14} />}
          href={`tel:${lead.phone}`}
          display={formatPhone(lead.phone)}
          copyText={lead.phone}
          mono
        />
      )}
      {hasEmail && (
        <CopyRow icon={<Mail size={14} />} href={`mailto:${lead.email}`} display={lead.email} copyText={lead.email} />
      )}
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

function AttributionBlock({
  attribution,
}: {
  attribution: NonNullable<ApiLead["attribution"]>;
}) {
  const rows = useMemo(
    () =>
      [
        { key: "Source", value: attribution.source },
        { key: "Campaign", value: attribution.campaign },
        { key: "Ad set", value: attribution.adset },
        { key: "Ad", value: attribution.ad },
      ].filter((r) => r.value),
    [attribution],
  );
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="label-cap mb-2">Attribution</div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-sm)] border border-border bg-border">
        {rows.map((r) => (
          <div key={r.key} className="bg-surface px-3 py-2">
            <dt className="label-cap mb-0.5">{r.key}</dt>
            <dd className="truncate font-data text-[12.5px] text-text">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MarkWonModal({
  open,
  onClose,
  wonLabel,
  valueLabel,
  defaultValue,
  saving,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  wonLabel: string;
  valueLabel: string;
  defaultValue: number | null;
  saving: boolean;
  onConfirm: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft(defaultValue == null ? "" : String(defaultValue));
  }, [open, defaultValue]);

  function confirm() {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    if (parsed != null && Number.isNaN(parsed)) return;
    onConfirm(parsed);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Mark ${wonLabel.toLowerCase()}`}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={confirm} loading={saving}>
            Confirm {wonLabel.toLowerCase()}
          </Button>
        </>
      }
    >
      <Field label={valueLabel} hint="Recorded against this lead when you confirm.">
        <Input
          autoFocus
          type="number"
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && confirm()}
          placeholder="0"
        />
      </Field>
    </Modal>
  );
}
