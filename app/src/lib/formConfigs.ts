// Configs for all GenericFormGenerator-driven forms.
// Each config defines: fields, target agent, prompt task, expected JSON shape.
// The shared GenericFormGenerator renders + runs these.

import type { ProfileFormValues } from "./clientProfile";
import { PITCH_DECK_PROMPT } from "./pitchDeckPrompt";
import type { PlaybookFieldKey } from "./playbooks";
import type { GeneratorKind } from "./types";

export type FormFieldBase = {
  key: string;
  label: string;
  /** Optional override for how this field is labeled inside the assembled prompt. */
  promptLabel?: string;
  /** Placeholder token in `FormConfig.promptTemplate` that this field's value
   *  replaces, e.g. "[BUSINESS NAME]". Ignored when promptTemplate is absent. */
  promptPlaceholder?: string;
  hint?: string;
  /** Render this field on the same row as the previous field (grid 1fr 1fr). */
  inline?: boolean;
  /** Block submit until this field is filled. Default false. */
  required?: boolean;
};

export type FormField =
  | (FormFieldBase & { kind: "text"; placeholder?: string; default?: string })
  | (FormFieldBase & { kind: "textarea"; placeholder?: string; minRows?: number; default?: string })
  | (FormFieldBase & {
      kind: "number";
      min?: number;
      max?: number;
      step?: number;
      default?: number;
    })
  | (FormFieldBase & { kind: "select"; options: string[]; default?: string })
  | (FormFieldBase & { kind: "segmented"; options: string[]; default?: string })
  | (FormFieldBase & { kind: "multi"; options: string[]; defaults?: string[] });

export type FormSection = {
  title: string;
  meta?: string;
  fields: FormField[];
};

export type FormConfig = {
  /** Stable id used in the App.tsx generator surface union, e.g. "welcome-email". */
  id: string;
  /** Page title shown in the form header. */
  title: string;
  /** One-line subtitle under the title. */
  subtitle: string;
  /** Eyebrow tag e.g. "▸ WELCOME EMAIL · VORTEX". */
  eyebrow: string;
  /** Right-side eyebrow label, e.g. "ONBOARDING · DAY 0". */
  eyebrowMeta?: string;
  /** "phase" (default) — slots into onboarding Phase 1-6 grouping.
   *  "misc" — standalone tool surfaced below the phase groups (no phase fields needed).
   *  "reports" — client-facing deliverables (weekly/monthly recaps, audits, etc.). */
  category?: "phase" | "misc" | "reports";
  /** Onboarding phase (1-6). Required when category is "phase". */
  phase?: number;
  /** Phase display name, e.g. "Close the Deal". */
  phaseName?: string;
  /** Phase meta line shown next to the section header, e.g. "Day 0". */
  phaseMeta?: string;
  /** Agent slug used to lookup persona body from media-buying/agents/<slug>.md. */
  agentSlug: string;
  /** Agent display name used in prompt header. */
  agentName: string;
  /** GeneratorKind for save bucket. */
  kind: GeneratorKind;
  /** Saved-output type label, e.g. "Welcome email saved". */
  savedHeading: string;
  /** Button label on the generate action. */
  generateLabel: string;
  /** Streaming-state button label. */
  generatingLabel: string;
  /** Form sections rendered top to bottom. */
  sections: FormSection[];
  /** Prompt task description. Optional when `promptTemplate` is supplied. */
  taskDescription?: string;
  /** JSON schema string inserted inside the ```json fence. Optional when `promptTemplate` is supplied. */
  outputSchema?: string;
  /** Instructions appended after the JSON schema for the markdown body.
   *  Optional when `promptTemplate` is supplied. */
  outputInstructions?: string;
  /** Verbatim prompt sent to the model, with `[PLACEHOLDER]` tokens substituted
   *  from form fields (matched via each field's `promptPlaceholder`). When set,
   *  this REPLACES the assembled persona/brief/task/output format — the template
   *  is shipped as-is. Use for prompts you want to control end-to-end. */
  promptTemplate?: string;
  /** Fallback title used to name the saved output if the model omits one. */
  defaultTitle: string;
  /** Optional: pre-fill these form fields from the active client's Profile.md.
   *  Map: form-field-key → ProfileFormValues key. */
  prefillFromProfile?: Partial<Record<string, keyof ProfileFormValues>>;
  /** Optional: pre-fill these form fields from the active client's niche
   *  playbook when Profile.md does not already supply a value. Map: form-field-key
   *  → playbook field (`audience` | `offers` | `angles` | `creative-brief` |
   *  `competitors`). Precedence: explicit > Profile.md > playbook > empty. */
  prefillFromPlaybook?: Partial<Record<string, PlaybookFieldKey>>;
  /** Optional: when set, the form post-processes Claude's output through an
   *  image-generation pipeline (currently Nano Banana 2 via Google AI Studio).
   *  Claude must emit a fenced ```json block with shape {prompts: [...]}, and
   *  the post-processor calls Gemini for each entry, saving PNGs to the
   *  client's vault assets folder. */
  imageGeneration?: {
    provider: "nano-banana-2";
  };
  /** Optional: surface a "Pull from Meta Ads" button that fills the listed
   *  form fields from `meta_list_ads_insights`. Keys are form field keys,
   *  values are MetaAutoFillSource identifiers (see metaAutoFill.ts). */
  metaAutoFill?: {
    windowDays: number;
    fieldMap: Record<string, string>;
    bestAdMinSpend?: number;
  };
  /** Optional: drives the in-flight progress bar in the DRAFTING card.
   *  `itemPattern` is matched against the streamed text with /gm flags; each
   *  match counts as one drafted item. `sectionPattern` (optional) captures the
   *  current section label from H2 headers as they stream in. */
  progress?: {
    total: number;
    unitLabel: string;
    itemPattern: string;
    sectionPattern?: string;
  };
};

// ── Vortex · Welcome Email ─────────────────────────────────────────
const WELCOME_EMAIL: FormConfig = {
  id: "welcome-email",
  title: "Welcome Email Builder",
  subtitle:
    "Drafts the welcome email after the contract is signed. Sets timeline, links the onboarding form, and the calendar.",
  eyebrow: "▸ WELCOME EMAIL · VORTEX",
  eyebrowMeta: "ONBOARDING · DAY 0",
  phase: 1,
  phaseName: "Close the Deal",
  phaseMeta: "Day 0",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "briefs",
  savedHeading: "Welcome email saved",
  generateLabel: "Draft welcome email",
  generatingLabel: "Drafting…",
  sections: [
    {
      title: "▸ ONBOARDING DETAILS",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "what_to_expect",
          label: "What to expect in week 1",
          placeholder: "Audit, creative, build, launch by Friday.",
          required: true,
        },
        {
          kind: "number",
          key: "timeline_days",
          label: "Timeline (days)",
          default: 7,
          min: 1,
          max: 30,
          inline: true,
        },
        {
          kind: "segmented",
          key: "tone",
          label: "Tone",
          options: ["Warm", "Professional", "Energetic"],
          default: "Warm",
        },
      ],
    },
    {
      title: "▸ LINKS & ACTIONS",
      meta: "optional",
      fields: [
        {
          kind: "text",
          key: "onboarding_form_url",
          label: "Onboarding form link",
          placeholder: "https://…",
        },
        {
          kind: "text",
          key: "calendar_url",
          label: "Calendar link",
          placeholder: "https://cal.com/…",
          inline: true,
        },
        {
          kind: "textarea",
          key: "personal_notes",
          label: "Personal notes for this client",
          placeholder: "Anything that should land in the email (no boilerplate).",
          minRows: 3,
        },
      ],
    },
  ],
  taskDescription:
    "Draft a warm, on-brand welcome email Jake can send after the contract is signed. Cover: what's about to happen this week, the onboarding form link, the calendar link for the kickoff call. Keep it under 200 words. Sound like a real person, never a sales template.",
  outputSchema:
    '{"headline":"…","summary":"…","subject_lines":["…","…","…"],"email_body":"…"}',
  outputInstructions:
    "After the JSON, write the full email — subject line on top, then the body. Plain prose Jake can paste into Gmail with no edits.",
  defaultTitle: "Welcome email",
};

// ── Vortex · Offer + CTA ───────────────────────────────────────────
const OFFER_CTA: FormConfig = {
  id: "offer-cta",
  title: "Offer + CTA Builder",
  subtitle:
    "Lock the primary offer and CTA before creative starts. Returns 3-5 sharpened variations.",
  eyebrow: "▸ OFFER + CTA · VORTEX",
  eyebrowMeta: "ONBOARDING · DAY 1",
  phase: 2,
  phaseName: "Onboarding Call",
  phaseMeta: "Day 1",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "briefs",
  savedHeading: "Offers saved",
  generateLabel: "Generate offers",
  generatingLabel: "Generating…",
  sections: [
    {
      title: "▸ BUSINESS",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "what_they_sell",
          label: "What they sell",
          placeholder: "Exterior window cleaning, single + multi-story homes.",
          required: true,
        },
        {
          kind: "text",
          key: "desired_action",
          label: "Desired action",
          placeholder: "Book a free in-home estimate.",
          required: true,
        },
      ],
    },
    {
      title: "▸ ANGLE & PROOF",
      meta: "required",
      fields: [
        {
          kind: "segmented",
          key: "urgency_angle",
          label: "Urgency angle",
          options: ["Seasonal", "Limited spots", "Always-on", "Risk-reversal"],
          default: "Seasonal",
        },
        {
          kind: "text",
          key: "guarantee",
          label: "Guarantee",
          placeholder: "100% satisfaction or we re-clean free.",
        },
        {
          kind: "textarea",
          key: "proof",
          label: "Proof points",
          placeholder: "Reviews · social proof · awards · stats.",
          minRows: 3,
        },
        {
          kind: "number",
          key: "variations",
          label: "Variations",
          default: 5,
          min: 1,
          max: 12,
        },
      ],
    },
  ],
  taskDescription:
    "Sharpen the offer into a one-line statement of value, then produce variations. For each variation: the offer line + a matching CTA. Every option must be specific (no 'learn more'), feel low-friction, and survive Meta ad policy.",
  outputSchema:
    '{"headline":"…","summary":"…","recommended":{"offer":"…","cta":"…","why":"…"},"variations":[{"offer":"…","cta":"…","angle":"…"}]}',
  outputInstructions:
    "After the JSON, list each variation cleanly with offer + CTA. Then a one-paragraph 'why I'd lead with the recommendation' note.",
  defaultTitle: "Offer + CTA set",
};

