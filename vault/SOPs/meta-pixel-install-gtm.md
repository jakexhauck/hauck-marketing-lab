# Install Meta Pixel via Google Tag Manager

**Category:** Onboarding
**Source:** Module 3 Lesson 5
**When to use:** Day 2 of onboarding for any client with a website. Skip if using Meta Lead Forms (no pixel needed).
**Estimated time:** 30 to 45 min

---

## Prerequisites

- [ ] Client has a website
- [ ] You have access to install code on their site (or a dev who will)
- [ ] Client's Business Manager and ad account are set up

## Checklist

- [ ] **Create GTM account and container:**
  - [ ] Go to tagmanager.google.com
  - [ ] Create one container per client website
  - [ ] Name the container after the business
- [ ] **Install GTM on the website (one-time):**
  - [ ] GTM provides two snippets, one in the head, one after the body opening tag
  - [ ] For Shopify, Wix, Squarespace, WordPress: client or dev installs via Custom Code or Header Scripts section
  - [ ] Verify install with GTM Preview mode
- [ ] **Create the Meta Pixel in Events Manager:**
  - [ ] Open Events Manager (facebook.com/events_manager)
  - [ ] Connect Data Sources, Web, Meta Pixel, Connect
  - [ ] Name the pixel after the client
  - [ ] Choose Install code manually
  - [ ] Copy the Pixel ID
- [ ] **Add the Pixel to GTM:**
  - [ ] GTM Dashboard, Tags, New, Custom HTML
  - [ ] Paste Meta Pixel base code
  - [ ] Trigger: All Pages
  - [ ] Save as "Meta Pixel - Base"
- [ ] **Add the Lead event tag:**
  - [ ] New tag, Custom HTML
  - [ ] Paste the fbq track Lead script
  - [ ] Trigger: Page View, Page URL contains /thank-you (or whatever the client's confirmation URL is)
  - [ ] Save as "Meta Pixel - Lead Event"
- [ ] **Publish the GTM container:**
  - [ ] Submit, Publish
- [ ] **Verify it works:**
  - [ ] Install Meta Pixel Helper Chrome extension
  - [ ] Visit client site, confirm Pixel Helper icon turns green
  - [ ] Events Manager, Data Sources, Test Events
  - [ ] Submit a test form on the site, confirm PageView and Lead events appear in real time

## Notes

- For most local business clients, you only need PageView and Lead events. Don't overcomplicate.
- If pixel won't fire: clear cache or try incognito, confirm code is in head not body, confirm pixel ID matches, disable ad blockers, re-paste fresh code.
- Meta also offers direct partner integrations for Shopify, WordPress (WooCommerce), and Squarespace if you only need Meta tracking and no other tools. 60-second install.
- GTM is the universal remote. Adding Google Ads or TikTok tracking later is just new tags in GTM, no developer call needed.

## Related SOPs

- onboarding-7day-pipeline
- pre-launch-qa-checklist
