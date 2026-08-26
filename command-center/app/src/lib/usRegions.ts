// The three blocks the map is tinted by: West, Central, East.
//
// These are calling blocks, not geography. The scraped book feeds a power
// dialer, so what a region has to answer is "can I ring these people right now",
// and that makes the split a time-zone one.
//
// The Mountain states sit with the West by Jake's call. Four buckets read the
// time zones more honestly, but three is what gets used, and a Denver number
// dialled on a Pacific schedule is an hour early rather than three hours wrong.
//
// The two split states are assigned by where their people are, not by where the
// zone line falls. Tennessee is Central because Nashville and Memphis are, and
// Kentucky is Eastern because Louisville and Lexington are. A state has to be in
// exactly one block or the map cannot colour it.

export type Region = "west" | "central" | "east";

export const REGION_LABEL: Record<Region, string> = {
  west: "West Coast",
  central: "Central",
  east: "East Coast",
};

export const REGIONS: Region[] = ["west", "central", "east"];

const WEST = ["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NM", "NV", "OR", "UT", "WA", "WY"];
const CENTRAL = ["AL", "AR", "IA", "IL", "KS", "LA", "MN", "MO", "MS", "ND", "NE", "OK", "SD", "TN", "TX", "WI"];
const EAST = ["CT", "DC", "DE", "FL", "GA", "IN", "KY", "MA", "MD", "ME", "MI", "NC", "NH", "NJ", "NY", "OH", "PA", "RI", "SC", "VA", "VT", "WV"];

const BY_STATE: Record<string, Region> = {};
for (const code of WEST) BY_STATE[code] = "west";
for (const code of CENTRAL) BY_STATE[code] = "central";
for (const code of EAST) BY_STATE[code] = "east";

export const REGION_STATES: Record<Region, string[]> = {
  west: WEST,
  central: CENTRAL,
  east: EAST,
};

/**
 * The block a two-letter state code belongs to, or null for anything that is not
 * one of the fifty states or DC.
 *
 * Null rather than a default block: a territory or a typo silently painted
 * Central would be a lie told in colour, and the map would rather leave a shape
 * uncoloured than claim it can be called at nine in the morning.
 */
export function regionOf(stateCode: string | null | undefined): Region | null {
  if (!stateCode) return null;
  return BY_STATE[stateCode.trim().toUpperCase()] ?? null;
}
