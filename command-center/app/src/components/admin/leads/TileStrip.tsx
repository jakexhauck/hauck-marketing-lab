import type { ReactNode } from "react";

// The bento tile strip. On the Leads book it filters the table; on Cold Calling
// it is the stage navigation and each tile is a page. One presentational
// component either way, so the two surfaces cannot drift apart.
//
// Ported from the .tiles block in docs/mockups/admin-redesign/leads-B.html.

export interface TileSpec {
  key: string;
  label: string;
  // Colour modifier from the shared sheet: t-newlead, t-dial1, and so on.
  tileClass: string;
  icon: ReactNode;
  // Omitted renders an em-less dash: a count that is not known, not a zero.
  value?: number;
}

interface TileStripProps {
  tiles: TileSpec[];
  active: string;
  onSelect: (key: string) => void;
  ariaLabel: string;
}

export default function TileStrip({ tiles, active, onSelect, ariaLabel }: TileStripProps) {
  return (
    <div className="adl-tiles" role="tablist" aria-label={ariaLabel}>
      {tiles.map((tile) => {
        const on = active === tile.key;
        return (
          <button
            key={tile.key}
            type="button"
            role="tab"
            aria-selected={on}
            className={`adl-tile ${tile.tileClass}${on ? " on" : ""}`}
            onClick={() => onSelect(tile.key)}
          >
            <span className="adl-tiletop">
              <span className="adl-tileico" aria-hidden>
                {tile.icon}
              </span>
              <span className="adl-tilelbl">{tile.label}</span>
            </span>
            <span className={`adl-tileval${tile.value === undefined ? " dash" : ""}`}>
              {tile.value === undefined ? "-" : tile.value}
            </span>
          </button>
        );
      })}
    </div>
  );
}
