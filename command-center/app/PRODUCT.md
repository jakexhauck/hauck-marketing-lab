# Product

## Register

product

## Users

**Primary: client staff (the daily operators).** Sales and operations people at Hauck Marketing's local-business clients. They live in this app every day to work leads, reply to conversations, watch ad performance, and handle billing. Most arrived from GoHighLevel and other generic CRMs, so their baseline expectation is "cluttered and confusing." They use it on both desktop (in-office) and phone (in the field, via the PWA).

**Secondary: Hauck agency admins (the tower).** Jake and the Hauck team run every client from the admin console (`/admin/clients`, `/admin/tasks`). Their job is oversight and ops across all tenants at once: roster, client health, internal tasks. They want speed, control, and information at a glance.

The job to be done: give each client one calm, premium place to run their pipeline and see results, and give the agency one tower to run all clients.

## Product Purpose

The Hauck Command Center is two things in one responsive app:

1. The **client-facing operating system** for Hauck's clients: leads pipeline, conversations inbox, contacts, paid-ads performance, calendar, billing, notifications.
2. The **agency admin tower** for running the whole book of clients.

It exists to replace the cheap, cluttered agency-CRM experience (GoHighLevel and friends) with something that feels expensive, clear, and trustworthy. Success looks like: a new client opens it and immediately feels they upgraded; a client can find any number or status in seconds without hunting; the agency can run daily ops from the tower without friction. It is the product face of Hauck Marketing to paying clients, so its perceived quality is the agency's perceived quality.

## Brand Personality

Premium and confident. Three words: **premium, clear, confident.**

The voice is quiet authority: precise, considered, never loud. It pairs Linear-grade precision and restraint with Notion/Height warmth and breathing room, so it reads as high-end without feeling cold or sterile. Emotionally it should evoke trust, competence, and calm control. The user should feel the product is handled, reliable, and worth what the client pays.

## Anti-references

- **GoHighLevel and generic agency CRMs.** Cluttered, every-feature-crammed-in, cheap. This is what clients are leaving; the product must read as an obvious upgrade.
- **Bootstrap / template SaaS.** Default purple gradients, identical card grids, the generic "AI made this dashboard" look.
- **Sterile, boring enterprise.** Gray-on-gray, lifeless, capable but charmless. We want premium, not dull.
- **Above all, clutter.** The single hardest rule: nothing busy or noisy. Text must be effortless to read and re-find at a glance. If a screen feels packed, it has failed, even if it looks polished.

## Design Principles

1. **Clarity over density.** Every screen has one obvious focal point. Reading a value and finding it again later must be effortless. When in doubt, remove, group, or space out, never cram.
2. **Premium through restraint.** Depth, hierarchy, and polish come from precision (spacing, type, considered color), not from decoration, gradients, or effects.
3. **One system, three expressions.** The client desktop app is the canonical baseline and source of truth. The admin tower and the mobile experience are derived variations of that same system, never separate visual languages.
4. **A visible upgrade.** At a glance it must look and feel clearly better than the CRM the client left. The contrast with GoHighLevel is part of the value.
5. **Earn trust through craft.** This handles clients' leads and money. Considered states, honest feedback, and reliability signal that the product (and the agency) can be trusted.

## Accessibility & Inclusion

WCAG AA is the bar. Body text meets 4.5:1 contrast (large text 3:1), placeholder and helper text included. Every interactive element has a visible focus ring and full keyboard operability. Color is never the only carrier of meaning (pair with icon, label, or text). Honor `prefers-reduced-motion` with a calm fallback for every animation. Verify contrast independently in both light and dark themes rather than assuming one transfers to the other.
