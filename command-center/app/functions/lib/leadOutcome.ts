// The new-lead link: when a lead lands, a GoHighLevel workflow texts the owner
//
//   New lead: {{contact.name}}. Log outcome: {{custom_values.lead_outcome_link}}&c={{contact.id}}
//
// and the page asks what happened, per Jake 2026-10-09:
//   Estimate booked  a time on the estimate calendar (books, or moves the one
//                    already booked)
//   Call back later  a day and time; once it passes the ads cron tags the lead
//                    call-back-due and a workflow texts the owner again
//   Not interested   a reason
//
// No Call button here on purpose: the Call Now link stays its own text. And a
// tap here never counts as a pickup; Pickup % stays calls only.
//
// Same guard as the other owner links (callNow.ts), purpose "lead-outcome".
// Pure: the endpoint is api/lead-outcome/.

import { SLOT_PICKER_JS, escapeHtml, pageShell, type ContactAppointment } from "./estimateOutcome";

export const LEAD_KEY_PURPOSE = "lead-outcome";
export const CALL_BACK_TAG = "call-back-due";

export type LeadOutcome = "estimate_booked" | "call_back" | "not_interested";

// Each reason and where it sends the card. A wrong number or spam is not a
// lost sale, so it goes to Trash and stays out of the Lost column.
export const NOT_INTERESTED_REASONS: { label: string; stage: "Lost" | "Trash" }[] = [
  { label: "Not interested", stage: "Lost" },
  { label: "Too expensive", stage: "Lost" },
  { label: "Out of area", stage: "Lost" },
  { label: "Wrong number", stage: "Trash" },
  { label: "Spam", stage: "Trash" },
];

// Call-back times on offer, wall clock in the client's zone.
export const CALL_BACK_TIMES = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];
export const CALL_BACK_DAYS = 7;

export type LeadInput =
  | { outcome: "estimate_booked"; slot: string }
  | { outcome: "call_back"; date: string; time: string }
  | { outcome: "not_interested"; reason: string };

const ISO_SLOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export function parseLeadBody(body: unknown): LeadInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (b.outcome === "estimate_booked") {
    const slot = typeof b.slot === "string" ? b.slot.trim() : "";
    return ISO_SLOT.test(slot) ? { outcome: "estimate_booked", slot } : { error: "Pick a time for the estimate." };
  }
  if (b.outcome === "call_back") {
    const date = typeof b.date === "string" ? b.date.trim() : "";
    const time = typeof b.time === "string" ? b.time.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !CALL_BACK_TIMES.includes(time)) {
      return { error: "Pick a day and time." };
    }
    return { outcome: "call_back", date, time };
  }
  if (b.outcome === "not_interested") {
    const reason = typeof b.reason === "string" ? b.reason.trim() : "";
    return NOT_INTERESTED_REASONS.some((r) => r.label === reason)
      ? { outcome: "not_interested", reason }
      : { error: "Pick a reason." };
  }
  return { error: "Pick what happened." };
}

// Where the card goes for each outcome, by stage name in the Sales Pipeline.
export function stageForLead(input: LeadInput): { stage: string; status?: "lost" } {
  if (input.outcome === "estimate_booked") return { stage: "Estimate Booked" };
  if (input.outcome === "call_back") return { stage: "Follow Up" };
  const r = NOT_INTERESTED_REASONS.find((x) => x.label === input.reason);
  return r?.stage === "Trash" ? { stage: "Trash" } : { stage: "Lost", status: "lost" };
}

// The lead's estimate still to come, if any: booking again moves that one
// rather than leaving the lead with two.
export function upcomingEstimate(
  appointments: ContactAppointment[],
  estimateCalendarId: string,
  nowMs: number,
): ContactAppointment | null {
  let best: ContactAppointment | null = null;
  for (const a of appointments) {
    if (a.calendarId !== estimateCalendarId || a.deleted) continue;
    if (a.status.toLowerCase().startsWith("cancel")) continue;
    const at = Date.parse(a.startTime);
    if (!Number.isFinite(at) || at < nowMs) continue;
    if (!best || at < Date.parse(best.startTime)) best = a;
  }
  return best;
}

// "13:00" -> "1 PM". The times on offer are all on the hour.
export function timeLabel(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
}

export interface LeadPageInput {
  name: string;
  // Chips: what was logged last, and an estimate already on the calendar.
  current: string;
  booked: string;
  query: string;
  // The call-back days, already in the client's zone: { date, label }.
  days: { date: string; label: string }[];
  // Times on the first day that have already passed, so they are not offered.
  pastToday: string[];
}

