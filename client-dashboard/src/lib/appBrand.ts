// Single source of truth for the app's brand identity in this single-tenant
// deploy. Authenticated sessions override these with the tenant row from
// GET /api/tenant; these constants are the fallback (login screen, Supabase
// unconfigured). Per-client branding is configuration, never code: no client
// name belongs anywhere in src/.
export const APP_BRAND = {
  appName: "Test Account",
  initials: "TST",
  color: "#1a4d8f",
  // Agency credit line on the login screen ("Secured by ...").
  securedBy: "Hauck Marketing",
};
