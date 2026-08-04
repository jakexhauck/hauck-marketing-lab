// GET /connected
//
// Where Google sends her after she approves. Reads the live connection state
// rather than assuming success, so a half finished grant says so.

import type { Env } from "./lib/composio.ts";
import { connectedAccountId } from "./lib/calendar.ts";

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;500&display=swap" rel="stylesheet">
<style>
  body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
       font-family:Poppins,system-ui,sans-serif;background:#F7F0E7;color:#2A201A}
  .card{max-width:440px;text-align:center;background:#FDF9F4;border:1px solid rgba(42,32,26,.11);
        border-radius:20px;padding:38px 32px}
  h1{margin:0 0 10px;font-size:26px;font-weight:500;letter-spacing:-.02em}
  p{margin:0;font-size:15px;font-weight:300;line-height:1.65;color:#806E5D}
  @media (prefers-color-scheme:dark){
    body{background:#15100D;color:#F5EAE0}
    .card{background:#201914;border-color:rgba(245,234,224,.13)}
    p{color:#AF9985}
  }
</style></head><body><div class="card">${body}</div></body></html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const linked = await connectedAccountId(context.env);
  return linked
    ? page(
        "Calendar connected",
        `<h1>Your calendar is connected</h1>
         <p>Bookings will appear in it automatically, and anything you block out will close that time off.
         You can close this tab.</p>`,
      )
    : page(
        "Not connected",
        `<h1>That did not finish</h1>
         <p>Google did not complete the connection. Open the link Jake sent you and try once more.</p>`,
      );
}
