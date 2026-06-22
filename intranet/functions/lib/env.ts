// Environment bindings for the internal SOP Hub. These mirror the Command
// Center's secrets so the SAME admin credentials work here: point
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY at the same project, and use the same
// SESSION_SECRET. The cookie is scoped to internal.hauckmarketing.com (its own
// host), so an admin signs in here once with their existing email + password.
export interface Env {
  SESSION_SECRET?: string;
  APP_PASSWORD?: string; // legacy fallback signing key (matches command-center)
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;

  // Google Drive (the "Assets" backend). The portal connects ONE agency Google
  // account once via OAuth; the refresh token is stored in drive_connection.
  // GOOGLE_OAUTH_CLIENT_ID / _SECRET come from a Web OAuth client in the agency's
  // Google Cloud project. GOOGLE_OAUTH_REDIRECT defaults to
  // https://internal.hauckmarketing.com/api/drive/oauth/callback when unset.
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  GOOGLE_OAUTH_REDIRECT?: string;
}
