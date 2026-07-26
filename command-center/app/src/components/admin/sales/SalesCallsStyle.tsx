// Styles for Sales > Sales Calls, scoped to .pk-kit so they read the admin
// theme tokens and work in light and dark without a second palette.
//
// Everything structural (.pk-list, .pk-li, .pk-tab, .pk-input, .pk-textarea)
// comes from PillarKit; only what is genuinely new to this surface lives here:
// the call cards' right-hand action column, and the full-screen workspace.
export default function SalesCallsStyle() {
  return (
    <style>{`
      .pk-kit .scc-views { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }

      .pk-kit .scc-nudge {
        display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        font-size: 12.5px; color: var(--warning, #b45309); margin-bottom: 12px;
      }

      .pk-kit .scc-search {
        display: flex; align-items: center; gap: 8px; margin-bottom: 12px;
        padding: 9px 13px; border: 1px solid var(--border); border-radius: 12px;
        background: var(--surface); color: var(--text-faint);
      }
      .pk-kit .scc-search input {
        flex: 1; border: 0; background: transparent; font: inherit; color: var(--text); outline: 0;
      }

      /* ---- card ---- */
      .pk-kit .scc-biz { color: var(--text-muted); font-weight: 500; margin-left: 8px; }
      .pk-kit .scc-live,
      .pk-kit .scc-cancelled {
        margin-left: 8px; font-size: 11px; font-weight: 600; padding: 2px 8px;
        border-radius: 999px; vertical-align: middle;
      }
      .pk-kit .scc-live { background: rgba(16,185,129,.16); color: #10b981; }
      .pk-kit .scc-cancelled { background: rgba(199,139,147,.18); color: #a1737a; }

      .pk-kit .scc-meta { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 3px; }
      .pk-kit .scc-chip { display: inline-flex; align-items: center; gap: 4px; }

      .pk-kit .scc-result { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 7px; }
      .pk-kit .scc-pill { font-size: 11.5px; font-weight: 600; padding: 3px 10px; border-radius: 999px; }
      .pk-kit .scc-cash { font-size: 12.5px; font-weight: 600; color: var(--text); }
      .pk-kit .scc-deal,
      .pk-kit .scc-dur { font-size: 12px; color: var(--text-faint); display: inline-flex; align-items: center; gap: 4px; }

      .pk-kit .scc-right { display: flex; align-items: center; gap: 12px; }
      .pk-kit .scc-when { text-align: right; }
      .pk-kit .scc-time { font-size: 13.5px; font-weight: 600; font-variant-numeric: tabular-nums; }
      .pk-kit .scc-date { font-size: 11.5px; color: var(--text-faint); }

      .pk-kit .scc-btn {
        display: inline-flex; align-items: center; gap: 6px; border: 0; cursor: pointer;
        font-family: inherit; font-weight: 600; font-size: 12.5px; padding: 8px 13px;
        border-radius: 11px; background: var(--grad-brand); color: #fff;
        box-shadow: var(--shadow-brand); white-space: nowrap;
      }
      .pk-kit .scc-btn:hover { filter: brightness(1.05); }
      .pk-kit .scc-btn.ghost {
        background: var(--surface-2); color: var(--text-muted); box-shadow: none;
        border: 1px solid var(--border);
      }
      .pk-kit .scc-btn.ghost:hover { color: var(--text); filter: none; }

      /* ---- workspace ---- */
      .pk-kit .scw {
        position: fixed; inset: 0; z-index: 90; background: var(--bg, var(--surface));
        display: flex; flex-direction: column; overflow: hidden;
      }

      .pk-kit .scw-bar {
        display: flex; align-items: center; gap: 16px; padding: 12px 20px;
        border-bottom: 1px solid var(--border); background: var(--surface); flex-shrink: 0;
      }
      .pk-kit .scw-bar-who { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
      .pk-kit .scw-bar-who strong { font-family: var(--font-display); font-size: 16px; }
      .pk-kit .scw-bar-who span { color: var(--text-muted); font-size: 13px; }
      .pk-kit .scw-bar-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
      .pk-kit .scw-saved { font-size: 12px; color: var(--text-faint); }
      .pk-kit .scw-close {
        border: 0; background: transparent; color: var(--text-faint); cursor: pointer;
        padding: 6px; border-radius: 9px; display: inline-flex;
      }
      .pk-kit .scw-close:hover { background: var(--surface-2); color: var(--text); }

      .pk-kit .scw-timer {
        display: inline-flex; align-items: center; gap: 7px; font-variant-numeric: tabular-nums;
        font-weight: 600; font-size: 15px; padding: 5px 13px; border-radius: 999px;
        background: var(--surface-2); color: var(--text-muted);
      }
      .pk-kit .scw-timer.idle { font-size: 12.5px; font-weight: 500; }
      .pk-kit .scw-timer.live { background: rgba(16,185,129,.16); color: #10b981; }
      .pk-kit .scw-dot {
        width: 7px; height: 7px; border-radius: 50%; background: currentColor;
        animation: scw-pulse 1.6s ease-in-out infinite;
      }
      @keyframes scw-pulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }
      @media (prefers-reduced-motion: reduce) {
        .pk-kit .scw-dot { animation: none; }
      }

      .pk-kit .scw-grid {
        flex: 1; min-height: 0; display: grid; grid-template-columns: 280px 1fr 340px;
        gap: 0; overflow: hidden;
      }
      .pk-kit .scw-col { padding: 18px 20px; overflow-y: auto; min-height: 0; }
      .pk-kit .scw-who { border-right: 1px solid var(--border); }
      .pk-kit .scw-outcome { border-left: 1px solid var(--border); background: var(--surface); }

      .pk-kit .scw-facts { display: flex; flex-direction: column; gap: 11px; margin-bottom: 18px; }
      .pk-kit .scw-fact { display: flex; flex-direction: column; gap: 2px; }
      .pk-kit .scw-fact-l { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--text-faint); }
      .pk-kit .scw-fact-v { font-size: 13.5px; color: var(--text); }
      .pk-kit .scw-fact-v a { color: var(--brand-text); display: inline-flex; align-items: center; gap: 5px; }

      .pk-kit .scw-start {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
        border: 0; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 14px;
        padding: 12px 16px; border-radius: 13px; background: var(--grad-brand); color: #fff;
        box-shadow: var(--shadow-brand);
      }
      .pk-kit .scw-start:disabled { opacity: .6; cursor: not-allowed; }

      .pk-kit .scw-hint { font-size: 11.5px; color: var(--text-faint); margin-top: 9px; line-height: 1.5; }

      .pk-kit .scw-section { margin-bottom: 14px; }
      .pk-kit .scw-section label {
        display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 5px;
      }
      .pk-kit .scw-notes .pk-textarea { width: 100%; resize: vertical; }

      /* ---- outcome ---- */
      .pk-kit .scw-outcomes { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
      .pk-kit .scw-oc {
        display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto;
        gap: 2px 9px; align-items: center; text-align: left; cursor: pointer;
        border: 1.5px solid var(--border); background: var(--surface-2); border-radius: 13px;
        padding: 11px 13px; font-family: inherit; color: var(--text);
      }
      .pk-kit .scw-oc:hover { border-color: var(--text-faint); }
      .pk-kit .scw-oc.on { background: var(--surface); }
      .pk-kit .scw-oc-dot { width: 9px; height: 9px; border-radius: 50%; grid-row: 1 / span 2; }
      .pk-kit .scw-oc-l { font-size: 13.5px; font-weight: 600; }
      .pk-kit .scw-oc-m { font-size: 11.5px; color: var(--text-faint); grid-column: 2; }

      .pk-kit .scw-qual { margin-bottom: 18px; }
      .pk-kit .scw-qual-q { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px; }
      .pk-kit .scw-qual-btns { display: flex; gap: 8px; }
      .pk-kit .scw-qb {
        flex: 1; border: 1.5px solid var(--border); background: var(--surface-2); cursor: pointer;
        font-family: inherit; font-size: 12.5px; font-weight: 600; color: var(--text-muted);
        padding: 8px 10px; border-radius: 11px;
      }
      .pk-kit .scw-qb.on { border-color: var(--brand-text); color: var(--brand-text); background: var(--brand-tint); }

      .pk-kit .scw-field { margin-bottom: 14px; }
      .pk-kit .scw-field label { display: block; font-size: 12px; font-weight: 600; color: var(--text-muted); margin-bottom: 5px; }
      .pk-kit .scw-field .pk-input, .pk-kit .scw-field .pk-textarea { width: 100%; }

      /* ---- deal ---- */
      .pk-kit .scw-deal { border-top: 1px solid var(--border); padding-top: 14px; margin-bottom: 16px; }
      .pk-kit .scw-dc { border-radius: 11px; padding: 4px 0; }
      .pk-kit .scw-dc-top { display: flex; align-items: center; gap: 9px; cursor: pointer; padding: 6px 0; }
      .pk-kit .scw-dc-l { font-size: 13px; font-weight: 600; }
      .pk-kit .scw-dc-h { font-size: 11px; color: var(--text-faint); margin-left: auto; }
      .pk-kit .scw-dc-amt { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-muted); }
      .pk-kit .scw-dc-amt .pk-input { flex: 1; text-align: right; font-variant-numeric: tabular-nums; }
      .pk-kit .scw-dc.on .scw-dc-amt { padding: 0 0 8px 26px; }

      .pk-kit .scw-extras { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
      .pk-kit .scw-cash { border-top: 1px solid var(--border); padding-top: 12px; }
      .pk-kit .scw-dealsum {
        font-size: 12.5px; color: var(--text-muted); background: var(--surface-2);
        padding: 9px 12px; border-radius: 10px; line-height: 1.5;
      }

      .pk-kit .scw-log { border-top: 1px solid var(--border); padding-top: 14px; }
      .pk-kit .scw-missing { font-size: 12px; color: var(--text-faint); margin-bottom: 8px; }
      .pk-kit .scw-logbtn {
        display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%;
        border: 0; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 14px;
        padding: 12px 16px; border-radius: 13px; background: var(--grad-brand); color: #fff;
        box-shadow: var(--shadow-brand);
      }
      .pk-kit .scw-logbtn:disabled { opacity: .45; cursor: not-allowed; box-shadow: none; }

      /* A phone is not where a demo call gets run, but the page must not be
         unusable if one is opened on it. */
      @media (max-width: 1100px) {
        .pk-kit .scw-grid { grid-template-columns: 1fr; overflow-y: auto; }
        .pk-kit .scw-who, .pk-kit .scw-outcome { border: 0; border-top: 1px solid var(--border); }
        .pk-kit .scw-col { overflow: visible; }
      }
    `}</style>
  );
}
