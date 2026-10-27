// The GHL Marketplace app's scopes. No imports, so src/ tests can read it
// without pulling in the Workers types the rest of functions/lib needs.

// Every scope ticked on the app's Auth page in the developer portal, in the
// portal's order (168, read 2026-10-27). Jake, 2026-10-27: the Grok Bots get
// full GHL access, and a token only carries what the install URL asks for, so
// the install asks for all of it. Kept here so the install URL the Connection
// page builds can never drift from the portal: GHL locks scopes once a version
// is published, so asking for one that is not ticked fails the install rather
// than silently granting less. Still unticked on v1.0.0 (they need a new app
// version): workflows write/delete/publish/logs, Projects, Notes, Managed
// Agents, ClientPortal AI, Countdown Timers, affiliate-manager.write and the
// Social Planner watermarks.
export const APP_SCOPES = [
  // Ad Publishing
  "adPublishing.readonly",
  "adPublishing.write",
  // Affiliate Manager
  "affiliate-manager.readonly",
  // AI Agent Studio
  "agent-studio.readonly",
  "agent-studio.write",
  // Associations
  "associations.write",
  "associations.readonly",
  "associations/relation.readonly",
  "associations/relation.write",
  // Blogs
  "blogs/post.write",
  "blogs/post-update.write",
  "blogs/check-slug.readonly",
  "blogs/category.readonly",
  "blogs/author.readonly",
  "blogs/posts.readonly",
  "blogs/list.readonly",
  // Brand Boards
  "brand-boards/design-kit.readonly",
  "brand-boards/design-kit.write",
  "brand-boards/voices.readonly",
  "brand-boards/voices.write",
  // Businesses
  "businesses.readonly",
  "businesses.write",
  // Calendars
  "calendars.readonly",
  "calendars.write",
  "calendars/events.readonly",
  "calendars/events.write",
  "calendars/groups.readonly",
  "calendars/groups.write",
  "calendars/resources.readonly",
  "calendars/resources.write",
  // Campaigns
  "campaigns.readonly",
  // Chat Widget
  "chat-widget.readonly",
  "chat-widget.write",
  // Companies
  "companies.readonly",
  // Contacts
  "contacts.readonly",
  "contacts.write",
  // Conversation AI
  "conversation-ai.readonly",
  "conversation-ai.write",
  // Conversations
  "conversations.readonly",
  "conversations.write",
  "conversations/message.readonly",
  "conversations/message.write",
  "conversations/reports.readonly",
  "conversations/livechat.write",
  // Courses
  "courses.write",
  "courses.readonly",
  // Custom Fields
  "locations/customFields.readonly",
  "locations/customFields.write",
  // Custom Menus
  "custom-menu-link.readonly",
  "custom-menu-link.write",
  // Emails
  "emails/builder.write",
  "emails/builder.readonly",
  "emails/schedule.readonly",
  "emails/schedule.write",
  "emails/templates.readonly",
  "emails/templates.write",
  "emails/campaigns.readonly",
  "emails/campaigns.write",
  "emails/stats.readonly",
  // Files
  "files.readonly",
  // Forms
  "forms.readonly",
  "forms.write",
  // Funnels
  "funnels/redirect.readonly",
  "funnels/page.readonly",
  "funnels/funnel.readonly",
  "funnels/pagecount.readonly",
  "funnels/redirect.write",
  // Invoices
  "invoices.readonly",
  "invoices.write",
  "invoices/schedule.readonly",
  "invoices/schedule.write",
  "invoices/template.readonly",
  "invoices/template.write",
  "invoices/estimate.readonly",
  "invoices/estimate.write",
  // Knowledge Base
  "knowledge-bases.write",
  "knowledge-bases.readonly",
  // Lc Email
  "lc-email.readonly",
  // Trigger Links
  "links.readonly",
  "links.write",
  // Locations
  "locations.write",
  "locations.readonly",
  "locations/customValues.readonly",
  "locations/customValues.write",
  "locations/tasks.readonly",
  "locations/tasks.write",
  "recurring-tasks.readonly",
  "recurring-tasks.write",
  "locations/tags.readonly",
  "locations/tags.write",
  "locations/templates.readonly",
  // Developer Marketplace
  "charges.readonly",
  "charges.write",
  "marketplace-installer-details.readonly",
  "marketplace-external-auth-migration.write",
  // Medias
  "medias.readonly",
  "medias.write",
  // Oauth: the two that make the agency-installs-once model work at all
  "oauth.write",
  "oauth.readonly",
  // Objects
  "objects/schema.readonly",
  "objects/schema.write",
  "objects/record.readonly",
  "objects/record.write",
  // Opportunities
  "opportunities.readonly",
  "opportunities.write",
  // Payments
  "payments/orders.readonly",
  "payments/orders.write",
  "payments/orders.collectPayment",
  "payments/integration.readonly",
  "payments/integration.write",
  "payments/transactions.readonly",
  "payments/subscriptions.readonly",
  "payments/coupons.readonly",
  "payments/coupons.write",
  "payments/custom-provider.readonly",
  "payments/custom-provider.write",
  // Phone System
  "phonenumbers.read",
  "phonenumbers.write",
  "numberpools.read",
  // Pipelines
  "pipelines.readonly",
  "pipelines.write",
  "pipelines.create",
  // Products
  "products.readonly",
  "products.write",
  "products/prices.readonly",
  "products/prices.write",
  "products/collection.readonly",
  "products/collection.write",
  // Proposals
  "documents_contracts/list.readonly",
  "documents_contracts/sendLink.write",
  "documents_contracts_template/sendLink.write",
  "documents_contracts_template/list.readonly",
  // Saas
  "saas/company.read",
  "saas/company.write",
  "saas/location.read",
  "saas/location.write",
  // Snapshots
  "snapshots.readonly",
  "snapshots.write",
  // Social Planner
  "socialplanner/oauth.readonly",
  "socialplanner/oauth.write",
  "socialplanner/post.readonly",
  "socialplanner/post.write",
  "socialplanner/account.readonly",
  "socialplanner/account.write",
  "socialplanner/csv.readonly",
  "socialplanner/csv.write",
  "socialplanner/category.readonly",
  "socialplanner/tag.readonly",
  "socialplanner/statistics.readonly",
  "socialplanner/comments.readonly",
  "socialplanner/comments.write",
  "socialplanner/category.write",
  "socialplanner/tag.write",
  // Store
  "store/shipping.readonly",
  "store/shipping.write",
  "store/setting.readonly",
  "store/setting.write",
  // Surveys
  "surveys.readonly",
  // Twilio Account
  "twilioaccount.read",
  // Users
  "users.readonly",
  "users.write",
  // Voice AI
  "voice-ai-dashboard.readonly",
  "voice-ai-agents.readonly",
  "voice-ai-agents.write",
  "voice-ai-agent-goals.readonly",
  "voice-ai-agent-goals.write",
  // Wordpress
  "wordpress.site.readonly",
  // Workflows
  "workflows.readonly",
] as const;

