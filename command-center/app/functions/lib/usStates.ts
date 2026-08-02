// US state names to their two-letter codes.
//
// Needed because the same state is written three different ways across this
// system: Jake's cities sheet says "Michigan", lead_metros says "MI", and a
// scraped lead's `state` column holds whichever of the two Google happened to
// return. Rather than normalising the leads table (a destructive rewrite of data
// we did not author), everything is compared through this map.

export const STATE_CODE: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  "district of columbia": "DC",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "puerto rico": "PR",
};

// Name or code in, code out. Returns "" for anything unrecognised rather than
// guessing, so a bad value fails to match instead of matching the wrong state.
export function stateCode(input: string): string {
  const t = (input ?? "").trim();
  if (!t) return "";
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return STATE_CODE[t.toLowerCase()] ?? "";
}

// Every spelling a given state might be stored as, lowercased, for matching
// against a column that holds a mixture.
export function stateAliases(name: string, code: string): string[] {
  return [name.toLowerCase().trim(), code.toLowerCase().trim()].filter(Boolean);
}
