---
name: web-designer
description: Build complete, modern, responsive local business landing pages from scratch or by revamping existing ugly sites. Produces client-ready HTML/CSS in under 2 minutes. Use when building websites for local business clients or creating revamp mockups for outreach.
---

# Web Designer Skill

## Slash Command Usage

```
/build-site business="Miami Smiles Dental" niche="dental" city="miami, FL" phone="(305) 555-0100"
/revamp-site url="https://theirdomain.com" business="Name" niche="niche" city="city"
/section type="testimonials" business="Miami Smiles Dental"
/mobile-check file="miamiSmilesDental-website.html"
```

## Build From Scratch Workflow

### Step 1: Gather info
Use what's provided. If a website URL is given, scrape it for:
- Real business name
- Actual services offered
- Real phone number and address
- Operating hours
- Any existing testimonials or reviews

If no URL, use the provided info and make reasonable assumptions for the niche.

### Step 2: Write the copy
Before writing any HTML, draft the copy for each section:
- Hero headline: outcome-focused ("More Patients. More Revenue. Guaranteed.")
- Service descriptions: benefits-first, not features-first
- Testimonials: realistic names, specific outcomes, 4-5 stars
- About copy: first-person, local, warm

### Step 3: Build the HTML
Single HTML file with embedded CSS. Requirements:
- Google Fonts import (Inter or Poppins)
- Mobile responsive (flexbox + CSS grid)
- Smooth scroll behavior
- Hover states on buttons and cards
- Subtle fade-in animations (CSS only, no JS required for core layout)
- Niche-appropriate accent color (see CLAUDE.md palettes)

### Step 4: Quality check
Before saving, verify:
- All sections present (hero, services, trust, testimonials, about, contact, footer)
- No Lorem ipsum anywhere
- Mobile layout doesn't break at 375px width
- CTA button color contrasts properly
- Form fields are labeled

### Step 5: Save
Save as `[businessname]-website.html` (no spaces, lowercase).

## Revamp Workflow

Same as above but:
1. First scrape the existing site for ALL real info
2. Never reuse their old design
3. Build something completely modern using their real info
4. Save as `[businessname]-revamp.html`

## Adding Sections

```
/section type="faq" business="Miami Smiles Dental"
/section type="pricing" business="Miami Smiles Dental" tiers="3"
/section type="before-after" business="FitLife Gym"
/section type="booking" business="City Chiropractic" tool="calendly"
```

Supported section types: faq, pricing, before-after, booking, gallery, team, awards, blog-preview, video-embed
