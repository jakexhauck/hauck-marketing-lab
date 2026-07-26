/* ============================================================================
   Root & Ritual Botanicals - Shopify theme builder
   Turns the five HTML mockup directions into five Online Store 2.0 themes.

   Run:  node build-themes.mjs
   Then zip each folder in ./src (contents at the zip root) for upload.

   Each direction gets its own structure, not just its own stylesheet. A theme
   is assembled from four structural axes declared on the direction:

     hero     split | arch | immersive | masthead | fullbleed
     frame    plain | arch | ruled | bare          (product card treatment)
     feature  split | arch | inset | ruled | band  (product feature row)
     chrome   standard | inverted | ruled | minimal (header + footer)

   Sections that read the same in every direction (story, reviews, icon strip,
   newsletter, cart, search, 404, blog, article) are written once and shared.
   Only the sections above branch. Add a branch when the markup genuinely has
   to differ; if CSS can carry it, let CSS carry it.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'src');

const DIRECTIONS = [
  {
    slug: '01-faithful', name: 'Faithful', folder: '01-faithful',
    hero: 'split', frame: 'plain', feature: 'split', chrome: 'standard',
    // The client's own comp, rebuilt. Copy leads, photo supports.
    order: ['hero', 'intro', 'feature_a', 'feature_b', 'icons', 'story', 'reviews', 'newsletter'],
  },
  {
    slug: '02-parchment', name: 'Parchment', folder: '02-parchment',
    hero: 'arch', frame: 'arch', feature: 'arch', chrome: 'standard',
    // Illustration led. The story earns its place high up the page.
    order: ['hero', 'intro', 'feature_a', 'story', 'feature_b', 'icons', 'reviews', 'newsletter'],
  },
  {
    slug: '03-deep-forest', name: 'Deep Forest', folder: '03-deep-forest',
    hero: 'immersive', frame: 'plain', feature: 'inset', chrome: 'inverted',
    // Green carries the page. Trust marks sit directly under the hero.
    order: ['hero', 'icons', 'intro', 'feature_a', 'feature_b', 'story', 'reviews', 'newsletter'],
  },
  {
    slug: '04-field-guide', name: 'Field Guide', folder: '04-field-guide',
    hero: 'masthead', frame: 'ruled', feature: 'ruled', chrome: 'ruled',
    // An almanac. Provenance before product, specimens in a ruled run.
    order: ['hero', 'intro', 'story', 'feature_a', 'feature_b', 'icons', 'reviews', 'newsletter'],
  },
  {
    slug: '05-golden-hour', name: 'Golden Hour', folder: '05-golden-hour',
    hero: 'fullbleed', frame: 'bare', feature: 'band', chrome: 'minimal',
    // Photography forward, minimal chrome. Product bands run back to back.
    order: ['hero', 'feature_a', 'feature_b', 'intro', 'story', 'icons', 'reviews', 'newsletter'],
  },
];

const FONT_LINK = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Jost:wght@300;400;500;600&display=swap">`;

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

/* ---------------------------------------------------------------- layout */
const themeLiquid = `<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="canonical" href="{{ canonical_url }}">
  {%- if settings.favicon != blank -%}
    <link rel="icon" type="image/png" href="{{ settings.favicon | image_url: width: 32, height: 32 }}">
  {%- endif -%}

  <title>{{ page_title }}{% if current_tags %} &ndash; {{ current_tags | join: ', ' }}{% endif %}{% unless page_title contains shop.name %} &ndash; {{ shop.name }}{% endunless %}</title>
  {%- if page_description -%}<meta name="description" content="{{ page_description | escape }}">{%- endif -%}

  {{ FONT_LINK }}
  {{ 'theme.css' | asset_url | stylesheet_tag }}

  <script>document.documentElement.className += " js";</script>
  {{ content_for_header }}
</head>

<body class="template-{{ template.name | handle }}{% unless template.name == 'index' %} solid-hdr{% endunless %}">

  {% sections 'header-group' %}

  <main id="MainContent" role="main">
    {{ content_for_layout }}
  </main>

  {% sections 'footer-group' %}

  <script src="{{ 'icons.js' | asset_url }}" defer></script>
  <script src="{{ 'site.js' | asset_url }}" defer></script>
  <script src="{{ 'product-form.js' | asset_url }}" defer></script>
</body>
</html>
`.replace('{{ FONT_LINK }}', FONT_LINK);

/* -------------------------------------------------------------- snippets */
const snippetIcon = `{%- comment -%}
  Renders an icon placeholder. icons.js swaps it for inline SVG.
  Usage: {% render 'icon', name: 'leaf', size: 20 %}
{%- endcomment -%}
<i data-icon="{{ name }}"{% if size %} data-size="{{ size }}"{% endif %}></i>
`;

const snippetProductCard = (dir) => `{%- comment -%}
  Product card. Falls back to demo content when no product is connected,
  so the theme looks right the moment it is uploaded.
  Frame treatment for this direction: ${dir.frame}.
{%- endcomment -%}
{%- liquid
  assign card_url = fallback_url | default: '#'
  assign card_title = fallback_title
  assign card_price = fallback_price
  assign card_image = ''
  if product != blank and product != empty
    assign card_url = product.url
    assign card_title = product.title
    assign card_price = product.price | money
    if product.featured_image
      assign card_image = product.featured_image | image_url: width: 900
    endif
  endif
  if card_image == blank and fallback_image != blank
    assign card_image = fallback_image | image_url: width: 900
  endif
  if card_image == blank
    assign card_image = fallback_asset | asset_url
  endif
-%}
<a class="pcard pcard--${dir.frame}" href="{{ card_url }}">
  <div class="pcard__media${dir.frame === 'arch' ? ' ph ph--arch' : ''}">
    <img src="{{ card_image }}" alt="{{ card_title | escape }}" loading="lazy" width="900" height="900">
    {%- if badge != blank -%}<span class="feat__badge">{{ badge }}</span>{%- endif -%}
${dir.frame === 'bare' ? `    {%- if card_title != blank -%}
      <span class="pcard__overlay"><span>{{ card_title }}</span></span>
    {%- endif -%}
` : ''}  </div>
  <div class="pcard__body">
${dir.frame === 'ruled' ? `    {%- if index != blank -%}<span class="pcard__idx">{{ index }}</span>{%- endif -%}
` : ''}    {%- if eyebrow != blank -%}<p class="eyebrow" style="color:var(--orange)">{{ eyebrow }}</p>{%- endif -%}
    <h3>{{ card_title }}</h3>
    {%- if tagline != blank -%}<p class="feat__tag">{{ tagline }}</p>{%- endif -%}
    {%- if blurb != blank -%}<p style="font-size:.9rem;opacity:.78">{{ blurb }}</p>{%- endif -%}
    {%- if meta_a != blank or meta_b != blank -%}
      <div class="feat__meta" style="margin:1rem 0 0">
        {%- if meta_a != blank -%}<span>{% render 'icon', name: 'cup', size: 14 %} {{ meta_a }}</span>{%- endif -%}
        {%- if meta_b != blank -%}<span>{% render 'icon', name: 'mortar', size: 14 %} {{ meta_b }}</span>{%- endif -%}
      </div>
    {%- endif -%}
    <div class="pcard__foot">
      {%- if card_price != blank -%}<span class="price">{{ card_price }}</span>{%- else -%}<span></span>{%- endif -%}
${dir.frame === 'bare' || dir.frame === 'minimal' ? `      <span class="pcard__more">View</span>
` : `      <span class="btn" style="pointer-events:none">View Product</span>
`}    </div>
  </div>
</a>
`;

/* -------------------------------------------------------------- sections */
const sectionAnnouncement = `<div class="ann">
  <span>
    {% render 'icon', name: 'leaf', size: 13 %}
    {{ section.settings.text }}
    {% render 'icon', name: 'leaf', size: 13 %}
  </span>
</div>

{% schema %}
{
  "name": "Announcement bar",
  "settings": [
    { "type": "text", "id": "text", "label": "Message", "default": "Free shipping on orders over $50" }
  ],
  "enabled_on": { "groups": ["header"] }
}
{% endschema %}
`;

const LOGO_BLOCK = `<a class="logo" href="{{ routes.root_url }}">
      <span class="logo__mark">
        <svg width="58" height="24" viewBox="0 0 68 28" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M2 26h64"/><path d="M12 26L27 5l9 12 5-6 12 15"/>
          <path d="M22 15c2-1 4-1 6 .5M38 16c2-1.5 4-1.5 6 0"/>
          <path d="M6 26V14M3 18l3-3 3 3M3.5 22l2.5-2.5L8.5 22"/>
          <path d="M62 26V14M59 18l3-3 3 3M59.5 22l2.5-2.5 2.5 2.5"/>
        </svg>
      </span>
      <span class="logo__word">{{ section.settings.word_one }} <em>&amp;</em> {{ section.settings.word_two }}</span>
      <span class="logo__sub">{{ section.settings.sub }}</span>
    </a>`;

const NAV_BLOCK = `<nav class="nav">
      {%- for link in section.settings.menu.links -%}
        <a href="{{ link.url }}"{% if link.active %} aria-current="page"{% endif %}>{{ link.title }}</a>
      {%- endfor -%}
    </nav>`;

const toolsBlock = (chrome) => `<div class="tools">
      <a href="{{ routes.search_url }}" aria-label="Search">{% render 'icon', name: 'search', size: 19 %}</a>
      <a href="{{ routes.account_url }}" aria-label="Account">{% render 'icon', name: 'user', size: 19 %}</a>
      <a href="{{ routes.cart_url }}" aria-label="Cart">
        {% render 'icon', name: 'bag', size: 19 %}
        {%- if cart.item_count > 0 -%}<span class="tools__count">{{ cart.item_count }}</span>{%- endif -%}
      </a>
      <button class="burger${chrome === 'minimal' ? ' burger--always' : ''}" data-burger aria-expanded="false" aria-label="Menu">{% render 'icon', name: 'plus', size: 22 %}</button>
    </div>`;

/* Chrome decides the masthead arrangement.
     standard / inverted  logo, nav, tools
     ruled                nav, logo, tools - a centred almanac masthead, with a
                          dated rule beneath it
     minimal              logo and tools only; the nav lives in the drawer at
                          every width so photography keeps the full frame */
function headerInner(chrome) {
  if (chrome === 'ruled') {
    return `${NAV_BLOCK}

    ${LOGO_BLOCK}

    ${toolsBlock(chrome)}`;
  }
  if (chrome === 'minimal') {
    return `${LOGO_BLOCK}

    ${toolsBlock(chrome)}`;
  }
  return `${LOGO_BLOCK}

    ${NAV_BLOCK}

    ${toolsBlock(chrome)}`;
}

const sectionHeader = (dir) => `<header class="hdr hdr--${dir.chrome}" data-header>
  <div class="wrap hdr__in">
    ${headerInner(dir.chrome)}
  </div>
${dir.chrome === 'ruled' ? `  <div class="hdr__rule">
    <div class="wrap">
      <span>{{ section.settings.rule_left }}</span>
      <span>{{ 'now' | date: '%B %Y' }}</span>
      <span>{{ section.settings.rule_right }}</span>
    </div>
  </div>
` : ''}</header>

<nav class="drawer" data-drawer>
  <button class="drawer__close" data-burger>Close</button>
  {%- for link in section.settings.menu.links -%}
    <a href="{{ link.url }}">{{ link.title }}</a>
  {%- endfor -%}
</nav>

{% schema %}
{
  "name": "Header",
  "settings": [
    { "type": "link_list", "id": "menu", "label": "Menu", "default": "main-menu" },
    { "type": "text", "id": "word_one", "label": "Logo word 1", "default": "Root" },
    { "type": "text", "id": "word_two", "label": "Logo word 2", "default": "Ritual" },
    { "type": "text", "id": "sub", "label": "Logo subtitle", "default": "Botanicals" }${dir.chrome === 'ruled' ? `,
    { "type": "text", "id": "rule_left", "label": "Masthead rule, left", "default": "North Georgia" },
    { "type": "text", "id": "rule_right", "label": "Masthead rule, right", "default": "Small Batch" }` : ''}
  ],
  "enabled_on": { "groups": ["header"] }
}
{% endschema %}
`;

const sectionFooter = (dir) => `<footer class="ftr ftr--${dir.chrome}">
${dir.chrome === 'minimal' ? `  <div class="ftr__creedband">
    <div class="wrap"><p>{{ section.settings.creed | newline_to_br }}</p></div>
  </div>
