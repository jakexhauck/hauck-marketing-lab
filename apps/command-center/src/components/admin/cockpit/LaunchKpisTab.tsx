import { useEffect, useState } from "react";
import {
  ROI_BENCHMARKS,
  ROI_DEFAULTS,
  averageProfit,
  roiRows,
  type RoiInputs,
} from "../../../lib/roiCalculator";

// Client > Launch KPIs (Jake, 2026-10-23, renamed from ROI Calculator
// 2026-10-27). The agency's ROI Calculator sheet per client: type the client's
// spend, job size and margin, read the best / average / worst funnel. The math
// lives in lib/roiCalculator.
//
// Inputs are kept per client in this browser's storage.

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const storageKey = (tenantId: string) => `hml_roi_calc_${tenantId}`;

function readInputs(tenantId: string): RoiInputs {
  try {
    const raw = localStorage.getItem(storageKey(tenantId));
    if (!raw) return ROI_DEFAULTS;
    const v = JSON.parse(raw);
    return {
      adSpend: Number(v.adSpend) || 0,
      jobSize: Number(v.jobSize) || 0,
      margin: Number(v.margin) || 0,
    };
  } catch {
    return ROI_DEFAULTS;
  }
}

function NumberField({
  label,
  value,
  prefix,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  onChange: (n: number) => void;
}) {
  return (
    <label className="roi-field">
      <span className="roi-field-label">{label}</span>
      <span className="roi-input">
        {prefix && <span className="roi-affix">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        />
        {suffix && <span className="roi-affix">{suffix}</span>}
      </span>
    </label>
  );
}

function RoiStyle() {
  return (
    <style>{`
      .pk-kit .roi-card { border: 1px solid; border-radius: 18px; padding: 20px; }
      .pk-kit .roi-card h2 { font-size: 15px; font-weight: 600; color: var(--text); margin: 0 0 14px; }
      .pk-kit .roi-inputs { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
      .pk-kit .roi-field { display: flex; flex-direction: column; gap: 6px; }
      .pk-kit .roi-field-label { font-size: 12.5px; font-weight: 600; color: var(--text-muted); }
      .pk-kit .roi-input {
        display: flex; align-items: center; gap: 4px; padding: 0 12px; height: 42px; border-radius: 12px;
        background: var(--surface); border: 1px solid color-mix(in srgb, var(--text) 14%, transparent);
      }
      .pk-kit .roi-input:focus-within { border-color: var(--brand); }
      .pk-kit .roi-input input {
        flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: inherit;
        font-size: 15px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums;
      }
      .pk-kit .roi-affix { font-size: 14px; color: var(--text-muted); }
      .pk-kit .roi-readout { height: 42px; display: flex; align-items: center; font-size: 15px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
      .pk-kit .roi-scroll { overflow-x: auto; }
      .pk-kit .roi-table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
      .pk-kit .roi-table th, .pk-kit .roi-table td { padding: 10px 12px; text-align: right; white-space: nowrap; font-size: 14px; }
      .pk-kit .roi-table th:first-child, .pk-kit .roi-table td:first-child { text-align: left; }
      .pk-kit .roi-table thead th { font-size: 12px; font-weight: 600; color: var(--text-muted); border-bottom: 1px solid color-mix(in srgb, var(--text) 10%, transparent); }
      .pk-kit .roi-table tbody td { color: var(--text); border-bottom: 1px solid color-mix(in srgb, var(--text) 6%, transparent); }
      .pk-kit .roi-table tbody tr:last-child td { border-bottom: 0; }
      .pk-kit .roi-table td.roi-strong { font-weight: 700; color: var(--brand-text); }
      .pk-kit .roi-table td:first-child { font-weight: 600; }
    `}</style>
  );
}

export default function LaunchKpisTab({ tenantId }: { tenantId: string }) {
  const [inputs, setInputs] = useState<RoiInputs>(() => readInputs(tenantId));

  // A different client in the same mounted page reads its own numbers.
  useEffect(() => setInputs(readInputs(tenantId)), [tenantId]);

  const update = (patch: Partial<RoiInputs>) =>
    setInputs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(storageKey(tenantId), JSON.stringify(next));
      } catch {
        // Storage blocked: the numbers still work for this visit.
      }
      return next;
    });

  const rows = roiRows(inputs);

  return (
    <>
      <RoiStyle />
      <div className="flex flex-col gap-5 pb-12">
        <section className="roi-card pk-card">
          <h2>Inputs</h2>
          <div className="roi-inputs">
            <NumberField
              label="Ad Spend (30 days)"
              prefix="$"
              value={inputs.adSpend}
              onChange={(adSpend) => update({ adSpend })}
            />
            <NumberField
              label="Median Job Size"
              prefix="$"
              value={inputs.jobSize}
              onChange={(jobSize) => update({ jobSize })}
            />
            <NumberField
              label="Profit Margin"
              suffix="%"
              value={Math.round(inputs.margin * 1000) / 10}
              onChange={(pct) => update({ margin: pct / 100 })}
            />
            <div className="roi-field">
              <span className="roi-field-label">Average Profit</span>
              <span className="roi-readout">{usd(averageProfit(inputs))}</span>
            </div>
          </div>
        </section>

        <section className="roi-card pk-card">
          <h2>Projection</h2>
          <div className="roi-scroll">
            <table className="roi-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Leads</th>
                  <th>Appointments</th>
                  <th>Clients Signed</th>
                  <th>Revenue</th>
                  <th>Profit</th>
                  <th>ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.label}</td>
                    <td>{r.leads.toLocaleString()}</td>
                    <td>{r.appointments.toLocaleString()}</td>
                    <td>{r.clients.toLocaleString()}</td>
                    <td>{usd(r.revenue)}</td>
                    <td>{usd(r.profit)}</td>
                    <td className="roi-strong">{r.roi === null ? "-" : `${r.roi.toFixed(1)}x`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="roi-card pk-card">
          <h2>Benchmarks</h2>
          <div className="roi-scroll">
            <table className="roi-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Cost Per Lead</th>
                  <th>Cost Per Appointment</th>
                  <th>Close Rate</th>
                </tr>
              </thead>
              <tbody>
                {ROI_BENCHMARKS.map((b) => (
                  <tr key={b.id}>
                    <td>{b.label}</td>
                    <td>{usd(b.cpl)}</td>
                    <td>{usd(b.cpa)}</td>
                    <td>{Math.round(b.closeRate * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
