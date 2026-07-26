import fs from 'node:fs';
import path from 'node:path';

const src = './src';
let errors = 0, checked = 0;

// Only these top-level dirs are supported by Shopify
const ALLOWED = new Set(['assets','blocks','config','layout','locales','sections','snippets','templates']);

for (const theme of fs.readdirSync(src)) {
  const base = path.join(src, theme);
  if (!fs.statSync(base).isDirectory()) continue;

  // 1. required file
  if (!fs.existsSync(path.join(base, 'layout', 'theme.liquid'))) {
    console.log(`FAIL ${theme}: missing layout/theme.liquid`); errors++;
  }

  // 2. only supported top-level directories
  for (const d of fs.readdirSync(base)) {
    if (!ALLOWED.has(d)) { console.log(`FAIL ${theme}: unsupported top-level "${d}"`); errors++; }
  }

  // 3. every .json parses
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });

  const files = walk(base);
  for (const f of files) {
    if (f.endsWith('.json')) {
      checked++;
      try { JSON.parse(fs.readFileSync(f, 'utf8')); }
      catch (e) { console.log(`FAIL ${f}: ${e.message}`); errors++; }
    }
    if (f.endsWith('.liquid')) {
      const body = fs.readFileSync(f, 'utf8');
      const m = body.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/);
      if (m) {
        checked++;
        try { JSON.parse(m[1]); }
        catch (e) { console.log(`FAIL ${f} schema: ${e.message}`); errors++; }
      }
      // unbalanced liquid tag sanity check
      const opens = (body.match(/\{%-?\s*(if|unless|for|form|case|comment|schema|paginate)\b/g) || []).length;
      const closes = (body.match(/\{%-?\s*end(if|unless|for|form|case|comment|schema|paginate)\b/g) || []).length;
      if (opens !== closes) { console.log(`FAIL ${f}: ${opens} block opens vs ${closes} closes`); errors++; }
    }
  }

  // 4. every section type referenced by a template actually exists
  const tpl = path.join(base, 'templates');
  for (const t of fs.readdirSync(tpl).filter(x => x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(tpl, t), 'utf8'));
    for (const [key, sec] of Object.entries(j.sections || {})) {
      const target = path.join(base, 'sections', sec.type + '.liquid');
      if (!fs.existsSync(target)) { console.log(`FAIL ${theme}/templates/${t}: section "${sec.type}" not found`); errors++; }
    }
    for (const key of (j.order || [])) {
      if (!j.sections[key]) { console.log(`FAIL ${theme}/templates/${t}: order references missing "${key}"`); errors++; }
    }
  }

  // 5. section groups reference real sections
  for (const g of ['header-group.json','footer-group.json']) {
    const j = JSON.parse(fs.readFileSync(path.join(base, 'sections', g), 'utf8'));
    for (const sec of Object.values(j.sections)) {
      if (!fs.existsSync(path.join(base, 'sections', sec.type + '.liquid'))) {
        console.log(`FAIL ${theme}/sections/${g}: "${sec.type}" not found`); errors++;
      }
    }
  }

  // 6. asset_url references resolve
  const assets = new Set(fs.readdirSync(path.join(base, 'assets')));
  for (const f of files.filter(x => x.endsWith('.liquid'))) {
    const body = fs.readFileSync(f, 'utf8');
    for (const m of body.matchAll(/'([\w.-]+\.(css|js|png|jpg|svg))'\s*\|\s*asset_url/g)) {
      if (!assets.has(m[1])) { console.log(`FAIL ${f}: asset "${m[1]}" missing`); errors++; }
    }
  }

  // 7. a real store needs more than the marketing pages
  const REQUIRED = [
    'templates/index.json',
    'templates/product.json',
    'templates/collection.json',
    'templates/page.json',
    'templates/page.contact.json',
    'templates/page.faq.json',
    'templates/cart.json',
    'templates/search.json',
    'templates/404.json',
    'templates/list-collections.json',
    'templates/blog.json',
    'templates/article.json',
    'templates/password.json',
    'templates/gift_card.liquid',
    'templates/customers/login.liquid',
    'templates/customers/register.liquid',
    'templates/customers/account.liquid',
    'templates/customers/order.liquid',
    'templates/customers/addresses.liquid',
    'templates/customers/activate_account.liquid',
    'templates/customers/reset_password.liquid',
    'layout/theme.liquid',
    'layout/password.liquid',
  ];
  for (const rel of REQUIRED) {
    checked++;
    if (!fs.existsSync(path.join(base, rel))) { console.log(`FAIL ${theme}: missing ${rel}`); errors++; }
  }

  // 8. both layouts must emit the two things Shopify injects
  for (const lay of ['theme.liquid', 'password.liquid']) {
    const p = path.join(base, 'layout', lay);
    if (!fs.existsSync(p)) continue;
    const body = fs.readFileSync(p, 'utf8');
    for (const token of ['content_for_header', 'content_for_layout']) {
      checked++;
      if (!body.includes(token)) { console.log(`FAIL ${theme}/layout/${lay}: no ${token}`); errors++; }
    }
  }

  // 9. The add-to-cart form must submit a variant id, and that id must come
  //    from a real form control rather than from JavaScript. This is the
  //    invariant that keeps the chip picker from ever adding the wrong item.
  const pdp = path.join(base, 'sections', 'main-product.liquid');
  if (fs.existsSync(pdp)) {
    const body = fs.readFileSync(pdp, 'utf8');
    checked++;
    const hasSelect = /<select[^>]*name="id"/.test(body);
    const hasHidden = /<input[^>]*type="hidden"[^>]*name="id"/.test(body);
    if (!hasSelect || !hasHidden) {
      console.log(`FAIL ${theme}/sections/main-product.liquid: needs both a name="id" select (multi-variant) and a hidden name="id" input (single variant); select=${hasSelect} hidden=${hasHidden}`);
      errors++;
    }
  }

  // 10. No invented money. A schema default that is a bare currency amount is
  //     a price the theme made up, and it can reach a live storefront. Prose
  //     that happens to mention a threshold ("Free shipping over $50") is
  //     merchant policy copy and is left alone deliberately.
  for (const f of files.filter(x => x.endsWith('.liquid'))) {
    const body = fs.readFileSync(f, 'utf8');
    const m = body.match(/\{%\s*schema\s*%\}([\s\S]*?)\{%\s*endschema\s*%\}/);
    if (!m) continue;
    for (const hit of m[1].matchAll(/"default"\s*:\s*"\s*(\$[\d,]+(?:\.\d{2})?)\s*"/g)) {
      console.log(`FAIL ${f}: invented price "${hit[1]}" as a schema default`);
      errors++;
    }
  }
}
console.log(errors === 0 ? `\nPASS - ${checked} JSON documents valid, all references resolve` : `\n${errors} ERRORS`);
process.exit(errors ? 1 : 0);