// ── Vortex · Expectations Email ───────────────────────────────────
const EXPECTATIONS_EMAIL: FormConfig = {
  id: "expectations-email",
  title: "Expectations Email",
  subtitle: "After the kickoff call: what happens in week 1 and what Jake needs from them.",
  eyebrow: "▸ EXPECTATIONS · VORTEX",
  eyebrowMeta: "ONBOARDING · DAY 1",
  phase: 2,
  phaseName: "Onboarding Call",
  phaseMeta: "Day 1",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "briefs",
  savedHeading: "Expectations email saved",
  generateLabel: "Draft expectations email",
  generatingLabel: "Drafting…",
  sections: [
    {
      title: "▸ THE PLAN",
      meta: "required",
      fields: [
        {
          kind: "textarea",
          key: "what_jake_does",
          label: "What Jake handles this week",
          placeholder: "Pixel setup · audience build · 10 ad variations · campaign QA.",
          minRows: 3,
          required: true,
        },
        {
          kind: "textarea",
          key: "what_client_does",
          label: "What the client needs to deliver",
          placeholder: "Brand assets · BM access · approve creatives by Thursday.",
          minRows: 3,
          required: true,
        },
      ],
    },
    {
      title: "▸ TOUCHPOINTS",
      meta: "optional",
      fields: [
        {
          kind: "text",
          key: "first_check_in",
          label: "First check-in",
          placeholder: "Wednesday: quick Loom review.",
        },
        {
          kind: "text",
          key: "launch_target",
          label: "Launch target",
          placeholder: "Friday EOD.",
          inline: true,
        },
      ],
    },
  ],
  taskDescription:
    "Write the post-kickoff email that sets expectations crisply. Two columns of action: Jake's side, client's side. Make deadlines concrete. End with a one-line 'you're in good hands' note. Under 250 words.",
  outputSchema:
    '{"headline":"…","summary":"…","subject_lines":["…","…","…"],"email_body":"…"}',
  outputInstructions:
    "After the JSON, write the full email — subject on top, then the body with clear sections for 'what I'm handling' and 'what I need from you'.",
  defaultTitle: "Expectations email",
};

// ── Vortex · Approval Email ────────────────────────────────────────
const APPROVAL_EMAIL: FormConfig = {
  id: "approval-email",
  title: "Creative Approval Email",
  subtitle: "Packages copy + creative for client sign-off with a clean approval deadline.",
  eyebrow: "▸ APPROVAL · VORTEX",
  eyebrowMeta: "ONBOARDING · DAY 4",
  phase: 4,
  phaseName: "Creative Production",
  phaseMeta: "Days 3–4",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "briefs",
  savedHeading: "Approval email saved",
  generateLabel: "Draft approval email",
  generatingLabel: "Drafting…",
  sections: [
    {
      title: "▸ ASSETS",
      meta: "links to include",
      fields: [
        {
          kind: "text",
          key: "copy_doc",
          label: "Copy doc link",
          placeholder: "https://docs.google.com/…",
          required: true,
        },
        {
          kind: "text",
          key: "creative_doc",
          label: "Creative folder link",
          placeholder: "https://drive.google.com/…",
          required: true,
        },
      ],
    },
    {
      title: "▸ ASK",
      meta: "what they need to do",
      fields: [
        {
          kind: "text",
          key: "deadline",
          label: "Approval deadline",
          placeholder: "Friday EOD (May 9).",
          required: true,
        },
        {
          kind: "segmented",
          key: "default_if_silent",
          label: "If they don't respond",
          options: ["Assume approval", "Hold launch", "Follow up Mon"],
          default: "Follow up Mon",
        },
        {
          kind: "textarea",
          key: "notes_to_client",
          label: "Specific notes / asks",
          placeholder: "Any callouts on a particular variation or angle.",
          minRows: 3,
        },
      ],
    },
  ],
  taskDescription:
    "Draft the approval-request email. Lead with what's attached and what specifically needs sign-off. State the deadline and what happens if there's no response. Keep it short and confident — not apologetic.",
  outputSchema:
    '{"headline":"…","summary":"…","subject_lines":["…","…","…"],"email_body":"…"}',
  outputInstructions:
    "After the JSON, write the full email. Bullet the assets, bold the deadline, end with 'reply with: approved as-is OR notes inline.'",
  defaultTitle: "Approval email",
};

// ── Vortex · Live Message ──────────────────────────────────────────
const LIVE_MESSAGE: FormConfig = {
  id: "live-message",
  title: "Ads Are Live Message",
  subtitle: "Short, confident note to the client the moment campaigns go live.",
  eyebrow: "▸ LIVE MESSAGE · VORTEX",
  eyebrowMeta: "ONBOARDING · DAY 7",
  phase: 6,
  phaseName: "Launch + Monitor",
  phaseMeta: "Day 7",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "briefs",
  savedHeading: "Live message saved",
  generateLabel: "Draft live message",
  generatingLabel: "Drafting…",
  sections: [
    {
      title: "▸ LAUNCH",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "launch_date",
          label: "Launch date",
          placeholder: "Today · 5 PM MT.",
          required: true,
        },
        {
          kind: "segmented",
          key: "channel",
          label: "Channel",
          options: ["Email", "SMS", "Slack", "Instagram DM"],
          default: "Email",
        },
      ],
    },
    {
      title: "▸ WHAT TO TELL THEM",
      meta: "optional",
      fields: [
        {
          kind: "textarea",
          key: "what_to_watch",
          label: "What they should watch for",
          placeholder: "Lead form emails · landing page bookings · DMs to the IG page.",
          minRows: 3,
        },
        {
          kind: "text",
          key: "first_report_day",
          label: "First report",
          placeholder: "Monday morning.",
        },
      ],
    },
  ],
  taskDescription:
    "Write the 'ads are live' notification — tone matches the chosen channel. Short, confident, ends with one clear next step. SMS = under 320 chars. Email = under 100 words. IG/Slack = 2-3 lines.",
  outputSchema:
    '{"headline":"…","summary":"…","message_body":"…","fallback_email_body":"…"}',
  outputInstructions:
    "After the JSON, write the message in the chosen channel's format. If non-email, also append an email version below for the record.",
  defaultTitle: "Ads live message",
};

// ── Stratos · Contract Drafter ─────────────────────────────────────
const CONTRACT: FormConfig = {
  id: "contract",
  title: "Contract Drafter",
  subtitle:
    "Fills the standard client agreement. Use the output as a starting draft in DocuSign or PandaDoc — not legal advice.",
  eyebrow: "▸ CONTRACT · STRATOS",
  eyebrowMeta: "ONBOARDING · DAY 0",
  phase: 1,
  phaseName: "Close the Deal",
  phaseMeta: "Day 0",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "scale_checks",
  savedHeading: "Contract draft saved",
  generateLabel: "Draft contract",
  generatingLabel: "Drafting…",
  sections: [
    {
      title: "▸ TERMS",
      meta: "required",
      fields: [
        {
          kind: "number",
          key: "monthly_fee",
          label: "Monthly fee ($)",
          default: 1500,
          min: 0,
          step: 100,
        },
        {
          kind: "segmented",
          key: "payment_terms",
          label: "Payment terms",
          options: ["Due on signing", "Net 15", "Net 30"],
          default: "Due on signing",
        },
        {
          kind: "number",
          key: "cancellation_days",
          label: "Cancellation notice (days)",
          default: 30,
          min: 0,
          max: 90,
          inline: true,
        },
        {
          kind: "text",
          key: "start_date",
          label: "Start date",
          placeholder: "Day 1 of first campaign launch week.",
        },
      ],
    },
    {
      title: "▸ SCOPE",
      meta: "what the engagement includes",
      fields: [
        {
          kind: "textarea",
          key: "scope_of_work",
          label: "Scope of work",
          placeholder:
            "Strategy · creative production · campaign management · weekly reporting · Slack support.",
          minRows: 4,
          required: true,
        },
        {
          kind: "textarea",
          key: "out_of_scope",
          label: "Out of scope",
          placeholder: "Landing page builds · CRM setup · long-form content.",
          minRows: 2,
        },
        {
          kind: "textarea",
          key: "additional_terms",
          label: "Additional terms",
          placeholder: "IP ownership · confidentiality · indemnification.",
          minRows: 3,
        },
      ],
    },
  ],
  taskDescription:
    "Produce a complete client services agreement in plain English. Include: parties, scope of work, fees and payment terms, term + cancellation, IP ownership of creatives, confidentiality, limitation of liability, governing law (assume Idaho unless told otherwise), and signature block. Note at the top this is a starting draft and Jake should have counsel review before sending.",
  outputSchema:
    '{"headline":"…","summary":"…","sections":["Parties","Scope","Fees","Term","IP","Confidentiality"],"deliverable_format":"docusign-ready"}',
  outputInstructions:
    "After the JSON, write the full contract in well-structured markdown. Number sections. Use the placeholders [Client Name], [Date], [Hauck Marketing] only where genuinely client-specific. End with signature lines.",
  defaultTitle: "Contract draft",
};

