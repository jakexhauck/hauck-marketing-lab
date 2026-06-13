import { createApiClient, ApiError } from "@hauck/core";

// The web CRM uses cookie auth (same registrable domain as the API). On any 401
// we broadcast an event AuthContext listens for, mirroring the mobile app's
// `hml:unauthorized` contract so an expired session routes back to /login.
export const UNAUTHORIZED_EVENT = "hml:unauthorized";

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE ?? "",
  auth: { mode: "cookie" },
  onUnauthorized: () => {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
  },
});

export { ApiError };
