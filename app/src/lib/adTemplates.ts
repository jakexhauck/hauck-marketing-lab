// V3 HTML composite ad templates — six niches, verbatim from
// docs/build-plans/Agency Desktop App/High Priority/02-ad-creatives.md §V3.
//
// Each entry is the full Claude prompt body that produces a single
// self-contained HTML file at the niche's target dimensions. The form layer
// substitutes [CITY] / [NEIGHBORHOOD] / headline + offer overrides before
// shipping the prompt.
//
// Output handling: Claude returns the HTML in a fenced ```html block. The
// form caller writes the markdown body verbatim; the user copies the HTML
// block into a `.html` file and opens it. Screenshot-to-PNG is a follow-up
// (needs Playwright sidecar).

export type AdNiche =
  | "dentist"
  | "gym"
  | "restaurant"
  | "real-estate"
  | "hair-salon"
  | "plumber";

export interface AdTemplate {
  id: AdNiche;
  label: string;
  dimensions: string;
  promptTemplate: string;
}

export const AD_TEMPLATES: Record<AdNiche, AdTemplate> = {
  dentist: {
    id: "dentist",
    label: "Family Dentist",
    dimensions: "1080x1080",
    promptTemplate: `Create an HTML ad creative, 1080x1080, square social-feed format. Niche: family dentist in [CITY]. Format: before/after comparison. Headline: "[HEADLINE]". Style: warm and trustworthy. Mint #E8F5E9, cream #FFF8E1, modern serif headline (Playfair Display), Inter body. Include: 5-star badge, "247 happy families this year", soft photo placeholders labeled "ANXIOUS BEFORE" / "SMILING AFTER". CTA: "[CTA] →" Output: a single HTML file with inline CSS, ready to screenshot at 1080x1080. Wrap the full HTML in a single \`\`\`html fenced code block — no preamble, no explanation, just the fenced code block.`,
  },
  gym: {
    id: "gym",
    label: "Local Gym (Dads 35-50)",
    dimensions: "1080x1350",
    promptTemplate: `Create an HTML ad creative, 1080x1350, vertical Reels/Stories format. Niche: local gym in [CITY], target dads 35-50. Format: transformation + offer. Headline: "[HEADLINE]". Style: matte black #0A0A0A, neon green #00FF88, all-caps display (Bebas Neue), gritty industrial. Include: stats panel (-22 lbs / 16 weeks / 3x per week), pull-quote testimonial, "5 spots left, January cohort". CTA: "[CTA] →" Output: single HTML, inline CSS, ready to screenshot at 1080x1350. Wrap the full HTML in a single \`\`\`html fenced code block — no preamble, no explanation, just the fenced code block.`,
  },
  restaurant: {
    id: "restaurant",
    label: "Italian Restaurant",
    dimensions: "1080x1080",
    promptTemplate: `Create an HTML ad creative, 1080x1080. Niche: Italian family spot in [CITY]. Format: hand-written secret-menu special. Headline: "[HEADLINE]" Style: warm chalkboard, cream #F5E9D0, brown #3E2723, Caveat handwritten headline, Cormorant for menu items. Include: 3 dishes + prices, "Walk-in only, 6 to 9 PM", italic line "(don't tell the tourists)". CTA: "[CTA] →" Output: single HTML, inline CSS, screenshot-ready. Wrap the full HTML in a single \`\`\`html fenced code block — no preamble, no explanation, just the fenced code block.`,
  },
  "real-estate": {
    id: "real-estate",
    label: "Real Estate (Sellers)",
    dimensions: "1080x1350",
    promptTemplate: `Create an HTML ad creative, 1080x1350. Niche: realtor in [CITY], target home sellers. Format: sold-listing flex. Headline: "[HEADLINE]" Style: editorial luxe, navy #0F1B2D, champagne #C9A961, Cormorant Garamond + Manrope. Include: before/after price tags, "8 days on market" badge, agent photo placeholder, 3-bullet "what we did differently". CTA: "[CTA]" Output: single HTML, screenshot at 1080x1350. Wrap the full HTML in a single \`\`\`html fenced code block — no preamble, no explanation, just the fenced code block.`,
  },
  "hair-salon": {
    id: "hair-salon",
    label: "Hair Salon (Colorist)",
    dimensions: "1080x1920",
    promptTemplate: `Create an HTML ad creative, 1080x1920 Story format. Niche: hair colorist in [CITY], target women 25-45. Format: before/after one-frame. Headline: "[HEADLINE]" Style: editorial fashion mag, soft pink #F8E8E8, rose gold #B76E79, Didot or Bodoni headline, clean sans body. Include: two photo boxes labeled "9 AM" / "1 PM", price callout "$280 (worth $450)", booking urgency. CTA: "[CTA] →" Output: single HTML, screenshot at 1080x1920. Wrap the full HTML in a single \`\`\`html fenced code block — no preamble, no explanation, just the fenced code block.`,
  },
  plumber: {
    id: "plumber",
    label: "Local Plumber",
    dimensions: "1080x1080",
    promptTemplate: `Create an HTML ad creative, 1080x1080. Niche: local plumber in [CITY]. Format: trust-builder. Headline: "[HEADLINE]" Style: blue-collar honest, red #C8102E, white, heavy condensed sans (Oswald) headline, Inter body. Include: 3 stats (24/7 / $0 quote / 4.9★ on 312 reviews), phone number HUGE, "No surprises, no hidden fees" badge. CTA: "[CTA]" Output: single HTML, inline CSS. Wrap the full HTML in a single \`\`\`html fenced code block — no preamble, no explanation, just the fenced code block.`,
  },
};

export const AD_TEMPLATE_ORDER: AdNiche[] = [
  "dentist",
  "gym",
  "restaurant",
  "real-estate",
  "hair-salon",
  "plumber",
];

/** Default headline + CTA per niche, used when the user leaves the override
 *  fields blank. Numbers reference real verbatim copy from the source doc. */
export const AD_TEMPLATE_DEFAULTS: Record<AdNiche, { headline: string; cta: string }> = {
  dentist: {
    headline: "Your kid's first dental visit shouldn't end in tears.",
    cta: "Book your free consult",
  },
  gym: {
    headline: "How Mike dropped 22 lbs at 47, without giving up beer.",
    cta: "Claim your spot",
  },
  restaurant: {
    headline: "Wednesday's secret menu (locals only)",
    cta: "See you Wednesday",
  },
  "real-estate": {
    headline: "$47K over asking. In 8 days. In [NEIGHBORHOOD].",
    cta: "Want yours sold like this? DM me 'PLAYBOOK'",
  },
  "hair-salon": {
    headline: "Boring brunette → bombshell blonde in 4 hours.",
    cta: "DM 'GLOW' to book this week",
  },
  plumber: {
    headline: "We answer the phone. (Apparently that's rare now.)",
    cta: "Call now, we're 11 min away",
  },
};