export function leadPage(p: LeadPageInput): string {
  const reasons = NOT_INTERESTED_REASONS.map(
    (r) => `<button type="button" data-reason="${escapeHtml(r.label)}">${escapeHtml(r.label)}</button>`,
  ).join("");
  const chips =
    (p.booked ? `<span class="chip">${escapeHtml(p.booked)}</span>` : "") +
    (p.current ? `<span class="chip on">${escapeHtml(p.current)}</span>` : "");
  const body = `
<div id="ask">
<h1>${escapeHtml(p.name)}</h1>
${chips}
<div class="list" style="margin-top:20px">
<button type="button" data-outcome="estimate_booked">Estimate booked</button>
<button type="button" data-outcome="call_back">Call back later</button>
<button type="button" data-outcome="not_interested">Not interested</button>
</div>
<section id="estimate_booked" class="hide">
<h2>Estimate time</h2>
<div data-picker="estimate"></div>
<button type="button" class="save" id="saveEst" disabled>Save</button>
</section>
<section id="call_back" class="hide">
<h2>Call back</h2>
<div class="row" id="cbDays"></div>
<div class="times" id="cbTimes" style="margin-top:10px"></div>
<button type="button" class="save" id="saveCb" disabled>Save</button>
</section>
<section id="not_interested" class="hide"><h2>Why not?</h2><div class="list">${reasons}</div></section>
<div class="err" id="err"></div>
</div>
<div id="done" class="hide"><h1 id="doneTitle">Saved.</h1></div>`;

  const script = `<script>
(function(){
var q=${JSON.stringify(p.query)};
var DAYS=${JSON.stringify(p.days)},TIMES=${JSON.stringify(CALL_BACK_TIMES)},PAST=${JSON.stringify(p.pastToday)};
var LABELS=${JSON.stringify(Object.fromEntries(CALL_BACK_TIMES.map((t) => [t, timeLabel(t)])))};
var state={slot:null,date:null,time:null};
var $=function(id){return document.getElementById(id)};
function err(m){$("err").textContent=m||""}
${SLOT_PICKER_JS}
var loaded=false;
function show(o){
  err("");
  document.querySelectorAll("[data-outcome]").forEach(function(b){b.classList.toggle("pick",b.getAttribute("data-outcome")===o)});
  ["estimate_booked","call_back","not_interested"].forEach(function(id){$(id).classList.toggle("hide",id!==o)});
  if(o==="estimate_booked"&&!loaded){loaded=true;
    pickSlots(document.querySelector('[data-picker="estimate"]'),"/api/lead-outcome/slots"+q,
      function(s){state.slot=s;$("saveEst").disabled=!s},function(){loaded=false})}
}
function drawTimes(date,first){
  var box=$("cbTimes");box.innerHTML="";state.time=null;$("saveCb").disabled=true;
  TIMES.forEach(function(t){var b=document.createElement("button");b.type="button";b.textContent=LABELS[t];
    if(first&&PAST.indexOf(t)>=0)b.disabled=true;
    b.onclick=function(){pickRow(box,b);state.time=t;$("saveCb").disabled=false};box.appendChild(b)});
}
DAYS.forEach(function(d,i){var b=document.createElement("button");b.type="button";b.textContent=d.label;
  b.onclick=function(){pickRow($("cbDays"),b);state.date=d.date;drawTimes(d.date,i===0)};
  $("cbDays").appendChild(b);if(i===0)b.click()});
function send(body,btn){
  err("");if(btn)btn.disabled=true;
  fetch("/api/lead-outcome"+q,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
  .then(function(x){if(!x.ok||!x.d.ok){err((x.d&&x.d.error)||"Could not save. Try again.");if(btn)btn.disabled=false;return}
    $("ask").classList.add("hide");$("done").classList.remove("hide");$("doneTitle").textContent=x.d.message||"Saved."})
  .catch(function(){err("Could not save. Try again.");if(btn)btn.disabled=false});
}
document.querySelectorAll("[data-outcome]").forEach(function(b){b.onclick=function(){show(b.getAttribute("data-outcome"))}});
document.querySelectorAll("[data-reason]").forEach(function(b){b.onclick=function(){send({outcome:"not_interested",reason:b.getAttribute("data-reason")},b)}});
$("saveEst").onclick=function(){send({outcome:"estimate_booked",slot:state.slot},$("saveEst"))};
$("saveCb").onclick=function(){send({outcome:"call_back",date:state.date,time:state.time},$("saveCb"))};
})();
</script>`;
  return pageShell(body, script, "New lead");
}
