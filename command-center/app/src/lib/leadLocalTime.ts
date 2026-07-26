// What time it is where the prospect is.
//
// A cold caller works one list all day and the list is not in one timezone. This
// answers the only question that matters before pressing dial: is it a
// reasonable hour there. Pure and injected with `now`, so it is unit-tested
// rather than trusted.
//
// Two sources, in order of trust:
//   1. The lead's own timezone field, however it was written down.
//   2. The area code of the phone number.
//
// The second is an inference and is labelled as one everywhere it is shown. Area
// codes follow states, and several states straddle a zone line, so a handful of
// numbers will be an hour out. That is worth saying out loud and still worth
// showing: "probably mid-morning there" beats no idea at all.

export type ZoneSource = "lead" | "areaCode";

export interface LeadZone {
  zone: string; // IANA, e.g. "America/Denver"
  source: ZoneSource;
}

// The shorthand people actually type into a timezone field.
const ZONE_WORDS: Record<string, string> = {
  et: "America/New_York",
  est: "America/New_York",
  edt: "America/New_York",
  eastern: "America/New_York",
  "eastern time": "America/New_York",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  central: "America/Chicago",
  "central time": "America/Chicago",
  mt: "America/Denver",
  mst: "America/Denver",
  mdt: "America/Denver",
  mountain: "America/Denver",
  "mountain time": "America/Denver",
  arizona: "America/Phoenix",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  pacific: "America/Los_Angeles",
  "pacific time": "America/Los_Angeles",
  akst: "America/Anchorage",
  alaska: "America/Anchorage",
  hst: "Pacific/Honolulu",
  hawaii: "Pacific/Honolulu",
  atlantic: "America/Halifax",
};

// Area codes by zone. Each code is filed under the zone MOST of its territory
// keeps; split codes (western Kansas, the Florida panhandle, north Idaho) are a
// known and accepted inaccuracy, called out in the UI as an inference.
const AREA_CODES: Record<string, string[]> = {
  "America/New_York": [
    "202","203","207","212","215","216","220","223","226","227","229","231","234",
    "239","240","248","249","252","260","263","267","269","272","276","289","301",
    "302","304","305","313","315","317","321","326","330","332","336","339","343",
    "347","351","352","354","363","365","367","380","382","386","401","404","407",
    "410","412","413","416","419","423","434","437","438","440","443","445","450",
    "463","468","470","475","478","484","502","508","513","514","516","517","518",
    "519","540","548","551","561","567","570","571","574","579","581","582","585",
    "586","603","606","607","609","610","613","614","616","617","631","640","646",
    "647","667","678","679","680","681","683","689","703","704","705","706","716",
    "717","718","724","727","732","734","740","742","743","753","754","757","762",
    "765","770","772","774","781","786","802","803","804","807","810","812","813",
    "814","819","826","828","835","838","839","843","845","848","854","856","857",
    "859","860","862","863","864","865","873","878","904","905","906","908","910",
    "912","914","917","919","929","930","934","937","938","941","943","947","948",
    "954","959","973","978","980","984","989",
  ],
  "America/Chicago": [
    "204","205","210","214","217","218","219","224","225","228","251","254","256",
    "262","270","274","281","308","309","312","314","316","318","319","320","325",
    "327","331","334","337","346","361","364","402","405","409","414","417","430",
    "431","432","447","448","464","469","479","501","504","507","512","515","531",
    "534","539","557","563","572","573","580","601","605","608","612","615","618",
    "620","629","630","636","641","651","659","660","662","682","701","708","712",
    "713","715","726","730","731","737","763","769","773","779","785","806","815",
    "816","817","830","832","847","850","870","872","901","903","913","918","920",
    "931","936","940","945","952","956","972","979","985",
  ],
  "America/Denver": [
    "208","303","307","385","403","406","435","505","575","587","719","720","780",
    "801","825","867","915","970","983","986",
  ],
  "America/Phoenix": ["480","520","602","623","928"],
  "America/Los_Angeles": [
    "206","209","213","236","250","253","279","310","323","341","350","360","369",
    "408","415","424","425","442","458","503","509","510","530","541","559","562",
    "564","604","619","626","628","650","657","661","669","672","702","707","714",
    "725","747","760","764","775","778","805","818","820","831","840","858","909",
    "916","925","935","949","951","971",
  ],
  "America/Anchorage": ["907"],
  "Pacific/Honolulu": ["808"],
  "America/Halifax": ["506","709","782","902"],
  "America/Puerto_Rico": ["340","787","939"],
  "America/Regina": ["306","639"],
};

// Flattened once at module load: area code -> zone.
const ZONE_BY_AREA_CODE: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [zone, codes] of Object.entries(AREA_CODES)) {
    // First zone to claim a code keeps it, so a code listed twice by mistake
    // resolves the same way every time rather than by object key order.
    for (const code of codes) if (!(code in out)) out[code] = zone;
  }
  return out;
})();

// The three-digit area code of a North American number, or "" if there is not
// one to read. Handles a leading 1 and any punctuation.
export function areaCodeOf(phone: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length < 10) return "";
  // An area code never starts with 0 or 1; anything else is not a NANP number
  // we can read, and guessing off it would be worse than saying nothing.
  const code = national.slice(0, 3);
  return /^[2-9]\d\d$/.test(code) ? code : "";
}

function isRealZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// The lead's timezone if it holds anything usable, else the area code's. Null
// when neither says anything, in which case the UI shows no time at all rather
// than a default that would quietly mean "Eastern".
export function zoneForLead(lead: { timezone?: string; phone?: string }): LeadZone | null {
  const written = (lead.timezone ?? "").trim();
  if (written) {
    const word = ZONE_WORDS[written.toLowerCase()];
    if (word) return { zone: word, source: "lead" };
    if (written.includes("/") && isRealZone(written)) return { zone: written, source: "lead" };
  }

  const zone = ZONE_BY_AREA_CODE[areaCodeOf(lead.phone ?? "")];
  return zone ? { zone, source: "areaCode" } : null;
}

// "3:42 PM" in that zone.
export function timeInZone(zone: string, nowMs: number): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(nowMs));
}

// The hour (0-23) in that zone.
export function hourInZone(zone: string, nowMs: number): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hour: "numeric",
    hour12: false,
  }).format(new Date(nowMs));
  // Some runtimes render midnight as "24".
  return Number(hour) % 24;
}

// Outside the hours anyone should be cold-called. The default window is the
// federal telemarketing one: no earlier than 8am, no later than 9pm, local to
// the person being called.
export function isOutsideCallingHours(
  zone: string,
  nowMs: number,
  startHour = 8,
  endHour = 21,
): boolean {
  const hour = hourInZone(zone, nowMs);
  return hour < startHour || hour >= endHour;
}

// The short label under a prospect's name, e.g. "2:14 PM their time".
export function localTimeLabel(zone: string, nowMs: number): string {
  return `${timeInZone(zone, nowMs)} their time`;
}
