// Client > Folder, layered on the Brief's .mcb tokens (brief/missionStyle.tsx)
// so the two pages read as one family in light and dark.
export function FolderStyle() {
  return (
    <style>{`
      .cf-crumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 2px; margin: -6px 0 14px; font-size: 13.5px; }
      .cf-crumb { padding: 4px 8px; border-radius: 8px; color: var(--text-muted); font-weight: 500; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      button.cf-crumb:hover { background: var(--surface-2); color: var(--text); }
      .cf-crumb.on { color: var(--text); font-weight: 600; }
      .cf-sep { color: var(--text-faint); flex-shrink: 0; }

      .cf-list { padding: 4px 0; transition: border-color .15s, box-shadow .15s, background .15s; }
      .cf-over .cf-list { border-color: var(--brand); box-shadow: 0 0 0 3px var(--brand-tint); background: color-mix(in srgb, var(--brand) 4%, var(--surface)); }
      .cf-row { display: flex; align-items: center; gap: 12px; padding: 3px 10px 3px 6px; border-bottom: 1px solid var(--border); min-height: 50px; transition: opacity .15s; }
      .cf-row:last-child { border-bottom: 0; }
      .cf-row:hover { background: var(--surface-2); }
      .cf-row.busy { opacity: .45; pointer-events: none; }
      .cf-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; padding: 6px; border-radius: 8px; text-align: left; }
      .cf-ic, .cf-thumb { width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0; }
      .cf-ic { display: grid; place-items: center; background: var(--surface-2); }
      .cf-row:hover .cf-ic { background: var(--surface); }
      .cf-thumb { object-fit: cover; background: var(--surface-2); }
      .cf-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
      .cf-kind { width: 64px; color: var(--text-faint); font-size: 12.5px; flex-shrink: 0; }
      .cf-when { width: 92px; text-align: right; color: var(--text-faint); font-size: 12.5px; font-variant-numeric: tabular-nums; flex-shrink: 0; }
      .cf-acts { display: flex; gap: 2px; width: 76px; justify-content: flex-end; flex-shrink: 0; opacity: 0; transition: opacity .12s; }
      .cf-row:hover .cf-acts, .cf-row:focus-within .cf-acts, .cf-acts:has(.arm) { opacity: 1; }
      .cf-act { height: 30px; min-width: 30px; padding: 0 8px; border-radius: 8px; display: grid; place-items: center; color: var(--text-muted); font-size: 12px; font-weight: 600; }
      .cf-act:hover { background: var(--surface); color: var(--text); }
      .cf-act.arm, .cf-act.arm:hover { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
      .cf-input { flex: 1; min-width: 0; font: inherit; font-weight: 500; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--brand); background: var(--surface); color: var(--text); outline: none; box-shadow: 0 0 0 3px var(--brand-tint); }

      .cf-new { position: relative; }
      .cf-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 170px; padding: 5px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); box-shadow: 0 12px 32px rgba(0,0,0,.18); transform-origin: top right; }
      @media (prefers-reduced-motion: no-preference) { .cf-menu { animation: cfPop .16s cubic-bezier(.23,1,.32,1); } }
      @keyframes cfPop { from { opacity: 0; transform: scale(.96) translateY(-4px); } to { opacity: 1; transform: none; } }
      .cf-menu button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 8px; font-size: 13.5px; font-weight: 500; text-align: left; }
      .cf-menu button:hover { background: var(--surface-2); }

      .cf-err { margin: 0 0 12px; padding: 9px 12px; border-radius: 10px; font-size: 13px; background: color-mix(in srgb, var(--danger) 10%, transparent); color: var(--danger); overflow-wrap: anywhere; }
      .cf-doc { display: block; width: 100%; height: calc(100vh - 150px); min-height: 560px; border: 1px solid var(--border); border-radius: 14px; background: #fff; }
      .cf-file { font-family: var(--font-display); font-weight: 600; font-size: 18px; margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .cf .mcb-head .cf-ic { width: 28px; height: 28px; }
      .cf .mcb-empty { padding: 14px 16px; }
      .cf .mcb-btn:disabled { opacity: .6; cursor: default; }
      .cf-spin { animation: cfSpin 1s linear infinite; }
      @keyframes cfSpin { to { transform: rotate(360deg); } }

      @media (hover: none) { .cf-acts { opacity: 1; } }
      @media (max-width: 640px) {
        .cf-kind { display: none; }
        .cf-when { width: auto; }
      }
    `}</style>
  );
}
