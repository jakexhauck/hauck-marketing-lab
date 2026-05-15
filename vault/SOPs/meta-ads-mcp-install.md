# Install Meta Ads MCP

**Category:** Stack
**Source:** Bonus, Meta Ads MCP + AI Creative Stack
**When to use:** When you want Claude (Desktop or Code) to pull live data, create campaigns, manage catalogs, and run diagnostics directly against Meta.
**Estimated time:** 2 to 10 min

---

## Prerequisites

- [ ] Meta Business account
- [ ] Same email on Ads Manager and Claude
- [ ] Claude Desktop OR Claude Code installed

## Checklist

### Claude Desktop (4 clicks, ~90 seconds)

- [ ] Open Claude Settings, then Connectors (profile icon, bottom-left)
- [ ] Click Add custom connector (top right of Connectors panel)
- [ ] Fill in:
  - [ ] NAME: META MCP
  - [ ] MCP SERVER URL: `https://mcp.facebook.com/ads`
- [ ] Click Add
- [ ] Approve Meta OAuth:
  - [ ] Sign in with same email as Ads Manager
  - [ ] Pick ad accounts to share
  - [ ] Click Approve
  - [ ] Green status indicator confirms readiness

### Claude Code (1 command, ~30 seconds)

- [ ] Run `claude mcp add` with http transport pointing at `https://mcp.facebook.com/ads`
- [ ] Verify with `claude mcp list`, look for `meta-ads connected`
- [ ] OAuth happens in browser on first use

### Test (works for either)

- [ ] Ask Claude: "List all my Meta ad accounts with name, currency, status, and 7-day spend as a table"
- [ ] If actual accounts come back, you're done
- [ ] If nothing comes back, redo OAuth step

## Notes

- 29 tools available across 5 families:
  - [ ] Campaigns and Ads (5 write tools: create_campaign, create_ad_set, create_ad, update_entity, activate_entity)
  - [ ] Product Catalog (10 tools: catalog_create, get_catalogs, get_details, get_diagnostics, get_feed_rules, get_products, more)
  - [ ] Accounts and Assets (3 tools: get_ad_accounts, get_ad_entities, get_pages_for_business)
  - [ ] Tracking and Datasets (4 tools: get_dataset_details, get_dataset_quality, get_dataset_stats, get_errors)
  - [ ] Insights and Performance (7 tools: advertiser_context, anomaly_signal, auction_ranking_benchmarks, industry_benchmark, performance_trend, opportunity_score, help_article)
- No Meta Developer App or Marketing API approval wait required. This is the official first-party connector (launched April 29 2026).
- After install, use the 8 client-ready prompts (Daily Pulse, Friday Report, Cleanup Audit, Catalog Health Check, Anomaly Alert, Auction Edge, Pre-Pitch Audit, Bloomberg Dashboard) for fast client deliverables.
- If you also need to push data from external scripts, the meta-api-token-setup SOP is still relevant. The MCP is for Claude-driven actions, the token is for code-driven actions.

## Related SOPs

- claude-code-install
- meta-api-token-setup
- read-ad-data-csv-with-claude
- daily-15min-optimization-routine
