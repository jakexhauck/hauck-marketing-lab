// Which timezone a North American phone number is in.
//
// One map, two consumers. The caller's screen reads it to answer "is it a
// reasonable hour there" before a number is dialled; the Leads page reads it to
// filter a list down to one zone. Keeping it here rather than in the browser
// bundle is what stops those two from ever disagreeing about where a 208 number
// is, which they would the first time one of them was edited alone.
//
// Area codes follow states, and several states straddle a zone line, so a
// handful of numbers are an hour out. Each code is filed under the zone MOST of
// its territory keeps. That is a known inaccuracy, labelled as an inference
// wherever a time is shown, and it is still far better than no idea at all.

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
export const ZONE_BY_AREA_CODE: Record<string, string> = (() => {
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

// The zones the Leads page offers as a filter, in the order a US list reads.
//
// Four, not the ten ZONE_CHOICES carries. This list exists to cut a calling day
// into workable halves ("it is not 8am in California yet"), and a zone that
// never appears in a list of US contractors would be a control that only ever
// filtered to nothing. Everything else is still reachable, because the filter
// starts on every timezone and that is where it stays until it is used.
export const CALL_ZONES: { zone: string; label: string }[] = [
  { zone: "America/New_York", label: "Eastern" },
  { zone: "America/Chicago", label: "Central" },
  { zone: "America/Denver", label: "Mountain" },
  { zone: "America/Los_Angeles", label: "Pacific" },
];

export function isCallZone(value: unknown): boolean {
  return typeof value === "string" && CALL_ZONES.some((c) => c.zone === value);
}

// Every area code in a zone, for the filter's own query.
//
// Read off the same map the clock is read from, so a zone can never mean one set
// of numbers on the Leads page and another on the call card. Arizona is its own
// zone here and is deliberately NOT folded into Mountain: it does not move for
// daylight saving, so for most of the year a Phoenix number is an hour out from
// a Denver one, which is the whole reason the filter is worth having.
export function areaCodesForZone(zone: string): string[] {
  return AREA_CODES[zone] ?? [];
}