` : ''}  <div class="wrap">
    <div class="ftr__grid">
      <div>
        <div class="ftr__mark">{% render 'icon', name: 'mountain', size: 44 %}</div>
${dir.chrome === 'minimal' ? '' : `        <p class="ftr__creed">{{ section.settings.creed }}</p>
`}      </div>

      {%- for block in section.blocks -%}
        {%- case block.type -%}
          {%- when 'menu' -%}
            <div {{ block.shopify_attributes }}>
              <h4>{{ block.settings.heading }}</h4>
              <ul>
                {%- for link in block.settings.menu.links -%}
                  <li><a href="{{ link.url }}">{{ link.title }}</a></li>
                {%- endfor -%}
              </ul>
            </div>
          {%- when 'social' -%}
            <div {{ block.shopify_attributes }}>
              <h4>{{ block.settings.heading }}</h4>
              <div class="social">
                {%- if block.settings.instagram != blank -%}<a href="{{ block.settings.instagram }}" aria-label="Instagram">{% render 'icon', name: 'instagram', size: 20 %}</a>{%- endif -%}
                {%- if block.settings.facebook != blank -%}<a href="{{ block.settings.facebook }}" aria-label="Facebook">{% render 'icon', name: 'facebook', size: 20 %}</a>{%- endif -%}
                {%- if block.settings.youtube != blank -%}<a href="{{ block.settings.youtube }}" aria-label="YouTube">{% render 'icon', name: 'youtube', size: 20 %}</a>{%- endif -%}
                {%- if block.settings.tiktok != blank -%}<a href="{{ block.settings.tiktok }}" aria-label="TikTok">{% render 'icon', name: 'tiktok', size: 20 %}</a>{%- endif -%}
              </div>
            </div>
        {%- endcase -%}
      {%- endfor -%}
    </div>

    <div class="ftr__base">
      <span>&copy; {{ 'now' | date: '%Y' }} {{ shop.name }}{% if section.settings.show_powered %} &middot; Powered by Shopify{% endif %}</span>
      <div class="pays">
        {%- for type in shop.enabled_payment_types -%}
          <span>{{ type | replace: '_', ' ' | capitalize }}</span>
        {%- else -%}
          <span>Apple Pay</span><span>G Pay</span><span>PayPal</span><span>Shop</span><span>Visa</span>
        {%- endfor -%}
      </div>
    </div>
  </div>
</footer>

{% schema %}
{
  "name": "Footer",
  "settings": [
    { "type": "textarea", "id": "creed", "label": "Creed", "default": "Rooted in nature.\\nGuided by tradition.\\nMade for your ritual." },
    { "type": "checkbox", "id": "show_powered", "label": "Show 'Powered by Shopify'", "default": true }
  ],
  "blocks": [
    {
      "type": "menu", "name": "Menu column", "limit": 3,
      "settings": [
        { "type": "text", "id": "heading", "label": "Heading", "default": "Shop" },
        { "type": "link_list", "id": "menu", "label": "Menu", "default": "footer" }
      ]
    },
    {
      "type": "social", "name": "Social", "limit": 1,
      "settings": [
        { "type": "text", "id": "heading", "label": "Heading", "default": "Follow Along" },
        { "type": "url", "id": "instagram", "label": "Instagram" },
        { "type": "url", "id": "facebook", "label": "Facebook" },
        { "type": "url", "id": "youtube", "label": "YouTube" },
        { "type": "url", "id": "tiktok", "label": "TikTok" }
      ]
    }
  ],
  "enabled_on": { "groups": ["footer"] }
}
{% endschema %}
`;

/* Each direction adds its own furniture inside the hero. The image, veil and
   copy column stay put in every variant, because each direction's stylesheet
   already positions those three precisely and rebuilding them here would throw
   away tuning that is correct. What differs is what surrounds them. */
const heroExtras = {
  // Closest to the client's comp. A scroll cue is all it wants.
  split: {
    afterCopy: '',
    tail: `  <div class="hero__cue" aria-hidden="true"><span></span></div>
`,
    settings: '',
  },
  // The arch is drawn in CSS. This adds the plate caption beneath it and a
  // botanical mark in the empty upper left.
  arch: {
    afterCopy: '',
    tail: `  <div class="hero__orn" aria-hidden="true">{% render 'icon', name: 'lavender', size: 120 %}</div>
  {%- if section.settings.plate != blank -%}
    <p class="hero__plate">{{ section.settings.plate }}</p>
  {%- endif -%}
`,
    settings: `,
    { "type": "text", "id": "plate", "label": "Plate caption", "default": "Plate I. Evening Ritual" }`,
  },
  // Green carries the page, so the hero closes with a running band of the
  // things the brand keeps saying.
  immersive: {
    afterCopy: '',
    tail: `  {%- if section.blocks.size > 0 -%}
    <div class="hero__band">
      <div class="wrap">
        {%- for block in section.blocks -%}
          <span {{ block.shopify_attributes }}>{% render 'icon', name: block.settings.icon, size: 14 %} {{ block.settings.text }}</span>
        {%- endfor -%}
      </div>
    </div>
  {%- endif -%}
`,
    settings: '',
  },
  // An almanac masthead: the headline is followed by a ruled data table rather
  // than a paragraph, which is the whole point of this direction.
  masthead: {
    afterCopy: `      {%- if section.blocks.size > 0 -%}
        <dl class="hero__specs">
          {%- for block in section.blocks -%}
            <div {{ block.shopify_attributes }}>
              <dt>{{ block.settings.label }}</dt>
              <dd>{{ block.settings.text }}</dd>
            </div>
          {%- endfor -%}
        </dl>
      {%- endif -%}
`,
    tail: '',
    settings: '',
  },
  // Photography forward. The chrome gets out of the way and the frame is
  // credited at the foot like a plate in a book.
  fullbleed: {
    afterCopy: '',
    tail: `  <div class="hero__foot">
    <div class="wrap">
      {%- if section.settings.credit != blank -%}<span class="hero__credit">{{ section.settings.credit }}</span>{%- endif -%}
      <span class="hero__cue" aria-hidden="true"><span></span></span>
    </div>
  </div>
`,
    settings: `,
    { "type": "text", "id": "credit", "label": "Frame credit", "default": "Evening Ritual, North Georgia" }`,
  },
};

const HERO_BLOCK_SCHEMA = {
  immersive: `,
  "blocks": [
    {
      "type": "mark", "name": "Band item", "limit": 4,
      "settings": [
        {
          "type": "select", "id": "icon", "label": "Icon", "default": "leaf",
          "options": [
            { "value": "leaf", "label": "Leaf" },
            { "value": "mountain", "label": "Mountain" },
            { "value": "mortar", "label": "Mortar & pestle" },
            { "value": "truck", "label": "Truck" }
          ]
        },
        { "type": "text", "id": "text", "label": "Text", "default": "Small batch" }
      ]
    }
  ]`,
  masthead: `,
  "blocks": [
    {
      "type": "spec", "name": "Masthead row", "limit": 4,
      "settings": [
        { "type": "text", "id": "label", "label": "Label", "default": "Origin" },
        { "type": "text", "id": "text", "label": "Value", "default": "North Georgia" }
      ]
    }
  ]`,
};

const HERO_PRESETS = {
  immersive: `[{ "name": "Hero", "blocks": [{ "type": "mark" }, { "type": "mark" }, { "type": "mark" }] }]`,
  masthead: `[{ "name": "Hero", "blocks": [{ "type": "spec" }, { "type": "spec" }, { "type": "spec" }] }]`,
};

const sectionHero = (dir) => {
  const ex = heroExtras[dir.hero];
  return `<section class="hero hero--${dir.hero}">
  <div class="hero__img">
    {%- if section.settings.image != blank -%}
      <img src="{{ section.settings.image | image_url: width: 2000 }}" alt="{{ section.settings.image.alt | escape }}" width="2000" height="2000" fetchpriority="high">
    {%- else -%}
      <img src="{{ 'evening.png' | asset_url }}" alt="{{ section.settings.heading | escape }}" width="1254" height="1254" fetchpriority="high">
    {%- endif -%}
  </div>
  <div class="hero__veil"></div>
  <div class="wrap hero__in">
    <div class="hero__copy">
      <h1>{{ section.settings.heading }}</h1>
      {%- if section.settings.sub != blank -%}
        <p class="hero__sub">{{ section.settings.sub | newline_to_br }}</p>
      {%- endif -%}
${ex.afterCopy}      <div class="hero__cta">
        {%- if section.settings.cta_one_label != blank -%}
          <a class="btn" href="{{ section.settings.cta_one_url | default: routes.all_products_collection_url }}">{{ section.settings.cta_one_label }}</a>
        {%- endif -%}
        {%- if section.settings.cta_two_label != blank -%}
          <a class="btn btn--ghost" href="{{ section.settings.cta_two_url | default: routes.root_url }}">{{ section.settings.cta_two_label }}</a>
        {%- endif -%}
      </div>
    </div>
  </div>
${ex.tail}</section>

{% schema %}
{
  "name": "Hero",
  "settings": [
    { "type": "image_picker", "id": "image", "label": "Background image", "info": "Leave empty to use the bundled product photo. For best results upload at least 2400px wide." },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Return to Ritual." },
    { "type": "textarea", "id": "sub", "label": "Subheading", "default": "Modern botanical goods\\ninspired by mountain medicine." },
    { "type": "text", "id": "cta_one_label", "label": "Button 1 label", "default": "Shop Rituals" },
    { "type": "url", "id": "cta_one_url", "label": "Button 1 link" },
    { "type": "text", "id": "cta_two_label", "label": "Button 2 label", "default": "Our Story" },
    { "type": "url", "id": "cta_two_url", "label": "Button 2 link" }${ex.settings}
  ]${HERO_BLOCK_SCHEMA[dir.hero] || ''},
  "presets": ${HERO_PRESETS[dir.hero] || '[{ "name": "Hero" }]'}
}
{% endschema %}
`;
};

const sectionRichText = `<section class="sect sect--tight">
  <div class="wrap lede" data-rise>
    <h2>{{ section.settings.heading }} {% if section.settings.heading_alt != blank %}<span class="alt">{{ section.settings.heading_alt }}</span>{% endif %}</h2>
    <div class="rule-mark">{% render 'icon', name: section.settings.ornament, size: 18 %}</div>
    {%- if section.settings.body != blank -%}<p>{{ section.settings.body }}</p>{%- endif -%}
  </div>
</section>

{% schema %}
{
  "name": "Section intro",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Small rituals." },
    { "type": "text", "id": "heading_alt", "label": "Heading accent", "default": "Big impact." },
    { "type": "textarea", "id": "body", "label": "Body", "default": "Two blends, made in small batches in the North Georgia mountains. One to begin the day with intention. One to close it with quiet." },
    {
      "type": "select", "id": "ornament", "label": "Ornament", "default": "lavender",
      "options": [
        { "value": "lavender", "label": "Lavender" },
        { "value": "leaf", "label": "Leaf" },
        { "value": "mountain", "label": "Mountain" },
        { "value": "mortar", "label": "Mortar & pestle" },
        { "value": "heart", "label": "Heart" }
      ]
    }
  ],
  "presets": [{ "name": "Section intro" }]
}
{% endschema %}
`;

/* The specs render as icon-and-text in most directions. The field guide turns
   the same blocks into a ruled definition list, which is the direction's whole
   reason for existing, and falls back to the text alone when no label is set. */
const featureSpecs = (dir) => dir.feature === 'ruled'
  ? `    {%- if section.blocks.size > 0 -%}
      <dl class="feat__table">
        {%- for block in section.blocks -%}
          <div {{ block.shopify_attributes }}>
            <dt>{{ block.settings.label | default: block.settings.icon }}</dt>
            <dd>{{ block.settings.text }}</dd>
          </div>
        {%- endfor -%}
      </dl>
    {%- endif -%}
`
  : `    {%- if section.blocks.size > 0 -%}
      <div class="feat__meta">
        {%- for block in section.blocks -%}
          <span {{ block.shopify_attributes }}>{% render 'icon', name: block.settings.icon, size: 15 %} {{ block.settings.text }}</span>
        {%- endfor -%}
      </div>
    {%- endif -%}
`;

const sectionProductFeature = (dir) => `{%- liquid
  assign p = section.settings.product
  assign f_title = section.settings.heading
  assign f_price = section.settings.price
  assign f_url = section.settings.link | default: routes.all_products_collection_url
  assign f_body = section.settings.body
  if p != blank
    assign f_title = p.title
    assign f_price = p.price | money
    assign f_url = p.url
    if p.description != blank
      assign f_body = p.description | strip_html | truncatewords: 55
    endif
  endif
-%}
<article class="feat feat--${dir.feature}{% if section.settings.flip %} feat--flip{% endif %}" data-rise>
  <div class="feat__media${dir.feature === 'arch' ? ' ph ph--arch' : ''}">
    {%- if section.settings.image != blank -%}
      <img src="{{ section.settings.image | image_url: width: 1600 }}" alt="{{ f_title | escape }}" loading="lazy" width="1600" height="1600">
    {%- elsif p != blank and p.featured_image -%}
      <img src="{{ p.featured_image | image_url: width: 1600 }}" alt="{{ f_title | escape }}" loading="lazy" width="1600" height="1600">
    {%- else -%}
      <img src="{{ section.settings.fallback | asset_url }}" alt="{{ f_title | escape }}" loading="lazy" width="1254" height="1254">
    {%- endif -%}
    {%- if section.settings.badge != blank -%}<span class="feat__badge">{{ section.settings.badge }}</span>{%- endif -%}
${dir.feature === 'band' ? `    <span class="feat__scrim" aria-hidden="true"></span>
` : ''}  </div>

  <div class="feat__body">
${dir.feature === 'ruled' ? `    {%- if section.settings.specimen != blank -%}
      <p class="feat__specimen">{{ section.settings.specimen }}</p>
    {%- endif -%}
