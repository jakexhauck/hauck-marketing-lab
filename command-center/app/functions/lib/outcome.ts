// The universal owner outcome page (Jake, 2026-10-10). One page behind every
// owner link the snapshot texts (Outcome Link, and the older Lead Outcome and
// Estimate Outcome links, which now open the same page), with every answer:
//
//   Estimate booked  a time on the estimate calendar (books, or moves the one
//                    already booked) + the booking form's questions
//   Job closed       the amount, a time on the Job calendar + the same
//                    questions; a customer_jobs row, so it counts as a job
//   Call back later  a day and time; Follow Up on the board, a reminder text
//   No answer        No Answer stage, call again this time tomorrow
//   Not interested   a reason; Lost
//
// The lead moves through the Leads board's own move (lib/outcomeMove.ts), never
// a tag, so the board and this page cannot disagree. Tags only fire workflows.
//
// Pure: the endpoints are api/outcome/ (and the two older paths), built by
// api/lib/outcomeHandlers.ts.

import { MAX_AMOUNT, SLOT_PICKER_JS, escapeHtml, pageShell } from "./estimateOutcome";
import type { LostReason, StageKey } from "./leadBoard";

export const OUTCOME_LINK_PURPOSE = "outcome";

export type Outcome = "estimate_booked" | "job_closed" | "call_back" | "no_answer" | "not_interested";

// Each reason the owner sees, and the board's lost reason it is stored as.
export const NOT_INTERESTED_REASONS: { label: string; lost: LostReason }[] = [
  { label: "Price", lost: "price" },
  { label: "Went with someone else", lost: "competitor" },
  { label: "Not ready yet", lost: "timing" },
  { label: "Out of area", lost: "other" },
  { label: "Wrong number", lost: "other" },
  { label: "Spam", lost: "other" },
];

// Call-back times on offer, wall clock in the client's zone.
export const CALL_BACK_TIMES = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00"];
export const CALL_BACK_DAYS = 7;

// The booking form's questions (contact custom fields, found by name). Name,
// phone and email come from the contact itself.
export const FORM_FIELDS = [
  { key: "address", name: "Street Address", label: "Street address", multiline: false },
  { key: "services", name: "Services", label: "Services", multiline: true },
  { key: "notes", name: "Any Notes For The Appointment", label: "Any notes for the appointment", multiline: true },
] as const;
export type FormKey = (typeof FORM_FIELDS)[number]["key"];
export type FormAnswers = Record<FormKey, string>;

export type OutcomeInput =
  | { outcome: "estimate_booked"; slot: string; form: FormAnswers }
  | { outcome: "job_closed"; amountCents: number; slot: string; form: FormAnswers }
  | { outcome: "call_back"; date: string; time: string }
  | { outcome: "no_answer" }
  | { outcome: "not_interested"; reason: string };

const ISO_SLOT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_TEXT = 2000;

function readForm(b: Record<string, unknown>): FormAnswers {
  const f = (b.form ?? {}) as Record<string, unknown>;
  const out = {} as FormAnswers;
  for (const { key } of FORM_FIELDS) {
    out[key] = typeof f[key] === "string" ? (f[key] as string).trim().slice(0, MAX_TEXT) : "";
  }
  return out;
}

export function parseOutcomeBody(body: unknown): OutcomeInput | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const slot = typeof b.slot === "string" ? b.slot.trim() : "";
  switch (b.outcome) {
    case "estimate_booked":
      return ISO_SLOT.test(slot)
        ? { outcome: "estimate_booked", slot, form: readForm(b) }
        : { error: "Pick a time for the estimate." };
    case "job_closed": {
      const dollars = typeof b.amount === "number" ? b.amount : Number(String(b.amount ?? "").replace(/[$,\s]/g, ""));
      if (!Number.isFinite(dollars) || dollars <= 0) return { error: "Enter the job amount." };
      if (dollars > MAX_AMOUNT) return { error: "That amount looks too big." };
      if (!ISO_SLOT.test(slot)) return { error: "Pick a time for the job." };
      return { outcome: "job_closed", amountCents: Math.round(dollars * 100), slot, form: readForm(b) };
    }
    case "call_back": {
      const date = typeof b.date === "string" ? b.date.trim() : "";
      const time = typeof b.time === "string" ? b.time.trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !CALL_BACK_TIMES.includes(time)) return { error: "Pick a day and time." };
      return { outcome: "call_back", date, time };
    }
    case "no_answer":
      return { outcome: "no_answer" };
    case "not_interested": {
      const reason = typeof b.reason === "string" ? b.reason.trim() : "";
      return NOT_INTERESTED_REASONS.some((r) => r.label === reason)
        ? { outcome: "not_interested", reason }
        : { error: "Pick a reason." };
    }
    default:
      return { error: "Pick what happened." };
  }
}

