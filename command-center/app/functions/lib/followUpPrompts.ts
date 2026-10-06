import { factsBlock, type ClientFacts } from "./clientFacts";
import { aiKeys, type CopyKind, type CopySettings } from "../../src/lib/followUpCopy";

// The prompts behind client > GHL > Follow-up Texts. The SOP's own examples are
// the style reference; the rules are the agency's (vault/About/Hauck
// Marketing.md) plus the SOP's warnings. Kept here, beside nothing else, so a
// change to the voice is one file.

const RULES = `Rules for every text:
- Sound like the owner texting from their own phone. Short, friendly, plain words, 6th grade reading level.
- Never use an em dash or en dash. Use commas or full stops.
- Max 300 characters. No emojis unless the example has one.
- Use these merge fields exactly as written, and no others: {{contact.first_name}}, {{custom_values.user_first_name}}, {{custom_values.company_name}}.
- The lead form only asks for a name and phone number. Never say or imply you know where they live ("near you", "your street", "your neighbourhood").
- No fake urgency, no prices or discounts unless they are in the client facts, no guarantees.
- Write for this client's trade and services. Do not mention services they do not offer.
- Leave out anything you are not given. Never invent awards, years in business, reviews or numbers.`;

const LTN_EXAMPLES = `Example set (brick paving):
SMS 1: Hey {{contact.first_name}}, most people assume a new patio or driveway costs way more than it actually does. Want a free, no-pressure estimate so you know the real number?\n\n- {{custom_values.user_first_name}}
SMS 2: Hey {{contact.first_name}}, most outdoor spaces slowly get away from people, cracked walkways, tired landscaping, that one project that keeps getting pushed. Want a free estimate on whatever's bugging you most? Takes about 2 min to go over.\n\n- {{custom_values.user_first_name}}
SMS 3: just a heads up {{contact.first_name}}: we're booking out further than usual right now. Want me to check what we have open before it fills?
SMS 4: Hi {{contact.first_name}}, putting together next month's job schedule, want me to get you on the list? We can stop by and give you a free estimate if you're free.\n\n- {{custom_values.user_first_name}}

Example set (window cleaning):
SMS 1: Hey {{contact.first_name}}, I can get you a price in about 2 minutes over the phone, no visit needed. Want me to run your numbers?\n\n- {{custom_values.user_first_name}}
SMS 2: hey {{contact.first_name}}, not sure if you've noticed the buildup this time of year, hard water spots and pollen sit right on the glass. Want a quick quote? Takes about 2 min over the phone, no visit needed.
SMS 3: just a heads up {{contact.first_name}}: we're booking out further than usual right now. Want me to check what we have open before it fills?
SMS 4: Hi {{contact.first_name}}, putting together this month's cleaning schedule, want me to pencil you in? I can price it out over the phone right now.\n\n- {{custom_values.user_first_name}}`;

const LTN_SYSTEM = `You write the Long Term Nurture texts for a local home-service business. These go to leads who stopped replying, spaced weeks apart: SMS 1 after 10 days, SMS 2 after 14 more, SMS 3 after 10 more, SMS 4 after 15 more. Each one is a light, no-pressure reason to reply. Vary the angle: the real cost, a problem they have probably noticed, a busy schedule, getting on next month's list.

${RULES}
- End SMS 1, 2 and 4 with a blank line and "- {{custom_values.user_first_name}}", like the examples.

${LTN_EXAMPLES}`;

const LEAD_FU_SYSTEM = `You write three follow-up texts for a local home-service business. A lead just filled in a Facebook lead form (name and phone only).

first: sent 2 minutes after the form, inside working hours, from the owner. It thanks them, asks one easy question about timing, and has a P.S. about the attached photo. Example (brick paving): "Hey {{contact.first_name}},\n\nIt's {{custom_values.user_first_name}} here from {{custom_values.company_name}}, thanks for your inquiry!\n\nHow soon were you looking to get this done?\n\nP.S. attached is a pic of myself and the crew! (The best brick paving company in Metro Detroit) lol"
sms3: sent a few days later if they have not replied, after two texts with links to recent work and the owner's story. A fresh, specific reason to reply, tied to the trade.
sms3Photo: one short line (not a text) describing a photo to send with sms3 that backs it up, e.g. "A finished patio with the crew standing on it".
hailMary: the last try, 2 days after sms3. Short, warm, easy to say yes or no to.

${RULES}`;

const props = (keys: string[]) =>
  Object.fromEntries(keys.map((k) => [k, { type: "string" }]));

export function copySchema(kind: CopyKind): Record<string, unknown> {
  const keys = aiKeys(kind);
  return { type: "object", properties: props(keys), required: keys, additionalProperties: false };
}

export function copyCheck(kind: CopyKind) {
  const keys = aiKeys(kind);
  return (v: unknown): v is Record<string, string> =>
    !!v && typeof v === "object" && keys.every((k) => typeof (v as Record<string, unknown>)[k] === "string" && ((v as Record<string, string>)[k]).trim() !== "");
}

export function copyPrompt(kind: CopyKind, facts: ClientFacts, settings: CopySettings): { system: string; input: string } {
  if (kind === "ltn") {
    return { system: LTN_SYSTEM, input: `Write SMS 1 to 4 for this client.\n\n${factsBlock(facts)}` };
  }
  const photo =
    settings.photo === "owner"
      ? "The photo attached to the first text is of the owner alone (not a crew). Make the P.S. match that."
      : "The photo attached to the first text is of the owner and the crew.";
  return {
    system: LEAD_FU_SYSTEM,
    input: `Write first, sms3, sms3Photo and hailMary for this client.\n${photo}\n\n${factsBlock(facts)}`,
  };
}
