# Step 3: GHL webhook workflows (TEST sub-account only)

Goal: make GoHighLevel tell the app when something happens. Three tiny workflows, each with one trigger and one webhook action. These feed the notification bell, the activity feed, and push notifications.

Time: about 15 minutes. Click paths: [Software Guide](../SOFTWARE-GUIDE.md) Recipe E covers the whole workflow build, including how to sanity-check a workflow with Execution Logs. Trigger names below verified against the official GHL trigger list, June 2026.

## Manual actions checklist (do these, in this order)

- [ ] 1. Open GHL and switch to the **TEST sub-account** (account switcher, top-left)
- [ ] 2. In Notes, assemble the webhook URL: `https://dash.hauckmarketing.com/api/webhook?token=` followed immediately by the WEBHOOK_SECRET value (no spaces, no quotes)
- [ ] 3. Left sidebar: **Automation**, then **Create Workflow** > **Start from Scratch**
- [ ] 4. Add trigger **Opportunity Created** (no filters), **Save Trigger**
- [ ] 5. Click **+**, add a **Webhook** action: method **POST**, URL = the assembled URL
- [ ] 6. In **Custom Data**, add 4 rows: `type` = `OpportunityCreate`, `locationId` = `{{location.id}}`, `contactId` = `{{contact.id}}`, `opportunityId` = `{{opportunity.id}}`
- [ ] 7. **Save Action**, then **Save** (top right), then flip **Draft** to **Publish**
- [ ] 8. Rename the workflow to `App Notify - New Lead`
- [ ] 9. Repeat actions 3 to 8 for workflow 2: trigger **Pipeline Stage Changed**, `type` = `OpportunityStageUpdate`, same 4 Custom Data rows, name `App Notify - Stage Changed`
- [ ] 10. Repeat actions 3 to 8 for workflow 3: trigger **Customer Replied**, only 3 Custom Data rows (`type` = `InboundMessage`, `locationId`, `contactId`), name `App Notify - Customer Replied`
- [ ] 11. Back on the Automation list, confirm all three workflows show **Published**
- [ ] 12. Delete the two secret values from Notes (they now live in Cloudflare and inside these workflow URLs)
- [ ] 13. Tick the Step 3 box in [00-README.md](00-README.md)

Details for every action are below; the `type` values are case-sensitive.

## Before you start

- **Be in the TEST sub-account.** Check the account switcher in the top-left of GHL before doing anything. Events are routed by location, so building these in the wrong sub-account means they get dropped (safe, but useless).
- Have the **WEBHOOK_SECRET** value from Step 2 at hand.
- Your webhook URL for all three workflows is (one line, no spaces):

```
https://dash.hauckmarketing.com/api/webhook?token=PASTE_WEBHOOK_SECRET_HERE
```

## The three workflows

| # | Workflow name | Trigger | Custom Data `type` value |
|---|---|---|---|
| 1 | App Notify - New Lead | Opportunity Created | `OpportunityCreate` |
| 2 | App Notify - Stage Changed | Pipeline Stage Changed | `OpportunityStageUpdate` |
| 3 | App Notify - Customer Replied | Customer Replied | `InboundMessage` |

The `type` values are exact and case-sensitive. The app ignores anything it does not recognize.

## 3.1 Build workflow 1 end to end

1. GHL left sidebar: **Automation**.
2. Top right: **Create Workflow** > **Start from Scratch** > **Create new workflow**.
3. Click the **Add New Trigger** box at the top:
   - Search and select **Opportunity Created**.
   - Leave filters empty so it fires for every pipeline.
   - Click **Save Trigger**.
4. Click the **+** under the trigger to add an action:
   - Search **Webhook** (sometimes listed as "Custom Webhook"). Select it.
   - **Method**: `POST`
   - **URL**: the full URL from above, with the real secret in it.
5. Inside the same webhook action, find **Custom Data** and click **Add item** once per row below. Keys are typed by hand, exactly as shown (capitalization matters). Values in curly braces can be typed or picked from the merge-tag icon in the value field:

   | Key | Value |
   |---|---|
   | `type` | `OpportunityCreate` |
   | `locationId` | `{{location.id}}` |
   | `contactId` | `{{contact.id}}` |
   | `opportunityId` | `{{opportunity.id}}` |

6. **Save Action**.
7. Top right: **Save**, then flip the toggle from **Draft** to **Publish**.
8. Rename the workflow (pencil icon by the title) to `App Notify - New Lead`.

## 3.2 Build workflows 2 and 3

Repeat 3.1 with these differences only:

**Workflow 2: App Notify - Stage Changed**
- Trigger: **Pipeline Stage Changed** (no filters)
- Custom Data `type`: `OpportunityStageUpdate`
- Keep all four Custom Data rows.

**Workflow 3: App Notify - Customer Replied**
- Trigger: **Customer Replied** (no filters; fires for SMS, FB, email, etc.)
- Custom Data `type`: `InboundMessage`
- Use only three rows: `type`, `locationId`, `contactId` (a reply is not always tied to an opportunity, so skip `opportunityId`).

Publish both.

## 3.3 Why locationId is mandatory

The app's webhook handler routes each event to a tenant by matching `locationId` against the configured locations, and silently ignores events without a routable one. If a workflow omits `{{location.id}}` it will fire and look successful from GHL's side while the app drops everything. If notifications ever seem dead, this is the first thing to check.

## 3.4 Note on the other draft workflows

As of 2026-06-10, all 27 pre-existing workflows in the test sub-account are **drafts** and do not run (follow-ups, reminders, review campaigns, missed-call text back, all of it). That is independent of this runbook, but nothing in the account automates until each is published. Publish them deliberately, one by one, when ready to test them.

When all three notify workflows show **Published**, check the Step 3 box in [00-README.md](00-README.md) and continue to [04-verification.md](04-verification.md).