// The board stage each outcome lands in. No Answer falls back to Follow Up on a
// pipeline that has no No Answer stage yet.
export function stageKeyFor(outcome: Outcome): StageKey {
  switch (outcome) {
    case "estimate_booked":
      return "estimate";
    case "job_closed":
      return "job";
    case "call_back":
      return "followUp";
    case "no_answer":
      return "noAnswer";
    case "not_interested":
      return "lost";
  }
}

export function lostReasonFor(label: string): LostReason {
  return NOT_INTERESTED_REASONS.find((r) => r.label === label)?.lost ?? "other";
}

// The stage name the confirmation names, e.g. "Saved. Moved to Follow Up."
export const STAGE_LABEL: Record<Outcome, string> = {
  estimate_booked: "Estimate Booked",
  job_closed: "Job Booked",
  call_back: "Follow Up",
  no_answer: "No Answer",
  not_interested: "Lost",
};

// "13:00" -> "1 PM", "13:30" -> "1:30 PM".
export function timeLabel(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`} ${h < 12 ? "AM" : "PM"}`;
}

export interface OutcomePageInput {
  name: string;
  // Chips: an estimate already on the calendar, and what was logged last.
  booked: string;
  current: string;
  // The base path this link was opened on, so posts go back to the same route
  // and key, plus "?l=..&c=..&k=..".
  base: string;
  query: string;
  hasJobCalendar: boolean;
  // Form answers already on the contact, to prefill.
  form: FormAnswers;
  // Call-back days in the client's zone, and today's times already gone.
  days: { date: string; label: string }[];
  pastToday: string[];
  // "2:15 PM": when No answer comes back round tomorrow.
  noAnswerAt: string;
}

function formHtml(prefix: string, form: FormAnswers): string {
  return FORM_FIELDS.map((f) => {
    const v = escapeHtml(form[f.key] ?? "");
    const field = f.multiline
      ? `<textarea data-form="${prefix}" data-key="${f.key}" rows="${f.key === "notes" ? 3 : 2}">${v}</textarea>`
      : `<input class="txt" data-form="${prefix}" data-key="${f.key}" value="${v}" autocomplete="off">`;
    return `<h2>${escapeHtml(f.label)}</h2>${field}`;
  }).join("");
}