` : ''}    {%- if section.settings.eyebrow != blank -%}<p class="eyebrow">{{ section.settings.eyebrow }}</p>{%- endif -%}
    <h3>{{ f_title }}</h3>
    {%- if section.settings.tagline != blank -%}<p class="feat__tag">{{ section.settings.tagline }}</p>{%- endif -%}
    {%- if f_body != blank -%}<p>{{ f_body }}</p>{%- endif -%}

${featureSpecs(dir)}
    <div class="feat__foot">
      {%- if f_price != blank -%}
        <span class="price">{{ f_price }} {% if section.settings.price_note != blank %}<small>{{ section.settings.price_note }}</small>{% endif %}</span>
      {%- endif -%}
      <a class="btn" href="{{ f_url }}">{{ section.settings.cta_label }}</a>
    </div>
  </div>
</article>

{% schema %}
{
  "name": "Product feature row",
  "settings": [
    { "type": "product", "id": "product", "label": "Product", "info": "Optional. When set, the title, price, description and image come from the product." },
    { "type": "image_picker", "id": "image", "label": "Image override" },
    {
      "type": "select", "id": "fallback", "label": "Bundled fallback photo", "default": "morning.png",
      "options": [
        { "value": "morning.png", "label": "Morning Ritual" },
        { "value": "evening.png", "label": "Evening Ritual" }
      ]
    },
    { "type": "checkbox", "id": "flip", "label": "Image on the right", "default": false },
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "Blend No. 01" },
    { "type": "text", "id": "badge", "label": "Badge", "default": "Best Seller" },
    { "type": "text", "id": "heading", "label": "Heading (used if no product)", "default": "Morning Ritual" },
    { "type": "text", "id": "tagline", "label": "Tagline", "default": "Awaken. Ground. Begin." },
    { "type": "textarea", "id": "body", "label": "Body (used if no product)", "default": "Green tea and peppermint lift the fog. Ginger root warms from the inside out. Prunella vulgaris, the self-heal our grandmothers picked along the ridge, holds the whole thing together." },
    { "type": "text", "id": "price", "label": "Price (used if no product)", "info": "Left empty on purpose. Connect a product above and the real price is used; type one here only if you are showing something that is not a Shopify product yet." },
    { "type": "text", "id": "price_note", "label": "Price note", "default": "Free shipping over $50" },
    { "type": "text", "id": "cta_label", "label": "Button label", "default": "View Product" },
    { "type": "url", "id": "link", "label": "Button link (used if no product)" }${dir.feature === 'ruled' ? `,
    { "type": "text", "id": "specimen", "label": "Specimen number", "default": "Specimen 01" }` : ''}
  ],
  "blocks": [
    {
      "type": "spec", "name": "Spec line", "limit": 4,
      "settings": [
        {
          "type": "select", "id": "icon", "label": "Icon", "default": "leaf",
          "options": [
            { "value": "leaf", "label": "Leaf" },
            { "value": "cup", "label": "Cup" },
            { "value": "mortar", "label": "Mortar & pestle" },
            { "value": "mountain", "label": "Mountain" },
            { "value": "heart", "label": "Heart" }
          ]
        },${dir.feature === 'ruled' ? `
        { "type": "text", "id": "label", "label": "Row label", "default": "Botanicals", "info": "Shown in the left column of the ruled table." },` : ''}
        { "type": "text", "id": "text", "label": "Text", "default": "20 Pyramid Bags" }
      ]
    }
  ],
  "presets": [{ "name": "Product feature row", "blocks": [{ "type": "spec" }, { "type": "spec" }, { "type": "spec" }] }]
}
{% endschema %}
`;

const sectionIconStrip = `<section class="sect sect--tight{% if section.settings.bg_cream %} sect--cream{% endif %}">
  <div class="wrap">
    <div class="trust" data-rise>
      {%- for block in section.blocks -%}
        <div {{ block.shopify_attributes }}>
          {% render 'icon', name: block.settings.icon, size: 30 %}
          <p>{{ block.settings.text | newline_to_br }}</p>
        </div>
      {%- endfor -%}
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Icon strip",
  "settings": [
    { "type": "checkbox", "id": "bg_cream", "label": "Alternate background", "default": false }
  ],
  "blocks": [
    {
      "type": "item", "name": "Item", "limit": 4,
      "settings": [
        {
          "type": "select", "id": "icon", "label": "Icon", "default": "leaf",
          "options": [
            { "value": "leaf", "label": "Leaf" },
            { "value": "mountain", "label": "Mountain" },
            { "value": "mortar", "label": "Mortar & pestle" },
            { "value": "heart", "label": "Heart" },
            { "value": "cup", "label": "Cup" },
            { "value": "truck", "label": "Truck" }
          ]
        },
        { "type": "textarea", "id": "text", "label": "Text", "default": "Natural\\nIngredients" }
      ]
    }
  ],
  "presets": [
    {
      "name": "Icon strip",
      "blocks": [
        { "type": "item", "settings": { "icon": "leaf", "text": "Natural\\nIngredients" } },
        { "type": "item", "settings": { "icon": "mountain", "text": "Mountain\\nInspired" } },
        { "type": "item", "settings": { "icon": "mortar", "text": "Small Batch\\nMade" } },
        { "type": "item", "settings": { "icon": "heart", "text": "Rituals for\\nMind. Body. Soul." } }
      ]
    }
  ]
}
{% endschema %}
`;

const sectionStory = `<section class="sect sect--green">
  <div class="wrap story">
    <div class="story__media ph" data-rise>
      {%- if section.settings.image != blank -%}
        <img src="{{ section.settings.image | image_url: width: 1400 }}" alt="{{ section.settings.image.alt | escape }}" loading="lazy" width="1400" height="1750">
      {%- else -%}
        <img src="{{ 'morning.png' | asset_url }}" alt="{{ section.settings.heading | escape }}" loading="lazy" width="1254" height="1254">
      {%- endif -%}
    </div>
    <div data-rise="120">
      {%- if section.settings.eyebrow != blank -%}<p class="eyebrow">{{ section.settings.eyebrow }}</p>{%- endif -%}
      <h2>{{ section.settings.heading }}</h2>
      {{ section.settings.body }}
      {%- if section.settings.sig != blank -%}
        <p class="sig">{{ section.settings.sig }}<small>{{ section.settings.sig_sub }}</small></p>
      {%- endif -%}
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Story",
  "settings": [
    { "type": "image_picker", "id": "image", "label": "Image" },
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "Rooted in North Georgia" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Healing starts slowly." },
    { "type": "richtext", "id": "body", "label": "Body", "default": "<p>Root &amp; Ritual was born in the North Georgia mountains, in a kitchen where the herbs came off the ridge and dried in the window over the sink.</p><p>We are not interested in the quick fix. A cup of tea. A walk through the garden. A quiet morning. Small rituals, practiced daily, become the roots of a meaningful life.</p>" },
    { "type": "text", "id": "sig", "label": "Signature", "default": "Guided by tradition. Made for your ritual." },
    { "type": "text", "id": "sig_sub", "label": "Signature subtitle", "default": "Root & Ritual Botanicals" }
  ],
  "presets": [{ "name": "Story" }]
}
{% endschema %}
`;

const sectionReviews = `<section class="sect">
  <div class="wrap">
    <div class="lede" data-rise style="margin-bottom:clamp(2.5rem,5vw,3.5rem)">
      <h2>{{ section.settings.heading }}</h2>
      <div class="rule-mark">{% render 'icon', name: 'heart', size: 16 %}</div>
    </div>
    <div class="revs">
      {%- for block in section.blocks -%}
        <figure class="rev" data-rise="{{ forloop.index0 | times: 100 }}" {{ block.shopify_attributes }}>
          <div class="stars">
            {%- for i in (1..block.settings.stars) -%}{% render 'icon', name: 'star', size: 13 %}{%- endfor -%}
          </div>
          <blockquote>&ldquo;{{ block.settings.quote }}&rdquo;</blockquote>
          <cite>{{ block.settings.author }}</cite>
        </figure>
      {%- endfor -%}
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Reviews",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "What the ritual does." }
  ],
  "blocks": [
    {
      "type": "review", "name": "Review", "limit": 6,
      "settings": [
        { "type": "range", "id": "stars", "label": "Stars", "min": 1, "max": 5, "step": 1, "default": 5 },
        { "type": "textarea", "id": "quote", "label": "Quote", "default": "Replace this with a real customer review." },
        { "type": "text", "id": "author", "label": "Attribution", "default": "Customer name" }
      ]
    }
  ],
  "presets": [
    { "name": "Reviews", "blocks": [{ "type": "review" }, { "type": "review" }, { "type": "review" }] }
  ]
}
{% endschema %}
`;

const sectionNewsletter = `<section class="sect sect--cream sect--tight">
  <div class="wrap news" data-rise>
    <div class="news__orn">{% render 'icon', name: 'lavender', size: 88 %}</div>
    <div>
      <h2>{{ section.settings.heading }}</h2>
      {%- if section.settings.body != blank -%}<p>{{ section.settings.body }}</p>{%- endif -%}
      {%- if section.blocks.size > 0 -%}
        <div class="news__perks">
          {%- for block in section.blocks -%}
            <span {{ block.shopify_attributes }}>{% render 'icon', name: block.settings.icon, size: 15 %} {{ block.settings.text }}</span>
          {%- endfor -%}
        </div>
      {%- endif -%}
    </div>
    {% form 'customer', class: 'news__form' %}
      <input type="hidden" name="contact[tags]" value="newsletter">
      <input type="email" name="contact[email]" placeholder="{{ section.settings.placeholder }}" aria-label="Email address" required>
      <button class="btn" type="submit">{{ section.settings.button }}</button>
      {%- if form.posted_successfully? -%}
        <p style="margin-top:.8rem">{{ section.settings.success }}</p>
      {%- endif -%}
    {% endform %}
  </div>
</section>

{% schema %}
{
  "name": "Newsletter",
  "settings": [
    { "type": "text", "id": "heading", "label": "Heading", "default": "Be the first to know." },
    { "type": "textarea", "id": "body", "label": "Body", "default": "Exclusive offers, new blends, and seasonal rituals delivered to your inbox." },
    { "type": "text", "id": "placeholder", "label": "Field placeholder", "default": "Email address" },
    { "type": "text", "id": "button", "label": "Button label", "default": "Join the Ritual" },
    { "type": "text", "id": "success", "label": "Success message", "default": "Thank you. Check your inbox." }
  ],
  "blocks": [
    {
      "type": "perk", "name": "Perk", "limit": 3,
      "settings": [
        {
          "type": "select", "id": "icon", "label": "Icon", "default": "leaf",
          "options": [
            { "value": "leaf", "label": "Leaf" },
            { "value": "cup", "label": "Cup" },
            { "value": "gift", "label": "Gift" },
            { "value": "mountain", "label": "Mountain" }
          ]
        },
        { "type": "text", "id": "text", "label": "Text", "default": "Exclusive Offers" }
      ]
    }
  ],
  "presets": [
    {
      "name": "Newsletter",
      "blocks": [
        { "type": "perk", "settings": { "icon": "leaf", "text": "Exclusive Offers" } },
        { "type": "perk", "settings": { "icon": "cup", "text": "New Product Drops" } },
        { "type": "perk", "settings": { "icon": "gift", "text": "Rituals & Recipes" } }
      ]
    }
  ]
}
{% endschema %}
`;

/* Every number in this section is computed, never typed.

   The price comes from the connected bundle product. The "bought separately"
   figure is the sum of the connected component products, and the saving is
   derived from those two. If no bundle product is connected there is nothing
   truthful to show, so the price area renders nothing at all rather than a
   placeholder that could reach a real storefront. */
const sectionBundle = `{%- liquid
  assign bundle = section.settings.product
  assign components = section.blocks | where: 'type', 'component'

  assign separately = 0
  for block in components
    if block.settings.product != blank
      assign separately = separately | plus: block.settings.product.price
    endif
  endfor

  assign has_price = false
  if bundle != blank
    assign has_price = true
    assign bundle_price = bundle.price
  endif

  assign saving = 0
  if has_price and separately > bundle_price
    assign saving = separately | minus: bundle_price
    assign saving_pct = saving | times: 100.0 | divided_by: separately | round
  endif
-%}
<section class="sect sect--tight">
  <div class="wrap">
    <div class="bundle" data-rise>
      <div class="bundle__stack">
        {%- if components.size > 0 -%}
          {%- for block in components limit: 2 -%}
            <div class="ph" {{ block.shopify_attributes }}>
              {%- if block.settings.product != blank and block.settings.product.featured_image -%}
                <img src="{{ block.settings.product.featured_image | image_url: width: 900 }}" alt="{{ block.settings.product.title | escape }}" loading="lazy" width="900" height="900">
              {%- else -%}
                <img src="{{ block.settings.fallback | asset_url }}" alt="{{ block.settings.product.title | default: 'Ritual blend' | escape }}" loading="lazy" width="1254" height="1254">
              {%- endif -%}
            </div>
          {%- endfor -%}
        {%- else -%}
          <div class="ph"><img src="{{ 'morning.png' | asset_url }}" alt="Morning Ritual" loading="lazy" width="1254" height="1254"></div>
          <div class="ph"><img src="{{ 'evening.png' | asset_url }}" alt="Evening Ritual" loading="lazy" width="1254" height="1254"></div>
        {%- endif -%}
      </div>
      <div>
        {%- if saving > 0 -%}
          <p class="eyebrow">Save {{ saving_pct }}%</p>
        {%- endif -%}
        <h3>{{ section.settings.heading }}</h3>
        {{ section.settings.body }}
        <div class="feat__foot" style="margin-top:1.8rem">
          {%- if has_price -%}
            <span class="price">
              {{ bundle_price | money }}
              {%- if saving > 0 -%}<small>{{ separately | money }} bought separately</small>{%- endif -%}
            </span>
          {%- endif -%}
          {%- if bundle != blank -%}
            {% form 'product', bundle %}
              <input type="hidden" name="id" value="{{ bundle.selected_or_first_available_variant.id }}">
              <button class="btn btn--orange" type="submit"{% unless bundle.available %} disabled{% endunless %}>
                {% if bundle.available %}{{ section.settings.cta }}{% else %}Sold out{% endif %}
              </button>
            {% endform %}
          {%- else -%}
            <a class="btn btn--orange" href="{{ routes.all_products_collection_url }}">{{ section.settings.cta }}</a>
          {%- endif -%}
        </div>
      </div>
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Bundle offer",
  "settings": [
    { "type": "product", "id": "product", "label": "Bundle product", "info": "The price and the add-to-cart button both come from this product. Leave empty and no price is shown." },
    { "type": "text", "id": "heading", "label": "Heading", "default": "The Full Ritual Set" },
    { "type": "richtext", "id": "body", "label": "Body", "default": "<p>Both blends together, the way they are meant to be used. One to open the day, one to close it.</p>" },
    { "type": "text", "id": "cta", "label": "Button label", "default": "Add Set to Cart" }
  ],
  "blocks": [
    {
      "type": "component", "name": "Included product", "limit": 2,
      "settings": [
        { "type": "product", "id": "product", "label": "Product", "info": "Used for the photo and for the 'bought separately' total." },
        {
          "type": "select", "id": "fallback", "label": "Fallback photo", "default": "morning.png",
          "options": [
            { "value": "morning.png", "label": "Morning Ritual" },
            { "value": "evening.png", "label": "Evening Ritual" }
          ]
        }
      ]
    }
  ],
  "presets": [
    {
      "name": "Bundle offer",
      "blocks": [
        { "type": "component", "settings": { "fallback": "morning.png" } },
        { "type": "component", "settings": { "fallback": "evening.png" } }
      ]
    }
  ]
}
{% endschema %}
`;

