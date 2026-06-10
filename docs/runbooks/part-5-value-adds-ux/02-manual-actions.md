# Part 5: Your Manual Actions

Do these only after Claude reports Part 5 implementation complete. Click paths are in the [Software Guide](../SOFTWARE-GUIDE.md).

## Manual actions checklist (do these, in this order)

### A. Ship it

- [ ] 1. Read Claude's Part 5 report (it is the longest one; the report will flag any decisions made on your behalf, e.g. timezone default)
- [ ] 2. Confirm the timezone Claude used matches where the test account's business hours live (default America/Chicago); if wrong, say so before deploying
- [ ] 3. Add a Cloudflare variable (Guide Recipe B): type **Plaintext**, name `TENANT_TIMEZONE`, value the IANA zone (e.g. `America/Chicago`), environment Production
- [ ] 4. Tell Claude: **"commit and push Part 5"** (Guide Recipe D)
- [ ] 5. Watch the deployment turn green (Guide Recipe C); it must be a deploy made after the variable was saved

### B. New GHL workflows for the wider notification coverage (TEST sub-account)

Build each with Guide Recipe E (same webhook URL with token, same Custom Data style as the Part 1 workflows):

- [ ] 6. `App Notify - Won or Lost`: trigger **Opportunity Status Changed**, Custom Data `type` = `OpportunityStatusUpdate`, plus `locationId` = `{{location.id}}`, `contactId` = `{{contact.id}}`, `opportunityId` = `{{opportunity.id}}`, and `status` = `{{opportunity.status}}`
- [ ] 7. `App Notify - Appointment Booked`: trigger **Customer Booked Appointment**, `type` = `AppointmentCreate`, plus `locationId`, `contactId`
- [ ] 8. `App Notify - Invoice Paid`: trigger the invoice-paid trigger (under Payments triggers), `type` = `InvoicePaid`, plus `locationId`, `contactId`
- [ ] 9. Publish all of them and confirm they show **Published**

### C. Verify the value-adds

- [ ] 10. **Attribution (5.1):** open a lead whose contact has UTM data (any FB test lead; or set `utm_source` on a test contact in GHL manually). Expected: an Attribution block on the lead detail showing Source/Campaign/Ad
- [ ] 11. **Tags (5.2):** in GHL, add two tags to a test contact. Expected: chips appear on the contact in the app (list + detail) within a poll cycle
- [ ] 12. **No fabricated numbers (5.4):** browse every screen logged in as the test account. Expected: NO dollar figures that you cannot trace to real GHL data or the tenant row. Specifically Dashboard/Today show no CPA/ROAS while spend is unset
- [ ] 13. **Branding (5.5):** log out and look at the Login screen footer. Expected: it shows the generic brand text from APP_BRAND, with no client or agency name hardcoded

### D. Verify the UX fixes

- [ ] 14. Mark a test lead Won. Expected: a visible confirmation toast, and you stay oriented (no silent jump)
- [ ] 15. Visit Billing, Calendar, Notifications with empty data. Expected: each empty state names the right thing, none say "NO LEADS"
- [ ] 16. Log out: the login button reads "Sign in", and the test banner has no em dash
- [ ] 17. **Timezone (5.10):** create a task due today late evening your time; expected it lists as today, not tomorrow. If you have an invoice due today, it must NOT show overdue
- [ ] 18. Scroll deep into Leads, open a lead, go back. Expected: list position restored; opening a new route starts at top
- [ ] 19. Pull down on Home. Expected: refresh spinner and fresh data
- [ ] 20. Open a conversation on the phone: keyboard up, composer stays visible above it; Enter sends, Shift+Enter makes a newline (test with hardware keyboard on desktop)
- [ ] 21. Leave the app open 5+ minutes. Expected: "x min ago" labels advance on their own
- [ ] 22. Win a lead, book a test appointment, mark a test invoice paid (GHL side). Expected: all three appear in the app's notification center with sensible labels

### E. Close out

- [ ] 23. Anything unexpected: paste exact behavior to Claude
- [ ] 24. Tick Part 5's two boxes in [../README.md](../README.md)
- [ ] 25. Decision point: the app is now feature-complete and fully generic on the test account. Next conversations: full regression pass, then the **client onboarding runbook** (Claude writes it when you say go; it covers stamping the app out for any client: tenant seed, env vars, GHL workflows, branding)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Attribution block missing | Contact has no UTM custom field values, or field-key cache stale (1h) | Set utm_source manually on the test contact; wait or redeploy to bust cache |
| Won/lost notification missing | Workflow from action 6 unpublished or `status` key misspelled | Re-check the workflow row by row |
| Appointment trigger not found | Trigger names vary by GHL plan ("Customer Booked Appointment" / "Appointment Status") | Pick the closest appointment-created trigger; tell Claude which, so the mapper can be confirmed against the real payload |
| Overdue shows on the due date | Timezone env not set on the deploy | Check `TENANT_TIMEZONE` in Cloudflare variables |