// ── Stratos · Competitor Research ──────────────────────────────────
// Synthesis-style form: Jake opens Meta Ad Library himself, copies the raw
// ad data for 5-10 long-running competitor ads, pastes them in. Stratos
// then synthesizes patterns, common angles/offers, white space, and the
// digest downstream forms consume. Stratos does NOT research competitors
// from the web — that path produced hallucinated Page IDs and inferred
// "ad angles" from website copy rather than actual ads.
const COMPETITOR_RESEARCH: FormConfig = {
  id: "competitors",
  title: "Competitor Research Brief",
  subtitle: "Paste real ads from Meta Ad Library. Stratos synthesizes the patterns, white space, and the digest downstream forms use.",
  eyebrow: "▸ COMPETITOR INTEL · STRATOS",
  eyebrowMeta: "ONBOARDING · DAY 2",
  phase: 3,
  phaseName: "Technical Setup",
  phaseMeta: "Day 2",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "scale_checks",
  savedHeading: "Competitor brief saved",
  generateLabel: "Synthesize intel",
  generatingLabel: "Synthesizing…",
  sections: [
    {
      title: "▸ TARGET MARKET",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "niche",
          label: "Niche",
          placeholder: "Residential window cleaning.",
          required: true,
        },
        {
          kind: "text",
          key: "region",
          label: "Region",
          placeholder: "Detroit metro + 25mi.",
          required: true,
          inline: true,
        },
      ],
    },
    {
      title: "▸ COMPETITOR ADS: paste from Meta Ad Library",
      meta: "required · open facebook.com/ads/library, search the niche + region, copy 5-10 ads that have been running 30+ days",
      fields: [
        {
          kind: "textarea",
          key: "ad_paste",
          label: "Raw ad data",
          placeholder:
            "One ad (or one competitor) per block, separated by a blank line or '---'. Loose format is fine, include whatever you can grab:\n\nCrystal Panes Window Cleaning · 84 days running, started 2026-02-28\nHeadline: $50 OFF First Cleaning\nPrimary text: Seattle's #1 window cleaners since 1985. Free estimates. No contract. Book today, sparkle tomorrow.\nOffer: $50 off first clean\nCTA: Book Now\nFormat: Static image, before/after split\n---\nChinook Services · 62 days, started 2026-03-21\nHeadline: Get Your Windows Done Right\n…",
          minRows: 18,
          required: true,
        },
      ],
    },
    {
      title: "▸ INTEL TO EXTRACT",
      meta: "optional",
      fields: [
        {
          kind: "multi",
          key: "extract",
          label: "What to surface",
          options: [
            "Ad angles",
            "Offers / pricing",
            "CTAs",
            "Hook patterns",
            "Format mix",
            "Social proof claims",
          ],
          defaults: ["Ad angles", "Offers / pricing", "CTAs"],
        },
        {
          kind: "textarea",
          key: "context",
          label: "Anything Jake already knows",
          placeholder: "Top competitor's biggest weakness · prior intel · personal observations.",
          minRows: 3,
        },
      ],
    },
  ],
  taskDescription:
    "Jake pasted real ad data he copied from Meta Ad Library. Your job is to synthesize across the ads he provided — find the dominant angles, offer patterns, hook structures, and the positioning white space Jake can attack. CRITICAL: work strictly from the pasted data. Do NOT invent competitors he didn't paste, do NOT fabricate longevity numbers, do NOT pull in 'industry knowledge' about businesses he didn't include, do NOT infer angles from anything other than the actual ad copy he provided. If the paste is thin, unclear, or doesn't contain enough signal to synthesize from, say so plainly in the `summary` field and ask Jake for more ads — do not pad the brief with guesses. For each distinct competitor present in the paste: company name (exactly as Jake wrote it), the angle their ads lean on (quote a specific line from their ad copy where you can — that's how Jake knows you read what he gave you), the offer / price points visible in their ads, and one weakness Jake can exploit in positioning. Then a cross-competitor synthesis: which angles appear across MULTIPLE competitors (those are the market's proven winners, since long-running ads are the ones that didn't get killed), which offers anchor the market, which hooks or opening lines repeat, and where the white space is — the angle, offer, or format nobody in the paste is running. Produce a tight `key_takeaways` string (3-5 sentences, max ~600 chars) that downstream agents (Audiences, Creative Brief, Ad Copy) will receive as context. The takeaways must stand alone — readable by an agent who has not seen the rest of the brief — and must reflect only what's in the pasted ads.",
  outputSchema:
    '{"headline":"…","summary":"…","competitors":[{"name":"…","angle":"…","offer":"…","weakness":"…"}],"common_angles":["…"],"common_offers":["…"],"white_space":"…","key_takeaways":"…"}',
  outputInstructions:
    "After the JSON, write the full brief: one section per competitor (angle, offer, weakness as bullets — quote a specific line from their ad copy under the angle bullet), then a synthesis section covering common angles, common offers, and the 2-3 plays Jake can run that nobody in the paste is running. The JSON `key_takeaways` field must stand alone, readable in isolation by another agent that has not seen the rest of the brief. Every claim in the brief should be traceable to a specific line in the paste — if it isn't, leave it out.",
  defaultTitle: "Competitor research brief",
};

// ── Stratos · Audience Builder ─────────────────────────────────────
const AUDIENCE_BUILDER: FormConfig = {
  id: "audiences",
  title: "Audience Builder",
  subtitle: "Returns 3-5 Meta audience configurations (broad, interest-stacked, lookalike) with reasoning.",
  eyebrow: "▸ AUDIENCES · STRATOS",
  eyebrowMeta: "ONBOARDING · DAYS 3-4",
  phase: 4,
  phaseName: "Creative Production",
  phaseMeta: "Days 3–4",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "scale_checks",
  savedHeading: "Audiences saved",
  generateLabel: "Build audiences",
  generatingLabel: "Building…",
  sections: [
    {
      title: "▸ OBJECTIVE & GEO",
      meta: "required",
      fields: [
        {
          kind: "segmented",
          key: "objective",
          label: "Objective",
          options: ["Lead generation", "Conversions", "Traffic", "Awareness"],
          default: "Lead generation",
        },
        {
          kind: "text",
          key: "geography",
          label: "Geography",
          placeholder: "Boise, ID + 25mi.",
          required: true,
        },
      ],
    },
    {
      title: "▸ TARGETING",
      meta: "demographic + intent",
      fields: [
        {
          kind: "number",
          key: "age_min",
          label: "Age min",
          default: 25,
          min: 13,
          max: 65,
        },
        {
          kind: "number",
          key: "age_max",
          label: "Age max",
          default: 65,
          min: 18,
          max: 65,
          inline: true,
        },
        {
          kind: "segmented",
          key: "gender",
          label: "Gender",
          options: ["All", "Women", "Men"],
          default: "All",
        },
        {
          kind: "textarea",
          key: "ideal_customer",
          label: "Ideal customer (in their words)",
          placeholder:
            "Homeowners, 2-story homes, $80k+ HH income. Time-poor. Want it done right the first time.",
          minRows: 4,
          required: true,
        },
        {
          kind: "text",
          key: "exclusions",
          label: "Exclusions",
          placeholder: "Past 30-day leads · existing customers · renters proxy.",
        },
        {
          kind: "text",
          key: "lookalike_source",
          label: "Lookalike source",
          placeholder: "CRM customer list (filename or note).",
          inline: true,
        },
      ],
    },
    {
      title: "▸ COMPETITOR INTEL",
      meta: "auto-filled from prior step",
      fields: [
        {
          kind: "textarea",
          key: "competitor_intel",
          label: "Competitor intel",
          promptLabel: "Competitor intel",
          placeholder:
            "Key takeaways from the competitor research brief. Auto-filled when this step runs after the Competitor Research step.",
          minRows: 4,
        },
      ],
    },
  ],
  taskDescription:
    "Build 3-5 Meta ad-set audiences for this objective and customer. Always include one BROAD (let the algorithm decide), one INTEREST-STACKED, and one LOOKALIKE — plus any other variant that's smart for this niche. For each: geo, demo, interests, exclusions, expected reach band, and a one-paragraph reasoning. End with a recommendation on which to launch first. If competitor intel is provided, use it to (a) sharpen interest stacks around the angles competitors are NOT already saturating, (b) avoid audiences likely to have high ad-fatigue overlap with competitor spend, and (c) call out in each reasoning paragraph which competitive angle the audience attacks.",
  outputSchema:
    '{"headline":"…","summary":"…","audiences":[{"type":"broad|interest|lookalike|custom","name":"…","reach_band":"…","reasoning":"…"}],"launch_first":"…"}',
  outputInstructions:
    "After the JSON, write each audience as a clear block: name, geo, demo, interests (pills/list), exclusions, reach, and the 'why this works' note. Recommend the lead audience at the end.",
  defaultTitle: "Audience configurations",
};

// ── Stratos · Campaign Structure ──────────────────────────────────
const CAMPAIGN_STRUCTURE: FormConfig = {
  id: "structure",
  title: "Campaign Structure Planner",
  subtitle: "CBO vs ABO call, ad-set split, creative-per-ad-set guidance for this build.",
  eyebrow: "▸ STRUCTURE · STRATOS",
  eyebrowMeta: "ONBOARDING · DAYS 5-6",
  phase: 5,
  phaseName: "Campaign Build + QA",
  phaseMeta: "Days 5–6",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "scale_checks",
  savedHeading: "Structure plan saved",
  generateLabel: "Plan structure",
  generatingLabel: "Planning…",
  sections: [
    {
      title: "▸ BUDGET",
      meta: "required",
      fields: [
        {
          kind: "number",
          key: "daily_budget",
          label: "Daily budget ($)",
          default: 100,
          min: 10,
          step: 10,
          required: true,
        },
        {
          kind: "segmented",
          key: "objective",
          label: "Objective",
          options: ["Leads", "Sales", "Traffic", "Awareness"],
          default: "Leads",
        },
      ],
    },
    {
      title: "▸ INVENTORY",
      meta: "what's ready to ship",
      fields: [
        {
          kind: "number",
          key: "audience_count",
          label: "Audiences ready",
          default: 3,
          min: 1,
          max: 10,
        },
        {
          kind: "number",
          key: "creative_count",
          label: "Creatives ready",
          default: 5,
          min: 1,
          max: 30,
          inline: true,
        },
        {
          kind: "segmented",
          key: "bid_strategy",
          label: "Bid strategy preference",
          options: ["Lowest cost", "Cost cap", "ROAS goal"],
          default: "Lowest cost",
        },
        {
          kind: "textarea",
          key: "notes",
          label: "Notes",
          placeholder: "Anything unusual: small budget, fast learning needed, etc.",
          minRows: 3,
        },
      ],
    },
  ],
  taskDescription:
    "Recommend a campaign structure: CBO vs ABO, number of ad sets, creatives-per-ad-set, daily budget distribution, and bid strategy. Justify each call. End with a campaign naming convention and the order Jake should build it in Ads Manager.",
  outputSchema:
    '{"headline":"…","summary":"…","cbo_or_abo":"cbo|abo","ad_sets":[{"name":"…","budget":0,"audience":"…","creatives":0}],"naming_convention":"…","build_order":["…"]}',
  outputInstructions:
    "After the JSON, write a campaign architecture diagram (text/markdown tree), then the build order as a numbered list Jake can execute in Ads Manager.",
  defaultTitle: "Campaign structure plan",
};