/* The variant picker.

   The select is the source of truth and carries name="id", so the form submits
   correctly with no JavaScript at all. The chips are progressive enhancement:
   they are hidden until the .js class lands on <html>, and all they do is set
   the select's value and fire a change event. That way a broken or blocked
   script can never cause the wrong variant to be added to a cart, which is the
   failure the previous build was right to avoid. */
const variantPicker = `        {%- if product.has_only_default_variant -%}
          <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">
        {%- else -%}
          <div class="opts" data-picker>
            {%- for option in product.options_with_values -%}
              <div class="opt" data-opt-index="{{ forloop.index0 }}">
                <h4>{{ option.name }}</h4>
                <div class="chips" role="group" aria-label="{{ option.name | escape }}">
                  {%- for value in option.values -%}
                    <button type="button"
                            data-chip
                            data-opt="{{ forloop.parentloop.index0 }}"
                            data-value="{{ value | escape }}"
                            aria-pressed="{% if option.selected_value == value %}true{% else %}false{% endif %}">{{ value }}</button>
                  {%- endfor -%}
                </div>
              </div>
            {%- endfor -%}
          </div>

          <div class="opts opts--fallback">
            <div>
              <h4>Options</h4>
              <select name="id" class="variant-select" data-picker-select aria-label="Choose an option">
                {%- for variant in product.variants -%}
                  <option value="{{ variant.id }}"
                          data-options="{{ variant.options | join: '~~' | escape }}"
                          {% if variant == product.selected_or_first_available_variant %}selected{% endif %}
                          {% unless variant.available %}disabled{% endunless %}>
                    {{ variant.title }} &middot; {{ variant.price | money }}{% unless variant.available %} (sold out){% endunless %}
                  </option>
                {%- endfor -%}
              </select>
            </div>
          </div>

          {%- capture variant_json -%}
            [
              {%- for variant in product.variants -%}
                {
                  "id": {{ variant.id }},
                  "options": {{ variant.options | json }},
                  "available": {{ variant.available | json }},
                  "price": {{ variant.price | json }},
                  "price_formatted": {{ variant.price | money | json }},
                  "compare_at": {{ variant.compare_at_price | json }},
                  "image": {%- if variant.featured_image -%}{{ variant.featured_image | image_url: width: 1400 | json }}{%- else -%}null{%- endif -%}
                }{%- unless forloop.last -%},{%- endunless -%}
              {%- endfor -%}
            ]
          {%- endcapture -%}
          <script type="application/json" data-variant-data>{{ variant_json }}</script>
        {%- endif -%}
`;

const productGallery = (dir) => dir.frame === 'bare'
  // Photography forward: every frame at full size, stacked, no thumbnail rail.
  ? `      <div class="gal gal--stack">
        {%- if product.images.size > 0 -%}
          {%- for image in product.images -%}
            <div class="gal__frame ph"{% if forloop.first %} data-gallery-main{% endif %}>
              <img src="{{ image | image_url: width: 1600 }}" alt="{{ image.alt | escape }}"{% if forloop.first %} fetchpriority="high"{% else %} loading="lazy"{% endif %} width="1600" height="1600">
            </div>
          {%- endfor -%}
        {%- else -%}
          <div class="gal__frame ph" data-gallery-main><img src="{{ 'morning.png' | asset_url }}" alt="{{ product.title | escape }}" width="1254" height="1254"></div>
          <div class="gal__frame ph"><img src="{{ 'evening.png' | asset_url }}" alt="Pairs with" loading="lazy" width="1254" height="1254"></div>
        {%- endif -%}
      </div>
`
  : `      <div class="gal">
        <div class="gal__main ph" data-gallery-main>
          {%- if product.featured_image -%}
            <img src="{{ product.featured_image | image_url: width: 1400 }}" alt="{{ product.title | escape }}" width="1400" height="1400">
          {%- else -%}
            <img src="{{ 'morning.png' | asset_url }}" alt="{{ product.title | escape }}" width="1254" height="1254">
          {%- endif -%}
        </div>
        <div class="gal__thumbs">
          {%- if product.images.size > 0 -%}
            {%- for image in product.images limit: 4 -%}
              <button data-gallery-thumb data-pos="50% 50%"{% if forloop.first %} class="is-sel"{% endif %} type="button">
                <img src="{{ image | image_url: width: 300 }}" alt="{{ image.alt | escape }}" loading="lazy" width="300" height="300">
              </button>
            {%- endfor -%}
          {%- else -%}
            <button data-gallery-thumb data-pos="50% 46%" class="is-sel" type="button"><img src="{{ 'morning.png' | asset_url }}" alt="Front" loading="lazy" width="300" height="300"></button>
            <button data-gallery-thumb data-pos="50% 8%" type="button"><img src="{{ 'morning.png' | asset_url }}" alt="Setting" loading="lazy" width="300" height="300"></button>
            <button data-gallery-thumb data-pos="50% 92%" type="button"><img src="{{ 'morning.png' | asset_url }}" alt="Detail" loading="lazy" width="300" height="300"></button>
            <button data-gallery-thumb data-pos="50% 46%" type="button"><img src="{{ 'evening.png' | asset_url }}" alt="Pairs with" loading="lazy" width="300" height="300"></button>
          {%- endif -%}
        </div>
      </div>
`;

const sectionMainProduct = (dir) => `<div class="sect">
  <div class="wrap">
    <p class="crumbs">
      <a href="{{ routes.root_url }}">Home</a> /
      <a href="{{ routes.all_products_collection_url }}">Shop</a> / {{ product.title }}
    </p>

    <div class="pdp pdp--${dir.frame}" data-gallery>
${productGallery(dir)}
      <div class="pinfo">
        {%- if section.settings.eyebrow != blank -%}
          <p class="eyebrow" style="color:var(--orange);margin-bottom:.9rem">{{ section.settings.eyebrow }}</p>
        {%- endif -%}
        <h1>{{ product.title }}</h1>
        {%- if product.metafields.custom.tagline -%}
          <p class="feat__tag">{{ product.metafields.custom.tagline }}</p>
        {%- endif -%}

        <p class="pinfo__price" data-price>{{ product.price | money }}</p>

        <div class="rte">{{ product.description }}</div>

        {% form 'product', product %}
${variantPicker}
          <div class="buyrow">
            <div class="stepper" data-qty>
              <button type="button" data-qty-step="-1" aria-label="Decrease">{% render 'icon', name: 'minus', size: 15 %}</button>
              <span data-qty-val>1</span>
              <button type="button" data-qty-step="1" aria-label="Increase">{% render 'icon', name: 'plus', size: 15 %}</button>
            </div>
            <input type="hidden" name="quantity" value="1" data-qty-input>
            <button class="btn" type="submit" data-add{% unless product.available %} disabled{% endunless %}>
              <span data-add-label>{% if product.available %}Add to Cart{% else %}Sold out{% endif %}</span>
              {%- if product.available -%}<span data-add-price>&middot; {{ product.selected_or_first_available_variant.price | money }}</span>{%- endif -%}
            </button>
          </div>
        {% endform %}

${dir.frame === 'ruled' ? `        {%- assign spec_rows = section.blocks | where: 'type', 'spec' -%}
        {%- if spec_rows.size > 0 -%}
          <dl class="pinfo__table">
            {%- for block in spec_rows -%}
              <div {{ block.shopify_attributes }}>
                <dt>{{ block.settings.label }}</dt>
                <dd>{{ block.settings.text }}</dd>
              </div>
            {%- endfor -%}
          </dl>
        {%- endif -%}

` : ''}        <div class="reassure">
          {%- for block in section.blocks -%}
            {%- if block.type == 'reassure' -%}
              <span {{ block.shopify_attributes }}>{% render 'icon', name: block.settings.icon, size: 15 %} {{ block.settings.text }}</span>
            {%- endif -%}
          {%- endfor -%}
        </div>

        <div class="acc">
          {%- for block in section.blocks -%}
            {%- if block.type == 'accordion' -%}
              <div class="acc__item{% if forloop.first %} is-open{% endif %}" data-acc {{ block.shopify_attributes }}>
                <button type="button" aria-expanded="{% if forloop.first %}true{% else %}false{% endif %}">
                  {{ block.settings.heading }} {% render 'icon', name: 'plus', size: 14 %}
                </button>
                <div class="acc__panel"><div>{{ block.settings.body }}</div></div>
              </div>
            {%- endif -%}
          {%- endfor -%}
        </div>
      </div>
    </div>
  </div>
</div>

{% schema %}
{
  "name": "Product",
  "settings": [
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "Blend No. 01" }
  ],
  "blocks": [
    {
      "type": "reassure", "name": "Reassurance line", "limit": 4,
      "settings": [
        {
          "type": "select", "id": "icon", "label": "Icon", "default": "truck",
          "options": [
            { "value": "truck", "label": "Truck" },
            { "value": "leaf", "label": "Leaf" },
            { "value": "mortar", "label": "Mortar & pestle" },
            { "value": "heart", "label": "Heart" }
          ]
        },
        { "type": "text", "id": "text", "label": "Text", "default": "Ships in 1-2 days" }
      ]
    },
    {
      "type": "accordion", "name": "Accordion", "limit": 5,
      "settings": [
        { "type": "text", "id": "heading", "label": "Heading", "default": "Ingredients" },
        { "type": "richtext", "id": "body", "label": "Body", "default": "<p>List the ingredients here.</p>" }
      ]
    }${dir.frame === 'ruled' ? `,
    {
      "type": "spec", "name": "Spec row", "limit": 6,
      "settings": [
        { "type": "text", "id": "label", "label": "Label", "default": "Steep time" },
        { "type": "text", "id": "text", "label": "Value", "default": "3 to 4 minutes" }
      ]
    }` : ''}
  ]
}
{% endschema %}
`;

const sectionMainCollection = `<section class="phead">
  <div class="wrap">
    <p class="crumbs"><a href="{{ routes.root_url }}">Home</a> / {{ collection.title | default: 'Shop' }}</p>
    <h1>{{ collection.title | default: 'The Collection' }}</h1>
    {%- if collection.description != blank -%}
      <p>{{ collection.description | strip_html }}</p>
    {%- else -%}
      <p>{{ section.settings.blurb }}</p>
    {%- endif -%}
  </div>
</section>

<div class="sect">
  <div class="wrap">
    <div class="shop2">
      {%- if collection.products.size > 0 -%}
        {%- for product in collection.products -%}
          {% render 'product-card', product: product %}
        {%- endfor -%}
      {%- else -%}
        {% render 'product-card',
            fallback_title: 'Morning Ritual',             fallback_asset: 'morning.png', eyebrow: 'Blend No. 01',
            tagline: 'Awaken. Ground. Begin.', badge: 'Best Seller',
            blurb: 'Green tea, peppermint, ginger root and prunella vulgaris. A clean lift with no crash.',
            meta_a: '20 Bags', meta_b: 'Caffeinated' %}
        {% render 'product-card',
            fallback_title: 'Evening Ritual',             fallback_asset: 'evening.png', eyebrow: 'Blend No. 02',
            tagline: 'Calm. Unwind. Restore.', badge: 'Caffeine Free',
            blurb: 'Chamomile, lavender, lemon balm and prunella vulgaris. The hour before bed, made deliberate.',
            meta_a: '20 Bags', meta_b: 'Caffeine Free' %}
      {%- endif -%}
    </div>
  </div>
</div>

{% schema %}
{
  "name": "Collection",
  "settings": [
    { "type": "textarea", "id": "blurb", "label": "Fallback description", "default": "Two blends. One for the beginning of the day, one for the end of it. Both blended by hand in the North Georgia mountains." }
  ]
}
{% endschema %}
`;

const sectionMainPage = `<section class="phead">
  <div class="wrap">
    <p class="crumbs"><a href="{{ routes.root_url }}">Home</a> / {{ page.title }}</p>
    <h1>{{ page.title }}</h1>
  </div>
</section>

<div class="sect">
  <div class="wrap prose rte" data-rise>
    {{ page.content }}
  </div>
</div>

{% schema %}
{ "name": "Page content" }
{% endschema %}
`;

const sectionMainCart = `<section class="phead"><div class="wrap"><h1>Your Cart</h1></div></section>
<div class="sect">
  <div class="wrap prose">
    {%- if cart.item_count > 0 -%}
      {% form 'cart', cart %}
        {%- for item in cart.items -%}
          <div class="pcard__foot" style="border-top:0;border-bottom:1px solid rgba(128,128,128,.25)">
            <span>{{ item.quantity }} &times; <a href="{{ item.url }}">{{ item.product.title }}</a></span>
            <span class="price">{{ item.final_line_price | money }}</span>
          </div>
        {%- endfor -%}
        <div class="feat__foot" style="margin-top:2rem">
          <span class="price">Subtotal {{ cart.total_price | money }}</span>
          <button class="btn" type="submit" name="checkout">Checkout</button>
        </div>
      {% endform %}
    {%- else -%}
      <p>Your cart is empty.</p>
      <p><a class="btn" href="{{ routes.all_products_collection_url }}">Shop the Collection</a></p>
    {%- endif -%}
  </div>
</div>

{% schema %}
{ "name": "Cart" }
{% endschema %}
`;

const sectionMainSearch = `<section class="phead"><div class="wrap"><h1>Search</h1></div></section>
<div class="sect">
  <div class="wrap prose">
    <form action="{{ routes.search_url }}" method="get" class="news__form">
      <input type="search" name="q" value="{{ search.terms | escape }}" placeholder="Search" aria-label="Search">
      <button class="btn" type="submit">Search</button>
    </form>
    {%- if search.performed -%}
      <p style="margin-top:2rem">{{ search.results_count }} results.</p>
      <div class="shop2">
        {%- for item in search.results -%}
          {%- if item.object_type == 'product' -%}{% render 'product-card', product: item %}{%- endif -%}
        {%- endfor -%}
      </div>
    {%- endif -%}
  </div>
</div>

{% schema %}
{ "name": "Search" }
{% endschema %}
`;

