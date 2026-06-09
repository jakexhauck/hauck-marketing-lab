---
type: plan
title: "GHL Workflow Restructure — Copy Library"
status: draft
tags: [plan, feature]
plan_kind: feature
created: "2026-06-08T17:30:32.000Z"
source: "docs/build-plans/GHL Workflow Restructure/COPY-LIBRARY.md"
---

# GHL Workflow Restructure — Copy Library

Verbatim message copy extracted from the Original workflows and carried into the new Claude Code workflows via clone-and-trim. Merge fields (`{{contact.*}}`, `{{custom_values.*}}`) are preserved exactly, so they stay portable.

---

## 2 - Speed-to-Lead › "New Lead - First Response & Follow-Up"
Source: Original › 🚨 Sales › Follow Up's/Reminders › **Lead Form Follow Up's**

### KEPT (lead-facing messages)

**1. Thanks For Your Interest, Next Steps** (Email)
- From name: `{{custom_values.email_from_name}}`
- From email: `{{custom_values.email_from_email}}`
- Subject: `{{contact.first_name}}, what next?`
- Body:
```
Hi {{contact.first_name}}, Thanks for your interest in {{custom_values.company_name}}. We don't plan on keeping this deal going forever, but we've got your spot reserved!

Next, let's go ahead & schedule a free estimate where we can go over all the details on what you might like done!

The quickest way to schedule and claim your spot is by calling us at {{custom_values.company_phone_number}}

Be on the lookout for a text from one of our reps as well.

Talk to you soon

{{custom_values.user_full_name}}
{{custom_values.company_name}}
```

**2. SMS 1** (SMS)
```
{{contact.first_name}}, it's {{custom_values.user_first_name}} over at {{custom_values.company_name}}. 🙂 Thanks for signing up for a free estimate, we've got your spot reserved while we still have availability! Can you tell me a little bit more about what you'd like done? You can also give me a quick call if that's easier.
```

**3. Email 2** (Email)
- Subject: `{{contact.first_name}}, have you started yet?`
- Body:
```
Hi {{contact.first_name}},

It's {{custom_values.user_first_name}} with {{custom_values.company_name}} again. I want to make sure I get you a quote - How can I help?

The quickest way to schedule and claim your spot is by calling us at {{custom_values.company_phone_number}}

Talk to you soon
{{custom_values.user_full_name}}
{{custom_values.company_name}}
```

**4. SMS 2** (SMS)
```
{{contact.first_name}}, didn't get a chance to hear from you yesterday about the free estimate we reserved for you. Did someone from my team reach out? Please call me when it's convenient for you. Just want to make sure you're taken care of 🙂
```

**5. Final SMS** (SMS)
```
{{contact.first_name}}, is everything okay? You reached out to me & wanted more info about our free estimate, but I haven't heard anything from you. I get it, things come up... Let me know if I should take you off my list and give away your reserved spot. 🙂 Call me when you have a quick second, would love to chat.

- {{custom_values.user_first_name}}
```

### KEPT (internal reply alerts)

**Lead Responded Email Notification** (Email)
- To: `{{custom_values.to_custom_email}}`
- Subject: `New Lead Response - {{contact.first_name}}`
- Body:
```
New customer response from {{contact.name}}:
"{{message.body}}"
The SMS text came from phone number: {{contact.phone}}
```

**Lead Responded SMS Notification** (SMS)
- To: `{{custom_values.to_custom_number}}`
- Body:
```
New customer response from {{contact.name}}:"{{message.body}}"
The SMS text came from phone number: {{contact.phone}}
```

### TRIMMED OUT (moved to the Intake layer, not deleted from Original)

**Lead In Email Notification** (Email)
- To: `{{custom_values.to_custom_email}}`
- Subject: `New Ads Lead - {{contact.first_name}}`
- Body:
```
Email: {{contact.email}}
Name: {{contact.name}}
Phone Number: {{contact.phone}}

- Ads Lead
```

**Lead In SMS Notification** (SMS)
- To: `{{custom_values.to_custom_number}}`
- Body:
```
Email: {{contact.email}}
Name: {{contact.name}}
Phone Number: {{contact.phone}}

- FB Ads Lead
```

**Add Tag "FB Lead"** — tagging action (belongs in the channel intake).

### Trigger change
- Was: `Facebook Lead Form Submitted (any form)`
- Becomes: `Contact Tag added — new-lead` (so every channel intake feeds this one shared follow-up)

---

## (more workflows appended here as they are built)