// ── Nexus · Pixel Install Walkthrough ──────────────────────────────
const PIXEL_INSTALL: FormConfig = {
  id: "pixel-install",
  title: "Pixel Install Walkthrough",
  subtitle: "Step-by-step install guide tailored to the website platform: copy-paste snippets included.",
  eyebrow: "▸ PIXEL INSTALL · NEXUS",
  eyebrowMeta: "ONBOARDING · DAY 2",
  phase: 3,
  phaseName: "Technical Setup",
  phaseMeta: "Day 2",
  agentSlug: "nexus",
  agentName: "Nexus",
  kind: "audits",
  savedHeading: "Install guide saved",
  generateLabel: "Generate guide",
  generatingLabel: "Generating…",
  sections: [
    {
      title: "▸ SITE",
      meta: "required",
      fields: [
        {
          kind: "segmented",
          key: "platform",
          label: "Website platform",
          options: ["WordPress", "Shopify", "Squarespace", "Webflow", "Custom HTML"],
          default: "WordPress",
        },
        {
          kind: "text",
          key: "pixel_id",
          label: "Pixel ID",
          placeholder: "15-17 digit Meta pixel id.",
          required: true,
        },
        {
          kind: "segmented",
          key: "has_gtm",
          label: "Google Tag Manager?",
          options: ["Yes", "No", "Not sure"],
          default: "No",
        },
      ],
    },
    {
      title: "▸ EVENTS TO TRACK",
      meta: "pick the ones that apply",
      fields: [
        {
          kind: "multi",
          key: "events",
          label: "Standard events",
          options: ["PageView", "Lead", "Purchase", "ViewContent", "AddToCart", "InitiateCheckout"],
          defaults: ["PageView", "Lead"],
        },
        {
          kind: "textarea",
          key: "site_notes",
          label: "Site notes",
          placeholder:
            "Where the conversion happens (form on /contact · thank-you on /thank-you · etc).",
          minRows: 3,
        },
      ],
    },
  ],
  taskDescription:
    "Produce a complete install walkthrough for THIS platform. Cover base pixel code placement, the chosen events (with copy-paste snippets where relevant), and a verification step at the end (how to confirm it's firing via Events Manager Test Events). Be explicit — the goal is that Jake or the client can execute without a second question.",
  outputSchema:
    '{"headline":"…","summary":"…","platform":"…","steps":[{"n":1,"title":"…","detail":"…","snippet":"… or empty"}],"verification":"…"}',
  outputInstructions:
    "After the JSON, write the walkthrough as a numbered list of steps. Each code snippet inside a fenced code block. Bold the platform-specific UI paths (e.g. **Shopify → Online Store → Themes → Edit Code**).",
  defaultTitle: "Pixel install guide",
};

// HOOKS formConfig removed 2026-05-22. The Hooks Generator was retired when
// ad-copy was retooled to write its own openers under each framework (lesson
// 3.8 build). Existing client `Hooks/` vault notes are left in place on disk
// but no UI surfaces them anymore. The `kind: "hooks"` GeneratorKind stays in
// types.ts so legacy saved files still typecheck.

// ── Vortex · Creative Brief (Misc) ────────────────────────────────
const CREATIVE_BRIEF: FormConfig = {
  id: "creative-brief",
  title: "Creative Brief Builder",
  subtitle:
    "Designer- and editor-ready creative brief. Pre-filled from this client's Profile when available.",
  eyebrow: "▸ CREATIVE BRIEF · VORTEX",
  eyebrowMeta: "TOOL · ANYTIME",
  category: "misc",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "briefs",
  savedHeading: "Creative brief saved",
  generateLabel: "Build brief",
  generatingLabel: "Building…",
  prefillFromProfile: {
    product: "services",
    audience: "target",
    visual_style: "voice",
    do_nots: "avoid",
  },
  prefillFromPlaybook: {
    audience: "audience",
    core_message: "angles",
    visual_style: "creative-brief",
    do_nots: "creative-brief",
    competitor_intel: "competitors",
  },
  sections: [
    {
      title: "▸ WHAT WE'RE MAKING",
      meta: "required",
      fields: [
        {
          kind: "textarea",
          key: "product",
          label: "Product / offer",
          promptLabel: "Product",
          placeholder: "What this brief is selling. (Pre-filled from Profile.md if available.)",
          minRows: 2,
          required: true,
        },
        {
          kind: "text",
          key: "format",
          label: "Format(s)",
          promptLabel: "Format",
          placeholder: "1080×1920 video, 15-30s.",
          required: true,
        },
        {
          kind: "number",
          key: "quantity",
          label: "Variations",
          promptLabel: "Quantity",
          default: 3,
          min: 1,
          max: 10,
          inline: true,
        },
      ],
    },
    {
      title: "▸ WHO + WHY",
      meta: "audience + angle",
      fields: [
        {
          kind: "textarea",
          key: "audience",
          label: "Audience",
          promptLabel: "Audience",
          placeholder: "Demo, mindset, where they are in the buying journey.",
          minRows: 3,
          required: true,
        },
        {
          kind: "segmented",
          key: "awareness",
          label: "Awareness",
          promptLabel: "Awareness",
          options: ["cold", "warm", "hot"],
          default: "cold",
        },
        {
          kind: "textarea",
          key: "pains",
          label: "Pain points",
          promptLabel: "Pain points",
          placeholder: "The specific frustrations driving the buy.",
          minRows: 3,
        },
        {
          kind: "textarea",
          key: "desires",
          label: "Desires",
          promptLabel: "Desires",
          placeholder: "The outcome they actually want.",
          minRows: 3,
        },
      ],
    },
    {
      title: "▸ THE PITCH",
      meta: "message + proof",
      fields: [
        {
          kind: "text",
          key: "hook",
          label: "Lead hook (optional)",
          promptLabel: "Lead hook",
          placeholder: "If Jake already has one, drop it here.",
        },
        {
          kind: "textarea",
          key: "core_message",
          label: "Core message",
          promptLabel: "Core message",
          placeholder: "The single idea every variation must land.",
          minRows: 2,
        },
        {
          kind: "textarea",
          key: "proof",
          label: "Proof",
          promptLabel: "Proof",
          placeholder: "Reviews, results, stats, social proof.",
          minRows: 3,
        },
        {
          kind: "text",
          key: "cta",
          label: "CTA",
          promptLabel: "CTA",
          placeholder: "Get a free quote.",
        },
      ],
    },
    {
      title: "▸ VISUAL + GUARDRAILS",
      meta: "execution notes",
      fields: [
        {
          kind: "textarea",
          key: "visual_style",
          label: "Visual style",
          promptLabel: "Visual style",
          placeholder: "Look, feel, references. (Pre-filled from Profile voice/brand if available.)",
          minRows: 3,
        },
        {
          kind: "textarea",
          key: "do_nots",
          label: "Do-nots",
          promptLabel: "Do-nots",
          placeholder: "Anything off-limits: claims, imagery, tone. (Pre-filled from Profile.)",
          minRows: 2,
        },
        {
          kind: "text",
          key: "deadline",
          label: "Deadline",
          promptLabel: "Deadline",
          placeholder: "When this needs to ship.",
        },
      ],
    },
    {
      title: "▸ COMPETITOR INTEL",
      meta: "auto-filled from prior step",
      fields: [
        {
          kind: "textarea",
          key: "competitor_intel",
          label: "Competitor intel",
          promptLabel: "Competitor intel",
          placeholder:
            "Key takeaways from the competitor research brief. Auto-filled when this step runs after the Competitor Research step.",
          minRows: 4,
        },
      ],
    },
  ],
  taskDescription:
    "Produce a complete creative brief a designer/editor can execute against. Follow the Vortex Creative Brief skill template — overview, audience, message, visual direction, technical specs, deliverables checklist. Be specific. No placeholders left unfilled. If competitor intel is provided, use it to position the hook + core message against the angles competitors are ALREADY running — the brief should explicitly own a different lane (different angle, different proof type, different visual treatment). Call out the competitive contrast in the brief's positioning section so the designer/editor understands what NOT to look like.",
  outputSchema:
    '{"headline":"…","summary":"…","format":"…","deliverables":["…","…"],"hook":"…","cta":"…"}',
  outputInstructions:
    "After the JSON, write the full brief as markdown — headers, lists, tables where they help. Production-ready.",
  defaultTitle: "Creative brief",
};

// ── Aurelius · Ad Copy (Misc) ─────────────────────────────────────
// Lesson 3.8 build (https://ai-advertiser-course.vercel.app/classes/3.8-ai-ad-copy-generator).
// Form layout + prompt template mirror the lesson's "Aurelius Prompt Builder"
// surface. The hooks step that used to feed [HOOKS] was retired 2026-05-22:
// the ad copy prompt now writes its own openers under each framework, so
// there's no chainFrom from a Hooks generator (which no longer exists).
//
// House em-dash rule: em dashes in the lesson prompt prose are swapped for
// commas/colons. The "Not X, It's Y" anti-pattern is kept with a comma so the
// rule still describes a real dramatic-contrast cliché. Arrows (→) inside
// framework names stay since they're framework notation, not em dashes.
const AD_COPY: FormConfig = {
  id: "ad-copy",
  title: "Aurelius Prompt Builder",
  subtitle:
    "12 ad copy variations across PAS, AIDA, BAB, and STORY. One reason to buy per ad. Mirrors lesson 3.8.",
  eyebrow: "▸ AURELIUS PROMPT BUILDER",
  eyebrowMeta: "TOOL · ANYTIME",
  category: "misc",
  agentSlug: "aurelius",
  agentName: "Aurelius",
  kind: "briefs",
  savedHeading: "Ad copy saved",
  generateLabel: "Generate ad copy",
  generatingLabel: "Writing…",
  prefillFromProfile: {
    business_name: "business",
    what_they_sell: "services",
    target_customer: "target",
    current_offer: "offers",
  },
  prefillFromPlaybook: {
    target_customer: "audience",
    current_offer: "offers",
    usp: "angles",
  },
  sections: [
    {
      title: "▸ AURELIUS PROMPT BUILDER",
      meta: "every field feeds the prompt",
      fields: [
        {
          kind: "text",
          key: "business_name",
          label: "Business name",
          promptPlaceholder: "[BUSINESS NAME]",
          placeholder: "Tony's Pizza",
          required: true,
        },
        {
          kind: "text",
          key: "what_they_sell",
          label: "What they sell / do",
          promptPlaceholder: "[WHAT THEY SELL]",
          placeholder: "Hand-tossed pizza delivery in Curitiba",
          required: true,
        },
        {
          kind: "textarea",
          key: "target_customer",
          label: "Target customer",
          promptPlaceholder: "[TARGET CUSTOMER]",
          placeholder:
            "Families in Curitiba Centro, 25-45, busy parents who don't have time to cook",
          minRows: 3,
          required: true,
        },
        {
          kind: "text",
          key: "usp",
          label: "What makes them different (USP)",
          promptPlaceholder: "[UNIQUE SELLING PROPOSITION]",
          placeholder:
            "Imported Italian ingredients, 20-min delivery, 15 years in business",
          required: true,
        },
        {
          kind: "text",
          key: "current_offer",
          label: "Current offer / promotion",
          promptPlaceholder: "[CURRENT OFFER]",
          placeholder: "2 large pizzas + 4 drinks for $19.99",
          required: true,
        },
        {
          kind: "select",
          key: "tone",
          label: "Tone / voice",
          promptPlaceholder: "[TONE]",
          options: [
            "Casual & Friendly",
            "Professional",
            "Urgent",
            "Luxury",
            "Fun",
            "Local",
          ],
          default: "Casual & Friendly",
        },
        {
          kind: "select",
          key: "platform",
          label: "Platform",
          promptPlaceholder: "[PLATFORM]",
          options: [
            "Facebook and Instagram ads",
            "Google ads",
            "TikTok ads",
          ],
          default: "Facebook and Instagram ads",
          inline: true,
        },
      ],
    },
  ],
  promptTemplate: `You are a world-class direct response copywriter. Write 12 ad copy variations for [PLATFORM].

BUSINESS: [BUSINESS NAME]
WHAT THEY SELL: [WHAT THEY SELL]
TARGET CUSTOMER: [TARGET CUSTOMER]
USP: [UNIQUE SELLING PROPOSITION]
CURRENT OFFER: [CURRENT OFFER]
TONE: [TONE]

RULES:
1. ONE AD = ONE REASON TO BUY. Each ad must target a completely different motivation (different fear, desire, or angle). NOT variations of the same headline.
2. Use these frameworks (3 ads each):
   - PAS (Problem → Agitate → Solution)
   - AIDA (Attention → Interest → Desire → Action)
   - BAB (Before → After → Bridge)
   - STORY (Character → Conflict → Resolution)
3. Mix lengths:
   - 3 short (under 50 words), for Stories/Reels
   - 6 medium (50-100 words), for Feed ads
   - 3 long (100-150 words), for high-intent audiences
4. ANTI-PATTERNS TO AVOID:
   - No "Not X, It's Y" dramatic contrasts
   - No triple parallel structures ("X. Y. And Z.")
   - No "Imagine this" or "Picture this" openers
   - No filler words: elevate, transform, unlock, game-changer, seamless, revolutionize
   - No perfect grammar, use contractions, fragments, slang where natural
   - No question-then-answer cadence ("Tired of X? We have the solution.")
5. Write like a human texting a friend, not a copywriter writing a brochure
6. Include specific numbers, prices, and details, NOT generic claims
7. Every ad ends with a clear CTA
8. NEVER use em dashes anywhere in the ad copy. Use commas, periods, or parentheses instead.

FORMAT (use this EXACT layout for every ad, no deviations):

**Ad N** | FRAMEWORK | Angle description | Length | NN words
<blank line>
<ad body>
<blank line>
---
<blank line>

Where FRAMEWORK is one of PAS / AIDA / BAB / STORY, and Length is one of Short / Medium / Long. Use literal pipe characters (|) as separators, NOT brackets. Numbering runs 1 through 12. Separate every ad with a "---" line.

EXAMPLE (first ad only, copy this shape):

**Ad 1** | PAS | DIY streaks | Short | 38 words

Three hours of vinegar and paper towels and your windows still look worse than when you started. Streaks for days. Skip it. Our crew handles it for $100 off plus free screens. Tap to book in 60 seconds.

---

GO.`,
  defaultTitle: "Ad copy set",
  progress: {
    total: 12,
    unitLabel: "ad",
    itemPattern: "^(PAS|AIDA|BAB|STORY)\\b",
  },
};

