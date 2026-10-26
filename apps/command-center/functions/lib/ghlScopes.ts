// The GHL Marketplace app's scopes. No imports, so src/ tests can read it
// without pulling in the Workers types the rest of functions/lib needs.

// The scopes the app was registered with. Kept here so the install URL the
// Connection page builds can never drift from what was ticked in the developer
// portal: GHL locks scopes once a version is published, so a mismatch fails the
// install rather than silently granting less.
export const APP_SCOPES = [
  "contacts.readonly",
  "contacts.write",
  "opportunities.readonly",
  "opportunities.write",
  "conversations.readonly",
  "conversations/message.readonly",
  // Sending texts from the app. Without these GHL answers 401 "not authorized
  // for this scope" on every app-linked client's send.
  "conversations.write",
  "conversations/message.write",
  "calendars.readonly",
  "calendars.write",
  "calendars/events.readonly",
  // Booking estimates and jobs from the owner's outcome link.
  "calendars/events.write",
  // Reading the booking form's questions, and the custom fields they fill.
  "forms.readonly",
  "locations/customFields.readonly",
  "invoices.readonly",
  "locations.readonly",
  "locations/customValues.readonly",
  "locations/customValues.write",
  "locations/customFields.write",
  "locations/tags.write",
  "users.readonly",
  "workflows.readonly",
  // Billing (payments), the Social pages, and the business number custom values
  // read (ghlPhone.ts). Pasted-key clients had these; app-linked ones did not.
  "payments/transactions.readonly",
  "socialplanner/post.readonly",
  "socialplanner/post.write",
  "socialplanner/account.readonly",
  "phonenumbers.read",
  // The two that make the agency-installs-once model work at all.
  "oauth.readonly",
  "oauth.write",
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
    "locations/customValues.readonly",
    "locations/customValues.write",
    "locations/customFields.readonly",
    "locations/customFields.write",
    "locations/tags.write",
  ],
  users: ["users.readonly"],
  workflows: ["workflows.readonly"],
  payments: ["payments/transactions.readonly"],
  "social-media-posting": ["socialplanner/post.readonly", "socialplanner/post.write", "socialplanner/account.readonly"],
  "phone-system": ["phonenumbers.read"],
  oauth: ["oauth.readonly", "oauth.write"],
};