const sectionMain404 = `<section class="phead">
  <div class="wrap">
    <h1>Page not found</h1>
    <p>That page has wandered off the ridge.</p>
  </div>
</section>
<div class="sect">
  <div class="wrap prose" style="text-align:center">
    <a class="btn" href="{{ routes.root_url }}">Back to Home</a>
  </div>
</div>

{% schema %}
{ "name": "404" }
{% endschema %}
`;

const sectionMainList = `<section class="phead"><div class="wrap"><h1>Collections</h1></div></section>
<div class="sect"><div class="wrap"><div class="shop2">
  {%- for collection in collections -%}
    <a class="pcard" href="{{ collection.url }}">
      <div class="pcard__media">
        <img src="{% if collection.image %}{{ collection.image | image_url: width: 900 }}{% else %}{{ 'morning.png' | asset_url }}{% endif %}" alt="{{ collection.title | escape }}" loading="lazy" width="900" height="900">
      </div>
      <div class="pcard__body"><h3>{{ collection.title }}</h3></div>
    </a>
  {%- endfor -%}
</div></div></div>

{% schema %}
{ "name": "Collections list" }
{% endschema %}
`;

const sectionMainBlog = `<section class="phead"><div class="wrap"><h1>{{ blog.title }}</h1></div></section>
<div class="sect"><div class="wrap prose">
  {%- for article in blog.articles -%}
    <h2><a href="{{ article.url }}" style="text-decoration:none">{{ article.title }}</a></h2>
    <p>{{ article.excerpt_or_content | strip_html | truncatewords: 40 }}</p>
  {%- endfor -%}
</div></div>

{% schema %}
{ "name": "Blog" }
{% endschema %}
`;

const sectionMainArticle = `<section class="phead"><div class="wrap"><h1>{{ article.title }}</h1></div></section>
<div class="sect"><div class="wrap prose rte">{{ article.content }}</div></div>

{% schema %}
{ "name": "Article" }
{% endschema %}
`;

const sectionContactForm = `<section class="phead">
  <div class="wrap">
    <p class="crumbs"><a href="{{ routes.root_url }}">Home</a> / {{ page.title | default: 'Contact' }}</p>
    <h1>{{ page.title | default: 'Contact' }}</h1>
    {%- if section.settings.blurb != blank -%}<p>{{ section.settings.blurb }}</p>{%- endif -%}
  </div>
</section>

<div class="sect">
  <div class="wrap prose" data-rise>
    {%- if page.content != blank -%}<div class="rte">{{ page.content }}</div>{%- endif -%}

    {% form 'contact' %}
      {%- if form.posted_successfully? -%}
        <p class="form__ok">{{ section.settings.success }}</p>
      {%- endif -%}

      {%- if form.errors -%}
        <ul class="form__errors">
          {%- for field in form.errors -%}
            <li>{{ form.errors.messages[field] }}</li>
          {%- endfor -%}
        </ul>
      {%- endif -%}

      <div class="field">
        <label for="ContactName">Name</label>
        <input type="text" id="ContactName" name="contact[name]" value="{{ form.name }}" autocomplete="name" required>
      </div>
      <div class="field">
        <label for="ContactEmail">Email</label>
        <input type="email" id="ContactEmail" name="contact[email]" value="{{ form.email }}" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="ContactPhone">Phone</label>
        <input type="tel" id="ContactPhone" name="contact[phone]" value="{{ form.phone }}" autocomplete="tel">
      </div>
      <div class="field">
        <label for="ContactBody">Message</label>
        <textarea id="ContactBody" name="contact[body]" rows="7" required>{{ form.body }}</textarea>
      </div>
      <button class="btn" type="submit">{{ section.settings.button }}</button>
    {% endform %}
  </div>
</div>

{% schema %}
{
  "name": "Contact form",
  "settings": [
    { "type": "textarea", "id": "blurb", "label": "Intro", "default": "Questions about a blend, an order, or a wholesale enquiry. We read every one." },
    { "type": "text", "id": "button", "label": "Button label", "default": "Send Message" },
    { "type": "text", "id": "success", "label": "Success message", "default": "Thank you. We will be in touch shortly." }
  ],
  "presets": [{ "name": "Contact form" }]
}
{% endschema %}
`;

const sectionFaq = `<section class="phead">
  <div class="wrap">
    <p class="crumbs"><a href="{{ routes.root_url }}">Home</a> / {{ page.title | default: 'FAQ' }}</p>
    <h1>{{ page.title | default: 'Questions' }}</h1>
  </div>
</section>

<div class="sect">
  <div class="wrap prose" data-rise>
    {%- if page.content != blank -%}<div class="rte">{{ page.content }}</div>{%- endif -%}
    <div class="acc">
      {%- for block in section.blocks -%}
        <div class="acc__item{% if forloop.first %} is-open{% endif %}" data-acc {{ block.shopify_attributes }}>
          <button type="button" aria-expanded="{% if forloop.first %}true{% else %}false{% endif %}">
            {{ block.settings.q }} {% render 'icon', name: 'plus', size: 14 %}
          </button>
          <div class="acc__panel"><div>{{ block.settings.a }}</div></div>
        </div>
      {%- endfor -%}
    </div>
  </div>
</div>

{% schema %}
{
  "name": "FAQ",
  "blocks": [
    {
      "type": "qa", "name": "Question", "limit": 20,
      "settings": [
        { "type": "text", "id": "q", "label": "Question", "default": "How long does shipping take?" },
        { "type": "richtext", "id": "a", "label": "Answer", "default": "<p>Orders leave the workshop within one to two business days.</p>" }
      ]
    }
  ],
  "presets": [{ "name": "FAQ", "blocks": [{ "type": "qa" }, { "type": "qa" }, { "type": "qa" }] }]
}
{% endschema %}
`;

/* ------------------------------------------------- customer account pages

   These are plain Liquid templates rather than JSON section templates. The
   account pages are forms, not merchandising surfaces, so there is nothing for
   a merchant to rearrange in the theme editor, and Liquid templates are
   supported by every Shopify plan without qualification. */
const customerShell = (heading, body) => `<section class="phead">
  <div class="wrap">
    <p class="crumbs"><a href="{{ routes.root_url }}">Home</a> / ${heading}</p>
    <h1>${heading}</h1>
  </div>
</section>

<div class="sect">
  <div class="wrap prose account" data-rise>
${body}  </div>
</div>
`;

const formErrors = `      {%- if form.errors -%}
        <ul class="form__errors">
          {%- for field in form.errors -%}
            <li>{{ form.errors.messages[field] }}</li>
          {%- endfor -%}
        </ul>
      {%- endif -%}
`;

const customerLogin = customerShell('Login', `    {% form 'customer_login' %}
${formErrors}      <div class="field">
        <label for="CustomerEmail">Email</label>
        <input type="email" id="CustomerEmail" name="customer[email]" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="CustomerPassword">Password</label>
        <input type="password" id="CustomerPassword" name="customer[password]" autocomplete="current-password" required>
      </div>
      <button class="btn" type="submit">Sign In</button>
      <p class="account__alt">
        <a href="#recover" onclick="document.getElementById('RecoverForm').hidden=false;return false;">Forgot your password?</a>
        &middot;
        <a href="{{ routes.account_register_url }}">Create an account</a>
      </p>
    {% endform %}

    <div id="RecoverForm" hidden>
      {% form 'recover_customer_password' %}
${formErrors}        {%- if form.posted_successfully? -%}
          <p class="form__ok">We have sent you an email with a link to reset your password.</p>
        {%- endif -%}
        <div class="field">
          <label for="RecoverEmail">Email</label>
          <input type="email" id="RecoverEmail" name="email" autocomplete="email" required>
        </div>
        <button class="btn" type="submit">Send Reset Link</button>
      {% endform %}
    </div>
`);

const customerRegister = customerShell('Create Account', `    {% form 'create_customer' %}
${formErrors}      <div class="field">
        <label for="RegisterFirst">First name</label>
        <input type="text" id="RegisterFirst" name="customer[first_name]" autocomplete="given-name">
      </div>
      <div class="field">
        <label for="RegisterLast">Last name</label>
        <input type="text" id="RegisterLast" name="customer[last_name]" autocomplete="family-name">
      </div>
      <div class="field">
        <label for="RegisterEmail">Email</label>
        <input type="email" id="RegisterEmail" name="customer[email]" autocomplete="email" required>
      </div>
      <div class="field">
        <label for="RegisterPassword">Password</label>
        <input type="password" id="RegisterPassword" name="customer[password]" autocomplete="new-password" required>
      </div>
      <button class="btn" type="submit">Create Account</button>
      <p class="account__alt"><a href="{{ routes.account_login_url }}">Already have an account?</a></p>
    {% endform %}
`);

const customerAccount = customerShell('Account', `    <p class="account__hello">{{ customer.name | default: customer.email }}</p>
    <p class="account__alt">
      <a href="{{ routes.account_addresses_url }}">Addresses</a> &middot;
      {{ 'Log out' | customer_logout_link }}
    </p>

    <h2>Order history</h2>
    {%- paginate customer.orders by 20 -%}
      {%- if customer.orders.size > 0 -%}
        <table class="account__table">
          <thead>
            <tr><th>Order</th><th>Date</th><th>Payment</th><th>Fulfillment</th><th>Total</th></tr>
          </thead>
          <tbody>
            {%- for order in customer.orders -%}
              <tr>
                <td><a href="{{ order.customer_url }}">{{ order.name }}</a></td>
                <td>{{ order.created_at | date: '%d %B %Y' }}</td>
                <td>{{ order.financial_status_label }}</td>
                <td>{{ order.fulfillment_status_label }}</td>
                <td>{{ order.total_net_amount | money }}</td>
              </tr>
            {%- endfor -%}
          </tbody>
        </table>
        {{ paginate | default_pagination }}
      {%- else -%}
        <p>You have not placed any orders yet.</p>
        <p><a class="btn" href="{{ routes.all_products_collection_url }}">Shop the Collection</a></p>
      {%- endif -%}
    {%- endpaginate -%}
`);

const customerOrder = customerShell('Order {{ order.name }}', `    <p class="account__alt">Placed {{ order.created_at | date: '%d %B %Y' }}</p>

    <table class="account__table">
      <thead><tr><th>Item</th><th>Qty</th><th>Total</th></tr></thead>
      <tbody>
        {%- for line in order.line_items -%}
          <tr>
            <td>{{ line.title }}</td>
            <td>{{ line.quantity }}</td>
            <td>{{ line.final_line_price | money }}</td>
          </tr>
        {%- endfor -%}
      </tbody>
      <tfoot>
        <tr><th>Subtotal</th><td></td><td>{{ order.subtotal_price | money }}</td></tr>
        {%- for shipping in order.shipping_methods -%}
          <tr><th>Shipping</th><td>{{ shipping.title }}</td><td>{{ shipping.price | money }}</td></tr>
        {%- endfor -%}
        {%- for tax in order.tax_lines -%}
          <tr><th>Tax</th><td>{{ tax.title }}</td><td>{{ tax.price | money }}</td></tr>
        {%- endfor -%}
        <tr><th>Total</th><td></td><td>{{ order.total_price | money }}</td></tr>
      </tfoot>
    </table>

    <h2>Shipping address</h2>
    <p>{{ order.shipping_address | format_address }}</p>
    <p class="account__alt"><a href="{{ routes.account_url }}">Back to account</a></p>
`);

const customerAddresses = customerShell('Addresses', `    {%- paginate customer.addresses by 10 -%}
      {% form 'customer_address', customer.new_address %}
${formErrors}        <h2>Add a new address</h2>
        <div class="field">
          <label for="AddressFirst">First name</label>
          <input type="text" id="AddressFirst" name="address[first_name]" autocomplete="given-name">
        </div>
        <div class="field">
          <label for="AddressLast">Last name</label>
          <input type="text" id="AddressLast" name="address[last_name]" autocomplete="family-name">
        </div>
        <div class="field">
          <label for="AddressStreet">Address</label>
          <input type="text" id="AddressStreet" name="address[address1]" autocomplete="address-line1">
        </div>
        <div class="field">
          <label for="AddressCity">City</label>
          <input type="text" id="AddressCity" name="address[city]" autocomplete="address-level2">
        </div>
        <div class="field">
          <label for="AddressZip">Postal code</label>
          <input type="text" id="AddressZip" name="address[zip]" autocomplete="postal-code">
        </div>
        <div class="field">
          <label for="AddressCountry">Country</label>
          <select id="AddressCountry" name="address[country]" data-default="{{ form.country }}">{{ country_option_tags }}</select>
        </div>
        <button class="btn" type="submit">Add Address</button>
      {% endform %}

      {%- if customer.addresses.size > 0 -%}
        <h2>Saved addresses</h2>
        {%- for address in customer.addresses -%}
          <div class="account__addr">
            <p>{{ address | format_address }}</p>
            <p class="account__alt">
              <a href="{{ routes.account_addresses_url }}/{{ address.id }}">Edit</a>
              {%- comment -%}
                Deleting posts a form with an overridden method. The old
                customer_address_delete_link filter no longer exists.
              {%- endcomment -%}
              <form method="post" action="{{ routes.account_addresses_url }}/{{ address.id }}" class="account__del">
                <input type="hidden" name="_method" value="delete">
                <button type="submit">Delete</button>
              </form>
            </p>
          </div>
        {%- endfor -%}
        {{ paginate | default_pagination }}
      {%- endif -%}
    {%- endpaginate -%}

    <p class="account__alt"><a href="{{ routes.account_url }}">Back to account</a></p>
`);