// AD_CREATIVE legacy block removed 2026-05-20. The ad-creative wizard step
// now renders AdCreativeStudio (Replicate-backed playground) directly — see
// AdsSequenceWizard.tsx + AdCreativeStudio.tsx. The sequence step's formId
// stays "ad-creative" as a sentinel; getFormConfig returns undefined for it
// and the wizard branches on the step id.

// ── Nexus · Audience Research (Misc) ──────────────────────────────
const AUDIENCE_RESEARCH: FormConfig = {
  id: "audience-research",
  title: "Audience Research",
  subtitle:
    "Voice-of-customer research: motivations, objections, triggers, language, competitors, daily routine. Informs copy + creative, not targeting.",
  eyebrow: "▸ AUDIENCE RESEARCH · NEXUS",
  eyebrowMeta: "TOOL · ANYTIME",
  category: "misc",
  agentSlug: "nexus",
  agentName: "Nexus",
  kind: "briefs",
  savedHeading: "Audience research saved",
  generateLabel: "Run research",
  generatingLabel: "Researching…",
  prefillFromProfile: {
    business_name: "business",
    product_service: "services",
    location: "geography",
  },
  sections: [
    {
      title: "▸ BUSINESS",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "business_name",
          label: "Business name",
          promptPlaceholder: "[Business name]",
          placeholder: "Willis Windows.",
          required: true,
        },
        {
          kind: "textarea",
          key: "product_service",
          label: "Product / service",
          promptPlaceholder: "[Product/service]",
          placeholder: "Exterior window cleaning for residential homes.",
          minRows: 2,
          required: true,
        },
        {
          kind: "text",
          key: "location",
          label: "Location",
          promptPlaceholder: "[City, state]",
          placeholder: "Boise, ID.",
          required: true,
        },
        {
          kind: "text",
          key: "price_range",
          label: "Average ticket",
          promptPlaceholder: "[Average ticket]",
          placeholder: "$250-$450 per clean.",
          required: true,
          inline: true,
        },
      ],
    },
    {
      title: "▸ COMPETITOR INTEL",
      meta: "auto-filled from all saved competitor briefs",
      fields: [
        {
          kind: "textarea",
          key: "competitor_intel",
          label: "Competitor intel",
          promptPlaceholder: "[COMPETITOR INTEL]",
          placeholder:
            "Aggregated digest of every competitor brief saved for this client. Auto-filled. Use it to sharpen the audience research against what competitors are already saying.",
          minRows: 4,
        },
      ],
    },
  ],
  promptTemplate: `I'm running Facebook/Instagram ads for a local business. I need to deeply understand their target audience, NOT for targeting settings (I'm using broad targeting), but to write better ad copy and create better visuals.

BUSINESS: [Business name]
WHAT THEY SELL: [Product/service]
LOCATION: [City, state]
PRICE RANGE: [Average ticket]

COMPETITOR INTEL (synthesized from every competitor brief saved for this client; may be empty on first run):
[COMPETITOR INTEL]

Give me:
1. The top 10 REASONS someone would buy this (not features, emotional motivations)
2. The top 5 OBJECTIONS they'd have before buying
3. The top 5 MOMENTS when they'd think about this product (triggers)
4. What language/slang does this audience actually use?
5. Who are they comparing this business to? (competitors + alternatives)
6. What does their day look like? (daily routine relevant to the product)

If competitor intel is provided, weight the answers against it: which motivations are competitors NOT speaking to, which objections do competitor reviews repeatedly surface, which language patterns appear across multiple competitor briefs. Synthesize, do not just restate.

Be specific. Use real examples. No generic marketing talk.`,
  defaultTitle: "Audience research",
};

// ── Zenith · Weekly Ads Report (Reports) ──────────────────────────
const WEEKLY_REPORT: FormConfig = {
  id: "weekly-report",
  title: "Weekly Ads Report",
  subtitle:
    "Client-ready weekly update: numbers, what's working, what changed, what's next.",
  eyebrow: "▸ WEEKLY REPORT · ZENITH",
  eyebrowMeta: "REPORT · WEEKLY",
  category: "reports",
  agentSlug: "zenith",
  agentName: "Zenith",
  kind: "reports",
  savedHeading: "Weekly report saved",
  generateLabel: "Generate report",
  generatingLabel: "Writing…",
  sections: [
    {
      title: "▸ THIS WEEK'S NUMBERS",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "total_spend",
          label: "Total spend ($)",
          promptPlaceholder: "[TOTAL SPEND]",
          placeholder: "1,240",
          required: true,
        },
        {
          kind: "text",
          key: "total_leads",
          label: "Total leads",
          promptPlaceholder: "[TOTAL LEADS]",
          placeholder: "32",
          required: true,
          inline: true,
        },
        {
          kind: "text",
          key: "cost_per_lead",
          label: "Cost per lead ($)",
          promptPlaceholder: "[COST PER LEAD]",
          placeholder: "38.75",
          required: true,
        },
        {
          kind: "text",
          key: "best_ad_name",
          label: "Best performing ad",
          promptPlaceholder: "[BEST AD NAME]",
          placeholder: "V3: streak-free guarantee UGC.",
          required: true,
        },
        {
          kind: "text",
          key: "best_ad_cpl",
          label: "Best ad CPL ($)",
          promptPlaceholder: "[BEST AD CPL]",
          placeholder: "24.10",
          required: true,
          inline: true,
        },
      ],
    },
    {
      title: "▸ WHAT'S WORKING",
      meta: "qualitative",
      fields: [
        {
          kind: "textarea",
          key: "top_ad_why",
          label: "Why the top ad is winning",
          promptPlaceholder: "[TOP AD WHY]",
          placeholder: "Angle + creative type + what's resonating.",
          minRows: 3,
          required: true,
        },
        {
          kind: "textarea",
          key: "trends",
          label: "Trends noticed",
          promptPlaceholder: "[TRENDS]",
          placeholder: "Mobile-first audiences · weekend CPLs · etc.",
          minRows: 3,
        },
      ],
    },
    {
      title: "▸ WHAT WE CHANGED",
      meta: "actions taken",
      fields: [
        {
          kind: "text",
          key: "paused_ads",
          label: "Ads paused (too expensive)",
          promptPlaceholder: "[PAUSED ADS]",
          placeholder: "V1, V4: CPL > $80.",
        },
        {
          kind: "text",
          key: "scaled_ad",
          label: "Ad scaled (budget +)",
          promptPlaceholder: "[SCALED AD]",
          placeholder: "V3: bumped daily from $40 → $80.",
        },
        {
          kind: "text",
          key: "new_creatives",
          label: "New creatives added",
          promptPlaceholder: "[NEW CREATIVES]",
          placeholder: "V5, V6: testimonial UGC + before/after.",
        },
      ],
    },
    {
      title: "▸ NEXT WEEK'S PLAN",
      meta: "what's next",
      fields: [
        {
          kind: "textarea",
          key: "next_week_plan",
          label: "Plan for next week",
          promptPlaceholder: "[NEXT WEEK PLAN]",
          placeholder: "Ship 3 new UGC angles · test landing page V2 · push budget on V3.",
          minRows: 3,
          required: true,
        },
      ],
    },
  ],
  promptTemplate: `Output the following weekly ads update email exactly as written below, substituting the values in place. No preamble, no commentary, no closing remarks — just the email itself.

Hey [CLIENT NAME]! Here's your weekly ads update:

📊 THIS WEEK'S NUMBERS
• Total Spend: $[TOTAL SPEND]
• Total Leads: [TOTAL LEADS]
• Cost Per Lead: $[COST PER LEAD]
• Best Performing Ad: [BEST AD NAME], $[BEST AD CPL]

🟢 WHAT'S WORKING
• [TOP AD WHY]
• [TRENDS]

🔴 WHAT WE CHANGED
• Paused [PAUSED ADS] (too expensive)
• Increased budget on [SCALED AD], best performer
• Added [NEW CREATIVES] to keep things fresh

📅 NEXT WEEK'S PLAN
• [NEXT WEEK PLAN]

Questions? Let me know!`,
  defaultTitle: "Weekly ads report",
  metaAutoFill: {
    windowDays: 7,
    fieldMap: {
      total_spend: "spend",
      total_leads: "leads",
      cost_per_lead: "cpl",
      best_ad_name: "best_ad_name",
      best_ad_cpl: "best_ad_cpl",
    },
  },
};

