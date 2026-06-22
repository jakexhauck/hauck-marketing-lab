# Web Designer Agent

Builds complete, modern, responsive local business landing pages from scratch. Also revamps existing ugly sites. Every output looks like a $5,000 website.

## Install

```bash
cp -r . ~/.claude/skills/web-designer/
```

## Usage

```
/build-site business="Miami Smiles Dental" niche="dental" city="miami, FL" phone="(305) 555-0100"
/revamp-site url="https://theirdomain.com" business="Name" niche="dental" city="miami"
/section type="faq" business="Miami Smiles Dental"
/mobile-check file="miamiSmilesDental-website.html"
```

## What it builds

- Complete single-page HTML site with embedded CSS
- Hero, services, trust, testimonials, about, contact, footer
- Mobile responsive (tested at 375px)
- Niche-appropriate color palette
- Google Fonts
- Real copy — no Lorem ipsum

## Niche colors

Dental=blue | Gym=orange | Med Spa=pink | Legal=gold | Real Estate=green | Home Services=steel blue | Restaurant=amber

## Output

`[businessname]-website.html` or `[businessname]-revamp.html`
