// Styles for KeysPanel, scoped to .kp.
//
// Carried with the component rather than added to a page stylesheet because the
// panel renders inside two different shells: Settings wraps its content in
// .pk-kit, Onboarding does not. Depending on either one would make the panel
// look right in one place and wrong in the other.
//
// Same tokens as everything else, so it inherits light and dark for free.
export function KeysPanelStyle() {
  return (
    <style>{`
      .kp { display: flex; flex-direction: column; }

      .kp-head { display: flex; align-items: flex-start; gap: 13px; margin-bottom: 22px; }
      .kp-icon { flex-shrink: 0; display: grid; place-items: center; width: 34px; height: 34px; margin-top: 1px; border-radius: 10px; background: var(--brand-tint); color: var(--brand-text); }
      .kp-title { font-family: var(--font-display); font-size: 17px; font-weight: 600; letter-spacing: -0.01em; margin: 0; color: var(--text); }
      .kp-blurb { color: var(--text-muted); font-size: 13px; line-height: 1.6; margin: 4px 0 0; max-width: 68ch; }
      .kp-counts { margin-left: auto; display: flex; gap: 7px; flex-wrap: wrap; flex-shrink: 0; }
      .kp-count { font-size: 11.5px; font-weight: 600; border-radius: 999px; padding: 4px 11px; white-space: nowrap; }
      .kp-count-live { color: var(--positive); background: var(--positive-tint); }
      .kp-count-pending { color: var(--warning); background: var(--warning-tint); }
      .kp-count-missing { color: var(--text-faint); background: var(--surface-2); }

      .kp-loading { color: var(--text-muted); font-size: 13px; padding: 22px 0; }

      .kp-note { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 16px; padding: 12px 15px; border-radius: 12px; font-size: 13px; line-height: 1.6; color: var(--text); }
      .kp-note code { font-family: var(--font-mono); font-size: 12px; }
      .kp-note svg { flex-shrink: 0; margin-top: 2px; }
      .kp-note-warn { background: var(--warning-tint); border: 1px solid color-mix(in srgb, var(--warning) 32%, var(--border)); }
      .kp-note-warn svg { color: var(--warning); }
      .kp-note-bad { background: var(--danger-tint); border: 1px solid color-mix(in srgb, var(--danger) 32%, var(--border)); }
      .kp-note-bad svg { color: var(--danger); }

      /* groups */
      .kp-group { margin-bottom: 26px; }
      .kp-grouphead { margin-bottom: 10px; }
      .kp-grouphead h3 { font-family: var(--font-display); font-size: 14px; font-weight: 600; letter-spacing: -0.005em; margin: 0; color: var(--text); }
      .kp-grouphead p { color: var(--text-faint); font-size: 12px; line-height: 1.55; margin: 3px 0 0; max-width: 72ch; }
      .kp-rows { display: flex; flex-direction: column; gap: 8px; }

      /* one key */
      .kp-row { display: flex; align-items: flex-start; gap: 16px; padding: 13px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
      .kp-row-pending { border-color: color-mix(in srgb, var(--warning) 42%, var(--border)); background: color-mix(in srgb, var(--warning-tint) 40%, var(--surface)); }
      .kp-rowmain { min-width: 0; flex: 1; }
      .kp-rowid { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
      .kp-name { font-family: var(--font-mono); font-size: 12.5px; font-weight: 600; color: var(--text); word-break: break-all; }
      .kp-mask { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-faint); }
      .kp-help { color: var(--text-faint); font-size: 12px; line-height: 1.55; margin: 6px 0 0; max-width: 76ch; }
      .kp-warn { display: flex; align-items: flex-start; gap: 6px; color: var(--warning); font-size: 11.5px; line-height: 1.5; margin: 6px 0 0; max-width: 76ch; }
      .kp-warn svg { flex-shrink: 0; margin-top: 2px; }
      .kp-err { color: var(--danger); font-size: 12px; line-height: 1.5; margin: 7px 0 0; }

      .kp-pill { font-size: 10.5px; font-weight: 700; letter-spacing: 0.02em; border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
      .kp-pill-live { color: var(--positive); background: var(--positive-tint); }
      .kp-pill-pending { color: var(--warning); background: var(--warning-tint); }
      .kp-pill-missing { color: var(--text-faint); background: var(--surface-2); }
      .kp-lockpill { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; font-weight: 600; color: var(--text-faint); background: var(--surface-2); border-radius: 999px; padding: 3px 8px; }

      /* controls */
      .kp-rowact { flex-shrink: 0; }
      .kp-editrow { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; justify-content: flex-end; }
      .kp-input { padding: 8px 11px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-2); color: var(--text); font: inherit; font-size: 12.5px; outline: none; min-width: 210px; }
      .kp-input:focus { border-color: var(--brand); background: var(--surface); }
      .kp-input::placeholder { color: var(--text-faint); }

      .kp-primary { display: inline-flex; align-items: center; gap: 6px; padding: 8px 15px; border: 0; border-radius: 999px; background: var(--grad-brand); color: #fff; font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; box-shadow: var(--shadow-brand); white-space: nowrap; }
      .kp-primary:disabled { opacity: .45; cursor: default; box-shadow: none; }
      .kp-ghost { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); color: var(--text); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }
      .kp-ghost:hover:not(:disabled) { border-color: var(--brand); color: var(--brand-text); }
      .kp-ghost:disabled { opacity: .5; cursor: default; }
      .kp-danger { display: inline-flex; align-items: center; gap: 5px; padding: 7px 13px; border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border)); border-radius: 999px; background: var(--danger-tint); color: var(--danger); font: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }

      /* confirm before rotating something with a consequence */
      .kp-confirm { margin-top: 10px; padding: 11px 13px; border-radius: 10px; background: var(--danger-tint); border: 1px solid color-mix(in srgb, var(--danger) 30%, var(--border)); }
      .kp-confirm p { display: flex; align-items: flex-start; gap: 7px; color: var(--text); font-size: 12.5px; line-height: 1.55; margin: 0; }
      .kp-confirm svg { color: var(--danger); flex-shrink: 0; margin-top: 2px; }
      .kp-confirmacts { display: flex; gap: 8px; margin-top: 10px; }

      /* the one time a generated value is shown */
      .kp-reveal { margin-top: 10px; padding: 12px 13px; border-radius: 10px; background: var(--positive-tint); border: 1px solid color-mix(in srgb, var(--positive) 30%, var(--border)); }
      .kp-revealhead { display: flex; align-items: center; gap: 7px; color: var(--text); font-size: 12.5px; font-weight: 600; margin-bottom: 9px; }
      .kp-revealhead svg { color: var(--positive); }
      .kp-revealrow { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; flex-wrap: wrap; }
      .kp-revealrow code { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); min-width: 150px; }
      .kp-revealval { flex: 1; font-family: var(--font-mono); font-size: 11.5px; min-width: 200px; }
      .kp-dismiss { margin-top: 3px; }

      /* the footer that finishes the job */
      .kp-apply { position: sticky; bottom: 0; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-top: 8px; padding: 15px 18px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); box-shadow: var(--shadow-md, 0 8px 26px rgb(0 0 0 / 0.10)); }
      .kp-apply-hot { border-color: color-mix(in srgb, var(--warning) 45%, var(--border)); }
      .kp-apply-off { background: var(--warning-tint); border-color: color-mix(in srgb, var(--warning) 32%, var(--border)); align-items: flex-start; font-size: 13px; line-height: 1.6; color: var(--text); }
      .kp-apply-off svg { color: var(--warning); flex-shrink: 0; margin-top: 2px; }
      .kp-apply-off code { font-family: var(--font-mono); font-size: 11.5px; background: var(--surface); border: 1px solid var(--border); border-radius: 5px; padding: 1px 6px; }
      .kp-applytext { display: flex; align-items: center; gap: 9px; flex: 1; min-width: 240px; color: var(--text); font-size: 12.5px; line-height: 1.55; }
      .kp-applytext svg { flex-shrink: 0; color: var(--text-muted); }
      .kp-applybtn { margin-left: auto; }
      .kp-applyerr { flex-basis: 100%; margin: 0; }
      .kp-applynote { flex-basis: 100%; color: var(--text-faint); font-size: 11.5px; line-height: 1.5; margin: 0; }

      .kp-spin { animation: kp-spin 1s linear infinite; }
      @keyframes kp-spin { to { transform: rotate(360deg); } }

      @media (max-width: 720px) {
        .kp-row { flex-direction: column; gap: 11px; }
        .kp-rowact { width: 100%; }
        .kp-editrow { justify-content: flex-start; }
        .kp-input { min-width: 0; width: 100%; }
        .kp-counts { margin-left: 0; flex-basis: 100%; }
        .kp-head { flex-wrap: wrap; }
      }
    `}</style>
  );
}
