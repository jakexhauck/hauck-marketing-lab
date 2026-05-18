// Runs before every /api/* route. CORS for local dev, JSON error shape,
// and a place to plug Supabase JWT verification once auth is wired (section 02).

const allowedOrigins = new Set([
  "http://localhost:5173",
  "https://dash.hauckmarketing.com",
]);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && allowedOrigins.has(origin) ? origin : "https://dash.hauckmarketing.com";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export const onRequest: PagesFunction = async (ctx) => {
  const origin = ctx.request.headers.get("origin");

  if (ctx.request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const response = await ctx.next();
    const headers = new Headers(response.headers);
    const cors = corsHeaders(origin);
    for (const [key, value] of Object.entries(cors)) {
      headers.set(key, value as string);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json", ...corsHeaders(origin) },
    });
  }
};
