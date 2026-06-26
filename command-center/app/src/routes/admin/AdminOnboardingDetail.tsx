import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Check, X } from "lucide-react";
import DesktopPage from "../../components/desktop/DesktopPage";
import { api } from "../../lib/api";
import { ONBOARDING_FIELDS, CHECKLIST_TASKS, type FieldGroup } from "../../lib/onboarding";

const GROUPS: { key: FieldGroup; label: string }[] = [
  { key: "connection", label: "Connection" },
  { key: "business", label: "Business" },
  { key: "rep", label: "Rep & internal alerts" },
  { key: "calendars", label: "Calendars & confirmation pages" },
];

interface ReadyCheck {
  key: string;
  ok: boolean;
  detail: string;
}

export default function AdminOnboardingDetail() {
  const { id = "" } = useParams();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [hasToken, setHasToken] = useState(false);
  const [checks, setChecks] = useState<ReadyCheck[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [f, c] = await Promise.all([
          api<{ fields: Record<string, string>; hasToken: boolean }>(`/api/admin/onboarding/${id}`),
          api<{ items: { task_key: string; done: boolean }[] }>(`/api/admin/onboarding/${id}/checklist`),
        ]);
        if (cancelled) return;
        setFields(f.fields ?? {});
        setHasToken(f.hasToken);
        setDone(Object.fromEntries((c.items ?? []).map((i) => [i.task_key, i.done])));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const set = (k: string, v: string) => setFields((p) => ({ ...p, [k]: v }));

  const saveDraft = async () => {
    setBusy("save");
    setMsg(null);
    try {
      await api(`/api/admin/onboarding/${id}`, { method: "PUT", body: JSON.stringify({ fields }) });
      setMsg("Draft saved.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const runReadiness = async () => {
    const r = await api<{ checks: ReadyCheck[] }>(`/api/admin/onboarding/${id}/readiness`);
    setChecks(r.checks ?? []);
  };

  const provision = async () => {
    setBusy("provision");
    setMsg(null);
    try {
      await api(`/api/admin/onboarding/${id}`, { method: "PUT", body: JSON.stringify({ fields }) });
      const r = await api<{ ok: boolean; written: string[]; failed: { name: string }[]; notFound: string[] }>(
        `/api/admin/onboarding/${id}/provision`,
        { method: "POST" },
      );
      setMsg(
        r.ok
          ? `Provisioned ${r.written.length} values.`
          : `Wrote ${r.written.length}, ${r.failed.length} failed, ${r.notFound.length} missing.`,
      );
      await runReadiness();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Provision failed");
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (taskKey: string, value: boolean) => {
    setDone((p) => ({ ...p, [taskKey]: value }));
    await api(`/api/admin/onboarding/${id}/checklist`, {
      method: "PUT",
      body: JSON.stringify({ taskKey, done: value }),
    });
  };

  const phases = useMemo(() => Array.from(new Set(CHECKLIST_TASKS.map((t) => t.phase))), []);

  if (loading) {
    return (
      <DesktopPage title="Onboarding">
        <div className="flex items-center gap-2 py-16 text-sm text-muted">
          <Loader2 size={16} className="animate-spin" /> Loading...
        </div>
      </DesktopPage>
    );
  }

  return (
    <DesktopPage
      title="Onboarding"
      subtitle="Fill, provision, verify"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={saveDraft}
            disabled={busy !== null}
            className="rounded-[var(--radius)] border border-border px-3 py-1.5 text-sm text-text hover:bg-surface-2 disabled:opacity-60"
          >
            Save draft
          </button>
          <button
            onClick={provision}
            disabled={busy !== null}
            className="rounded-[var(--radius)] bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {busy === "provision" ? "Provisioning..." : "Provision to GHL"}
          </button>
        </div>
      }
    >
      {msg && (
        <div className="mb-4 rounded-[var(--radius)] border border-border bg-surface px-4 py-2 text-sm text-text">
          {msg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Setup form */}
        <div className="space-y-6">
          {GROUPS.map((g) => (
            <section key={g.key} className="rounded-[var(--radius)] border border-border bg-surface p-4">
              <h2 className="mb-3 font-display text-[15px] font-semibold text-text">{g.label}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ONBOARDING_FIELDS.filter((f) => f.group === g.key).map((f) => {
                  const isToken = f.key === "ghl_token";
                  return (
                    <label key={f.key} className="block text-sm">
                      <span className="mb-1 block text-[13px] text-muted">{f.label}</span>
                      <input
                        type={isToken ? "password" : "text"}
                        value={fields[f.key] ?? ""}
                        placeholder={isToken && hasToken ? "Token set (leave blank to keep)" : ""}
                        onChange={(e) => set(f.key, e.target.value)}
                        className="w-full rounded-[var(--radius)] border border-border bg-bg px-3 py-2 text-text outline-none focus:border-brand"
                      />
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* Readiness panel */}
        <aside className="space-y-4">
          <section className="rounded-[var(--radius)] border border-border bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-[15px] font-semibold text-text">Readiness</h2>
              <button onClick={runReadiness} className="text-[12px] text-brand hover:underline">
                Re-check
              </button>
            </div>
            <ul className="space-y-2">
              {checks.length === 0 ? (
                <li className="text-[13px] text-muted">Run a check or provision first.</li>
              ) : (
                checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-[13px]">
                    {c.ok ? (
                      <Check size={15} className="mt-0.5 text-brand" />
                    ) : (
                      <X size={15} className="mt-0.5 text-danger" />
                    )}
                    <span className="text-muted">{c.detail}</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-[var(--radius)] border border-border bg-surface p-4">
            <h2 className="mb-3 font-display text-[15px] font-semibold text-text">Launch checklist</h2>
            {phases.map((phase) => (
              <div key={phase} className="mb-3 last:mb-0">
                <p className="mb-1 text-[12px] uppercase tracking-wide text-faint">{phase}</p>
                {CHECKLIST_TASKS.filter((t) => t.phase === phase).map((t) => (
                  <label key={t.key} className="flex items-center gap-2 py-1 text-[13px] text-text">
                    <input
                      type="checkbox"
                      checked={Boolean(done[t.key])}
                      onChange={(e) => toggle(t.key, e.target.checked)}
                    />
                    <span className={done[t.key] ? "text-muted line-through" : ""}>{t.label}</span>
                  </label>
                ))}
              </div>
            ))}
          </section>
        </aside>
      </div>
    </DesktopPage>
  );
}