const customerActivate = customerShell('Activate Account', `    {% form 'activate_customer_password' %}
${formErrors}      <div class="field">
        <label for="ActivatePassword">Password</label>
        <input type="password" id="ActivatePassword" name="customer[password]" autocomplete="new-password" required>
      </div>
      <div class="field">
        <label for="ActivateConfirm">Confirm password</label>
        <input type="password" id="ActivateConfirm" name="customer[password_confirmation]" autocomplete="new-password" required>
      </div>
      <button class="btn" type="submit">Activate Account</button>
      <button class="btn btn--ghost" type="submit" name="decline">Decline Invitation</button>
    {% endform %}
`);

const customerResetPassword = customerShell('Reset Password', `    {% form 'reset_customer_password' %}
${formErrors}      <div class="field">
        <label for="ResetPassword">New password</label>
        <input type="password" id="ResetPassword" name="customer[password]" autocomplete="new-password" required>
      </div>
      <div class="field">
        <label for="ResetConfirm">Confirm password</label>
        <input type="password" id="ResetConfirm" name="customer[password_confirmation]" autocomplete="new-password" required>
      </div>
      <button class="btn" type="submit">Reset Password</button>
    {% endform %}
`);

/* The gift card page is opened from an email and is often printed, so it is
   deliberately plain: the code, the balance, and nothing competing with them. */
const templateGiftCard = `<div class="sect">
  <div class="wrap prose giftcard" data-rise>
    <p class="eyebrow">{{ shop.name }}</p>
    <h1>Gift Card</h1>
    <p class="giftcard__value">{{ gift_card.balance | money }}</p>
    {%- if gift_card.balance != gift_card.initial_value -%}
      <p class="account__alt">Originally {{ gift_card.initial_value | money }}</p>
    {%- endif -%}

    <div class="giftcard__code"><span>{{ gift_card.code | format_code }}</span></div>

    {%- if gift_card.qr_identifier -%}
      <img class="giftcard__qr" src="{{ gift_card | image_url: width: 200 }}" alt="Gift card QR code" width="200" height="200">
    {%- endif -%}

    {%- if gift_card.expired -%}
      <p class="form__errors">This gift card expired on {{ gift_card.expires_on | date: '%d %B %Y' }}.</p>
    {%- elsif gift_card.expires_on -%}
      <p class="account__alt">Expires {{ gift_card.expires_on | date: '%d %B %Y' }}</p>
    {%- endif -%}

    <p><a class="btn" href="{{ shop.url }}">Shop the Collection</a></p>
  </div>
</div>
`;

/* The password page uses its own layout: no header, no footer, no navigation
   to a store that is not open yet. */
const layoutPassword = `<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ shop.name }}</title>
  {{ FONT_LINK }}
  {{ 'theme.css' | asset_url | stylesheet_tag }}
  <script>document.documentElement.className += " js";</script>
  {{ content_for_header }}
</head>
<body class="template-password">
  <main id="MainContent" role="main">
    {{ content_for_layout }}
  </main>
  <script src="{{ 'icons.js' | asset_url }}" defer></script>
</body>
</html>
`.replace('{{ FONT_LINK }}', FONT_LINK);

const sectionMainPassword = `<section class="pwd">
  <div class="wrap pwd__in">
    <div class="pwd__mark">{% render 'icon', name: 'mountain', size: 56 %}</div>
    <h1>{{ shop.name }}</h1>
    <p class="pwd__creed">{{ section.settings.message }}</p>

    <div class="pwd__forms">
      {% form 'customer' %}
        <input type="hidden" name="contact[tags]" value="prelaunch">
        <label for="PasswordEmail" class="eyebrow">{{ section.settings.signup_label }}</label>
        <div class="news__form">
          <input type="email" id="PasswordEmail" name="contact[email]" placeholder="Email address" required>
          <button class="btn" type="submit">Notify Me</button>
        </div>
        {%- if form.posted_successfully? -%}<p class="form__ok">Thank you. We will let you know.</p>{%- endif -%}
      {% endform %}

      {% form 'storefront_password' %}
        <label for="StorePassword" class="eyebrow">Enter using password</label>
        <div class="news__form">
          <input type="password" id="StorePassword" name="password" placeholder="Password" required>
          <button class="btn btn--ghost" type="submit">Enter</button>
        </div>
        {%- if form.errors -%}<p class="form__errors">{{ form.errors.messages['form'] }}</p>{%- endif -%}
      {% endform %}
    </div>
  </div>
</section>

{% schema %}
{
  "name": "Password page",
  "settings": [
    { "type": "textarea", "id": "message", "label": "Message", "default": "Something is steeping. Leave your email and we will tell you the moment the doors open." },
    { "type": "text", "id": "signup_label", "label": "Signup label", "default": "Be the first to know" }
  ]
}
{% endschema %}
`;

/* --------------------------------------------------------- section groups */
const headerGroup = JSON.stringify({
  type: 'header',
  name: 'Header',
  sections: {
    announcement: { type: 'announcement', settings: { text: 'Free shipping on orders over $50' } },
    header: { type: 'header', settings: {} },
  },
  order: ['announcement', 'header'],
}, null, 2);

const footerGroup = JSON.stringify({
  type: 'footer',
  name: 'Footer',
  sections: {
    footer: {
      type: 'footer',
      blocks: {
        shop: { type: 'menu', settings: { heading: 'Shop' } },
        connect: { type: 'menu', settings: { heading: 'Connect' } },
        social: { type: 'social', settings: { heading: 'Follow Along' } },
      },
      block_order: ['shop', 'connect', 'social'],
      settings: {},
    },
  },
  order: ['footer'],
}, null, 2);

/* ------------------------------------------------------------- templates */

/* Two hero variants take blocks. Seed them here so an uploaded theme looks
   finished before anyone opens the editor. */
function heroSeed(dir) {
  if (dir.hero === 'immersive') {
    return {
      type: 'hero',
      blocks: {
        m1: { type: 'mark', settings: { icon: 'leaf', text: 'Small batch' } },
        m2: { type: 'mark', settings: { icon: 'mountain', text: 'North Georgia' } },
        m3: { type: 'mark', settings: { icon: 'truck', text: 'Free over $50' } },
      },
      block_order: ['m1', 'm2', 'm3'],
      settings: {},
    };
  }
  if (dir.hero === 'masthead') {
    return {
      type: 'hero',
      blocks: {
        s1: { type: 'spec', settings: { label: 'Origin', text: 'North Georgia' } },
        s2: { type: 'spec', settings: { label: 'Method', text: 'Hand blended' } },
        s3: { type: 'spec', settings: { label: 'Batch', text: 'Small, seasonal' } },
      },
      block_order: ['s1', 's2', 's3'],
      settings: {},
    };
  }
  return { type: 'hero', settings: {} };
}

/* A feature spec block. The ruled direction renders these as a two-column
   table and so needs the label; the others only ever show the icon and text. */
const spec = (dir, icon, label, text) => ({
  type: 'spec',
  settings: dir.feature === 'ruled' ? { icon, label, text } : { icon, text },
});

const templateIndex = (dir) => JSON.stringify({
  sections: {
    hero: heroSeed(dir),
    intro: { type: 'rich-text', settings: {} },
    feature_a: {
      type: 'product-feature',
      blocks: {
        s1: spec(dir, 'leaf', 'Botanicals', 'Green Tea & Peppermint'),
        s2: spec(dir, 'cup', 'Format', '20 Pyramid Bags'),
        s3: spec(dir, 'mortar', 'Steep', '3 to 4 minutes'),
      },
      block_order: ['s1', 's2', 's3'],
      settings: {
        fallback: 'morning.png', flip: false, eyebrow: 'Blend No. 01', badge: 'Best Seller',
        heading: 'Morning Ritual', tagline: 'Awaken. Ground. Begin.',
        ...(dir.feature === 'ruled' ? { specimen: 'Specimen 01' } : {}),
      },
    },
    feature_b: {
      type: 'product-feature',
      blocks: {
        s1: spec(dir, 'leaf', 'Botanicals', 'Chamomile & Lavender'),
        s2: spec(dir, 'cup', 'Format', '20 Pyramid Bags'),
        s3: spec(dir, 'mortar', 'Steep', '3 to 5 minutes'),
      },
      block_order: ['s1', 's2', 's3'],
      settings: {
        fallback: 'evening.png', flip: true, eyebrow: 'Blend No. 02', badge: 'Caffeine Free',
        heading: 'Evening Ritual', tagline: 'Calm. Unwind. Restore.',
        body: 'Chamomile and lavender for the shoulders. Lemon balm for the mind that will not stop running. Brewed the hour before bed, every night, until the body learns what the cup means.',
        ...(dir.feature === 'ruled' ? { specimen: 'Specimen 02' } : {}),
      },
    },
    icons: {
      type: 'icon-strip',
      blocks: {
        b1: { type: 'item', settings: { icon: 'leaf', text: 'Natural\nIngredients' } },
        b2: { type: 'item', settings: { icon: 'mountain', text: 'Mountain\nInspired' } },
        b3: { type: 'item', settings: { icon: 'mortar', text: 'Small Batch\nMade' } },
        b4: { type: 'item', settings: { icon: 'heart', text: 'Rituals for\nMind. Body. Soul.' } },
      },
      block_order: ['b1', 'b2', 'b3', 'b4'],
      settings: {},
    },
    story: { type: 'story', settings: {} },
    reviews: {
      type: 'reviews',
      blocks: {
        r1: { type: 'review', settings: { stars: 5, quote: 'PLACEHOLDER - replace with a real customer review before launch.', author: 'Customer name' } },
        r2: { type: 'review', settings: { stars: 5, quote: 'PLACEHOLDER - replace with a real customer review before launch.', author: 'Customer name' } },
        r3: { type: 'review', settings: { stars: 5, quote: 'PLACEHOLDER - replace with a real customer review before launch.', author: 'Customer name' } },
      },
      block_order: ['r1', 'r2', 'r3'],
      settings: {},
    },
    newsletter: {
      type: 'newsletter',
      blocks: {
        p1: { type: 'perk', settings: { icon: 'leaf', text: 'Exclusive Offers' } },
        p2: { type: 'perk', settings: { icon: 'cup', text: 'New Product Drops' } },
        p3: { type: 'perk', settings: { icon: 'gift', text: 'Rituals & Recipes' } },
      },
      block_order: ['p1', 'p2', 'p3'],
      settings: {},
    },
  },
  order: dir.order,
}, null, 2);

const templateProduct = (dir) => JSON.stringify({
  sections: {
    main: {
      type: 'main-product',
      blocks: {
        r1: { type: 'reassure', settings: { icon: 'truck', text: 'Ships in 1-2 days' } },
        r2: { type: 'reassure', settings: { icon: 'leaf', text: 'Whole herbs' } },
        r3: { type: 'reassure', settings: { icon: 'mortar', text: 'Small batch' } },
        a1: { type: 'accordion', settings: { heading: 'Ingredients', body: '<p>List the ingredients here.</p>' } },
        a2: { type: 'accordion', settings: { heading: 'Brewing Guide', body: '<p><strong>Hot.</strong> One bag in an 8-10oz mug. Steep 3-4 minutes in boiling water.<br><strong>Iced.</strong> Two bags in 1.5 cups of water, sweeten, then pour over a quarter jar of ice.</p>' } },
        a3: { type: 'accordion', settings: { heading: 'Shipping & Returns', body: '<p>Orders ship within 1-2 business days. Free shipping over $50.</p>' } },
        ...(dir.frame === 'ruled' ? {
          t1: { type: 'spec', settings: { label: 'Origin', text: 'North Georgia' } },
          t2: { type: 'spec', settings: { label: 'Format', text: '20 pyramid bags' } },
          t3: { type: 'spec', settings: { label: 'Steep', text: '3 to 4 minutes' } },
        } : {}),
      },
      block_order: dir.frame === 'ruled'
        ? ['r1', 'r2', 'r3', 't1', 't2', 't3', 'a1', 'a2', 'a3']
        : ['r1', 'r2', 'r3', 'a1', 'a2', 'a3'],
      settings: {},
    },
    icons: {
      type: 'icon-strip',
      blocks: {
        b1: { type: 'item', settings: { icon: 'leaf', text: 'Natural\nIngredients' } },
        b2: { type: 'item', settings: { icon: 'mountain', text: 'Mountain\nInspired' } },
        b3: { type: 'item', settings: { icon: 'mortar', text: 'Small Batch\nMade' } },
        b4: { type: 'item', settings: { icon: 'heart', text: 'Rituals for\nMind. Body. Soul.' } },
      },
      block_order: ['b1', 'b2', 'b3', 'b4'],
      settings: { bg_cream: true },
    },
  },
  order: ['main', 'icons'],
}, null, 2);

const templateCollection = JSON.stringify({
  sections: {
    main: { type: 'main-collection', settings: {} },
    bundle: {
      type: 'bundle',
      blocks: {
        c1: { type: 'component', settings: { fallback: 'morning.png' } },
        c2: { type: 'component', settings: { fallback: 'evening.png' } },
      },
      block_order: ['c1', 'c2'],
      settings: {},
    },
    icons: {
      type: 'icon-strip',
      blocks: {
        b1: { type: 'item', settings: { icon: 'leaf', text: 'Natural\nIngredients' } },
        b2: { type: 'item', settings: { icon: 'mountain', text: 'Mountain\nInspired' } },
        b3: { type: 'item', settings: { icon: 'mortar', text: 'Small Batch\nMade' } },
        b4: { type: 'item', settings: { icon: 'heart', text: 'Rituals for\nMind. Body. Soul.' } },
      },
      block_order: ['b1', 'b2', 'b3', 'b4'],
      settings: { bg_cream: true },
    },
  },
  order: ['main', 'bundle', 'icons'],
}, null, 2);

const simpleTemplate = (type) => JSON.stringify({ sections: { main: { type, settings: {} } }, order: ['main'] }, null, 2);

