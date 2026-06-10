# Software Guide: Exact Click Paths

Every manual checklist in these runbooks references the recipes below instead of re-explaining the same dashboards. Each recipe is the complete click path with zero assumed knowledge. UI labels verified against official documentation, June 2026. If a screen ever looks different from a recipe, the software shipped an update: tell Claude, who will re-verify and update this file.

The four tools you touch:

| Tool | What it is for here | Where |
|---|---|---|
| Claude Code | Runs commands for you, makes all code changes, deploys on request | this terminal/app |
| Supabase | The app's database (sessions metadata, notifications, team, rate limiting) | supabase.com/dashboard |
| Cloudflare Pages | Hosts the app and its API; holds the secrets | dash.cloudflare.com |
| GoHighLevel (GHL) | The CRM; the TEST sub-account only, for now | app.gohighlevel.com (or your white-label URL) |

---

## Recipe A: Run a SQL file or snippet in Supabase

1. Browser: go to `https://supabase.com/dashboard`. Sign in if prompted.
2. Click the project (if more than one is listed, the client-dashboard one).
3. Left sidebar is a column of icons; hover to see labels. Click **SQL Editor** (terminal-prompt icon).
4. Click **+ New query** (top-left area; on newer versions it is a `+` that opens a new tab inside the editor; tabs are normal, use either).
5. Get the SQL onto your clipboard:
   - For a **file from the repo**: in Claude Code type `! cat client-dashboard/supabase/migrations/FILENAME.sql | pbcopy` and press enter. This copies the file perfectly. NEVER copy SQL out of a chat or terminal window; line-wrapping has corrupted a paste before and produced a confusing `syntax error` message.
   - For a **short snippet printed in a runbook**: those are safe to copy directly from the MD file.
6. Click into the big empty text area, press **Cmd+V**.
7. Click the green **Run** button (bottom-right of the editor) or press **Cmd+Enter**.
8. Read the result panel at the bottom:
   - `Success. No rows returned` = normal for migrations.
   - A small table of rows = normal for select queries.
   - Anything starting with `ERROR:` = stop, copy the entire error text, paste it to Claude.

## Recipe B: Add a variable or secret in Cloudflare Pages

1. Browser: `https://dash.cloudflare.com`. Sign in. Pick your account if a chooser appears.
2. Left sidebar: **Workers & Pages** (sits under a "Compute" heading in newer layouts).
3. In the project list click **hauck-dashboard**.
4. Click the **Settings** tab along the top of the project page.
5. Scroll to **Variables and Secrets**. Click **Add** (older UI: "Add variable").
6. Fill the form:
   - **Type**: choose **Secret** for anything sensitive (passwords, tokens, the runbook will say which). Choose **Plaintext/Text** only when the runbook says so (e.g. a timezone). Secrets hide their value after saving; that is the point.
   - **Variable name**: type EXACTLY what the runbook gives, all caps and underscores matter.
   - **Value**: paste the value. No quotes, no trailing spaces.
   - **Environment**: **Production** (also add to **Preview** when the runbook suggests it).
7. Click **Save**.
8. IMPORTANT: variables only take effect on the NEXT deployment. After adding or changing any, do Recipe C.

## Recipe C: Redeploy the app on Cloudflare (and watch it finish)

Use this after changing variables, or when a runbook says "watch the deployment turn green".

1. In the **hauck-dashboard** project (Recipe B steps 1 to 3), click the **Deployments** tab.
2. The top row is the newest deployment. To redeploy the same code (e.g. after a variable change): click the **three-dot menu (...)** at the right end of that row, click **Retry deployment**, confirm.
3. Wait 1 to 2 minutes. The status chip moves from building to **Success** (green). If it goes red, click the row, copy the last ~20 lines of the build log, paste to Claude.
4. New code pushed by Claude (Recipe D) deploys automatically; you only watch for the green status here.

## Recipe D: Ship code Claude has written

1. In Claude Code, type: **commit and push Part N** (whatever part you are on).
2. Claude commits, pushes to GitHub, and tells you when done. The push automatically starts a Cloudflare build.
3. Do Recipe C steps 1 and 3 to watch it go green.
4. On your phone afterward: fully close the installed app (swipe away) and reopen it so it picks up the new version. Until Part 4 ships, you may need to close/reopen twice.

## Recipe E: Build a GHL notify-webhook workflow

Used whenever a runbook says "build workflow X with trigger Y and type Z". Everything except the trigger and the Custom Data values is identical every time.

0. Confirm the sub-account: top-left account switcher must show the **TEST** sub-account. Do not build in the agency view or any other sub-account.
1. Left sidebar: **Automation**.
2. Top right: **Create Workflow** > **Start from Scratch** > **Create new workflow**.
3. Click the **Add New Trigger** placeholder box:
   - In the search field type the trigger name the runbook gives (e.g. `Opportunity Created`). Click it.
   - Leave **Filters** empty unless the runbook says otherwise.
   - Click **Save Trigger**.
4. Click the **+** icon under the trigger to add an action:
   - Search `webhook`. Click **Custom Webhook** (premium action; on some plans simply "Webhook").
   - **Method**: select **POST**.
   - **URL**: paste the webhook URL from the runbook (it embeds the secret token; one line, no spaces).
   - Ignore Headers, Query Parameters, and Authorization sections; leave them empty.
5. Scroll to the **Custom Data** section. For each key/value row the runbook lists: click **+ Add item**, type the **Key** exactly (case matters: `type`, `locationId`, `contactId`, `opportunityId`, `status`), then the **Value**. Values in double curly braces like `{{location.id}}` can be typed literally or chosen via the tag icon inside the value field; both work.
6. Click **Save Action**.
7. Top right: click **Save**, then flip the **Draft / Publish** toggle to **Publish**.
8. Click the workflow name (pencil icon) and rename it to the name the runbook gives.
9. To confirm later: Automation list shows the workflow with a **Published** badge.

Optional sanity check for any webhook workflow: open the workflow, use **Test Workflow** (or enroll a test contact), then check **Execution Logs** (tab inside the workflow) to see the webhook step status code. `200` = the app accepted it. `401` = the token in the URL is wrong.

## Recipe F: Find a value you need

- **Your WEBHOOK_SECRET / SESSION_SECRET**: shown only at creation time (Notes). After that: Cloudflare keeps them hidden; if lost, generate new ones and redo the steps that used them.
- **The test location id**: Cloudflare > hauck-dashboard > Settings > Variables and Secrets > `TEST_GHL_LOCATION_ID` (plaintext, visible). As of June 2026 it is `r0WfsA12qpBv7M185V3v`.
- **Your GHL user id**: ask Claude ("what is my GHL user id in the test account"); Claude reads it via the GHL CLI.
- **Anything else**: ask Claude before guessing.
