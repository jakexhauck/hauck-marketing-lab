// Single source of truth for the client-facing app identity in this
// single-tenant deploy. While we build against the GHL test sub-account this
// reads as an unmistakable "Test Account". When promoting to a live client,
// swap these three values (and the amber test banner stops showing once the
// session mode is "live").
export const APP_BRAND = {
  appName: "Test Account",
  initials: "TST",
  color: "#1a4d8f",
};
