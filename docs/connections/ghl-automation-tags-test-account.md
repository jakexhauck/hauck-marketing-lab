# Automation Tags — Jonas Rorwick Automations

**Account:** TEST ACCOUNT (Allen Park, MI) · location `r0WfsA12qpBv7M185V3v`
**Folder:** Jonas Rorwick Automations · `d9e74c3b-7da8-49b1-9bf0-f2cd033de58f`
**Pulled:** 2026-07-19 via GHL internal API (Firebase token), workflow step definitions read from storage
**Status:** all 11 workflows are in Draft

---

## The 11 automations

| # | Workflow | Tag actions |
|---|----------|-------------|
| 1 | 0) Lead Form Opt-In | adds `hot lead`, `lead form` (+1 empty) |
| 2 | 1) Survey Completed No Appt Booked | adds `funnel survey completed`, removes `lead form` (+1 empty) |
| 3 | 2) Phone Appointment Booked | none (1 empty action) |
| 4 | 3) Appointment Confirmed | adds 2, removes 4 |
| 5 | 4) Canceled Appointments | none |
| 6 | 5) Post Dial Tags | **none** (see Problems) |
| 7 | 6) No Answer Tags (Lead Form) | removes 3 |
| 8 | 7) No Answer Tags (Funnel) | removes 3 |
| 9 | 8) Home Estimate Reminders | adds `home estimate booked` |
| 10 | 9) Job Reminders | adds `job booked` |
| 11 | Removing Opportunities - redo at the end | none |

---

## All 14 tags

### Added somewhere

| Tag | Added by |
|-----|----------|
| `hot lead` | 0) Lead Form Opt-In |
| `lead form` | 0) Lead Form Opt-In |
| `funnel survey completed` | 1) Survey Completed No Appt Booked |
| `phone appointment booked` | 3) Appointment Confirmed |
| `phone appointment confirmed` | 3) Appointment Confirmed |
| `home estimate booked` | 8) Home Estimate Reminders |
| `job booked` | 9) Job Reminders |

### Only ever removed, never added anywhere in this folder

| Tag | Removed by |
|-----|------------|
| `no answer day 1` | 6) No Answer Tags (Lead Form), 7) No Answer Tags (Funnel) |
| `no answer day 2` | 6) No Answer Tags (Lead Form), 7) No Answer Tags (Funnel) |
| `no answer day 3` | 6) No Answer Tags (Lead Form), 7) No Answer Tags (Funnel) |
| `canceled appointment follow-up` | 3) Appointment Confirmed |
| `canceled appointment rescheduling` | 3) Appointment Confirmed |
| `canceled appointment uninterested` | 3) Appointment Confirmed |
| `phone appointment unqualified` | 3) Appointment Confirmed |

`lead form` is both: added by 0), removed by 1).

---

## Problems found

### 1. `5) Post Dial Tags` applies no tags at all

Despite the name, it is branch-only (branches "Follow Up" and "Services Uninterested") with zero tag actions. This is almost certainly the missing piece behind the seven remove-only tags above, in particular the three `canceled appointment *` tags and `phone appointment unqualified`.

### 2. Three tag actions are configured but empty

They run and do nothing (`tags: []`):

- 0) Lead Form Opt-In
- 1) Survey Completed No Appt Booked
- 2) Phone Appointment Booked

### 3. Two workflows have no tag actions at all

- 4) Canceled Appointments
- Removing Opportunities - redo at the end

---

## Method and caveats

- Folder membership resolved by `parentId` on each workflow record. The GHL API does **not** expose folder names, only IDs, so the folder-name-to-ID mapping was confirmed by opening the folder in the GHL UI (`?folder=d9e74c3b-...`).
- Tag values were read from each workflow's step definition JSON in Firebase storage.
- Trigger definitions were also scanned. Across the 37 workflows in this account whose trigger files downloaded, **zero** carried any tag reference, so tags in this data model live entirely in steps.
- `hasTags` (a boolean flag) and `customTags` (holds the merge field `{{contact.attributionSource.utmMedium}}`) were checked and excluded as false positives.
