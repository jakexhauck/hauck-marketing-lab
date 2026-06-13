// Transport-agnostic API client factory. Same body-parsing + ApiError behavior
// as client-dashboard/src/lib/api.ts, but the auth transport is injected so the
// web CRM (cookie) and a future desktop app (bearer token) share one code path.

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type AuthTransport =
  // Web: the browser holds the HttpOnly cookie; we send credentials.
  | { mode: "cookie" }
  // Desktop: attach the signed session token as a bearer header; no cookie.
  | { mode: "bearer"; getToken(): string | null };

export interface ApiClientOptions {
  baseUrl: string;
  auth: AuthTransport;
  // Called on any 401 so the app can flip to unauthenticated and route to login.
  // Mirrors the mobile app's `hml:unauthorized` window event.
  onUnauthorized?: () => void;
}

export type ApiClient = <T>(path: string, init?: RequestInit) => Promise<T>;

export function createApiClient(opts: ApiClientOptions): ApiClient {
  return async function api<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (opts.auth.mode === "bearer") {
      const token = opts.auth.getToken();
      if (token) headers.set("authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${opts.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: opts.auth.mode === "cookie" ? "include" : "omit",
    });

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!res.ok) {
      if (res.status === 401) {
        opts.onUnauthorized?.();
      }
      const msg =
        (body && typeof body === "object" && "error" in body
          ? String((body as { error: unknown }).error)
          : null) ?? `${res.status} ${res.statusText}`;
      throw new ApiError(res.status, msg, body);
    }

    return body as T;
  };
}
