import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, MapPin, Phone, Wrench } from "lucide-react";
import FilterPicker, { MultiFilterPicker } from "../FilterPicker";
import {
  coldSmsLeadKeys,
  useColdSmsLeadGroups,
  useColdSmsLeadPreview,
} from "../../../hooks/useColdSms";
import {
  LINE_TYPES,
  MAX_EXPORT,
  availableCount,
  cityOptions,
  normalizeFilters,
  serviceOptions,
  type ColdSmsLeadFilters,
} from "../../../lib/coldSmsLeads";

// Cold SMS > Leads (Jake, 2026-10-06). The textable leads cold-sms-pipeline
// uploads after each scrape (0139). Jake filters by city, line type and
// service, types how many, and downloads the GHL import CSV. A download marks
// its leads at once, so they never come out again; Exports keeps every past
// file for a re-download. Counts come from the groups view, never from
// fetched rows (PostgREST's silent 1000 cap). The table shows the first 100
// the download would take, in the same order.

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  LINE_TYPES.map((t) => [t.value, t.label]),
);

function LeadsStyle() {
  return (
    <style>{`
      .pk-kit .sl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .pk-kit .sl-avail { display: flex; flex-direction: column; line-height: 1.15; margin-left: auto; }
      .pk-kit .sl-avail span {
        font-size: 9.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
        color: var(--text-faint);
      }
      .pk-kit .sl-avail b { font-family: var(--font-display); font-size: 22px; font-weight: 600; color: var(--text); }
      .pk-kit .sl-take { display: flex; align-items: center; gap: 8px; }
      .pk-kit .sl-take input {
        width: 110px; height: 40px; border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); color: var(--text); font: inherit; font-size: 14px;
        padding: 0 12px; box-shadow: var(--shadow-sm);
      }
      .pk-kit .sl-take input:focus { outline: 0; border-color: var(--brand); }
      .pk-kit .sl-btn {
        display: inline-flex; align-items: center; gap: 7px; height: 40px; padding: 0 16px;
        border: 0; border-radius: 12px; cursor: pointer; font: inherit; font-size: 13.5px;
        font-weight: 600; background: var(--brand); color: var(--brand-contrast, #fff);
      }
      .pk-kit .sl-btn:disabled { opacity: .5; cursor: default; }
      .pk-kit .sl-err { color: var(--danger, #cc0000); font-size: 13px; }
      .pk-kit .sl-spin { animation: sl-spin 1s linear infinite; }
      @keyframes sl-spin { to { transform: rotate(360deg); } }
      .pk-kit .sl-grid { display: grid; grid-template-columns: minmax(0, 1fr) 280px; gap: 16px; align-items: start; }
      @media (max-width: 900px) { .pk-kit .sl-grid { grid-template-columns: minmax(0, 1fr); } }
      .sms-sheet.sl-table { max-height: calc(100vh - 260px); }
      .sms-sheet .sl-dl {
        border: 0; background: transparent; cursor: pointer; color: #1a73e8; font: inherit; padding: 0;
      }
    `}</style>
  );
}