// ── Zenith · Monthly Ads Report (Reports) ─────────────────────────
const MONTHLY_REPORT: FormConfig = {
  id: "monthly-report",
  title: "Monthly Ads Report",
  subtitle:
    "Full monthly recap: big numbers, MoM comparison, wins, challenges, next-month plan, recommendation.",
  eyebrow: "▸ MONTHLY REPORT · ZENITH",
  eyebrowMeta: "REPORT · MONTHLY",
  category: "reports",
  agentSlug: "zenith",
  agentName: "Zenith",
  kind: "reports",
  savedHeading: "Monthly report saved",
  generateLabel: "Generate report",
  generatingLabel: "Writing…",
  sections: [
    {
      title: "▸ PERIOD",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "month_year",
          label: "Month & year",
          promptPlaceholder: "[MONTH YEAR]",
          placeholder: "May 2026.",
          required: true,
        },
      ],
    },
    {
      title: "▸ THIS MONTH",
      meta: "headline numbers",
      fields: [
        {
          kind: "text",
          key: "spend_this",
          label: "Total spend ($)",
          promptPlaceholder: "[SPEND THIS]",
          placeholder: "4,820",
          required: true,
        },
        {
          kind: "text",
          key: "leads_this",
          label: "Total leads",
          promptPlaceholder: "[LEADS THIS]",
          placeholder: "138",
          required: true,
          inline: true,
        },
        {
          kind: "text",
          key: "cpl_this",
          label: "Cost per lead ($)",
          promptPlaceholder: "[CPL THIS]",
          placeholder: "34.92",
          required: true,
        },
        {
          kind: "text",
          key: "revenue_this",
          label: "Est. revenue ($)",
          promptPlaceholder: "[REVENUE THIS]",
          placeholder: "21,400",
          required: true,
          inline: true,
        },
        {
          kind: "text",
          key: "roas",
          label: "ROAS (x)",
          promptPlaceholder: "[ROAS]",
          placeholder: "4.4",
          required: true,
        },
      ],
    },
    {
      title: "▸ LAST MONTH",
      meta: "for MoM comparison (leave blank if N/A)",
      fields: [
        {
          kind: "text",
          key: "spend_last",
          label: "Spend last month ($)",
          promptPlaceholder: "[SPEND LAST]",
          placeholder: "4,300",
        },
        {
          kind: "text",
          key: "spend_change",
          label: "Spend change",
          promptPlaceholder: "[SPEND CHANGE]",
          placeholder: "+12%",
          inline: true,
        },
        {
          kind: "text",
          key: "leads_last",
          label: "Leads last month",
          promptPlaceholder: "[LEADS LAST]",
          placeholder: "112",
        },
        {
          kind: "text",
          key: "leads_change",
          label: "Leads change",
          promptPlaceholder: "[LEADS CHANGE]",
          placeholder: "+23%",
          inline: true,
        },
        {
          kind: "text",
          key: "cpl_last",
          label: "CPL last month ($)",
          promptPlaceholder: "[CPL LAST]",
          placeholder: "38.40",
        },
        {
          kind: "text",
          key: "cpl_change",
          label: "CPL change",
          promptPlaceholder: "[CPL CHANGE]",
          placeholder: "-9%",
          inline: true,
        },
        {
          kind: "text",
          key: "revenue_last",
          label: "Revenue last month ($)",
          promptPlaceholder: "[REVENUE LAST]",
          placeholder: "17,200",
        },
        {
          kind: "text",
          key: "revenue_change",
          label: "Revenue change",
          promptPlaceholder: "[REVENUE CHANGE]",
          placeholder: "+24%",
          inline: true,
        },
      ],
    },
    {
      title: "▸ WINS",
      meta: "what worked",
      fields: [
        {
          kind: "textarea",
          key: "top_ad_win",
          label: "Best performing ad / angle (and why)",
          promptPlaceholder: "[TOP AD WIN]",
          placeholder: "V3 streak-free guarantee UGC, drove 41% of leads at $24 CPL.",
          minRows: 3,
          required: true,
        },
        {
          kind: "textarea",
          key: "record_wins",
          label: "Record days / weeks",
          promptPlaceholder: "[RECORD WINS]",
          placeholder: "May 18: 14 leads in one day, all-time high.",
          minRows: 2,
        },
        {
          kind: "textarea",
          key: "new_winner",
          label: "New audience or creative that worked",
          promptPlaceholder: "[NEW WINNER]",
          placeholder: "First testimonial UGC outperformed studio creative 2x.",
          minRows: 2,
        },
      ],
    },
    {
      title: "▸ CHALLENGES",
      meta: "what didn't work",
      fields: [
        {
          kind: "textarea",
          key: "challenges",
          label: "What didn't work (and what was learned)",
          promptPlaceholder: "[CHALLENGES]",
          placeholder: "Long-form video underperformed, audience prefers 15s hooks.",
          minRows: 3,
        },
        {
          kind: "textarea",
          key: "external_factors",
          label: "External factors",
          promptPlaceholder: "[EXTERNAL FACTORS]",
          placeholder: "Memorial Day weekend dip · new competitor ad blitz.",
          minRows: 2,
        },
      ],
    },
    {
      title: "▸ NEXT MONTH",
      meta: "the plan",
      fields: [
        {
          kind: "textarea",
          key: "next_3_things",
          label: "3 specific things to do differently",
          promptPlaceholder: "[NEXT 3 THINGS]",
          placeholder: "1) Ship 3 testimonial UGCs · 2) Test 7-day retargeting · 3) Kill long-form.",
          minRows: 3,
          required: true,
        },
        {
          kind: "textarea",
          key: "new_angles",
          label: "New creative angles to test",
          promptPlaceholder: "[NEW ANGLES]",
          placeholder: "Before/after splits · veteran-owned story · neighbor referral.",
          minRows: 2,
        },
        {
          kind: "text",
          key: "budget_rec",
          label: "Budget recommendation",
          promptPlaceholder: "[BUDGET REC]",
          placeholder: "Scale to $200/day, hold for 14 days.",
        },
      ],
    },
    {
      title: "▸ THE ASK",
      meta: "one clear recommendation",
      fields: [
        {
          kind: "textarea",
          key: "recommendation",
          label: "Recommendation",
          promptPlaceholder: "[RECOMMENDATION]",
          placeholder: "Increase monthly ad budget to $6k, current scale is bottlenecked by spend, not demand.",
          minRows: 3,
          required: true,
        },
      ],
    },
  ],
  promptTemplate: `Output the following monthly performance report exactly as written below, substituting the values in place. Preserve all spacing, line breaks, emojis, and the column alignment in the MoM table. No preamble, no commentary, no closing remarks — just the report itself.

📊 MONTHLY PERFORMANCE REPORT: [MONTH YEAR]
[BUSINESS NAME] | Prepared by Jake Hauck

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 THE BIG NUMBERS
• Total Ad Spend: $[SPEND THIS]
• Total Leads Generated: [LEADS THIS]
• Cost Per Lead: $[CPL THIS]
• Estimated Revenue from Ads: $[REVENUE THIS]
• Return on Ad Spend (ROAS): [ROAS]x

📊 MONTH-OVER-MONTH COMPARISON
             This Month    Last Month    Change
Spend:       $[SPEND THIS]          $[SPEND LAST]          [SPEND CHANGE]
Leads:       [LEADS THIS]           [LEADS LAST]           [LEADS CHANGE]
CPL:         $[CPL THIS]          $[CPL LAST]          [CPL CHANGE]
Revenue:     $[REVENUE THIS]          $[REVENUE LAST]          [REVENUE CHANGE]

🏆 WINS THIS MONTH
• [TOP AD WIN]
• [RECORD WINS]
• [NEW WINNER]

📉 CHALLENGES
• [CHALLENGES]
• [EXTERNAL FACTORS]

🎯 NEXT MONTH PLAN
• [NEXT 3 THINGS]
• [NEW ANGLES]
• [BUDGET REC]

💡 RECOMMENDATION
[RECOMMENDATION]`,
  defaultTitle: "Monthly ads report",
  metaAutoFill: {
    windowDays: 30,
    fieldMap: {
      spend_this: "spend",
      leads_this: "leads",
      cpl_this: "cpl",
      revenue_this: "revenue",
      roas: "roas",
    },
  },
};

// ── Vortex · V3 HTML Composite Ad Forms ───────────────────────────
// Six niche-specific composite-ad generators per
// docs/build-plans/Agency Desktop App/High Priority/02-ad-creatives.md §V3.
// Each form ships the verbatim niche promptTemplate from adTemplates.ts
// after substituting [CITY] / [NEIGHBORHOOD] / headline + CTA overrides.
// Output: a single fenced ```html block Jake can copy into a .html file.

import { AD_TEMPLATES, AD_TEMPLATE_DEFAULTS, AD_TEMPLATE_ORDER, type AdNiche } from "./adTemplates";

function buildHtmlCompositeForm(niche: AdNiche): FormConfig {
  const template = AD_TEMPLATES[niche];
  const defaults = AD_TEMPLATE_DEFAULTS[niche];
  const id = `ad-html-${niche}`;
  return {
    id,
    title: `HTML Ad · ${template.label}`,
    subtitle: `${template.dimensions} composite ad. Self-contained HTML with inline CSS, ready to screenshot.`,
    eyebrow: `▸ HTML COMPOSITE · ${template.label.toUpperCase()}`,
    eyebrowMeta: `STATIC · ${template.dimensions}`,
    category: "misc",
    agentSlug: "vortex",
    agentName: "Vortex",
    kind: "briefs",
    savedHeading: `${template.label} composite saved`,
    generateLabel: "Generate HTML ad",
    generatingLabel: "Designing…",
    sections: [
      {
        title: "▸ LOCATION",
        meta: "required",
        fields: [
          {
            kind: "text",
            key: "city",
            label: "City",
            promptPlaceholder: "[CITY]",
            placeholder: "Tacoma.",
            required: true,
          },
          ...(niche === "real-estate"
            ? [
                {
                  kind: "text" as const,
                  key: "neighborhood",
                  label: "Neighborhood",
                  promptPlaceholder: "[NEIGHBORHOOD]",
                  placeholder: "North End.",
                  required: true,
                  inline: true,
                },
              ]
            : []),
        ],
      },
      {
        title: "▸ COPY (overrides optional)",
        meta: "blank = use the default",
        fields: [
          {
            kind: "textarea",
            key: "headline",
            label: "Headline",
            promptPlaceholder: "[HEADLINE]",
            placeholder: defaults.headline,
            default: defaults.headline,
            minRows: 2,
          },
          {
            kind: "text",
            key: "cta",
            label: "CTA",
            promptPlaceholder: "[CTA]",
            placeholder: defaults.cta,
            default: defaults.cta,
          },
        ],
      },
    ],
    promptTemplate: template.promptTemplate,
    defaultTitle: `${template.label} HTML ad`,
  };
}

