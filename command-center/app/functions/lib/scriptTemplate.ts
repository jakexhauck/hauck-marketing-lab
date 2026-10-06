// The dialing script template ("Client Dialing/Voicemail Script | TEMPLATE" in
// the 🚀 Client Setup Drive folder) turned into one client's Setter Suite
// script. Jake, 2026-10-06: the only thing that changes per client is the
// company name, written [Company Name] in the template. Everything else
// ([First Name], [Your Name] and the rest) is said live on the call and stays.
//
// Google's HTML export carries bold and underline as inline styles on spans,
// which the script sanitizer strips. So the spans are turned into real
// <strong>/<u>/<em> first; the sanitizer then removes every attribute.
// Pure string work (no HTMLRewriter) so it is unit tested; the export is
// machine-written and regular, and the sanitizer is still the trust boundary.

export const DIALING_TEMPLATE_DOC_ID = "1FPm791CduIxJGe4DdoEiOqINHP0H0EqbIS8d_VRC4RQ";

const COMPANY_TOKEN = /(\[|\{\{)\s*company\s+name\s*(\]|\}\})/gi;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Google Doc export -> plain script markup (strong/u/em, headings, paragraphs). */
export function docExportToScript(exportHtml: string): string {
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(exportHtml);
  let html = bodyMatch ? bodyMatch[1] : exportHtml;

  // The document's title paragraph reads as a heading in the script.
  html = html.replace(/<p class="title"[^>]*>([\s\S]*?)<\/p>/gi, "<h2>$1</h2>");

  // Styled spans -> semantic tags. Google never nests spans.
  html = html.replace(/<span([^>]*)>([\s\S]*?)<\/span>/gi, (_m, attrs: string, inner: string) => {
    const style = /style="([^"]*)"/i.exec(attrs)?.[1] ?? "";
    let out = inner;
    if (/font-style:\s*italic/i.test(style)) out = `<em>${out}</em>`;
    if (/text-decoration:[^;"]*underline/i.test(style)) out = `<u>${out}</u>`;
    if (/font-weight:\s*(700|bold)/i.test(style)) out = `<strong>${out}</strong>`;
    return out;
  });

  // Google's horizontal rules are an <hr> the editor cannot hold; a divider line reads the same.
  html = html.replace(/<hr[^>]*>/gi, "<p>________________</p>");
  return html.trim();
}

/** Swap every [Company Name] / {{Company Name}} for the client's name. */
export function fillCompanyName(html: string, businessName: string): string {
  const name = businessName.trim();
  if (!name) return html;
  return html.replace(COMPANY_TOKEN, escapeHtml(name));
}

/** How many company-name spots a document has (0 means the template changed). */
export function countCompanyTokens(text: string): number {
  return (text.match(COMPANY_TOKEN) ?? []).length;
}
