import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import type { ApiPipelineSummary } from "../lib/api";
import { useToast } from "../context/ToastContext";

interface Props {
  open: boolean;
  pipeline: ApiPipelineSummary | null;
  onClose: () => void;
  // The query key for the active pipeline's lead list, invalidated on success
  // alongside ["summary"] so the new lead and counts appear at once.
  leadsKey: unknown[];
}

// Bottom sheet to create a lead: name (required), optional phone/email, and a
// stage picker. Defaults the stage to the active pipeline's first stage. Posts
// to /api/leads, which creates the GHL contact + opportunity.
export default function NewLeadSheet({ open, pipeline, onClose, leadsKey }: Props) {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const stages = useMemo(() => pipeline?.stages ?? [], [pipeline]);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [stageId, setStageId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Reset the form whenever the sheet opens, defaulting to the first stage.
  useEffect(() => {
    if (!open) return;
    setName("");
    setPhone("");
    setEmail("");
    setStageId(stages[0]?.id ?? "");
    setSubmitting(false);
  }, [open, stages]);

  const canSubmit =
    name.trim() !== "" && Boolean(pipeline) && stageId !== "" && !submitting;

  async function handleSubmit() {
    if (!canSubmit || !pipeline) return;
    setSubmitting(true);
    try {
      await api("/api/leads", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          pipelineId: pipeline.id,
          pipelineStageId: stageId,
        }),
      });
      qc.invalidateQueries({ queryKey: leadsKey });
      qc.invalidateQueries({ queryKey: ["summary"] });
      showToast("Lead created");
      onClose();
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not create the lead.";
      showToast(message);
      setSubmitting(false);
    }
  }

  return (
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-40 transition-opacity duration-200 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div
        className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl bg-[var(--surface)] shadow-xl transition-transform duration-200 ease-out ${
          open ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="flex flex-col gap-5 px-6 pt-5">
          <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border)]" />
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="label-cap-strong">Add to pipeline</span>
              <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text)]">
                New lead
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--text-muted)] active:bg-[var(--surface-2)]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="label-cap px-1">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Full name"
                autoFocus
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="label-cap px-1">Phone</span>
              <input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Optional"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="label-cap px-1">Email</span>
              <input
                type="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Optional"
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--ring)]"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="label-cap px-1">Stage</span>
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                disabled={stages.length === 0}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--text)] outline-none focus:border-[var(--ring)] disabled:opacity-50"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[13px] font-bold uppercase tracking-wider text-[var(--text-muted)] transition-transform active:scale-[0.98] active:bg-[var(--surface-2)]"
              style={{ minHeight: "52px" }}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
              className="flex-1 rounded-xl px-4 py-3 text-[13px] font-bold uppercase tracking-wider text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-[var(--surface-2)] disabled:text-[var(--text-faint)]"
              style={{ minHeight: "52px", backgroundColor: "var(--brand-primary)" }}
            >
              {submitting ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