const templatePage = JSON.stringify({
  sections: {
    main: { type: 'main-page', settings: {} },
    newsletter: {
      type: 'newsletter',
      blocks: {
        p1: { type: 'perk', settings: { icon: 'leaf', text: 'Exclusive Offers' } },
        p2: { type: 'perk', settings: { icon: 'cup', text: 'New Product Drops' } },
        p3: { type: 'perk', settings: { icon: 'gift', text: 'Rituals & Recipes' } },
      },
      block_order: ['p1', 'p2', 'p3'],
      settings: {},
    },
  },
  order: ['main', 'newsletter'],
}, null, 2);

const templatePageContact = JSON.stringify({
  sections: {
    main: { type: 'contact-form', settings: {} },
  },
  order: ['main'],
}, null, 2);

const templatePageFaq = JSON.stringify({
  sections: {
    main: {
      type: 'faq',
      blocks: {
        q1: { type: 'qa', settings: { q: 'How long does shipping take?', a: '<p>Orders leave the workshop within one to two business days. Shipping is free on orders over $50.</p>' } },
        q2: { type: 'qa', settings: { q: 'How should I store the tea?', a: '<p>Somewhere cool, dry and out of direct light. The kraft pouch reseals; keep it closed and the blend holds for about twelve months.</p>' } },
        q3: { type: 'qa', settings: { q: 'Is the tea caffeinated?', a: '<p>Morning Ritual is. Evening Ritual is caffeine free, which is rather the point of it.</p>' } },
        q4: { type: 'qa', settings: { q: 'Can I return an order?', a: '<p>Write to us within thirty days and we will make it right.</p>' } },
      },
      block_order: ['q1', 'q2', 'q3', 'q4'],
      settings: {},
    },
    newsletter: {
      type: 'newsletter',
      blocks: {
        p1: { type: 'perk', settings: { icon: 'leaf', text: 'Exclusive Offers' } },
        p2: { type: 'perk', settings: { icon: 'cup', text: 'New Product Drops' } },
        p3: { type: 'perk', settings: { icon: 'gift', text: 'Rituals & Recipes' } },
      },
      block_order: ['p1', 'p2', 'p3'],
      settings: {},
    },
  },
  order: ['main', 'newsletter'],
}, null, 2);

/* ------------------------------------------------------------ assets: css

   Styles for markup that exists only in the themes, never in the mockups: the
   new store templates, and the structural furniture each direction adds.

   Only variables declared in tokens.css are used here. The directions each
   invent their own extras (--paper, --shade, --line) and reaching for those
   would break the moment a direction is edited. */

const CSS_SHARED = `
/* --- variant picker ---------------------------------------------------- */
/* The chips are enhancement. Until .js lands on <html> the plain select is
   what the customer sees, and it is what the form submits either way. */
.opts[data-picker] { display: none; }
.js .opts[data-picker] { display: grid; gap: 1.3rem; margin: 1.9rem 0; }
.js .opts--fallback { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

.chips button[disabled] { opacity: .3; cursor: not-allowed; text-decoration: line-through; }
.chips button.is-unavailable { opacity: .55; }
.chips button.is-unavailable::after { content: ' (sold out)'; font-size: .85em; opacity: .8; }

[data-add][disabled] { opacity: .5; cursor: not-allowed; }
[data-add] { gap: .5em; }

/* --- forms: contact, account, password ---------------------------------- */
.field { margin-bottom: 1.2rem; }
.field label {
  display: block; margin-bottom: .45rem;
  font-family: var(--caps); font-size: .62rem; font-weight: 500;
  letter-spacing: .24em; text-transform: uppercase; opacity: .7;
}
.field input, .field textarea, .field select {
  width: 100%; max-width: 34rem;
  font-family: var(--body); font-size: .92rem;
  padding: .95rem 1.1rem;
  background: transparent; color: inherit;
  border: 1px solid currentColor; border-radius: 0;
}
.field textarea { resize: vertical; }

.form__ok, .form__errors {
  font-family: var(--caps); font-size: .72rem; letter-spacing: .12em;
  padding: .9rem 1.1rem; margin-bottom: 1.4rem;
  border-left: 3px solid var(--orange);
  background: rgba(200,106,34,.08);
}
.form__errors { list-style: none; }
.form__errors li + li { margin-top: .4rem; }

/* --- customer account --------------------------------------------------- */
.account__hello { font-family: var(--display); font-size: 1.7rem; margin-bottom: .3rem; }
.account__alt {
  font-family: var(--caps); font-size: .66rem; letter-spacing: .18em;
  text-transform: uppercase; opacity: .72; margin-top: 1rem;
}
.account__alt a { text-decoration: none; border-bottom: 1px solid currentColor; }
.account__table { width: 100%; border-collapse: collapse; margin: 1.4rem 0 2.4rem; font-size: .88rem; }
.account__table th, .account__table td { text-align: left; padding: .8rem .6rem; border-bottom: 1px solid rgba(128,128,128,.28); }
.account__table th {
  font-family: var(--caps); font-size: .6rem; font-weight: 500;
  letter-spacing: .22em; text-transform: uppercase; opacity: .7;
}
.account__addr { padding: 1.2rem 0; border-bottom: 1px solid rgba(128,128,128,.22); }
.account__del { display: inline; }
.account__del button {
  background: none; border: 0; padding: 0; cursor: pointer;
  font: inherit; color: inherit;
  border-bottom: 1px solid currentColor;
}

/* --- gift card ---------------------------------------------------------- */
.giftcard { text-align: center; }
.giftcard__value { font-family: var(--display); font-size: clamp(3rem, 9vw, 5rem); line-height: 1; margin: 1.2rem 0; }
.giftcard__code {
  margin: 1.8rem auto; padding: 1.1rem 1.4rem; max-width: 24rem;
  border: 1px dashed currentColor;
  font-family: var(--caps); font-size: 1.1rem; letter-spacing: .2em;
}
.giftcard__qr { margin: 1.6rem auto; }
@media print { .btn, .eyebrow { display: none; } }

/* --- password page ------------------------------------------------------ */
.pwd { min-height: 100vh; display: flex; align-items: center; text-align: center; }
.pwd__in { max-width: 34rem; margin-inline: auto; }
.pwd__mark { display: flex; justify-content: center; opacity: .65; margin-bottom: 1.6rem; }
.pwd h1 { font-size: clamp(2.4rem, 7vw, 3.6rem); margin-bottom: 1rem; }
.pwd__creed { font-size: .95rem; opacity: .78; margin-bottom: 2.4rem; }
.pwd__forms { display: grid; gap: 2rem; text-align: left; }
.pwd__forms .eyebrow { display: block; margin-bottom: .6rem; opacity: .7; }

/* --- header cart count -------------------------------------------------- */
.tools a { position: relative; }
.tools__count {
  position: absolute; top: -.4rem; right: -.55rem;
  min-width: 1.05rem; height: 1.05rem; padding: 0 .2rem;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--orange); color: #fff; border-radius: 50%;
  font-family: var(--caps); font-size: .55rem; letter-spacing: 0;
}
`;

const CSS_HERO = {
  split: `
.hero__cue { position: absolute; left: 50%; bottom: 1.8rem; z-index: 3; transform: translateX(-50%); }
.hero__cue span { display: block; width: 1px; height: 46px; background: currentColor; opacity: .45; color: var(--cream); }
`,
  arch: `
.hero__orn { position: absolute; left: 4%; top: 12%; z-index: 1; color: var(--brown); opacity: .13; pointer-events: none; }
.hero__plate {
  position: absolute; right: 7%; bottom: 6%; z-index: 3; margin: 0;
  font-family: var(--caps); font-size: .58rem; letter-spacing: .3em;
  text-transform: uppercase; color: var(--brown); opacity: .75;
}
@media (max-width: 900px) { .hero__orn, .hero__plate { display: none; } }
`,
  immersive: `
.hero__band {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 3;
  border-top: 1px solid rgba(243,235,221,.2);
  background: rgba(20,32,25,.5);
}
.hero__band .wrap { display: flex; flex-wrap: wrap; gap: clamp(1.2rem, 4vw, 3rem); padding-block: 1rem; }
.hero__band span {
  display: inline-flex; align-items: center; gap: .55rem;
  font-family: var(--caps); font-size: .62rem; letter-spacing: .22em;
  text-transform: uppercase; color: rgba(243,235,221,.82);
}
.hero__band i { color: var(--orange-soft); }
`,
  masthead: `
.hero__specs { margin: 0 0 2.2rem; border-top: 1px solid currentColor; }
.hero__specs > div {
  display: grid; grid-template-columns: 9rem 1fr; gap: 1rem;
  padding: .7rem 0; border-bottom: 1px solid currentColor;
}
.hero__specs dt, .hero__specs dd {
  margin: 0; font-family: var(--caps); font-size: .64rem;
  letter-spacing: .2em; text-transform: uppercase;
}
.hero__specs dt { opacity: .58; }
@media (max-width: 600px) { .hero__specs > div { grid-template-columns: 1fr; gap: .1rem; } }
`,
  fullbleed: `
.hero__foot { position: absolute; left: 0; right: 0; bottom: 1.6rem; z-index: 3; }
.hero__foot .wrap { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.hero__credit {
  font-family: var(--caps); font-size: .58rem; letter-spacing: .26em;
  text-transform: uppercase; color: rgba(243,235,221,.6);
}
.hero__cue span { display: block; width: 1px; height: 40px; background: rgba(243,235,221,.5); }
`,
};

const CSS_FEATURE = {
  split: '',
  arch: `
.feat--arch .feat__media { border-radius: 50vw 50vw 4px 4px; overflow: hidden; }
`,
  inset: `
.feat--inset { position: relative; }
.feat--inset .feat__media { box-shadow: 0 40px 70px -50px rgba(0,0,0,.9); }
`,
  ruled: `
.feat--ruled .feat__specimen {
  font-family: var(--caps); font-size: .58rem; letter-spacing: .3em;
  text-transform: uppercase; opacity: .5; margin-bottom: .8rem;
}
.feat__table { margin: 1.6rem 0 1.8rem; border-top: 1px solid currentColor; }
.feat__table > div {
  display: grid; grid-template-columns: 9rem 1fr; gap: 1rem;
  padding: .72rem 0; border-bottom: 1px solid currentColor;
}
.feat__table dt, .feat__table dd {
  margin: 0; font-family: var(--caps); font-size: .66rem;
  letter-spacing: .16em; text-transform: uppercase;
}
.feat__table dt { opacity: .55; }
@media (max-width: 600px) { .feat__table > div { grid-template-columns: 1fr; gap: .1rem; } }
`,
  band: `
/* The band runs the full width and the copy sits on the photograph, so the
   two feature rows read as one continuous reel rather than two cards. */
.feat--band {
  position: relative; display: block; max-width: none;
  margin-inline: 0; padding: 0; min-height: clamp(520px, 76vh, 780px);
}
.feat--band .feat__media { position: absolute; inset: 0; }
.feat--band .feat__media img { width: 100%; height: 100%; object-fit: cover; }
.feat--band .feat__scrim {
  position: absolute; inset: 0;
  background: linear-gradient(90deg, rgba(18,27,22,.9) 0%, rgba(18,27,22,.62) 38%, transparent 72%);
}
.feat--band.feat--flip .feat__scrim {
  background: linear-gradient(270deg, rgba(18,27,22,.9) 0%, rgba(18,27,22,.62) 38%, transparent 72%);
}
.feat--band .feat__body {
  position: relative; z-index: 2;
  width: min(100%, var(--page)); margin-inline: auto;
  padding: clamp(3rem, 8vw, 6rem) var(--gut);
  max-width: none;
  display: flex; flex-direction: column; justify-content: center;
  min-height: clamp(520px, 76vh, 780px);
  color: var(--cream-lift);
}
.feat--band .feat__body > * { max-width: 34rem; }
.feat--band.feat--flip .feat__body { align-items: flex-end; }
.feat--band.feat--flip .feat__body > * { margin-left: auto; }
.feat--band .feat__body h3, .feat--band .feat__body .price { color: var(--cream-lift); }
.feat--band .feat__body p { color: rgba(243,235,221,.84); }
.feat--band .feat__badge { top: clamp(1.5rem, 4vw, 3rem); left: auto; right: var(--gut); bottom: auto; }
@media (max-width: 720px) {
  .feat--band .feat__scrim,
  .feat--band.feat--flip .feat__scrim { background: linear-gradient(180deg, rgba(18,27,22,.55), rgba(18,27,22,.9)); }
  .feat--band.feat--flip .feat__body { align-items: flex-start; }
  .feat--band.feat--flip .feat__body > * { margin-left: 0; }
}
`,
};

const CSS_CHROME = {
  standard: '',
  inverted: '',
  ruled: `
/* Centred masthead: nav, wordmark, tools. */
.hdr--ruled .nav { justify-content: flex-start; }
.hdr__rule { border-top: 1px solid currentColor; }
.hdr__rule .wrap {
  display: flex; justify-content: space-between; gap: 1rem;
  padding-block: .5rem;
  font-family: var(--caps); font-size: .55rem; letter-spacing: .3em;
  text-transform: uppercase; opacity: .6;
}
@media (max-width: 1024px) { .hdr__rule { display: none; } }
`,
  minimal: `
/* No inline nav at any width. The drawer holds it so the photography keeps
   the whole frame. */
.hdr--minimal .hdr__in { display: flex; align-items: center; justify-content: space-between; }
.hdr--minimal .burger--always { display: inline-flex; }
.ftr--minimal .ftr__creedband {
  border-bottom: 1px solid rgba(128,128,128,.25);
  padding-block: clamp(2.5rem, 6vw, 4rem);
  text-align: center;
}
.ftr--minimal .ftr__creedband p {
  font-family: var(--display); font-size: clamp(1.6rem, 3.4vw, 2.4rem);
  line-height: 1.5; max-width: 30rem; margin-inline: auto;
}
`,
};