const AD_HTML_DENTIST = buildHtmlCompositeForm("dentist");
const AD_HTML_GYM = buildHtmlCompositeForm("gym");
const AD_HTML_RESTAURANT = buildHtmlCompositeForm("restaurant");
const AD_HTML_REAL_ESTATE = buildHtmlCompositeForm("real-estate");
const AD_HTML_HAIR_SALON = buildHtmlCompositeForm("hair-salon");
const AD_HTML_PLUMBER = buildHtmlCompositeForm("plumber");

// ── Meta Ads · Live Report Forms ──────────────────────────────────
// Eight verbatim-prompt forms from docs/build-plans/Agency Desktop App/High
// Priority/01-meta-ads.md §"Verbatim prompts: the eight live reports".
// Each form pipes through claude -p; when the meta-ads MCP is registered the
// prompts read real account data, otherwise they compose against pasted data.

const META_ACCOUNT_FIELD: FormField = {
  kind: "text",
  key: "account_id",
  label: "Meta ad account ID",
  promptPlaceholder: "[ACCOUNT_ID]",
  placeholder: "act_1234567890 (find in Ads Manager URL)",
  required: true,
};

const META_CLIENT_FIELD: FormField = {
  kind: "text",
  key: "client_name",
  label: "Client name",
  promptPlaceholder: "[CLIENT_NAME]",
  placeholder: "Willis Windows.",
  required: true,
};

const META_DAILY_PULSE: FormConfig = {
  id: "meta-daily-pulse",
  title: "Meta · Daily Pulse",
  subtitle:
    "Yesterday's performance, campaign-by-campaign, with red/yellow/green status cards. Single self-contained HTML dashboard.",
  eyebrow: "▸ DAILY PULSE · STRATOS",
  eyebrowMeta: "REPORT · DAILY",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Daily pulse saved",
  generateLabel: "Generate daily pulse",
  generatingLabel: "Pulling…",
  prefillFromProfile: { client_name: "business" },
  sections: [
    {
      title: "▸ ACCOUNT",
      meta: "required",
      fields: [META_ACCOUNT_FIELD, META_CLIENT_FIELD],
    },
  ],
  promptTemplate: `Use the meta-ads MCP to pull yesterday's performance for ad account [ACCOUNT_ID]. Group by campaign. For each row show: spend, CPM, CTR, CPA, conversions, vs the 7-day average. Then build me an HTML dashboard with red/yellow/green status cards. Add a summary at the top: biggest winner today, biggest concern, what to do. Use my agency colors: primary #b478ff, bg #0A0A0A. Output a single self-contained HTML file.`,
  defaultTitle: "Daily pulse",
};

const META_FRIDAY_CLIENT_REPORT: FormConfig = {
  id: "meta-friday-client",
  title: "Meta · Friday Client Report",
  subtitle:
    "7-day client-facing HTML one-pager. Spend vs target, leads, CPL trend, top 3 ads, anomalies. Confident, no jargon.",
  eyebrow: "▸ FRIDAY REPORT · STRATOS",
  eyebrowMeta: "REPORT · WEEKLY",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Friday report saved",
  generateLabel: "Generate Friday report",
  generatingLabel: "Pulling…",
  prefillFromProfile: { client_name: "business" },
  sections: [
    {
      title: "▸ ACCOUNT",
      meta: "required",
      fields: [
        META_ACCOUNT_FIELD,
        META_CLIENT_FIELD,
        {
          kind: "text",
          key: "agency_name",
          label: "Agency name",
          promptPlaceholder: "[AGENCY_NAME]",
          placeholder: "Hauck Marketing.",
          required: true,
        },
      ],
    },
  ],
  promptTemplate: `Pull the last 7 days of data for ad account [ACCOUNT_ID]. Generate an HTML one-pager I can send to my client [CLIENT_NAME] tonight. Include: spend vs target, leads (or purchases), CPL trend line, top 3 ads by ROAS with their thumbnails if available, anomalies flagged by ads_insights_anomaly_signal. Tone: confident, no jargon. Brand it with [AGENCY_NAME] header at the top. Output as single HTML.`,
  defaultTitle: "Friday client report",
};

const META_ANDROMEDA_CLEANUP: FormConfig = {
  id: "meta-andromeda-cleanup",
  title: "Meta · Andromeda Cleanup Audit",
  subtitle:
    "14-day ad-set audit. Flags extended Learning Phase, low conversions, and CPA > 1.5× account avg. Outputs a kill/keep/scale table.",
  eyebrow: "▸ ANDROMEDA · STRATOS",
  eyebrowMeta: "AUDIT · 14D",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Andromeda audit saved",
  generateLabel: "Run audit",
  generatingLabel: "Auditing…",
  sections: [
    {
      title: "▸ ACCOUNT",
      meta: "required",
      fields: [META_ACCOUNT_FIELD],
    },
  ],
  promptTemplate: `Pull the last 14 days of all ad sets in account [ACCOUNT_ID]. Flag: ad sets in extended Learning Phase, ones with fewer than 50 conversions/week, and any with CPA > 1.5× the account average. Output a kill/keep/scale table with one-line reasoning for each row. Sort by spend descending.`,
  defaultTitle: "Andromeda cleanup audit",
};

const META_CATALOG_HEALTH: FormConfig = {
  id: "meta-catalog-health",
  title: "Meta · Catalog Health Check",
  subtitle:
    "Pulls catalog diagnostics, prioritises errors by severity + revenue-impact tier. Hand-offable checklist for client devs.",
  eyebrow: "▸ CATALOG · STRATOS",
  eyebrowMeta: "DIAGNOSTIC",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Catalog audit saved",
  generateLabel: "Run diagnostics",
  generatingLabel: "Diagnosing…",
  sections: [
    {
      title: "▸ CATALOG",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "catalog_id",
          label: "Meta catalog ID",
          promptPlaceholder: "[CATALOG_ID]",
          placeholder: "1234567890123456",
          required: true,
        },
      ],
    },
  ],
  promptTemplate: `Run ads_catalog_get_diagnostics on catalog [CATALOG_ID]. Pull every error and warning. Build me a prioritized fix list grouped by severity, and estimate revenue-impact tier (high / medium / low) for each error type. Format as a checklist I can hand off to my client's developer.`,
  defaultTitle: "Catalog health check",
};

const META_ANOMALY_SLACK: FormConfig = {
  id: "meta-anomaly-slack",
  title: "Meta · Anomaly Slack Alert",
  subtitle:
    "24h anomaly signals → plain-English explanation + suggested action. Slack-pasteable summary.",
  eyebrow: "▸ ANOMALY · STRATOS",
  eyebrowMeta: "ALERT · 24H",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Anomaly alert saved",
  generateLabel: "Check anomalies",
  generatingLabel: "Scanning…",
  sections: [
    {
      title: "▸ ACCOUNT",
      meta: "required",
      fields: [
        META_ACCOUNT_FIELD,
        {
          kind: "text",
          key: "client_slug_label",
          label: "Slack channel slug",
          promptPlaceholder: "[NAME]",
          placeholder: "willis-windows",
          required: true,
        },
      ],
    },
  ],
  promptTemplate: `Run ads_insights_anomaly_signal on account [ACCOUNT_ID]. For anything flagged in the last 24h, write a one-line plain-English explanation + a one-line suggested action. Format the whole thing as a Slack-pasteable summary I can drop in #client-[NAME] right now.`,
  defaultTitle: "Anomaly Slack alert",
};

const META_AUCTION_EDGE: FormConfig = {
  id: "meta-auction-edge",
  title: "Meta · Auction Edge Report",
  subtitle:
    "Top-10 ads by spend. Quality / engagement / conversion ranking vs the auction. Identifies what's dragging losing ads.",
  eyebrow: "▸ AUCTION · STRATOS",
  eyebrowMeta: "RANKING",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Auction report saved",
  generateLabel: "Run benchmarks",
  generatingLabel: "Benchmarking…",
  sections: [
    {
      title: "▸ ACCOUNT",
      meta: "required",
      fields: [META_ACCOUNT_FIELD],
    },
  ],
  promptTemplate: `Pull ads_insights_auction_ranking_benchmarks for the top 10 ads by spend in account [ACCOUNT_ID]. For each, show our quality / engagement / conversion ranking vs the auction. Identify which ads are losing the auction and explain what's likely dragging us, quality, relevance, or bid strategy. Output as a ranked table.`,
  defaultTitle: "Auction edge report",
};

const META_PRE_PITCH_AUDIT: FormConfig = {
  id: "meta-pre-pitch-audit",
  title: "Meta · Pre-Pitch Account Audit",
  subtitle:
    "1-pager state-of-their-advertising for cold outreach. Uses account access if available, falls back to public Ad Library.",
  eyebrow: "▸ PRE-PITCH · STRATOS",
  eyebrowMeta: "PROSPECT AUDIT",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Pre-pitch audit saved",
  generateLabel: "Audit account",
  generatingLabel: "Auditing…",
  sections: [
    {
      title: "▸ PROSPECT",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "business_name",
          label: "Business name",
          promptPlaceholder: "[BUSINESS_NAME]",
          placeholder: "Sterling Auto Body.",
          required: true,
        },
        {
          kind: "text",
          key: "industry",
          label: "Industry",
          promptPlaceholder: "[INDUSTRY]",
          placeholder: "Collision repair · auto services.",
          required: true,
        },
      ],
    },
  ],
  promptTemplate: `I'm pitching [BUSINESS_NAME] tomorrow. Use the meta-ads MCP to query the ad opportunity score for their account if I have access, and benchmark them against ads_insights_industry_benchmark for [INDUSTRY]. If I don't have account access, query their public Meta Ad Library footprint instead. Output a "state of their advertising" 1-pager I can use to anchor the pitch, what's working, what's broken, where I'd start.`,
  defaultTitle: "Pre-pitch audit",
};