// Every GHL API area the server calls, by its first path segment, and the scopes
// that area needs. ghlAppScopes.test.ts scans functions/ for GHL paths and fails
// on an area missing here or a scope missing from APP_SCOPES, so new GHL code
// cannot ship without asking the install for its permission (2026-10-26: texts
// 401'd on every app-linked client because conversations write was never asked).
export const GHL_AREA_SCOPES: Record<string, readonly (typeof APP_SCOPES)[number][]> = {
  contacts: ["contacts.readonly", "contacts.write"],
  opportunities: ["opportunities.readonly", "opportunities.write"],
  conversations: [
    "conversations.readonly",
    "conversations.write",
    "conversations/message.readonly",
    "conversations/message.write",
  ],
  calendars: ["calendars.readonly", "calendars.write", "calendars/events.readonly", "calendars/events.write"],
  forms: ["forms.readonly"],
  invoices: ["invoices.readonly"],
  locations: [
    "locations.readonly",
    "locations.write",
    "locations/customValues.readonly",
    "locations/customValues.write",
    "locations/customFields.readonly",
    "locations/customFields.write",
    "locations/tags.write",
  ],
  users: ["users.readonly", "users.write"],
  medias: ["medias.readonly", "medias.write"],
  workflows: ["workflows.readonly"],
  payments: ["payments/transactions.readonly"],
  "social-media-posting": ["socialplanner/post.readonly", "socialplanner/post.write", "socialplanner/account.readonly"],
  "phone-system": ["phonenumbers.read", "phonenumbers.write"],
  oauth: ["oauth.readonly", "oauth.write"],
};