const CSS_FRAME = {
  plain: '',
  arch: `
.pcard--arch .pcard__media { border-radius: 50vw 50vw 4px 4px; }
`,
  ruled: `
.pcard--ruled .pcard__idx {
  display: block; margin-bottom: .5rem;
  font-family: var(--caps); font-size: .56rem; letter-spacing: .3em;
  text-transform: uppercase; opacity: .5;
}
.pinfo__table { margin: 1.8rem 0; border-top: 1px solid currentColor; }
.pinfo__table > div {
  display: grid; grid-template-columns: 9rem 1fr; gap: 1rem;
  padding: .7rem 0; border-bottom: 1px solid currentColor;
}
.pinfo__table dt, .pinfo__table dd {
  margin: 0; font-family: var(--caps); font-size: .64rem;
  letter-spacing: .16em; text-transform: uppercase;
}
.pinfo__table dt { opacity: .55; }
@media (max-width: 600px) { .pinfo__table > div { grid-template-columns: 1fr; gap: .1rem; } }
`,
  bare: `
.pcard--bare .pcard__media { position: relative; }
.pcard__overlay {
  position: absolute; inset: auto 0 0 0; z-index: 2;
  padding: 3.5rem 1.2rem 1.1rem;
  background: linear-gradient(180deg, transparent, rgba(18,27,22,.82));
  color: var(--cream-lift);
  font-family: var(--display); font-size: 1.5rem; line-height: 1.1;
}
.pcard--bare .pcard__body h3 { display: none; }
.pcard__more {
  font-family: var(--caps); font-size: .62rem; letter-spacing: .24em;
  text-transform: uppercase; border-bottom: 1px solid currentColor; padding-bottom: .15rem;
}
/* Stacked gallery: every frame at full size, no thumbnail rail. */
.gal--stack { display: grid; gap: .9rem; position: static; }
.gal__frame { aspect-ratio: 3/3.6; }
.gal__frame img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 46%; }
`,
};

function structuralCss(dir) {
  return [
    `\n/* ============================================================\n   THEME-ONLY STRUCTURE - ${dir.name}\n   hero: ${dir.hero} | feature: ${dir.feature} | frame: ${dir.frame} | chrome: ${dir.chrome}\n   ============================================================ */`,
    CSS_SHARED,
    CSS_HERO[dir.hero] || '',
    CSS_FEATURE[dir.feature] || '',
    CSS_CHROME[dir.chrome] || '',
    CSS_FRAME[dir.frame] || '',
  ].join('\n');
}

/* ------------------------------------------------------------- assets: js */

/* Variant picker.

   The <select> carries name="id" and is the only thing the form submits, so
   with no JavaScript the page still works exactly as it did before. This file
   only ever sets select.value and dispatches a change event, which means the
   worst case if it misbehaves is a stale display, never a wrong variant in a
   cart.

   A combination is offered when some variant matches it. A combination that
   matches nothing is disabled outright; one that matches a sold-out variant
   stays clickable and is marked unavailable, because the customer is entitled
   to know the thing exists and is out of stock. */
const assetProductForm = `(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var picker = document.querySelector('[data-picker]');
    var select = document.querySelector('[data-picker-select]');
    var dataEl = document.querySelector('[data-variant-data]');
    if (!picker || !select || !dataEl) return;

    var variants;
    try {
      variants = JSON.parse(dataEl.textContent);
    } catch (err) {
      // Malformed payload: leave the plain select in charge rather than guess.
      return;
    }
    if (!variants || !variants.length) return;

    var groups = Array.prototype.slice.call(picker.querySelectorAll('[data-opt-index]'));
    var form = select.closest('form');
    var priceEl = document.querySelector('[data-price]');
    var addBtn = form ? form.querySelector('[data-add]') : null;
    var addLabel = addBtn ? addBtn.querySelector('[data-add-label]') : null;
    var addPrice = addBtn ? addBtn.querySelector('[data-add-price]') : null;
    var mainImg = document.querySelector('[data-gallery-main] img');

    function byId(id) {
      for (var i = 0; i < variants.length; i++) {
        if (String(variants[i].id) === String(id)) return variants[i];
      }
      return null;
    }

    // The chips that are currently pressed, in option order.
    function selection() {
      return groups.map(function (g) {
        var on = g.querySelector('[data-chip][aria-pressed="true"]');
        return on ? on.getAttribute('data-value') : null;
      });
    }

    // First variant matching every non-null position of the wanted selection.
    function match(wanted) {
      for (var i = 0; i < variants.length; i++) {
        var ok = true;
        for (var j = 0; j < wanted.length; j++) {
          if (wanted[j] !== null && variants[i].options[j] !== wanted[j]) { ok = false; break; }
        }
        if (ok) return variants[i];
      }
      return null;
    }

    function exists(optIndex, value) {
      var wanted = selection();
      wanted[optIndex] = value;
      return !!match(wanted);
    }

    function available(optIndex, value) {
      var wanted = selection();
      wanted[optIndex] = value;
      var v = match(wanted);
      return !!(v && v.available);
    }

    function paint(variant) {
      groups.forEach(function (g) {
        var idx = parseInt(g.getAttribute('data-opt-index'), 10);
        g.querySelectorAll('[data-chip]').forEach(function (chip) {
          var value = chip.getAttribute('data-value');
          var pressed = variant.options[idx] === value;
          chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
          // Only disable combinations that do not exist at all. Sold-out ones
          // stay reachable so the customer can see them.
          var real = pressed || exists(idx, value);
          chip.disabled = !real;
          chip.classList.toggle('is-unavailable', real && !pressed && !available(idx, value));
        });
      });

      if (priceEl && variant.price_formatted) priceEl.textContent = variant.price_formatted;

      if (addBtn) {
        addBtn.disabled = !variant.available;
        if (addLabel) addLabel.textContent = variant.available ? 'Add to Cart' : 'Sold out';
        if (addPrice) addPrice.textContent = variant.available && variant.price_formatted ? '\\u00b7 ' + variant.price_formatted : '';
      }

      if (mainImg && variant.image) mainImg.src = variant.image;

      if (window.history && window.history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url.toString());
      }
    }

    function choose(variant) {
      if (!variant) return;
      select.value = variant.id;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      paint(variant);
    }

    picker.addEventListener('click', function (e) {
      var chip = e.target.closest('[data-chip]');
      if (!chip || chip.disabled) return;

      var idx = parseInt(chip.getAttribute('data-opt'), 10);
      var wanted = selection();
      wanted[idx] = chip.getAttribute('data-value');

      // Exact hit first. Failing that, hold the clicked option and let the
      // others fall where they may, so a click always does something.
      var next = match(wanted);
      if (!next) {
        var loose = wanted.map(function (v, i) { return i === idx ? v : null; });
        next = match(loose);
      }
      choose(next);
    });

    // Someone using the fallback select directly still gets a synced display.
    select.addEventListener('change', function () {
      var v = byId(select.value);
      if (v) paint(v);
    });

    var initial = byId(select.value);
    if (initial) paint(initial);
  });
})();
`;

/* ------------------------------------------------------------------ config */
function settingsSchema(dirName) {
  return JSON.stringify([
    {
      name: 'theme_info',
      theme_name: `Root & Ritual - ${dirName}`,
      theme_version: '1.0.0',
      theme_author: 'Hauck Marketing',
      theme_documentation_url: 'https://hauckmarketing.com',
      theme_support_url: 'https://hauckmarketing.com',
    },
    {
      name: 'Brand',
      settings: [
        { type: 'image_picker', id: 'favicon', label: 'Favicon' },
        { type: 'header', content: 'Palette' },
        { type: 'paragraph', content: 'This direction ships with the locked Root & Ritual palette: Mountain Green #203126, Parchment Cream #F3EBDD, Orange Accent #C86A22, Weathered Brown #6A4A32. Edit assets/theme.css to change them.' },
      ],
    },
  ], null, 2);
}

const settingsData = JSON.stringify({ current: {} }, null, 2);

const localeDefault = JSON.stringify({
  general: { search: { title: 'Search', placeholder: 'Search' }, "404": { title: 'Page not found' } },
  products: { product: { add_to_cart: 'Add to Cart', sold_out: 'Sold out' } },
  cart: { general: { title: 'Your Cart', empty: 'Your cart is empty', checkout: 'Checkout', subtotal: 'Subtotal' } },
}, null, 2);

const localeSchema = JSON.stringify({
  settings_schema: { brand: { name: 'Brand' } },
}, null, 2);

/* ------------------------------------------------------------------ build */
function buildTheme(dir) {
  const base = path.join(out, `root-ritual-${dir.slug}`);
  fs.rmSync(base, { recursive: true, force: true });

  // --- assets: flatten tokens.css + the direction stylesheet into one file
  const tokens = fs.readFileSync(path.join(root, 'assets', 'tokens.css'), 'utf8')
    .replace(/@import url\('https:\/\/fonts[^']*'\);\s*/g, '');
  const skin = fs.readFileSync(path.join(root, dir.folder, 'style.css'), 'utf8')
    .replace(/@import url\('\.\.\/assets\/tokens\.css'\);\s*/g, '');

  const css = `/* Root & Ritual Botanicals - ${dir.name}
   Built from the approved HTML mockup. Fonts are loaded in layout/theme.liquid.
   Brand palette is locked in :root below. */

${tokens}
${skin}

/* --- Shopify variant select --- */
.variant-select {
  font-family: var(--caps); font-size: .78rem; letter-spacing: .06em;
  padding: .9rem 1.1rem; width: 100%; max-width: 24rem;
  background: transparent; color: inherit;
  border: 1px solid currentColor; border-radius: inherit;
}
.variant-select option { color: #1A2620; background: #F3EBDD; }

/* --- Shopify rich-text output (product descriptions, page content) --- */
.rte h2, .rte h3 { font-family: var(--display); margin: 1.6em 0 .5em; }
.rte ul, .rte ol { padding-left: 1.2rem; }
.rte li { margin-bottom: .35rem; }
.rte img { height: auto; margin: 1.4rem 0; }
.rte a { color: var(--orange); }
${structuralCss(dir)}`;

  write(path.join(base, 'assets', 'theme.css'), css);
  write(path.join(base, 'assets', 'product-form.js'), assetProductForm);
  fs.copyFileSync(path.join(root, 'assets', 'icons.js'), path.join(base, 'assets', 'icons.js'));
  fs.copyFileSync(path.join(root, 'assets', 'site.js'), path.join(base, 'assets', 'site.js'));
  fs.copyFileSync(path.join(root, 'assets', 'morning.png'), path.join(base, 'assets', 'morning.png'));
  fs.copyFileSync(path.join(root, 'assets', 'evening.png'), path.join(base, 'assets', 'evening.png'));

  // --- layout
  write(path.join(base, 'layout', 'theme.liquid'), themeLiquid);
  write(path.join(base, 'layout', 'password.liquid'), layoutPassword);

  // --- snippets
  write(path.join(base, 'snippets', 'icon.liquid'), snippetIcon);
  write(path.join(base, 'snippets', 'product-card.liquid'), snippetProductCard(dir));

  // --- sections
  const sections = {
    'announcement.liquid': sectionAnnouncement,
    'header.liquid': sectionHeader(dir),
    'footer.liquid': sectionFooter(dir),
    'hero.liquid': sectionHero(dir),
    'rich-text.liquid': sectionRichText,
    'product-feature.liquid': sectionProductFeature(dir),
    'icon-strip.liquid': sectionIconStrip,
    'story.liquid': sectionStory,
    'reviews.liquid': sectionReviews,
    'newsletter.liquid': sectionNewsletter,
    'bundle.liquid': sectionBundle,
    'contact-form.liquid': sectionContactForm,
    'faq.liquid': sectionFaq,
    'main-product.liquid': sectionMainProduct(dir),
    'main-collection.liquid': sectionMainCollection,
    'main-page.liquid': sectionMainPage,
    'main-cart.liquid': sectionMainCart,
    'main-search.liquid': sectionMainSearch,
    'main-404.liquid': sectionMain404,
    'main-list-collections.liquid': sectionMainList,
    'main-blog.liquid': sectionMainBlog,
    'main-article.liquid': sectionMainArticle,
    'main-password.liquid': sectionMainPassword,
    'header-group.json': headerGroup,
    'footer-group.json': footerGroup,
  };
  for (const [file, body] of Object.entries(sections)) {
    write(path.join(base, 'sections', file), body);
  }

  // --- templates
  const templates = {
    'index.json': templateIndex(dir),
    'product.json': templateProduct(dir),
    'collection.json': templateCollection,
    'page.json': templatePage,
    'page.contact.json': templatePageContact,
    'page.faq.json': templatePageFaq,
    'cart.json': simpleTemplate('main-cart'),
    'search.json': simpleTemplate('main-search'),
    '404.json': simpleTemplate('main-404'),
    'list-collections.json': simpleTemplate('main-list-collections'),
    'blog.json': simpleTemplate('main-blog'),
    'article.json': simpleTemplate('main-article'),
    'password.json': simpleTemplate('main-password'),
    'gift_card.liquid': templateGiftCard,
    'customers/login.liquid': customerLogin,
    'customers/register.liquid': customerRegister,
    'customers/account.liquid': customerAccount,
    'customers/order.liquid': customerOrder,
    'customers/addresses.liquid': customerAddresses,
    'customers/activate_account.liquid': customerActivate,
    'customers/reset_password.liquid': customerResetPassword,
  };
  for (const [file, body] of Object.entries(templates)) {
    write(path.join(base, 'templates', file), body);
  }

  // --- config + locales
  write(path.join(base, 'config', 'settings_schema.json'), settingsSchema(dir.name));
  write(path.join(base, 'config', 'settings_data.json'), settingsData);
  write(path.join(base, 'locales', 'en.default.json'), localeDefault);
  write(path.join(base, 'locales', 'en.default.schema.json'), localeSchema);

  return base;
}

let count = 0;
for (const dir of DIRECTIONS) {
  const built = buildTheme(dir);
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else files.push(p);
    }
  })(built);
  console.log(`built root-ritual-${dir.slug}  (${files.length} files)`);
  count++;
}
console.log(`\n${count} themes written to ${out}`);
