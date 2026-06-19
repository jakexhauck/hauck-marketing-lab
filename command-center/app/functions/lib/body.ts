// Shared JSON body parsing. A malformed body is a client error, not a server
// crash: callers return 400 on null instead of letting request.json() throw
// into the middleware's 500 handler.
export async function readJsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