async function saveCsv(res: Response) {
  const blob = await res.blob();
  const name =
    /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "cold-sms.csv";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function errorOf(res: Response) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? "Could not build the file.";
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SmsLeadsSheet() {
  const qc = useQueryClient();
  const [cities, setCities] = useState<string[]>([]);
  const [lineType, setLineType] = useState("");
  const [service, setService] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const groups = useColdSmsLeadGroups();
  const allGroups = groups.data?.groups ?? [];

  const filters: ColdSmsLeadFilters = useMemo(
    () =>
      normalizeFilters({
        cities,
        lineTypes: lineType ? [lineType] : [],
        services: service ? [service] : [],
        limit: amount,
      }),
    [cities, lineType, service, amount],
  );
  const available = availableCount(allGroups, filters);
  const preview = useColdSmsLeadPreview(filters);

  const cityList = useMemo(
    () =>
      cityOptions(allGroups).map((c) => ({
        value: c.value,
        label: c.label,
        sub: `${c.count.toLocaleString()} leads`,
      })),
    [allGroups],
  );
  const services = useMemo(() => serviceOptions(allGroups), [allGroups]);

  const take = Math.min(filters.limit, available);

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/tracker/cold-sms-leads-export", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      await saveCsv(res);
      setAmount("");
    } catch {
      setError("Could not build the file.");
    } finally {
      setBusy(false);
      // Those leads are taken now, whatever happened to the file.
      void qc.invalidateQueries({ queryKey: coldSmsLeadKeys.all() });
    }
  };

  const redownload = async (batch: string) => {
    setError("");
    try {
      const res = await fetch(
        `/api/admin/tracker/cold-sms-leads-export?batch=${encodeURIComponent(batch)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      await saveCsv(res);
    } catch {
      setError("Could not build the file.");
    }
  };

  if (groups.isError) return <div className="sl-err">Could not load the leads.</div>;

  const rows = preview.data?.rows ?? [];
  const batches = groups.data?.batches ?? [];

  return (
    <>
      <LeadsStyle />
      <div className="flex flex-col gap-4">
        <div className="sl-bar">
          <MultiFilterPicker
            kicker="City"
            allLabel="All cities"
            values={cities}
            options={cityList}
            onChange={setCities}
            icon={<MapPin size={15} />}
          />
          <FilterPicker
            kicker="Line type"
            value={lineType}
            options={[{ value: "", label: "All" }, ...LINE_TYPES]}
            onChange={setLineType}
            icon={<Phone size={15} />}
          />
          <FilterPicker
            kicker="Service"
            value={service}
            options={[{ value: "", label: "All" }, ...services.map((s) => ({ value: s, label: s }))]}
            onChange={setService}
            icon={<Wrench size={15} />}
          />

          <div className="sl-avail">
            <span>Available</span>
            <b>{groups.isLoading ? "…" : available.toLocaleString()}</b>
          </div>

          <div className="sl-take">
            <input
              type="number"
              min={1}
              max={Math.min(available, MAX_EXPORT)}
              inputMode="numeric"
              placeholder="How many"
              aria-label="How many"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              type="button"
              className="sl-btn"
              disabled={busy || take < 1}
              onClick={download}
            >
              {busy ? <Loader2 size={15} className="sl-spin" /> : <Download size={15} />}
              {take > 0 ? `Export ${take.toLocaleString()}` : "Export CSV"}
            </button>
          </div>
        </div>

        {error && <div className="sl-err">{error}</div>}

        <div className="sl-grid">
          <div className="sms-sheet sl-table">
            <table>
              <colgroup>
                <col style={{ width: 300 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 50 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 120 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="bx">Company</th>
                  <th className="bx">City</th>
                  <th className="bx">State</th>
                  <th className="bx">Line type</th>
                  <th className="bx">Service</th>
                  <th className="bx">Phone</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="g empty" colSpan={6}>
                      {preview.isLoading || groups.isLoading ? "" : "No leads."}
                    </td>
                  </tr>
                ) : (
                  rows.map((l) => (
                    <tr key={l.phone}>
                      <td className="g" title={l.companyName}>{l.companyName}</td>
                      <td className="g">{l.city}</td>
                      <td className="g c">{l.state}</td>
                      <td className="g">{TYPE_LABEL[l.lineType] ?? l.lineType}</td>
                      <td className="g">{l.service}</td>
                      <td className="g">{l.phone}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="sms-sheet" style={{ maxHeight: "none" }}>
            <table style={{ width: "100%" }}>
              <colgroup>
                <col />
                <col style={{ width: 60 }} />
                <col style={{ width: 40 }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="bx">Exports</th>
                  <th className="bx">Leads</th>
                  <th className="bx" aria-label="Download" />
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 ? (
                  <tr>
                    <td className="g empty" colSpan={3}>None yet.</td>
                  </tr>
                ) : (
                  batches.map((b) => (
                    <tr key={b.batch}>
                      <td className="g">{when(b.exportedAt)}</td>
                      <td className="g r">{b.leads.toLocaleString()}</td>
                      <td className="g c">
                        <button
                          type="button"
                          className="sl-dl"
                          aria-label={`Download ${b.batch}`}
                          onClick={() => redownload(b.batch)}
                        >
                          <Download size={13} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
