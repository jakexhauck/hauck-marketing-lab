# GHL Client Setup Checklist

Same list for every new client. The snapshot comes from the Test Account (`yVfX127fswQ03fydxBQg`).
Every workflow in the snapshot ships as a draft. Nothing sends until Publish + test.

This is the GHL map on Agents > SOPs, one section per box in the map's order, each line word for word
from the box. `src/lib/ghlChecklistDoc.test.ts` fails if the two ever differ, so change the map
(`src/lib/agentSops.ts`, GHL) and this file together.

## 1. Sub-account
- [ ] Create the new sub-account
- [ ] Load the Facebook Ads Client Snapshot 10/10
- [ ] Business profile: the client's timezone, address and website (never Allen Park)
- [ ] Delete every pipeline that is not Sales Pipeline (GHL adds a Marketing Pipeline with example deals)
- [ ] Verify the email sending domain
- [ ] Upload the client's media into the Media Library

## 2. Staff added
- [ ] Add Jake as staff
- [ ] Add the owner as staff (email from the onboarding form) with their real cell number, the auto-calls ring it
- [ ] Owner connects their Google Calendar, two-way

## 3. Connect Facebook
- [ ] Connect the client's Facebook and Instagram pages
- [ ] Needs Jake's login, the agent cannot do this

## 4. Custom values
- [ ] Business Name, Business Owner First Name, Business Owner Full Name
- [ ] Business Phone Number, GHL Phone Number
- [ ] Facebook Access Token, Facebook Dataset ID (the client's own dataset, check its name in Events Manager)
- [ ] Open Lead (from the app)
- [ ] Custom fields set
- [ ] Buy and apply the subdomain for the client's funnel pages

## 5. A2P submitted
- [ ] Fill the A2P Wizard form from the onboarding form
- [ ] Business profile emails from the wizard site
- [ ] Trust Center > A2P Messaging > Start Registration
- [ ] Low volume, manual setup, Local on the wizard
- [ ] Tick every Business Website Compliance box
- [ ] Pass the AI check, then submit

## 6. Phone system
- [ ] Buy a local number on the client's area code
- [ ] Buy the Appointment Outcome number
- [ ] Buy the Facebook Ad Speed to Lead number
- [ ] Turn off message compliance (all 3 boxes, type CONFIRM)
- [ ] Turn on call recording and transcription
- [ ] Route calls to the owner's phone

## 7. Calendars
- [ ] Home Estimate and Job: hours set to the owner's real hours
- [ ] Owner as team member on Home Estimate and Job
- [ ] Phone Appointment: the owner's hours, or left unused if the client is form only

## 8. Workflows
- [ ] Rewrite every step named REWRITE: LF Follow Ups, LP Follow Ups (funnel only), Long Term Nurture, Home Estimate Reminders
- [ ] Swap every photo for the client's own job photos, then take REWRITE off each step name
- [ ] Every Client alert, reminder and Track What Happened text goes to the owner
- [ ] Every Agency alert goes to Jake
- [ ] Owner in App Call, New Lead Auto Call and Phone Appointment Auto Call

## 9. CAPI + Meta
- [ ] LF Follow Ups trigger: the client's Page + their live lead form
- [ ] Conversions API (Leads) trigger: the same Page + form
- [ ] Every new lead form goes into both triggers
- [ ] Conversions API (Schedules): fires on Home Estimate bookings
- [ ] Token and dataset come from the custom values, never typed into a step

## 10. Jake review
- [ ] Read every SMS against the custom values
- [ ] No text that assumes an address we never asked for

## 11. Publish + test
- [ ] Publish every workflow (LP Follow Ups only with a funnel, the Phone Appointment ones only if they take calls)
- [ ] Accounts page all green
- [ ] Submit the real lead form with your own phone: owner text + auto-call, lead in Sales Pipeline > Lead, agency text
- [ ] Events Manager: a Lead event on the client's dataset
- [ ] Book a test estimate: confirmation text, owner alert, Schedule event on the client's dataset
- [ ] Delete the test contact
- [ ] Launch call: send a test text, client saves both outcome numbers
