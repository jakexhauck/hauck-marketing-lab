// Scoped styles for the /admin/settings connection control room. Mounted by the
// page, scoped under .pk-kit so every rule reads the Modern Motion theme tokens
// and works in light and dark without a second palette.
//
// Four states, four colours, used consistently everywhere a state appears:
//   live         green   probed and working
//   down         red     credential present but rejected
//   unconfigured amber   never set up
//   unverified   grey    cannot be tested from here, so no claim is made
export function ConnectionsStyle() {
  return (
    <style>{`
      .pk-kit .cx-head { display: flex; align-items: flex-start; gap: 20px; }
      .pk-kit .cx-sub { color: var(--text-muted); font-size: 13.5px; line-height: 1.6; margin-top: 6px; max-width: 68ch; }
      .pk-kit .cx-refresh { margin-left: auto; flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 9px 15px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: border-color .14s, color .14s; }
      .pk-kit .cx-refresh:hover:not(:disabled) { border-color: var(--brand); color: var(--brand-text); }
      .pk-kit .cx-refresh:disabled { opacity: .6; cursor: default; }
      @keyframes cxSpin { to { transform: rotate(360deg); } }
      .pk-kit .cx-spin { animation: cxSpin 1s linear infinite; }

      /* notices */
      .pk-kit .cx-note { display: flex; align-items: flex-start; gap: 10px; margin-top: 16px; padding: 12px 15px; border-radius: 12px; font-size: 13px; line-height: 1.6; }
      .pk-kit .cx-note code { font-family: var(--font-mono); font-size: 12px; }
      .pk-kit .cx-note-warn { background: var(--warning-tint); border: 1px solid color-mix(in srgb, var(--warning) 32%, var(--border)); color: var(--text); }
      .pk-kit .cx-note-warn svg { color: var(--warning); flex-shrink: 0; margin-top: 1px; }
      .pk-kit .cx-note-bad { background: var(--danger-tint); border: 1px solid color-mix(in srgb, var(--danger) 32%, var(--border)); color: var(--text); }
      .pk-kit .cx-note-bad svg { color: var(--danger); flex-shrink: 0; margin-top: 1px; }

      /* summary strip */
      .pk-kit .cx-score { display: flex; align-items: flex-end; gap: 34px; margin: 22px 0 4px; flex-wrap: wrap; }
      .pk-kit .cx-score-val { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.1; }
      .pk-kit .cx-score-label { color: var(--text-muted); font-size: 11.5px; font-weight: 500; margin-top: 3px; }
      .pk-kit .cx-score-when { margin-left: auto; color: var(--text-faint); font-size: 12px; font-family: var(--font-mono); }
      .pk-kit .cx-tone-live { color: var(--positive); }
      .pk-kit .cx-tone-down { color: var(--danger); }
      .pk-kit .cx-tone-unconfigured { color: var(--warning); }
      .pk-kit .cx-tone-unverified { color: var(--text-faint); }

      .pk-kit .cx-tabcount { font-size: 11px; font-weight: 700; color: #fff; background: var(--danger); border-radius: 999px; padding: 1px 7px; }
      .pk-kit .cx-tabintro { color: var(--text-muted); font-size: 13.5px; line-height: 1.6; max-width: 74ch; margin: -6px 0 18px; }

      /* state pill */
      .pk-kit .cx-pill { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; padding: 4px 11px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; }
      .pk-kit .cx-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: currentColor; }
      .pk-kit .cx-pill-live { color: var(--positive); background: var(--positive-tint); }
      .pk-kit .cx-pill-down { color: var(--danger); background: var(--danger-tint); }
      .pk-kit .cx-pill-unconfigured { color: var(--warning); background: var(--warning-tint); }
      .pk-kit .cx-pill-unverified { color: var(--text-faint); background: var(--surface-2); }

      /* rows */
      .pk-kit .cx-list { display: flex; flex-direction: column; gap: 8px; }
      .pk-kit .cx-row, .pk-kit .cx-srow { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); overflow: hidden; }
      .pk-kit .cx-row-attention { border-color: color-mix(in srgb, var(--danger) 38%, var(--border)); }
      .pk-kit .cx-rowhead { display: flex; align-items: center; gap: 12px; width: 100%; padding: 15px 18px; border: 0; background: transparent; font: inherit; color: inherit; text-align: left; cursor: pointer; }
      .pk-kit .cx-rowhead:hover { background: var(--surface-2); }
      .pk-kit .cx-chev { color: var(--text-faint); flex-shrink: 0; transition: transform .16s ease; }
      .pk-kit .cx-chev.on { transform: rotate(90deg); color: var(--brand-text); }
      .pk-kit .cx-rowmain { flex: 1; min-width: 0; }
      .pk-kit .cx-rowtitle { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
      .pk-kit .cx-rowtitle a { color: inherit; text-decoration: none; }
      .pk-kit .cx-rowtitle a:hover { color: var(--brand-text); }
      .pk-kit .cx-rowreason { color: var(--text-muted); font-size: 12.5px; margin-top: 4px; line-height: 1.5; }
      .pk-kit .cx-scope { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text-faint); background: var(--surface-2); border-radius: 999px; padding: 2px 8px; }

      /* expanded body */
      .pk-kit .cx-body { padding: 4px 18px 20px 46px; border-top: 1px solid var(--divider); }
      .pk-kit .cx-purpose { color: var(--text); font-size: 13.5px; line-height: 1.65; margin: 16px 0 18px; max-width: 76ch; }
      .pk-kit .cx-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 26px; }
      .pk-kit .cx-h4 { font-family: var(--font-display); font-size: 11.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 10px; }

      .pk-kit .cx-creds { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
      .pk-kit .cx-credtop { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .pk-kit .cx-creds code, .pk-kit .cx-table code { font-family: var(--font-mono); font-size: 12px; color: var(--text); background: var(--surface-2); border-radius: 6px; padding: 2px 7px; }
      .pk-kit .cx-credhome { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; color: var(--text-muted); font-size: 12px; margin-top: 5px; }
      .pk-kit .cx-doppler { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--brand-text); background: var(--brand-tint); border-radius: 999px; padding: 2px 8px; }
      .pk-kit .cx-opt { font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-faint); border: 1px solid var(--border); border-radius: 999px; padding: 1px 7px; }
      .pk-kit .cx-present { font-size: 10.5px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; border-radius: 999px; padding: 2px 8px; }
      .pk-kit .cx-present.yes { color: var(--positive); background: var(--positive-tint); }
      .pk-kit .cx-present.no { color: var(--danger); background: var(--danger-tint); }
      .pk-kit .cx-note-sm { color: var(--text-faint); font-size: 12px; line-height: 1.55; margin-top: 5px; max-width: 62ch; }

      .pk-kit .cx-surfaces { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
      .pk-kit .cx-surfaces li { display: flex; align-items: center; gap: 9px; font-size: 13.5px; }
      .pk-kit .cx-surfaces a { display: inline-flex; align-items: center; gap: 5px; color: var(--text); text-decoration: none; }
      .pk-kit .cx-surfaces a:hover { color: var(--brand-text); }
      .pk-kit .cx-surfaces a svg { color: var(--text-faint); }
      .pk-kit .cx-aud { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 999px; padding: 2px 7px; flex-shrink: 0; }
      .pk-kit .cx-aud-client { color: var(--brand-text); background: var(--brand-tint); }
      .pk-kit .cx-aud-admin { color: var(--text-faint); background: var(--surface-2); }

      .pk-kit .cx-fix { margin-top: 22px; padding: 14px 16px; border-radius: 12px; background: var(--surface-2); border: 1px dashed var(--border); }
      .pk-kit .cx-fix p { color: var(--text-muted); font-size: 13px; line-height: 1.65; margin: 0; max-width: 82ch; }

      /* by-surface rows */
      .pk-kit .cx-srow { display: flex; align-items: center; gap: 16px; padding: 15px 18px; }
      .pk-kit .cx-reqs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      .pk-kit .cx-req { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 999px; background: var(--surface-2); }
      .pk-kit .cx-req-live { color: var(--positive); }
      .pk-kit .cx-req-down { color: var(--danger); background: var(--danger-tint); }
      .pk-kit .cx-req-unconfigured { color: var(--warning); background: var(--warning-tint); }
      .pk-kit .cx-req-unverified { color: var(--text-faint); }
      .pk-kit .cx-blame { flex-shrink: 0; color: var(--danger); font-size: 12px; font-weight: 600; text-align: right; max-width: 240px; line-height: 1.5; }

      /* tables */
      .pk-kit .cx-search { width: 100%; max-width: 380px; margin-bottom: 16px; padding: 9px 13px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; outline: none; }
      .pk-kit .cx-search:focus { border-color: var(--brand); }
      .pk-kit .cx-search::placeholder { color: var(--text-faint); }
      .pk-kit .cx-table { width: 100%; border-collapse: collapse; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); overflow: hidden; }
      .pk-kit .cx-table th { text-align: left; font-family: var(--font-display); font-size: 11px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--text-muted); padding: 12px 16px; background: var(--surface-2); border-bottom: 1px solid var(--border); white-space: nowrap; }
      .pk-kit .cx-table td { padding: 13px 16px; border-bottom: 1px solid var(--divider); font-size: 13px; vertical-align: top; }
      .pk-kit .cx-table tbody tr:last-child td { border-bottom: 0; }
      .pk-kit .cx-table td .cx-opt, .pk-kit .cx-table td .cx-doppler { margin-left: 8px; }
      .pk-kit .cx-tr-attention { background: var(--danger-tint); }
      .pk-kit .cx-cname { font-family: var(--font-display); font-size: 14px; font-weight: 600; }
      .pk-kit .cx-cslug { color: var(--text-faint); font-family: var(--font-mono); font-size: 11.5px; margin-top: 3px; }

      /* ===== The split screen: work left, reassurance right ===== */
      .pk-kit .cx-board { display: grid; grid-template-columns: minmax(0, 1.9fr) minmax(210px, 0.8fr); gap: 40px; margin-top: 26px; align-items: start; }
      .pk-kit .cx-colhead { display: flex; align-items: center; gap: 10px; font-family: var(--font-display); font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-muted); margin: 0 0 14px; }
      .pk-kit .cx-colhead-calm { color: var(--text-faint); }
      .pk-kit .cx-colhead-grey { margin-top: 26px; }
      .pk-kit .cx-count { font-family: var(--font-mono); font-size: 11px; font-weight: 700; letter-spacing: 0; color: var(--text-muted); background: var(--surface-2); border-radius: 999px; padding: 2px 8px; }
      .pk-kit .cx-count.on { color: #fff; background: var(--danger); }

      /* Jobs. Big enough to read from a lean-back, one consequence line each. */
      .pk-kit .cx-jobs { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
      .pk-kit .cx-job { display: flex; align-items: center; gap: 20px; background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--text-faint); border-radius: 12px; padding: 16px 18px; box-shadow: var(--shadow-sm); }
      .pk-kit .cx-job-client-down { border-left-color: var(--danger); background: var(--danger-tint); }
      .pk-kit .cx-job-down { border-left-color: var(--danger); }
      .pk-kit .cx-job-drift { border-left-color: var(--warning); }
      .pk-kit .cx-job-setup { border-left-color: var(--text-faint); }
      .pk-kit .cx-job-main { flex: 1; min-width: 0; }
      .pk-kit .cx-job-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-family: var(--font-display); font-size: 15.5px; font-weight: 600; letter-spacing: -0.01em; }
      .pk-kit .cx-job-why { color: var(--text-muted); font-size: 13px; line-height: 1.55; margin: 6px 0 0; max-width: 68ch; }
      .pk-kit .cx-sev { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 999px; padding: 3px 8px; flex-shrink: 0; }
      .pk-kit .cx-sev-client-down { color: #fff; background: var(--danger); }
      .pk-kit .cx-sev-down { color: var(--danger); background: var(--danger-tint); }
      .pk-kit .cx-sev-drift { color: var(--warning); background: var(--warning-tint); }
      .pk-kit .cx-sev-setup { color: var(--text-faint); background: var(--surface-2); }
      .pk-kit .cx-job-btn { flex-shrink: 0; display: inline-flex; align-items: center; gap: 7px; padding: 9px 16px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; transition: border-color .14s, color .14s, transform .14s; }
      .pk-kit .cx-job-btn:hover { border-color: var(--brand); color: var(--brand-text); transform: translateX(2px); }

      .pk-kit .cx-allclear { display: flex; align-items: center; gap: 16px; padding: 26px 24px; border: 1px dashed color-mix(in srgb, var(--positive) 40%, var(--border)); border-radius: 14px; background: var(--positive-tint); }
      .pk-kit .cx-allclear svg { color: var(--positive); flex-shrink: 0; }
      .pk-kit .cx-allclear strong { font-family: var(--font-display); font-size: 16px; font-weight: 600; }
      .pk-kit .cx-allclear p { color: var(--text-muted); font-size: 13px; margin: 4px 0 0; }

      /* The calm column. Small and quiet on purpose: nine things being fine
         should cost almost no attention. */
      .pk-kit .cx-board-right { border-left: 1px solid var(--divider); padding-left: 30px; }
      .pk-kit .cx-calm { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 9px; }
      .pk-kit .cx-calm li { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text-muted); }
      .pk-kit .cx-calm svg { color: var(--positive); flex-shrink: 0; }
      .pk-kit .cx-calm-grey svg { color: var(--text-faint); }
      .pk-kit .cx-calm-grey li { color: var(--text-faint); }
      .pk-kit .cx-calm-none { color: var(--text-faint); font-style: italic; }

      /* Details: closed by default, opened on purpose. */
      .pk-kit .cx-details { margin-top: 44px; border-top: 1px solid var(--divider); padding-top: 16px; }
      .pk-kit .cx-detailbar { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
      .pk-kit .cx-detaillabel { font-size: 10.5px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--text-faint); margin-right: 6px; }
      .pk-kit .cx-detailtab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid transparent; border-radius: 999px; background: transparent; color: var(--text-faint); font: inherit; font-size: 12.5px; font-weight: 500; cursor: pointer; text-decoration: none; transition: color .14s, background-color .14s, border-color .14s; }
      .pk-kit .cx-detailtab:hover { color: var(--text); background: var(--surface-2); }
      .pk-kit .cx-detailtab.on { color: var(--brand-text); background: var(--brand-tint); border-color: color-mix(in srgb, var(--brand) 30%, transparent); }
      .pk-kit .cx-detailbody { margin-top: 24px; }

      @media (max-width: 1000px) {
        .pk-kit .cx-board { grid-template-columns: 1fr; gap: 30px; }
        .pk-kit .cx-board-right { border-left: 0; padding-left: 0; border-top: 1px solid var(--divider); padding-top: 22px; }
        .pk-kit .cx-job { flex-direction: column; align-items: flex-start; gap: 12px; }
      }

      /* ===== Secrets tab ===== */
      .pk-kit .cx-secblock { margin-bottom: 34px; }
      .pk-kit .cx-sechead { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 16px; }
      .pk-kit .cx-sech3 { font-family: var(--font-display); font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 0; }
      .pk-kit .cx-sechint { color: var(--text-muted); font-size: 13px; line-height: 1.6; margin: 5px 0 0; max-width: 72ch; }
      .pk-kit .cx-sechint code { font-family: var(--font-mono); font-size: 11.5px; background: var(--surface-2); border-radius: 5px; padding: 1px 6px; }
      .pk-kit .cx-select { margin-left: auto; flex-shrink: 0; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; font-size: 13px; }
      .pk-kit .cx-readonly { margin-left: auto; flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600; color: var(--text-faint); background: var(--surface-2); border-radius: 999px; padding: 5px 11px; }

      .pk-kit .cx-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 18px; }
      .pk-kit .cx-field { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; }
      .pk-kit .cx-field-bad { border-color: color-mix(in srgb, var(--danger) 45%, var(--border)); }
      .pk-kit .cx-fieldtop { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-bottom: 9px; }
      .pk-kit .cx-fieldtop label { font-family: var(--font-display); font-size: 13.5px; font-weight: 600; }
      .pk-kit .cx-lock { display: inline-flex; align-items: center; gap: 4px; font-size: 9.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--warning); background: var(--warning-tint); border-radius: 999px; padding: 2px 7px; }
      .pk-kit .cx-cur { margin-left: auto; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
      .pk-kit .cx-cur-empty { color: var(--text-faint); font-style: italic; font-family: var(--font-body); font-size: 12px; }
      .pk-kit .cx-input { width: 100%; padding: 9px 12px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); color: var(--text); font: inherit; font-size: 13px; outline: none; }
      .pk-kit .cx-input:focus { border-color: var(--brand); background: var(--surface); }
      .pk-kit .cx-input::placeholder { color: var(--text-faint); }
      .pk-kit .cx-help { color: var(--text-faint); font-size: 11.5px; line-height: 1.5; margin: 7px 0 0; }
      .pk-kit .cx-field-bad .cx-help { color: var(--danger); }

      .pk-kit .cx-actions { display: flex; align-items: center; gap: 14px; margin-top: 18px; flex-wrap: wrap; }
      .pk-kit .cx-save { display: inline-flex; align-items: center; gap: 7px; padding: 9px 17px; border: 0; border-radius: 999px; background: var(--grad-brand); color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; box-shadow: var(--shadow-brand); }
      .pk-kit .cx-save:disabled { opacity: .45; cursor: default; box-shadow: none; }
      .pk-kit .cx-cancel, .pk-kit .cx-edit { padding: 8px 14px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
      .pk-kit .cx-cancel:hover, .pk-kit .cx-edit:hover { border-color: var(--brand); color: var(--brand-text); }
      .pk-kit .cx-saved { display: inline-flex; align-items: center; gap: 6px; color: var(--positive); font-size: 12.5px; font-weight: 600; }
      .pk-kit .cx-hint { color: var(--text-faint); font-size: 12px; }

      .pk-kit .cx-mask { font-family: var(--font-mono); font-size: 12.5px; }
      .pk-kit .cx-driftpill { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; color: var(--danger); background: var(--danger-tint); border-radius: 999px; padding: 3px 10px; }
      .pk-kit .cx-matchpill { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; color: var(--positive); background: var(--positive-tint); border-radius: 999px; padding: 3px 10px; }
      /* Present but uncomparable. Deliberately not green: there is no Doppler
         value to match against, and an unverifiable state is not a pass. */
      .pk-kit .cx-presentpill { display: inline-flex; align-items: center; font-size: 11.5px; font-weight: 600; color: var(--text-faint); background: var(--surface-2); border-radius: 999px; padding: 3px 10px; }
      .pk-kit .cx-usedby { color: var(--text-muted); font-size: 12px; }
      .pk-kit .cx-rowact { text-align: right; white-space: nowrap; }
      .pk-kit .cx-editrow { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
      .pk-kit .cx-editrow .cx-input { width: 220px; }
      .pk-kit .cx-driftfix { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; margin-top: 8px; font-size: 12.5px; color: var(--text-muted); }
      .pk-kit .cx-driftfix code { font-family: var(--font-mono); font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 3px 9px; color: var(--text); }
      .pk-kit .cx-copy { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text-muted); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer; }
      .pk-kit .cx-copy:hover { color: var(--brand-text); border-color: var(--brand); }

      .pk-kit .cx-foot { margin-top: 30px; display: flex; flex-wrap: wrap; gap: 10px; }
      .pk-kit .cx-footnote { color: var(--text-faint); font-size: 12.5px; line-height: 1.6; margin-top: 12px; max-width: 74ch; }

      /* Narrow: the two-column expanded body stacks, and wide tables scroll
         inside themselves rather than pushing the page sideways. */
      @media (max-width: 720px) {
        .pk-kit .cx-head { flex-direction: column; }
        .pk-kit .cx-refresh { margin-left: 0; }
        .pk-kit .cx-body { padding-left: 18px; }
        .pk-kit .cx-srow { flex-direction: column; align-items: flex-start; }
        .pk-kit .cx-blame { text-align: left; max-width: none; }
      }
    `}</style>
  );
}
