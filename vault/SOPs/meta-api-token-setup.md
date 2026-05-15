# Generate Meta API Access Token

**Category:** Stack
**Source:** Module 5 Lesson 3
**When to use:** When connecting any third-party software to a Meta ad account via API.
**Estimated time:** 20 min

---

## Prerequisites

- [ ] Meta Business Manager set up
- [ ] Facebook Page connected to Business Manager
- [ ] Admin access on the Business Manager (not employee-level)

## Checklist

- [ ] **Go to Meta Developers:**
  - [ ] developers.facebook.com
  - [ ] Log in with the Facebook account tied to your Business Manager
  - [ ] My Apps (top right)
  - [ ] Green Create App button
- [ ] **Create the app:**
  - [ ] Type: Business
  - [ ] Name: memorable, only you see it (e.g. "My Agency Ads Tool")
  - [ ] Contact email: yours
  - [ ] Pick your Business Manager from portfolio
  - [ ] Create App
  - [ ] Complete security verification if prompted
- [ ] **Get access token:**
  - [ ] Left menu: Tools
  - [ ] Open Graph API Explorer
  - [ ] Right side: select User Token
  - [ ] Add four permissions one at a time:
    - [ ] ads_management (lets software create and modify ads)
    - [ ] ads_read (view ad performance data)
    - [ ] business_management (Business Manager access)
    - [ ] pages_read_engagement (read Page info)
  - [ ] Click Generate Access Token (blue button)
  - [ ] Click Continue on authorization popup
  - [ ] Copy the resulting token string
- [ ] **Get Ad Account ID:**
  - [ ] Business Manager, Ad Accounts
  - [ ] Copy ID, starts with `act_`
- [ ] **Paste into target software:**
  - [ ] Open the software (Adlevel, custom tool, etc.)
  - [ ] Settings, Meta Connection (or API Settings)
  - [ ] Paste access token
  - [ ] Paste Ad Account ID
  - [ ] Save or Connect
- [ ] **Verify:**
  - [ ] Open Campaigns or Dashboard in the software
  - [ ] If connected, existing campaigns appear (empty list with no error also = success)
- [ ] **Convert to long-lived token:**
  - [ ] Initial tokens expire in about an hour
  - [ ] Use software's built-in conversion or run Graph API request to extend to 60 days

## Notes

- Treat the token like a banking password. Full control of your ad account.
- "App" is misleading. You're not building software, just creating a credentials container.
- Common errors:
  - [ ] Invalid token: regenerate, it expired
  - [ ] No ad account found: confirm ID starts with `act_`
  - [ ] Permissions error: re-add all four permissions, regenerate token
  - [ ] Business not found: you need admin access, not employee

## Related SOPs

- claude-code-install
- meta-ads-mcp-install
