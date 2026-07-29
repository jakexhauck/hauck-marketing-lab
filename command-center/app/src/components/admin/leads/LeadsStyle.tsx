// Bento Bold styles for every lead surface: the Leads book and the seven Cold
// Call stage pages. Ported from docs/mockups/admin-redesign/leads-B.html and
// scoped to .pk-kit so it reads the admin theme tokens and works in light and
// dark.
//
// The seven colour slots are the mockup's palette, re-keyed to the Cold Call
// Leads pipeline stages: New Lead, 1st Dial, 2nd Dial, Brushed Off, Call Back,
// Booked, Not Interested. Their tints get dark overrides since the mockup is
// light-only. Mounted once per surface; two mounts of identical CSS are inert.

export default function LeadsStyle() {
  return (
    <style>{`
      .pk-kit {
        --adl-indigo: #6366f1; --adl-indigo-tint: #eef0ff;
        --adl-sky: #0ea5e9;    --adl-sky-tint: #e6f5fd;
        --adl-amber: #f59e0b;  --adl-amber-tint: #fdf3e2;
        --adl-green: #10b981;  --adl-green-tint: #e7f7f0;
        --adl-violet: #8b5cf6; --adl-violet-tint: #f1ecfe;
        --adl-teal: #14b8a6;   --adl-teal-tint: #e2f6f3;
        --adl-rose: #c78b93;   --adl-rose-tint: #f0edee; --adl-rose-ink: #a1737a;
        --adl-head-bg: #fafbfc; --adl-hover: #fbfbfd; --adl-input-hover: #f1f2f6;
      }
      [data-theme="dark"] .pk-kit {
        --adl-indigo-tint: rgba(99,102,241,.18);
        --adl-sky-tint: rgba(14,165,233,.16);
        --adl-amber-tint: rgba(245,158,11,.16);
        --adl-green-tint: rgba(16,185,129,.16);
        --adl-violet-tint: rgba(139,92,246,.18);
        --adl-teal-tint: rgba(20,184,166,.16);
        --adl-rose-tint: rgba(199,139,147,.18); --adl-rose-ink: #d8a7ad;
        --adl-head-bg: color-mix(in srgb, var(--surface) 80%, transparent);
        --adl-hover: rgba(255,255,255,.03);
        --adl-input-hover: rgba(255,255,255,.06);
      }

      .pk-kit .adl-sronly { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

      .pk-kit .adl-controls { display: flex; align-items: center; justify-content: flex-end; gap: 16px; flex-wrap: wrap; }
      .pk-kit .adl-addbtn {
        display: inline-flex; align-items: center; gap: 7px; border: 0; background: var(--grad-brand);
        color: #fff; font-family: inherit; font-weight: 600; font-size: 13.5px; padding: 10px 16px;
        border-radius: 13px; cursor: pointer; box-shadow: var(--shadow-brand); transition: filter .15s, transform .15s;
      }
      .pk-kit .adl-addbtn:hover:not(:disabled) { filter: brightness(1.05); transform: translateY(-1px); }
      .pk-kit .adl-addbtn:disabled { opacity: .6; cursor: not-allowed; }

      /* tile strip: the stage navigation on Cold Calling, the filter on Leads */
      .pk-kit .adl-tiles { display: grid; grid-template-columns: repeat(8, 1fr); gap: 12px; margin-top: 18px; }
      .pk-kit .adl-tile {
        border-radius: 18px; padding: 13px 14px; cursor: pointer; border: 2px solid transparent;
        text-align: left; background: var(--surface); font-family: inherit; transition: transform .15s, border-color .15s, background .15s;
        box-shadow: var(--shadow-sm); display: block; width: 100%;
      }
      .pk-kit .adl-tile:hover { transform: translateY(-2px); }
      .pk-kit .adl-tiletop { display: flex; align-items: center; gap: 8px; }
      .pk-kit .adl-tileico { width: 26px; height: 26px; border-radius: 9px; display: grid; place-items: center; color: #fff; flex-shrink: 0; }
      .pk-kit .adl-tilelbl { font-size: 11.5px; font-weight: 600; color: var(--text-muted); line-height: 1.15; }
      .pk-kit .adl-tileval { font-family: var(--font-display); font-weight: 700; font-size: 27px; letter-spacing: -.02em; margin-top: 7px; display: block; font-variant-numeric: tabular-nums; color: var(--text); }
      .pk-kit .adl-tileval.dash { color: var(--text-faint); }
      .pk-kit .adl-tile.on { border-color: currentColor; }
      .pk-kit .adl-tile.t-all { color: var(--text); }
      .pk-kit .adl-tile.t-all.on { background: var(--surface-2); }
      .pk-kit .adl-tile.t-all .adl-tileico { background: var(--text); color: var(--surface); }
      .pk-kit .adl-tile.t-newlead { color: var(--adl-indigo); }
      .pk-kit .adl-tile.t-newlead.on { background: var(--adl-indigo-tint); }
      .pk-kit .adl-tile.t-newlead .adl-tileico { background: var(--adl-indigo); }
      .pk-kit .adl-tile.t-dial1 { color: var(--adl-sky); }
      .pk-kit .adl-tile.t-dial1.on { background: var(--adl-sky-tint); }
      .pk-kit .adl-tile.t-dial1 .adl-tileico { background: var(--adl-sky); }
      .pk-kit .adl-tile.t-dial2 { color: var(--adl-amber); }
      .pk-kit .adl-tile.t-dial2.on { background: var(--adl-amber-tint); }
      .pk-kit .adl-tile.t-dial2 .adl-tileico { background: var(--adl-amber); }
      .pk-kit .adl-tile.t-brushed { color: var(--adl-teal); }
      .pk-kit .adl-tile.t-brushed.on { background: var(--adl-teal-tint); }
      .pk-kit .adl-tile.t-brushed .adl-tileico { background: var(--adl-teal); }
      .pk-kit .adl-tile.t-callback { color: var(--adl-violet); }
      .pk-kit .adl-tile.t-callback.on { background: var(--adl-violet-tint); }
      .pk-kit .adl-tile.t-callback .adl-tileico { background: var(--adl-violet); }
      .pk-kit .adl-tile.t-booked { color: var(--adl-green); }
      .pk-kit .adl-tile.t-booked.on { background: var(--adl-green-tint); }
      .pk-kit .adl-tile.t-booked .adl-tileico { background: var(--adl-green); }
      .pk-kit .adl-tile.t-notint { color: var(--adl-rose-ink); }
      .pk-kit .adl-tile.t-notint.on { background: var(--adl-rose-tint); }
      .pk-kit .adl-tile.t-notint .adl-tileico { background: var(--adl-rose); }
      .pk-kit .adl-tile.t-tracker { color: var(--text-muted); }
      .pk-kit .adl-tile.t-tracker.on { background: var(--surface-2); }
      .pk-kit .adl-tile.t-tracker .adl-tileico { background: var(--text-muted); }

      /* table card */
      .pk-kit .adl-card {
        background: var(--surface); border: 1px solid var(--border); border-radius: 22px; margin-top: 16px;
        display: flex; flex-direction: column; box-shadow: var(--shadow-md); overflow: hidden;
      }
      .pk-kit .adl-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px 12px; flex-wrap: wrap; gap: 10px; }
      .pk-kit .adl-title { font-family: var(--font-display); font-weight: 600; font-size: 16px; color: var(--text); }
      .pk-kit .adl-sub { font-size: 12px; color: var(--text-faint); margin-top: 2px; }
      .pk-kit .adl-clearbtn {
        border: 0; background: var(--brand-tint); color: var(--brand-text); font-family: inherit;
        font-weight: 600; font-size: 12px; padding: 7px 12px; border-radius: 10px; cursor: pointer;
      }
      .pk-kit .adl-clearbtn:hover { background: var(--brand-tint-strong); }
      .pk-kit .adl-error { margin: 0 20px 12px; padding: 10px 14px; border-radius: 10px; background: var(--danger-tint); color: var(--danger); font-size: 13px; }

      .pk-kit .adl-scroll { overflow: auto; max-height: min(64vh, 760px); }
      .pk-kit .adl-card table { width: 100%; border-collapse: collapse; min-width: 1180px; }
      .pk-kit .adl-card thead th {
        position: sticky; top: 0; z-index: 3; background: var(--adl-head-bg); font-size: 11px; font-weight: 600;
        letter-spacing: .05em; text-transform: uppercase; color: var(--text-faint); text-align: left;
        padding: 0; white-space: nowrap; border-bottom: 1px solid var(--border);
      }
      .pk-kit .adl-card thead th.rt { text-align: right; }
      .pk-kit .adl-sorter {
        display: inline-flex; align-items: center; gap: 5px; width: 100%; border: 0; background: transparent;
        font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer;
        padding: 11px 14px; user-select: none;
      }
      .pk-kit .adl-card thead th.rt .adl-sorter { justify-content: flex-end; }
      .pk-kit .adl-sorter:hover { color: var(--text-muted); }
      .pk-kit .adl-caret { opacity: 0; display: inline-flex; }
      .pk-kit .adl-card thead th.sorted .adl-caret { opacity: 1; color: var(--brand-text); }
      .pk-kit .adl-actionhead { width: 46px; }

      .pk-kit .adl-card tbody td { padding: 4px 8px; font-size: 13.5px; border-bottom: 1px solid var(--border); white-space: nowrap; }
      .pk-kit .adl-card tbody td.rt { text-align: right; }
      .pk-kit .adl-card tbody tr:hover td { background: var(--adl-hover); }
      .pk-kit .adl-card td input {
        width: 100%; min-width: 60px; border: 0; background: transparent; font: inherit; color: var(--text);
        padding: 6px 8px; border-radius: 8px; transition: background .12s, box-shadow .12s;
      }
      .pk-kit .adl-card td.rt input { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; min-width: 44px; }
      .pk-kit .adl-card td.mono input { font-variant-numeric: tabular-nums; }
      .pk-kit .adl-card td.wide input { min-width: 190px; color: var(--text-muted); }
      .pk-kit .adl-card td.name input { font-weight: 600; }
      .pk-kit .adl-card td input::placeholder { color: var(--text-faint); font-weight: 400; }
      .pk-kit .adl-card td input:hover { background: var(--adl-input-hover); }
      .pk-kit .adl-card td input:focus { outline: 0; background: var(--surface); box-shadow: 0 0 0 2px var(--adl-indigo); position: relative; z-index: 1; }
      .pk-kit .adl-card td input[type="date"] { min-width: 132px; }
      .pk-kit .adl-card td input:disabled { color: var(--text-muted); cursor: default; }
      .pk-kit .adl-card td input:disabled:hover { background: transparent; }

      /* status pill */
      .pk-kit .adl-pill {
        display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 11px; border-radius: 999px;
        font-size: 12px; font-weight: 600; cursor: pointer; border: 0; font-family: inherit; white-space: nowrap;
        transition: filter .12s;
      }
      .pk-kit .adl-pill:hover { filter: brightness(.97); }
      .pk-kit .adl-pill:disabled { cursor: default; }
      .pk-kit .adl-pill svg { opacity: .6; }
      .pk-kit .adl-pdot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
      .pk-kit .adl-pill.st-newlead { background: var(--adl-indigo-tint); color: #4a4de0; }
      .pk-kit .adl-pill.st-newlead .adl-pdot { background: var(--adl-indigo); }
      .pk-kit .adl-pill.st-dial1 { background: var(--adl-sky-tint); color: #0b76a8; }
      .pk-kit .adl-pill.st-dial1 .adl-pdot { background: var(--adl-sky); }
      .pk-kit .adl-pill.st-dial2 { background: var(--adl-amber-tint); color: #a86a08; }
      .pk-kit .adl-pill.st-dial2 .adl-pdot { background: var(--adl-amber); }
      .pk-kit .adl-pill.st-brushed { background: var(--adl-teal-tint); color: #0f8a7e; }
      .pk-kit .adl-pill.st-brushed .adl-pdot { background: var(--adl-teal); }
      .pk-kit .adl-pill.st-callback { background: var(--adl-violet-tint); color: #7c3aed; }
      .pk-kit .adl-pill.st-callback .adl-pdot { background: var(--adl-violet); }
      .pk-kit .adl-pill.st-booked { background: var(--adl-green-tint); color: #0a7d58; }
      .pk-kit .adl-pill.st-booked .adl-pdot { background: var(--adl-green); }
      .pk-kit .adl-pill.st-notint { background: var(--adl-rose-tint); color: var(--adl-rose-ink); }
      .pk-kit .adl-pill.st-notint .adl-pdot { background: var(--adl-rose); }
      .pk-kit .adl-pill.st-unknown { background: var(--surface-2); color: var(--text-faint); }
      .pk-kit .adl-pill.st-unknown .adl-pdot { background: var(--text-faint); }
      [data-theme="dark"] .pk-kit .adl-pill.st-newlead { color: #a5b4fc; }
      [data-theme="dark"] .pk-kit .adl-pill.st-dial1 { color: #7dd3fc; }
      [data-theme="dark"] .pk-kit .adl-pill.st-dial2 { color: #fcd34d; }
      [data-theme="dark"] .pk-kit .adl-pill.st-brushed { color: #5eead4; }
      [data-theme="dark"] .pk-kit .adl-pill.st-callback { color: #c4b5fd; }
      [data-theme="dark"] .pk-kit .adl-pill.st-booked { color: #6ee7b7; }

      /* status popover */
      .pk-kit .adl-pop {
        position: fixed; z-index: 80; background: var(--surface); border-radius: 14px;
        box-shadow: 0 16px 40px -12px rgba(20,22,28,.34); padding: 6px; min-width: 178px; border: 1px solid var(--border);
      }
      .pk-kit .adl-pop button {
        display: flex; width: 100%; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 9px;
        border: 0; background: transparent; cursor: pointer; font-family: inherit; font-size: 13px;
        font-weight: 500; color: var(--text); text-align: left;
      }
      .pk-kit .adl-pop button:hover { background: var(--surface-2); }
      .pk-kit .adl-sw { width: 11px; height: 11px; border-radius: 4px; flex-shrink: 0; }
      .pk-kit .adl-chk { margin-left: auto; opacity: 0; color: var(--brand-text); display: inline-flex; }
      .pk-kit .adl-pop button.cur .adl-chk { opacity: 1; }

      /* row action */
      .pk-kit .adl-actioncell { width: 46px; text-align: right; }
      .pk-kit .adl-del {
        border: 0; background: transparent; color: var(--text-faint); cursor: pointer; padding: 6px 8px;
        border-radius: 8px; display: inline-flex; align-items: center; font: inherit; font-size: 12px; font-weight: 600;
      }
      .pk-kit .adl-del:hover { color: var(--danger); background: var(--danger-tint); }
      .pk-kit .adl-del.armed { color: var(--danger); background: var(--danger-tint); }

      /* footer add row + empty state */
      .pk-kit .adl-addrow td { padding: 0; border-bottom: 0; }
      .pk-kit .adl-addrow button {
        display: inline-flex; align-items: center; gap: 8px; width: 100%; text-align: left; border: 0;
        background: transparent; color: var(--brand-text); font-family: inherit; font-weight: 600;
        font-size: 13px; padding: 12px 16px; cursor: pointer;
      }
      .pk-kit .adl-addrow button:hover:not(:disabled) { background: var(--brand-tint); }
      .pk-kit .adl-addrow button:disabled { opacity: .6; cursor: not-allowed; }
      .pk-kit .adl-empty { padding: 40px; text-align: center; color: var(--text-faint); font-size: 13.5px; }

      /* Cold Call workspace: the stage header above the table */
      .pk-kit .ccs-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 22px; }
      .pk-kit .ccs-stage { display: flex; align-items: center; gap: 10px; }
      .pk-kit .ccs-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
      .pk-kit .ccs-name { font-family: var(--font-display); font-weight: 600; font-size: 20px; letter-spacing: -.01em; color: var(--text); }
      .pk-kit .ccs-meaning { font-size: 13px; color: var(--text-muted); margin-top: 5px; }
      .pk-kit .ccs-tag { font-size: 11.5px; color: var(--text-faint); margin-top: 4px; font-variant-numeric: tabular-nums; }
      .pk-kit .ccs-tag code { background: var(--surface-2); border-radius: 6px; padding: 1px 6px; font-size: 11px; }
      .pk-kit .ccs-tracker { margin-top: 22px; }
      .pk-kit .ccs-badge {
        display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 7px 13px;
        background: var(--adl-amber-tint); color: #a86a08; font-size: 12px; font-weight: 600; white-space: nowrap;
      }
      [data-theme="dark"] .pk-kit .ccs-badge { color: #fcd34d; }

      @media (max-width: 1200px) { .pk-kit .adl-tiles { grid-template-columns: repeat(4, 1fr); } }
      @media (max-width: 720px) {
        .pk-kit .adl-tiles { grid-template-columns: repeat(2, 1fr); }
        .pk-kit .adl-controls { justify-content: flex-start; }
      }
    `}</style>
  );
}
