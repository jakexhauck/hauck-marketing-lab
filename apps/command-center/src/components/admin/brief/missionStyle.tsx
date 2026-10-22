// Scoped to .mcb, on the admin tokens, so it reads in light and dark. The brand
// family is rebuilt from --brand (the client's colour), as the Brief always has.
export function MissionStyle() {
  return (
    <style>{`
      .mcb {
        --brand-2: color-mix(in srgb, var(--brand) 72%, white);
        --grad-brand: linear-gradient(135deg, var(--brand) 0%, var(--brand-2) 100%);
        --brand-tint: color-mix(in srgb, var(--brand) 12%, transparent);
        --brand-text: color-mix(in srgb, var(--brand) 85%, black);
        --mono: var(--font-mono, ui-monospace, SFMono-Regular, monospace);
        color: var(--text); font-family: var(--font-body); font-size: 14px;
      }
      [data-theme="dark"] .mcb { --brand-tint: color-mix(in srgb, var(--brand) 20%, transparent); --brand-text: color-mix(in srgb, var(--brand) 65%, white); }
      .mcb *, .mcb *::before, .mcb *::after { box-sizing: border-box; }
      :where(.mcb) button { font: inherit; cursor: pointer; color: inherit; border: 0; background: none; }
      .mcb a { color: inherit; text-decoration: none; }

      .mcb-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
      .mcb-title { font-family: var(--font-display); font-weight: 600; font-size: 22px; letter-spacing: -.01em; margin: 0; }
      .mcb-grow { flex: 1; }
      .mcb-pages { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); width: fit-content; max-width: 100%; overflow-x: auto; margin-bottom: 22px; scrollbar-width: none; }
      .mcb-pg { padding: 8px 16px; border-radius: 999px; font-weight: 500; font-size: 13.5px; color: var(--text-muted); white-space: nowrap; transition: color .15s, background .15s; }
      .mcb-pg:hover { color: var(--text); }
      .mcb-pg.on { color: #fff; background: var(--grad-brand); box-shadow: 0 6px 18px color-mix(in srgb, var(--brand) 30%, transparent); }
      @media (prefers-reduced-motion: no-preference) { .mcb-page { animation: mcbIn .28s cubic-bezier(.23,1,.32,1); } }
      @keyframes mcbIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

      .mcb-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 18px; }
      .mcb-card.flush { padding: 4px 6px; overflow-x: auto; }
      .mcb-sec { margin-bottom: 26px; }
      .mcb-h { font-family: var(--font-display); font-weight: 600; font-size: 16px; margin: 0 0 12px; letter-spacing: -.01em; display: flex; align-items: center; gap: 10px; }
      .mcb-h .act { margin-left: auto; font-family: var(--font-body); display: flex; gap: 6px; }
      .mcb-ch { font-family: var(--font-display); font-weight: 600; font-size: 14.5px; margin: 0 0 6px; }
      .mcb-empty { color: var(--text-faint); font-size: 13.5px; padding: 6px 0; }
      .mcb-btn { border: 1px solid var(--border) !important; background: var(--surface) !important; border-radius: 999px; padding: 6px 13px; font-size: 12.5px !important; font-weight: 500; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
      .mcb-btn:hover { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)) !important; }

      .mcb-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 26px; }
      .mcb-stat span { font-size: 12px; color: var(--text-faint); }
      .mcb-stat b { display: block; font-family: var(--mono); font-size: 22px; margin-top: 4px; font-variant-numeric: tabular-nums; font-weight: 600; }

      .mcb-tag { display: inline-block; font-size: 11.5px; font-weight: 600; padding: 2px 9px; border-radius: 999px; background: var(--brand-tint); color: var(--brand-text); white-space: nowrap; }
      .mcb-tag.ok { background: color-mix(in srgb, var(--positive) 14%, transparent); color: var(--positive); }
      .mcb-tag.wait { background: color-mix(in srgb, var(--warning) 16%, transparent); color: var(--warning); }
      .mcb-tag.bad { background: color-mix(in srgb, var(--danger) 14%, transparent); color: var(--danger); }
      .mcb-tag.plain { background: var(--surface-2); color: var(--text-muted); }

      .mcb-links { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
      .mcb-lk { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); font-weight: 500; transition: border-color .15s, transform .15s; }
      a.mcb-lk:hover { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); transform: translateY(-1px); }
      .mcb-lk.off { opacity: .45; }
      .mcb-lk .ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; color: #fff; background: var(--grad-brand); flex-shrink: 0; }
      .mcb-lk .ic svg { width: 15px; height: 15px; }
      .mcb-lk small { display: block; font-size: 11.5px; color: var(--text-faint); font-weight: 400; }

      .mcb-assets { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; }
      .mcb-as { border-radius: 12px; overflow: hidden; border: 1px solid var(--border); background: var(--surface); display: block; }
      .mcb-as .img { height: 92px; background: var(--surface-2) center / cover no-repeat; }
      .mcb-as p { margin: 0; padding: 7px 10px; font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

      .mcb-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
      .mcb-two { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .mcb-kv { display: flex; gap: 14px; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13.5px; }
      .mcb-kv:last-child { border-bottom: 0; }
      .mcb-kv > span:first-child { width: 140px; flex-shrink: 0; color: var(--text-faint); }
      .mcb-kv > span:nth-child(2) { flex: 1; min-width: 0; overflow-wrap: anywhere; }

      .mcb table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
      .mcb th { text-align: left; font-weight: 500; font-size: 12px; color: var(--text-faint); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
      .mcb td { padding: 10px; border-bottom: 1px solid var(--border); vertical-align: middle; }
      .mcb tr:last-child td { border-bottom: 0; }
      .mcb .num { font-family: var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
      .mcb tr.me td { background: var(--brand-tint); }
      .mcb .mono { font-family: var(--mono); font-size: 12px; color: var(--text-muted); }

      .mcb-setup { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; align-items: start; }
      .mcb-area { margin-bottom: 16px; }
      .mcb-area-h { display: flex; align-items: center; gap: 10px; padding: 4px 4px 10px; border-bottom: 1px solid var(--border); margin-bottom: 4px; }
      .mcb-area-h b { font-family: var(--font-display); font-weight: 600; font-size: 15px; }
      .mcb-bar { width: 140px; height: 6px; border-radius: 99px; background: var(--surface-2); overflow: hidden; }
      .mcb-bar div { height: 100%; background: var(--grad-brand); transition: width .3s; }
      .mcb-task { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 10px; }
      .mcb-task:hover { background: var(--surface-2); }
      .mcb-box { width: 18px; height: 18px; border-radius: 6px; border: 1.6px solid var(--border) !important; flex-shrink: 0; display: grid !important; place-items: center; color: #fff; padding: 0; }
      .mcb-box svg { width: 12px; height: 12px; }
      .mcb-box.on { background: var(--grad-brand) !important; border-color: transparent !important; }
      .mcb-box.doing { border-color: var(--brand) !important; border-style: dashed !important; }
      .mcb-task .t { flex: 1; min-width: 0; }
      .mcb-task.done .t { color: var(--text-faint); text-decoration: line-through; }
      .mcb-owner { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); width: 150px; flex-shrink: 0; }
      .mcb-av { width: 20px; height: 20px; border-radius: 6px; display: grid; place-items: center; color: #fff; font-size: 10px; font-weight: 600; flex-shrink: 0; }
      .mcb-when { font-size: 11.5px; color: var(--text-faint); width: 86px; text-align: right; flex-shrink: 0; }
      .mcb-feed { position: sticky; top: 76px; }
      .mcb-ev { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 13px; line-height: 1.45; }
      .mcb-ev:last-child { border-bottom: 0; }
      .mcb-ev small { display: block; color: var(--text-faint); font-size: 11.5px; }
      .mcb-live { width: 8px; height: 8px; border-radius: 50%; background: var(--positive); box-shadow: 0 0 0 4px color-mix(in srgb, var(--positive) 20%, transparent); }

      .mcb-stars { color: #f5b301; letter-spacing: 1px; white-space: nowrap; }
      .mcb-pain { display: flex; gap: 14px; padding: 12px 0; border-bottom: 1px solid var(--border); }
      .mcb-pain:last-child { border-bottom: 0; }
      .mcb-pain .n { font-family: var(--mono); font-size: 20px; width: 52px; flex-shrink: 0; color: var(--brand-text); font-weight: 600; }
      .mcb-pain b { display: block; margin-bottom: 3px; }
      .mcb-pain q { display: block; color: var(--text-muted); font-size: 13px; margin-top: 4px; }

      .mcb-tree .node { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); margin-bottom: 8px; font-size: 13.5px; }
      .mcb-tree .lvl { font-family: var(--mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--text-faint); width: 64px; flex-shrink: 0; }
      .mcb-tree .i1 { margin-left: 26px; } .mcb-tree .i2 { margin-left: 52px; }
      .mcb-angles { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; }
      .mcb-angles p { margin: 4px 0 10px; color: var(--text-muted); font-size: 13.5px; line-height: 1.5; }
      .mcb tr.ad { cursor: pointer; }
      .mcb tr.ad:hover td { background: var(--surface-2); }
      .mcb .clip { max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-muted); }
      .mcb tr.full td { background: var(--surface-2); padding: 14px 18px 18px; }
      .mcb .copy { white-space: pre-line; line-height: 1.65; max-width: 720px; overflow-wrap: anywhere; }
      .mcb-offer { font-size: 15px; line-height: 1.55; }

      .mcb-sum { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 26px; }
      .mcb-sum b { font-family: var(--mono); font-size: 24px; display: block; margin: 4px 0 8px; }
      .mcb-sum .li { font-size: 13px; padding: 3px 0; color: var(--text-muted); }
      .mcb-stage { display: inline-flex; align-items: center; padding: 6px 12px; border-radius: 8px; background: var(--surface-2); border: 1px solid var(--border); font-size: 12.5px; font-weight: 500; }
      .mcb-arrow { color: var(--text-faint); margin: 0 4px; }
      .mcb-stages { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 0; }

      .mcb-notes { margin-top: 30px; }

      /* What the last approve changed, beside the agent's chat. An inset shadow
         rather than a background, so a card keeps its own surface as it fades.
         Without motion the tint just sits there until the panel clears it. */
      .mcb .mcb-fresh, .mcb tr.mcb-fresh > td { box-shadow: inset 0 0 0 999px var(--brand-tint); }
      .mcb .mcb-card.mcb-fresh { border-color: color-mix(in srgb, var(--brand) 45%, var(--border)); }
      @media (prefers-reduced-motion: no-preference) {
        .mcb .mcb-fresh, .mcb tr.mcb-fresh > td { animation: mcbFresh 3.2s cubic-bezier(.23,1,.32,1) forwards; }
      }
      @keyframes mcbFresh {
        0%, 35% { box-shadow: inset 0 0 0 999px var(--brand-tint); }
        100% { box-shadow: inset 0 0 0 999px transparent; }
      }

      @media (max-width: 1000px) {
        .mcb-setup, .mcb-two, .mcb-sum { grid-template-columns: 1fr; }
        .mcb-feed { position: static; }
      }
      @media (max-width: 640px) {
        .mcb-owner { width: auto; }
        .mcb-owner .nm, .mcb-when { display: none; }
        .mcb-bar { width: 70px; }
        .mcb-kv > span:first-child { width: 110px; }
      }
    `}</style>
  );
}