export function outcomePage(p: OutcomePageInput): string {
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
<button type="button" data-outcome="job_closed">Job closed</button>
<button type="button" data-outcome="call_back">Call back later</button>
<button type="button" data-outcome="no_answer">No answer</button>
<button type="button" data-outcome="not_interested">Not interested</button>
</div>
<section id="estimate_booked" class="hide">
<h2>Estimate time</h2>
<div data-picker="estimate"></div>
${formHtml("estimate", p.form)}
<button type="button" class="save" id="saveEst" disabled>Save</button>
</section>
<section id="job_closed" class="hide">
<h2>Job amount</h2>
<input id="amount" inputmode="decimal" placeholder="$0" autocomplete="off">
<h2>Book the job</h2>
${p.hasJobCalendar ? `<div data-picker="job"></div>` : `<p class="empty">No Job calendar in this account.</p>`}
${formHtml("job", p.form)}
<button type="button" class="save" id="saveJob" disabled>Save</button>
</section>
<section id="call_back" class="hide">
<h2>Call back</h2>
<div class="row" id="cbDays"></div>
<div class="times" id="cbTimes" style="margin-top:10px"></div>
<button type="button" class="save" id="saveCb" disabled>Save</button>
</section>
<section id="no_answer" class="hide">
<h2>Call again tomorrow at ${escapeHtml(p.noAnswerAt)}</h2>
<button type="button" class="save" id="saveNa">Save</button>
</section>
<section id="not_interested" class="hide"><h2>Why not?</h2><div class="list">${reasons}</div></section>
<div class="err" id="err"></div>
</div>
<div id="done" class="hide"><h1 id="doneTitle">Saved.</h1></div>`;

  const script = `<script>
(function(){
var BASE=${JSON.stringify(p.base)},q=${JSON.stringify(p.query)};
var DAYS=${JSON.stringify(p.days)},TIMES=${JSON.stringify(CALL_BACK_TIMES)},PAST=${JSON.stringify(p.pastToday)};
var LABELS=${JSON.stringify(Object.fromEntries(CALL_BACK_TIMES.map((t) => [t, timeLabel(t)])))};
var state={estimate:null,job:null,date:null,time:null};
var $=function(id){return document.getElementById(id)};
function err(m){$("err").textContent=m||""}
${SLOT_PICKER_JS}
var loaded={};
function load(cal,onPick){
  var box=document.querySelector('[data-picker="'+cal+'"]');
  if(!box||loaded[cal])return;loaded[cal]=true;
  pickSlots(box,BASE+"/slots"+q+"&cal="+cal,onPick,function(){loaded[cal]=false});
}
function amount(){return Number(($("amount").value||"").replace(/[$,\\s]/g,""))}
function syncJob(){var s=$("saveJob");if(s)s.disabled=!(amount()>0&&state.job)}
function form(prefix){var o={};document.querySelectorAll('[data-form="'+prefix+'"]').forEach(function(el){o[el.getAttribute("data-key")]=el.value});return o}
function show(o){
  err("");
  document.querySelectorAll("[data-outcome]").forEach(function(b){b.classList.toggle("pick",b.getAttribute("data-outcome")===o)});
  ["estimate_booked","job_closed","call_back","no_answer","not_interested"].forEach(function(id){$(id).classList.toggle("hide",id!==o)});
  if(o==="estimate_booked")load("estimate",function(s){state.estimate=s;$("saveEst").disabled=!s});
  if(o==="job_closed")load("job",function(s){state.job=s;syncJob()});
}
function drawTimes(first){
  var box=$("cbTimes");box.innerHTML="";state.time=null;$("saveCb").disabled=true;
  TIMES.forEach(function(t){var b=document.createElement("button");b.type="button";b.textContent=LABELS[t];
    if(first&&PAST.indexOf(t)>=0)b.disabled=true;
    b.onclick=function(){pickRow(box,b);state.time=t;$("saveCb").disabled=false};box.appendChild(b)});
}
DAYS.forEach(function(d,i){var b=document.createElement("button");b.type="button";b.textContent=d.label;
  b.onclick=function(){pickRow($("cbDays"),b);state.date=d.date;drawTimes(i===0)};
  $("cbDays").appendChild(b);if(i===0)b.click()});
function send(body,btn){
  err("");if(btn)btn.disabled=true;
  fetch(BASE+q,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)})
  .then(function(r){return r.json().then(function(d){return{ok:r.ok,d:d}})})
  .then(function(x){if(!x.ok||!x.d.ok){err((x.d&&x.d.error)||"Could not save. Try again.");if(btn)btn.disabled=false;return}
    $("ask").classList.add("hide");$("done").classList.remove("hide");$("doneTitle").textContent=x.d.message||"Saved."})
  .catch(function(){err("Could not save. Try again.");if(btn)btn.disabled=false});
}
document.querySelectorAll("[data-outcome]").forEach(function(b){b.onclick=function(){show(b.getAttribute("data-outcome"))}});
document.querySelectorAll("[data-reason]").forEach(function(b){b.onclick=function(){send({outcome:"not_interested",reason:b.getAttribute("data-reason")},b)}});
var am=$("amount");if(am)am.oninput=syncJob;
$("saveEst").onclick=function(){send({outcome:"estimate_booked",slot:state.estimate,form:form("estimate")},$("saveEst"))};
$("saveJob").onclick=function(){send({outcome:"job_closed",amount:amount(),slot:state.job,form:form("job")},$("saveJob"))};
$("saveCb").onclick=function(){send({outcome:"call_back",date:state.date,time:state.time},$("saveCb"))};
$("saveNa").onclick=function(){send({outcome:"no_answer"},$("saveNa"))};
})();
</script>`;
  return pageShell(body, script, "Outcome");
}
