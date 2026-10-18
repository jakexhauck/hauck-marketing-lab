# GHL Client Setup Checklist

Same list for every new client. The snapshot comes from the Test Account (`yVfX127fswQ03fydxBQg`).
Every workflow in the snapshot ships as a draft. Nothing sends until step 9.

## 1. Load
- [ ] Load the client snapshot into the new sub-account

## 2. Account (Settings > Business Profile)
- [ ] Timezone = the client's real timezone (Owensboro KY = Central, not Detroit)
- [ ] Business address = the client's (not Allen Park)
- [ ] Website = the client's real site

## 3. People and phone
- [ ] Add Jake and the owner as staff; the owner's user has their real cell number (auto-calls ring this number)
- [ ] Connect Facebook to GHL (pages + Instagram; needs Jake's login)
- [ ] A2P submitted
- [ ] Buy the local GHL number
- [ ] Buy the Appointment Outcome number
- [ ] Buy the Facebook Ad Speed to Lead number
- [ ] Turn off message compliance (all 3 boxes, type CONFIRM)
- [ ] Turn on call recording and transcription
- [ ] Route calls to the owner's phone
- [ ] Buy and apply the subdomain (conversion asset pages)

## 4. Custom values (Settings > Custom Values)
- [ ] Business Name
- [ ] Business Owner First Name
- [ ] Business Owner Full Name
- [ ] Business Phone Number
- [ ] GHL Phone Number
- [ ] Facebook Access Token
- [ ] Facebook Dataset ID (the CLIENT'S dataset, check the name in Events Manager)
- [ ] Open Lead (from the app)
- [ ] Recent Work, Owner Story, Unique Mechanism (conversion asset links)
- [ ] Conversion Asset Offer
- [ ] Custom fields set

## 5. Calendars
- [ ] Home Estimate, Conversion Asset Estimate, Job: hours = the owner's real hours
- [ ] Phone Appointment: hours = the owner's real hours (or leave unused if the client is form only)

## 6. Meta wiring
- [ ] LF Follow Ups trigger: client's Facebook Page + the live lead form
- [ ] Conversions API (Leads) trigger: same Page + same form
- [ ] Every new lead form the client runs gets added to BOTH triggers

## 7. Rewrite the client texts (every step named "REWRITE: ...")
- [ ] LF Follow Ups: first text, photos, Recent Work, Owner Story, another-quote text, hail mary
- [ ] LP Follow Ups: same set (only if the client has a funnel)
- [ ] Long Term Nurture: 4 texts
- [ ] Home Estimate Reminders: 2 Unique Mechanism texts
- [ ] Swap every photo for the client's own job photos
- [ ] Remove "REWRITE: " from each step name once it's done

## 8. Who gets what
- [ ] Every "Client" alert, reminder and "Track What Happened" text: owner
- [ ] Every "Agency" alert: Jake
- [ ] Assign user in App Call, New Lead Auto Call, Phone Appointment Auto Call: owner

## 9. Publish
- [ ] Publish all workflows (LP Follow Ups only if there is a funnel; Phone Appointment ones only if the client takes phone calls)
- [ ] Delete any pipeline that is not "Sales Pipeline" (GHL adds a "Marketing Pipeline" with example deals)

## 10. Test before ads go on
- [ ] Submit the real lead form with your own phone: owner gets the New Lead text and the auto-call, opportunity lands in Sales Pipeline > Lead, you get the agency text
- [ ] Meta Events Manager: a Lead event on the CLIENT'S dataset
- [ ] Book a test estimate: confirmation text, owner alert, Schedule event on the client's dataset
- [ ] Delete the test contact
- [ ] Launch call: send a test text, client saves both outcome numbers in their phone
