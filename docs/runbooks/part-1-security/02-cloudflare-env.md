# Step 2: Cloudflare secrets and redeploy

Goal: give the deployed app its two new secrets. `SESSION_SECRET` signs login cookies (replacing an insecure fallback). `WEBHOOK_SECRET` is the token GHL must present to the webhook endpoint. Until this step is done, the webhook endpoint returns 503 for everything, on purpose.

Time: about 5 minutes plus a 1 to 2 minute build. Click paths: [Software Guide](../SOFTWARE-GUIDE.md) Recipes B and C. UI labels verified against Cloudflare docs, June 2026: the screen is **Settings > Variables and Secrets > Add**.

## Manual actions checklist (do these, in this order)

- [ ] 1. In Claude Code, type `! openssl rand -hex 32` and press enter; copy the output into Notes labeled **SESSION_SECRET**
- [ ] 2. Run `! openssl rand -hex 32` again; copy the output into Notes labeled **WEBHOOK_SECRET**
- [ ] 3. Open `https://dash.cloudflare.com` in the browser and sign in
- [ ] 4. Left sidebar: **Workers & Pages**, then click the **hauck-dashboard** project
- [ ] 5. Click the **Settings** tab, find **Variables and Secrets**
- [ ] 6. Click **Add**: type **Secret**, name `SESSION_SECRET`, paste the first value, environment **Production**, save
- [ ] 7. Click **Add**: type **Secret**, name `WEBHOOK_SECRET`, paste the second value, environment **Production**, save
- [ ] 8. Optional: add both again under the **Preview** environment
- [ ] 9. Confirm `TEST_APP_PASSWORD`, `TEST_GHL_LOCATION_ID`, and `TEST_GHL_TOKEN` all exist in the same list (look only, change nothing)
- [ ] 10. Click the **Deployments** tab, three-dot menu on the newest Production deployment, **Retry deployment**, confirm
- [ ] 11. Wait for the deployment to turn green (1 to 2 minutes)
- [ ] 12. Open the app on your phone/browser, get bounced to login once, sign back in with the test password
- [ ] 13. Tick the Step 2 box in [00-README.md](00-README.md)

Details and troubleshooting for every action are below. Keep the two Notes values until Step 3 is done, then delete them.

## 2.1 Generate the secrets

In the Claude Code session, type each of these at the prompt (the `!` prefix runs it locally and shows the output in the chat):

```
! openssl rand -hex 32
```

Run it **twice**. Each run prints one line of 64 hex characters.

- First output: this is your **SESSION_SECRET**
- Second output: this is your **WEBHOOK_SECRET**

Park them temporarily in Notes (delete after Step 3; the WEBHOOK_SECRET also lives on inside the GHL webhook URLs, and both live in Cloudflare).

## 2.2 Add them to the Pages project

1. Browser: `https://dash.cloudflare.com`, sign in, pick your account if asked.
2. Left sidebar: **Workers & Pages** (under "Compute" in newer layouts).
3. In the project list, click **hauck-dashboard** (type: Pages).
4. Click the **Settings** tab along the top.
5. Find **Variables and Secrets** (older UI: "Environment variables"). Click **Add** / **Add variable**.
6. First entry:
   - Type: **Secret** (or tick **Encrypt**). This hides the value after saving.
   - Name: `SESSION_SECRET` (exact: all caps, one underscore)
   - Value: paste the first random string
   - Environment: **Production**
   - Save.
7. Second entry, same way:
   - Name: `WEBHOOK_SECRET`
   - Value: the second random string
   - Environment: **Production**
   - Save.
8. Optional but recommended: add both again under the **Preview** environment so preview deploys behave identically.

## 2.3 Confirm the existing test-account variables

While in Variables and Secrets, confirm these three already exist (do not change their values):

- `TEST_APP_PASSWORD`
- `TEST_GHL_LOCATION_ID`
- `TEST_GHL_TOKEN`

If any of the three is missing, stop and tell Claude; test mode cannot work without them.

## 2.4 Redeploy

Environment variables only apply to deployments created after they are saved.

1. Click the **Deployments** tab.
2. On the newest Production deployment, click the **three-dot menu (...)** at the right end of its row.
3. Click **Retry deployment**, confirm.
4. Wait until the deployment shows success (green), usually 1 to 2 minutes.

## 2.5 Expected side effect: one forced logout

The new SESSION_SECRET changes the cookie signing key, so every device gets logged out exactly once. Open the app, sign back in with the test password, done. If login itself fails afterward, see troubleshooting.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Login returns "too many attempts" | You tripped the new rate limit (10 failed tries per 15 minutes per IP) | Wait 15 minutes, or delete rows: `delete from public.login_attempts;` in the Supabase SQL editor |
| Login says password incorrect but it is correct | Wrong mode (test password on the live toggle or vice versa) | Check which mode the login screen is set to |
| Everything 401s after deploy | Old cookie signed with the old key | Log out and back in once |
| Webhook tests still 503 after this step | The redeploy predates saving the secrets | Redeploy again |

When sign-in works again, check the Step 2 box in [00-README.md](00-README.md) and continue to [03-ghl-webhooks.md](03-ghl-webhooks.md).
