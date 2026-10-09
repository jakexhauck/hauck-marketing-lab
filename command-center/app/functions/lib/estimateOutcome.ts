// The estimate outcome link: one hour after an estimate on the client's
// estimate calendar, a GoHighLevel workflow texts the owner
//
//   {{custom_values.estimate_outcome_link}}&c={{contact.id}}
//
// and the page it opens asks what happened. Sold takes the dollar amount AND a
// time on the Job calendar (the page will not save a sale without one, per
// Jake 2026-10-09); Not sold takes a reason; Rescheduled takes a new estimate
// time; No-show takes nothing. A Sold is the Job on the Ads Dashboard
// (estimateTracking.ts) and its amount is the revenue.
//
// Guarded like the call link (callNow.ts): a per-location HMAC key, purpose
// "estimate-outcome", so a workflow can paste it as a constant.
//
// Pure: the endpoint is api/estimate-outcome/.

export const OUTCOME_KEY_PURPOSE = "estimate-outcome";

export type Outcome = "sold" | "not_sold" | "rescheduled" | "no_show";

export const NOT_SOLD_REASONS = [
  "Price",
  "Went with someone else",
  "Not ready yet",
  "Just getting quotes",
  "Other",
] as const;

// Biggest job the page accepts, in dollars. Stops a stray extra zero turning
// into a million-dollar ROAS.
export const MAX_AMOUNT = 1_000_000;

export interface OutcomeInput {
  outcome: Outcome;
  amountCents: number | null;
  reason: string | null;
  // A slot exactly as free-slots returned it (ISO with offset).
  slot: string | null;
}

const ISO_SLOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

// The page's POST body, checked. Returns an error string a person can read.
export function parseOutcomeBody(body: unknown): OutcomeInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const outcome = b.outcome;
  if (outcome !== "sold" && outcome !== "not_sold" && outcome !== "rescheduled" && outcome !== "no_show") {
    return { error: "Pick what happened." };
  }
  const slot = typeof b.slot === "string" && ISO_SLOT.test(b.slot.trim()) ? b.slot.trim() : null;

  if (outcome === "sold") {
    const dollars = typeof b.amount === "number" ? b.amount : Number(String(b.amount ?? "").replace(/[$,\s]/g, ""));
    if (!Number.isFinite(dollars) || dollars <= 0) return { error: "Enter the job amount." };
    if (dollars > MAX_AMOUNT) return { error: "That amount looks too big." };
    if (!slot) return { error: "Pick a time for the job." };
    return { outcome, amountCents: Math.round(dollars * 100), reason: null, slot };
  }
  if (outcome === "not_sold") {
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    if (!(NOT_SOLD_REASONS as readonly string[]).includes(reason)) return { error: "Pick a reason." };
    return { outcome, amountCents: null, reason, slot: null };
  }
  if (outcome === "rescheduled") {
    if (!slot) return { error: "Pick the new estimate time." };
    return { outcome, amountCents: null, reason: null, slot };
  }
  return { outcome, amountCents: null, reason: null, slot: null };
}

export interface ContactAppointment {
  id: string;
  calendarId: string;
  startTime: string;
  status: string;
  deleted?: boolean;
}

// Which estimate the link is about. The workflow cannot be relied on to pass
// the appointment id, so the contact's appointments are read and the one on
// the estimate calendar that started most recently wins (the text goes out an
// hour after it). Failing that, the next upcoming one. A link that does carry
// an id (&a=) is honoured when it really is this contact's estimate.
export function pickEstimateAppointment(
  appointments: ContactAppointment[],
  estimateCalendarId: string,
  nowMs: number,
  wantedId?: string | null,
): ContactAppointment | null {
  const estimates = appointments.filter(
    (a) => a.calendarId === estimateCalendarId && !a.deleted && Number.isFinite(Date.parse(a.startTime)),
  );
  if (wantedId) {
    const hit = estimates.find((a) => a.id === wantedId);
    if (hit) return hit;
  }
  const live = estimates.filter((a) => !a.status.toLowerCase().startsWith("cancel"));
  const pool = live.length > 0 ? live : estimates;
  let past: ContactAppointment | null = null;
  let next: ContactAppointment | null = null;
  for (const a of pool) {
    const at = Date.parse(a.startTime);
    if (at <= nowMs) {
      if (!past || at > Date.parse(past.startTime)) past = a;
    } else if (!next || at < Date.parse(next.startTime)) {
      next = a;
    }
  }
  return past ?? next;
}

// End time for a booking: the calendar's slot length, else an hour.
export function slotEnd(startIso: string, duration?: number, unit?: string): string {
  const mins = !duration || duration <= 0 ? 60 : /hour/i.test(unit ?? "") ? duration * 60 : duration;
  return new Date(Date.parse(startIso) + mins * 60_000).toISOString();
}

