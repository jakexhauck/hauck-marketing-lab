// Configs for all GenericFormGenerator-driven forms.
// Each config defines: fields, target agent, prompt task, expected JSON shape.
// The shared GenericFormGenerator renders + runs these.

import type { GeneratorKind } from "./types";

export type FormFieldBase = {
  key: string;
  label: string;
  /** Optional override for how this field is labeled inside the assembled prompt. */
  promptLabel?: string;
  hint?: string;
  /** Render this field on the same row as the previous field (grid 1fr 1fr). */
  inline?: boolean;
  /** Block submit until this field is filled. Default false. */
  required?: boolean;
};

export type FormField =
  | (FormFieldBase & { kind: "text"; placeholder?: string })
  | (FormFieldBase & { kind: "textarea"; placeholder?: string; minRows?: number })
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
  /** Prompt task description. */
  taskDescription: string;
  /** JSON schema string inserted inside the ```json fence. Headline + summary are required. */
  outputSchema: string;
  /** Instructions appended after the JSON schema for the markdown body. */
  outputInstructions: string;
  /** Fallback title used to name the saved output if the model omits one. */
  defaultTitle: string;
};

// ── Vortex · Welcome Email ─────────────────────────────────────────
const WELCOME_EMAIL: FormConfig = {
  id: "welcome-email",
  title: "Welcome Email Builder",
  subtitle:
    "Drafts the welcome email after the contract is signed. Sets timeline, links the onboarding form, and the calendar.",
  eyebrow: "▸ WELCOME EMAIL · VORTEX",
  eyebrowMeta: "ONBOARDING · DAY 0",
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
  subtitle: "After the kickoff call — what happens in week 1 and what Jake needs from them.",
  eyebrow: "▸ EXPECTATIONS · VORTEX",
  eyebrowMeta: "ONBOARDING · DAY 1",
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
          placeholder: "Wednesday — quick Loom review.",
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
const COMPETITOR_RESEARCH: FormConfig = {
  id: "competitors",
  title: "Competitor Research Brief",
  subtitle: "Maps the 5-10 most relevant competitors with angles, offers, and ad-library breadcrumbs.",
  eyebrow: "▸ COMPETITOR INTEL · STRATOS",
  eyebrowMeta: "ONBOARDING · DAY 2",
  agentSlug: "stratos",
  agentName: "Stratos",
  kind: "scale_checks",
  savedHeading: "Competitor brief saved",
  generateLabel: "Run research",
  generatingLabel: "Researching…",
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
          placeholder: "Boise metro + 25mi.",
          required: true,
          inline: true,
        },
        {
          kind: "number",
          key: "count",
          label: "How many competitors",
          default: 5,
          min: 3,
          max: 12,
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
          label: "What to pull on each",
          options: [
            "Ad angles",
            "Offers / pricing",
            "Review themes",
            "Landing-page CTA",
            "Service stack",
            "Social proof claims",
          ],
          defaults: ["Ad angles", "Offers / pricing", "Review themes"],
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
    "Produce a competitor intel brief covering the requested number of competitors in this niche and region. For each: company, primary angle, offer/pricing visible publicly, review themes (what customers love + complain about), landing-page CTA, and one weakness Jake can exploit in positioning. End with a synthesis: where the white space is.",
  outputSchema:
    '{"headline":"…","summary":"…","competitors":[{"name":"…","angle":"…","offer":"…","weakness":"…"}],"white_space":"…"}',
  outputInstructions:
    "After the JSON, write the full brief — one section per competitor, then a closing white-space section with the 2-3 plays Jake can run that nobody else is running.",
  defaultTitle: "Competitor research brief",
};

// ── Stratos · Audience Builder ─────────────────────────────────────
const AUDIENCE_BUILDER: FormConfig = {
  id: "audiences",
  title: "Audience Builder",
  subtitle: "Returns 3-5 Meta audience configurations — broad, interest-stacked, lookalike — with reasoning.",
  eyebrow: "▸ AUDIENCES · STRATOS",
  eyebrowMeta: "ONBOARDING · DAYS 3-4",
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
  ],
  taskDescription:
    "Build 3-5 Meta ad-set audiences for this objective and customer. Always include one BROAD (let the algorithm decide), one INTEREST-STACKED, and one LOOKALIKE — plus any other variant that's smart for this niche. For each: geo, demo, interests, exclusions, expected reach band, and a one-paragraph reasoning. End with a recommendation on which to launch first.",
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
  subtitle: "Step-by-step install guide tailored to the website platform — copy-paste snippets included.",
  eyebrow: "▸ PIXEL INSTALL · NEXUS",
  eyebrowMeta: "ONBOARDING · DAY 2",
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

// ── Zenith · Optimizer Config ──────────────────────────────────────
const OPTIMIZER_CONFIG: FormConfig = {
  id: "optimizer",
  title: "Optimizer Config",
  subtitle: "Defines the kill/scale rules and alert thresholds Zenith uses to monitor this account.",
  eyebrow: "▸ OPTIMIZER · ZENITH",
  eyebrowMeta: "ONBOARDING · DAY 7",
  agentSlug: "zenith",
  agentName: "Zenith",
  kind: "reports",
  savedHeading: "Optimizer config saved",
  generateLabel: "Generate rules",
  generatingLabel: "Generating…",
  sections: [
    {
      title: "▸ TARGETS",
      meta: "required",
      fields: [
        {
          kind: "number",
          key: "target_roas",
          label: "Target ROAS (x)",
          default: 3,
          min: 0,
          step: 0.1,
        },
        {
          kind: "number",
          key: "target_cpa",
          label: "Target CPA ($)",
          default: 50,
          min: 0,
          step: 1,
          inline: true,
        },
        {
          kind: "number",
          key: "max_daily_spend",
          label: "Max daily spend ($)",
          default: 200,
          min: 10,
          step: 10,
        },
      ],
    },
    {
      title: "▸ KILL & SCALE RULES",
      meta: "thresholds Zenith will enforce",
      fields: [
        {
          kind: "number",
          key: "kill_threshold_days",
          label: "Kill after N days underperforming",
          default: 3,
          min: 1,
          max: 14,
        },
        {
          kind: "number",
          key: "scale_step_pct",
          label: "Scale step %",
          default: 20,
          min: 5,
          max: 50,
          inline: true,
        },
        {
          kind: "number",
          key: "frequency_cap",
          label: "Frequency cap",
          default: 3,
          min: 1,
          max: 10,
        },
        {
          kind: "multi",
          key: "alert_channels",
          label: "Alert channels",
          options: ["Email", "SMS", "In-app", "Slack"],
          defaults: ["Email", "In-app"],
        },
        {
          kind: "textarea",
          key: "client_specifics",
          label: "Client-specific rules",
          placeholder: "e.g. never pause on Friday-Sunday · always keep V2 live · etc.",
          minRows: 3,
        },
      ],
    },
  ],
  taskDescription:
    "Compile Zenith's monitoring config for this account: explicit kill/scale rules, alert thresholds, and the cadence Zenith will check. Each rule must be unambiguous (numeric or boolean), so it can run unattended. Flag any rule that conflicts with the others.",
  outputSchema:
    '{"headline":"…","summary":"…","kill_rules":[{"condition":"…","action":"…"}],"scale_rules":[{"condition":"…","action":"…"}],"alerts":[{"trigger":"…","channels":["…"]}],"check_cadence":"…"}',
  outputInstructions:
    "After the JSON, write the full ruleset as a clear list. End with a 'first 14 days' note: what Zenith will or won't do during the learning window.",
  defaultTitle: "Optimizer config",
};

export const ALL_FORM_CONFIGS: FormConfig[] = [
  WELCOME_EMAIL,
  OFFER_CTA,
  EXPECTATIONS_EMAIL,
  APPROVAL_EMAIL,
  LIVE_MESSAGE,
  CONTRACT,
  COMPETITOR_RESEARCH,
  AUDIENCE_BUILDER,
  CAMPAIGN_STRUCTURE,
  PIXEL_INSTALL,
  OPTIMIZER_CONFIG,
];

export type FormSurfaceId = (typeof ALL_FORM_CONFIGS)[number]["id"];

export type FormValues = Record<string, string | number | string[] | undefined>;

export function defaultValuesFor(config: FormConfig): FormValues {
  const out: FormValues = {};
  for (const section of config.sections) {
    for (const f of section.fields) {
      if (f.kind === "number") out[f.key] = f.default ?? "";
      else if (f.kind === "segmented" || f.kind === "select") out[f.key] = f.default ?? f.options[0];
      else if (f.kind === "multi") out[f.key] = f.defaults ?? [];
      else out[f.key] = "";
    }
  }
  return out;
}

export function getFormConfig(id: string): FormConfig | undefined {
  return ALL_FORM_CONFIGS.find((c) => c.id === id);
}