const META_BLOOMBERG: FormConfig = {
  id: "meta-bloomberg",
  title: "Meta · Bloomberg-Style Live Dashboard",
  subtitle:
    "Dense terminal-look HTML dashboard. Today's KPIs, 7-day revenue chart, top 5 ads, anomaly feed. Self-refreshing every 5min.",
  eyebrow: "▸ BLOOMBERG · STRATOS",
  eyebrowMeta: "LIVE DASHBOARD",
  category: "reports",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "reports",
  savedHeading: "Bloomberg dashboard saved",
  generateLabel: "Build dashboard",
  generatingLabel: "Building…",
  sections: [
    {
      title: "▸ ACCOUNT",
      meta: "required",
      fields: [META_ACCOUNT_FIELD],
    },
    {
      title: "▸ BRAND",
      meta: "agency colors",
      fields: [
        {
          kind: "text",
          key: "hex_primary",
          label: "Primary hex",
          promptPlaceholder: "[HEX_PRIMARY]",
          placeholder: "#b478ff",
          required: true,
        },
        {
          kind: "text",
          key: "hex_bg",
          label: "Background hex",
          promptPlaceholder: "[HEX_BG]",
          placeholder: "#0A0A0A",
          required: true,
          inline: true,
        },
      ],
    },
  ],
  promptTemplate: `Build me a self-refreshing HTML dashboard for ad account [ACCOUNT_ID]. Top row = today's spend / leads / ROAS as huge numbers with up/down arrows vs yesterday. Middle = bar chart of last 7 days revenue. Bottom-left = top 5 ads with thumbnails + CPA. Bottom-right = anomaly feed (latest first). Use my agency colors [HEX_PRIMARY] / [HEX_BG]. Make it look like a Bloomberg terminal, dense, monospace, dark. Refresh every 5 minutes via a meta-tag refresh. Single self-contained HTML file.`,
  defaultTitle: "Bloomberg dashboard",
};

// ── Vortex · Pitch Deck Generator ─────────────────────────────────
// Single-prompt 12-slide HTML deck for client proposals. Saves to
// media-buying/data/<client>/decks/<timestamp>-pitch.html and opens in
// the default browser. Lives in phase 1 alongside Contract / Welcome.
const PITCH_DECK: FormConfig = {
  id: "pitch-deck",
  title: "Pitch Deck Builder",
  subtitle: "12-slide HTML deck for client proposals. Snap-scroll, glassmorphism, no JS.",
  eyebrow: "▸ PITCH DECK · VORTEX",
  eyebrowMeta: "SALES · PRE-CONTRACT",
  phase: 1,
  phaseName: "Close the Deal",
  phaseMeta: "Sales",
  agentSlug: "vortex",
  agentName: "Vortex",
  kind: "html",
  savedHeading: "Pitch deck saved",
  generateLabel: "Generate deck",
  generatingLabel: "Generating…",
  prefillFromProfile: {
    clientName: "business",
    city: "geography",
  },
  sections: [
    {
      title: "▸ CLIENT",
      meta: "required",
      fields: [
        {
          kind: "text",
          key: "clientName",
          label: "Client name",
          promptPlaceholder: "[CLIENT NAME]",
          placeholder: "Willis Windows.",
          required: true,
        },
        {
          kind: "text",
          key: "agencyName",
          label: "Agency name",
          promptPlaceholder: "[AGENCY NAME]",
          placeholder: "Hauck Marketing",
          inline: true,
        },
        {
          kind: "text",
          key: "niche",
          label: "Niche",
          promptPlaceholder: "[NICHE]",
          placeholder: "Window cleaning, home services, dental, etc.",
          required: true,
        },
        {
          kind: "text",
          key: "city",
          label: "City",
          promptPlaceholder: "[CITY]",
          placeholder: "Austin, TX.",
          inline: true,
        },
        {
          kind: "textarea",
          key: "opportunity",
          label: "The opportunity (one stat + sentence)",
          promptPlaceholder: "[OPPORTUNITY]",
          placeholder:
            "73% of homeowners search online before booking a service. Most window cleaners have no ads.",
          minRows: 2,
        },
        {
          kind: "textarea",
          key: "observations",
          label: "3 honest observations about where they are now",
          promptPlaceholder: "[OBSERVATIONS]",
          placeholder:
            "No paid traffic. Website converts at <1%. No follow-up sequence for unbooked leads.",
          minRows: 3,
        },
        {
          kind: "textarea",
          key: "outcomes",
          label: "3 targets for 90 days",
          promptPlaceholder: "[OUTCOMES]",
          placeholder:
            "40 booked jobs/mo at $35 CPL. 30% lead-to-booking close rate. $25k MRR from ads.",
          minRows: 3,
        },
      ],
    },
    {
      title: "▸ PRICING",
      meta: "required",
      fields: [
        {
          kind: "textarea",
          key: "tiers",
          label: "Pricing tiers (mark recommended with *)",
          promptPlaceholder: "[TIERS]",
          placeholder:
            "Starter $1,500/mo. Growth $2,500/mo *. Scale $4,500/mo. Setup fee $500 one-time.",
          minRows: 3,
        },
        {
          kind: "text",
          key: "guarantee",
          label: "Guarantee line",
          promptPlaceholder: "[GUARANTEE]",
          placeholder: "10 qualified leads in the first 30 days or the next month is free.",
        },
      ],
    },
    {
      title: "▸ STYLE",
      meta: "optional",
      fields: [
        {
          kind: "text",
          key: "accent",
          label: "Accent color (hex)",
          promptPlaceholder: "[ACCENT]",
          placeholder: "#4d8eff",
          inline: true,
        },
        {
          kind: "select",
          key: "vibe",
          label: "Vibe",
          promptPlaceholder: "[VIBE]",
          options: ["Editorial", "Tech", "Luxe", "Gritty"],
          default: "Editorial",
        },
      ],
    },
  ],
  promptTemplate: PITCH_DECK_PROMPT,
  defaultTitle: "Pitch deck",
};

// Ordered to match the onboarding sequence (onboardingPlan.ts):
// 1. Close the Deal  → 2. Onboarding Call  → 3. Technical Setup
// 4. Creative Production  → 5. Campaign Build + QA  → 6. Launch + Monitor
// Within Technical Setup, COMPETITOR_RESEARCH lists before PIXEL_INSTALL
// because its output now feeds Audiences / Creative Brief / Ad Copy via the
// MEDIA_BUYING_SEQUENCE chain — it should be run first.
// Misc tools (Hooks, Creative Brief) live below the phase forms and surface
// in a separate "Misc" group in the sidebar + AgentFormsHub.
export const ALL_FORM_CONFIGS: FormConfig[] = [
  CONTRACT,
  PITCH_DECK,
  WELCOME_EMAIL,
  OFFER_CTA,
  EXPECTATIONS_EMAIL,
  COMPETITOR_RESEARCH,
  PIXEL_INSTALL,
  AUDIENCE_BUILDER,
  APPROVAL_EMAIL,
  CAMPAIGN_STRUCTURE,
  LIVE_MESSAGE,
  CREATIVE_BRIEF,
  AD_COPY,
  AUDIENCE_RESEARCH,
  WEEKLY_REPORT,
  MONTHLY_REPORT,
  META_DAILY_PULSE,
  META_FRIDAY_CLIENT_REPORT,
  META_ANDROMEDA_CLEANUP,
  META_CATALOG_HEALTH,
  META_ANOMALY_SLACK,
  META_AUCTION_EDGE,
  META_PRE_PITCH_AUDIT,
  META_BLOOMBERG,
  AD_HTML_DENTIST,
  AD_HTML_GYM,
  AD_HTML_RESTAURANT,
  AD_HTML_REAL_ESTATE,
  AD_HTML_HAIR_SALON,
  AD_HTML_PLUMBER,
];

// Silence unused-warning for the niche order export (used by other UI surfaces).
void AD_TEMPLATE_ORDER;

export type FormSurfaceId = (typeof ALL_FORM_CONFIGS)[number]["id"];

export type FormValues = Record<string, string | number | string[] | undefined>;

export type FormPhaseGroup = {
  phase: number;
  phaseName: string;
  phaseMeta: string;
  forms: FormConfig[];
};

export type FormMiscGroup = {
  forms: FormConfig[];
};

export type FormReportsGroup = {
  forms: FormConfig[];
};

export type FormGroups = {
  phaseGroups: FormPhaseGroup[];
  miscGroup: FormMiscGroup | null;
  reportsGroup: FormReportsGroup | null;
};

/** Group a list of form configs into phase buckets + a misc bucket + a reports bucket.
 *  Phase buckets sort ascending by phase; misc + reports rendered last by the UI. */
export function groupFormsByCategory(configs: FormConfig[]): FormGroups {
  const phaseGroups: FormPhaseGroup[] = [];
  const miscForms: FormConfig[] = [];
  const reportForms: FormConfig[] = [];
  for (const cfg of configs) {
    const category = cfg.category ?? "phase";
    if (category === "misc") {
      miscForms.push(cfg);
      continue;
    }
    if (category === "reports") {
      reportForms.push(cfg);
      continue;
    }
    if (cfg.phase === undefined) continue;
    let group = phaseGroups.find((g) => g.phase === cfg.phase);
    if (!group) {
      group = {
        phase: cfg.phase,
        phaseName: cfg.phaseName ?? "",
        phaseMeta: cfg.phaseMeta ?? "",
        forms: [],
      };
      phaseGroups.push(group);
    }
    group.forms.push(cfg);
  }
  phaseGroups.sort((a, b) => a.phase - b.phase);
  return {
    phaseGroups,
    miscGroup: miscForms.length > 0 ? { forms: miscForms } : null,
    reportsGroup: reportForms.length > 0 ? { forms: reportForms } : null,
  };
}

export function defaultValuesFor(config: FormConfig): FormValues {
  const out: FormValues = {};
  for (const section of config.sections) {
    for (const f of section.fields) {
      if (f.kind === "number") out[f.key] = f.default ?? "";
      else if (f.kind === "segmented" || f.kind === "select") out[f.key] = f.default ?? f.options[0];
      else if (f.kind === "multi") out[f.key] = f.defaults ?? [];
      else if (f.kind === "text" || f.kind === "textarea") out[f.key] = f.default ?? "";
    }
  }
  return out;
}

export function getFormConfig(id: string): FormConfig | undefined {
  return ALL_FORM_CONFIGS.find((c) => c.id === id);
}