// The calendar date of a free-slot string, in the zone it was written in
// ("2026-10-14T09:00:00-04:00" -> "2026-10-14").
export function slotDate(slot: string): string {
  return slot.slice(0, 10);
}

// Stage the lead's card moves to, by name, in the "Sales Pipeline". Null leaves
// the card where it is. GoHighLevel workflows fire on the stage change.
export function stageForOutcome(outcome: Outcome): { stage: string; status?: "won" | "lost" } | null {
  if (outcome === "sold") return { stage: "Job Booked" };
  if (outcome === "not_sold") return { stage: "Lost", status: "lost" };
  if (outcome === "rescheduled") return { stage: "Estimate Booked" };
  return null;
}

// ------------------------------------------------------------------ the page

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export interface OutcomePageInput {
  name: string;
  // Formatted estimate time, e.g. "Tue, Oct 14, 2:00 PM".
  when: string;
  current: { outcome: Outcome; amountCents: number | null; reason: string | null } | null;
  // Same query string as the page, so the script can call back with the key.
  query: string;
  hasJobCalendar: boolean;
}

const LABELS: Record<Outcome, string> = {
  sold: "Sold",
  not_sold: "Not sold",
  rescheduled: "Rescheduled",
  no_show: "No-show",
};

export function currentLabel(c: OutcomePageInput["current"]): string {
  if (!c) return "";
  if (c.outcome === "sold" && c.amountCents !== null) {
    return `Sold $${(c.amountCents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  if (c.outcome === "not_sold" && c.reason) return `Not sold: ${c.reason}`;
  return LABELS[c.outcome];
}

// A message-only page (bad link, nothing to report on).
export function outcomeMessagePage(title: string): string {
  return pageShell(`<h1>${escapeHtml(title)}</h1>`);
}

// The day + time picker both owner pages use. Plain script (no build step on
// these pages): pickSlots(box, url, onPick, onFail) draws a row of days and a
// grid of times from a slots endpoint and calls onPick(slot) or onPick(null).
export const SLOT_PICKER_JS = `
function fmtDay(d){var x=new Date(d+"T12:00:00");return x.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
function fmtTime(s){var h=+s.slice(11,13),m=s.slice(14,16);return ((h%12)||12)+":"+m+(h<12?" AM":" PM")}
function pickRow(row,b){row.querySelectorAll("button").forEach(function(x){x.classList.remove("pick")});b.classList.add("pick")}
function pickSlots(box,url,onPick,onFail){
  box.innerHTML='<p class="empty">Loading times...</p>';
  fetch(url).then(function(r){return r.json()}).then(function(d){
    var days=(d&&d.days)||[];
    if(!days.length){box.innerHTML='<p class="empty">No open times in the next 3 weeks.</p>';return}
    box.innerHTML='<div class="row" data-days></div><div class="times" data-times style="margin-top:10px"></div>';
    var dayRow=box.querySelector("[data-days]"),times=box.querySelector("[data-times]");
    days.forEach(function(day,i){
      var b=document.createElement("button");b.type="button";b.textContent=fmtDay(day.date);
      b.onclick=function(){pickRow(dayRow,b);times.innerHTML="";onPick(null);
        day.slots.forEach(function(s){var t=document.createElement("button");t.type="button";t.textContent=fmtTime(s);
          t.onclick=function(){pickRow(times,t);onPick(s)};times.appendChild(t)})};
      dayRow.appendChild(b);if(i===0)b.click();
    });
  }).catch(function(){onFail();box.innerHTML='<p class="empty">Could not load times. Try again.</p>'});
}`;

export function pageShell(body: string, script = "", title = "Estimate outcome"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#0A1D19;--card:#11302A;--line:#1E4A40;--ink:#fff;--mute:#9DB8B0;--brand:#4DBB83;--bad:#E5675C}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:var(--bg);color:var(--ink);font-family:Inter,system-ui,sans-serif;padding:24px 16px;display:flex;justify-content:center}
main{width:100%;max-width:440px}
h1{font-family:Poppins,Inter,system-ui,sans-serif;font-weight:600;font-size:22px;line-height:1.3;margin:8px 0 12px}
h2{font-family:Poppins,Inter,system-ui,sans-serif;font-weight:600;font-size:16px;margin:24px 0 10px}
.chip{display:inline-block;font-size:13px;color:var(--mute);border:1px solid var(--line);border-radius:999px;padding:4px 12px;margin:0 6px 6px 0}
.chip.on{color:var(--bg);background:var(--brand);border-color:var(--brand)}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:20px}
button{font:600 16px Poppins,Inter,system-ui,sans-serif;border-radius:14px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:16px 12px;cursor:pointer;min-height:52px}
button.pick{background:var(--brand);color:var(--bg);border-color:var(--brand)}
button:disabled{opacity:.4;cursor:default}
.list{display:flex;flex-direction:column;gap:8px}
.row{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}
.row button{flex:0 0 auto;padding:10px 14px;min-height:44px;font-size:14px}
.times{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.times button{padding:10px 4px;min-height:44px;font-size:14px}
input{width:100%;font:600 22px Poppins,Inter,system-ui,sans-serif;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.save{width:100%;margin-top:20px;background:var(--brand);color:var(--bg);border-color:var(--brand)}
.err{color:var(--bad);font-size:14px;margin-top:12px;min-height:18px}
.hide{display:none}
.empty{color:var(--mute);font-size:14px}
</style></head><body><main>${body}</main>${script}</body></html>`;
}

export function outcomePage(p: OutcomePageInput): string {
  const now = currentLabel(p.current);
  const reasons = NOT_SOLD_REASONS.map(
    (r) => `<button type="button" data-reason="${escapeHtml(r)}">${escapeHtml(r)}</button>`,
  ).join("");
  const body = `
<div id="ask">
<h1>How did ${escapeHtml(p.name)}'s estimate go?</h1>
<span class="chip">${escapeHtml(p.when)}</span>${now ? `<span class="chip on">${escapeHtml(now)}</span>` : ""}
<div class="grid">
<button type="button" data-outcome="sold">Sold</button>
<button type="button" data-outcome="not_sold">Not sold</button>
<button type="button" data-outcome="rescheduled">Rescheduled</button>
<button type="button" data-outcome="no_show">No-show</button>
</div>
<section id="sold" class="hide">
<h2>Job amount</h2>
<input id="amount" inputmode="decimal" placeholder="$0" autocomplete="off">
<h2>Book the job</h2>
${p.hasJobCalendar ? `<div data-picker="job"></div>` : `<p class="empty">No Job calendar in this account.</p>`}
<button type="button" class="save" id="saveSold" disabled>Save</button>
</section>
<section id="not_sold" class="hide"><h2>Why not?</h2><div class="list">${reasons}</div></section>
<section id="rescheduled" class="hide">
<h2>New estimate time</h2>
<div data-picker="estimate"></div>
<button type="button" class="save" id="saveRe" disabled>Save</button>
</section>
<section id="no_show" class="hide"><button type="button" class="save" id="saveNo">Save</button></section>
<div class="err" id="err"></div>
</div>
<div id="done" class="hide"><h1 id="doneTitle">Saved.</h1></div>`;

  const script = `<script>
(function(){
var q=${JSON.stringify(p.query)};
var state={outcome:null,slot:{job:null,estimate:null}};
var $=function(id){return document.getElementById(id)};
function err(m){$("err").textContent=m||""}
function show(o){
  state.outcome=o;err("");
  document.querySelectorAll("[data-outcome]").forEach(function(b){b.classList.toggle("pick",b.getAttribute("data-outcome")===o)});
  ["sold","not_sold","rescheduled","no_show"].forEach(function(id){$(id).classList.toggle("hide",id!==o)});
  if(o==="sold")load("job");
  if(o==="rescheduled")load("estimate");
}
${SLOT_PICKER_JS}
var loaded={};
function load(cal){
  var box=document.querySelector('[data-picker="'+cal+'"]');
  if(!box||loaded[cal])return;loaded[cal]=true;
  pickSlots(box,"/api/estimate-outcome/slots"+q+"&cal="+cal,
    function(s){state.slot[cal]=s;sync()},function(){loaded[cal]=false});
}
function amount(){return Number(($("amount").value||"").replace(/[$,\\s]/g,""))}
function sync(){
  var s=$("saveSold");if(s)s.disabled=!(amount()>0&&state.slot.job);
  $("saveRe").disabled=!state.slot.estimate;
}
function send(body,btn){
  err("");if(btn)btn.disabled=true;
  fetch("/api/estimate-outcome"+q,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
  .then(function(x){if(!x.ok||!x.d.ok){err((x.d&&x.d.error)||"Could not save. Try again.");if(btn)btn.disabled=false;return}
    $("ask").classList.add("hide");$("done").classList.remove("hide");$("doneTitle").textContent=x.d.message||"Saved."})
  .catch(function(){err("Could not save. Try again.");if(btn)btn.disabled=false});
}
document.querySelectorAll("[data-outcome]").forEach(function(b){b.onclick=function(){show(b.getAttribute("data-outcome"))}});
document.querySelectorAll("[data-reason]").forEach(function(b){b.onclick=function(){send({outcome:"not_sold",reason:b.getAttribute("data-reason")},b)}});
var a=$("amount");if(a)a.oninput=sync;
var ss=$("saveSold");if(ss)ss.onclick=function(){send({outcome:"sold",amount:amount(),slot:state.slot.job},ss)};
$("saveRe").onclick=function(){send({outcome:"rescheduled",slot:state.slot.estimate},$("saveRe"))};
$("saveNo").onclick=function(){send({outcome:"no_show"},$("saveNo"))};
})();
</script>`;
  return pageShell(body, script);
}
