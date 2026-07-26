/* ============================================================================
   Root & Ritual Botanicals - Shopify theme builder
   Turns the five HTML mockup directions into five Online Store 2.0 themes.

   Run:  node build-themes.mjs
   Then zip each folder in ./src (contents at the zip root) for upload.

   The Liquid is shared across all five. Only assets/theme.css differs, which
   is exactly how the mockups differ: same structure, different visual system.
   ============================================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const out = path.join(here, 'src');

const DIRECTIONS = [
  { slug: '01-faithful',    name: 'Faithful',     folder: '01-faithful' },
  { slug: '02-parchment',   name: 'Parchment',    folder: '02-parchment' },
  { slug: '03-deep-forest', name: 'Deep Forest',  folder: '03-deep-forest' },
  { slug: '04-field-guide', name: 'Field Guide',  folder: '04-field-guide' },
  { slug: '05-golden-hour', name: 'Golden Hour',  folder: '05-golden-hour' },
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

const snippetProductCard = `{%- comment -%}
  Product card. Falls back to demo content when no product is connected,
  so the theme looks right the moment it is uploaded.
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
<a class="pcard" href="{{ card_url }}">
  <div class="pcard__media">
    <img src="{{ card_image }}" alt="{{ card_title | escape }}" loading="lazy" width="900" height="900">
    {%- if badge != blank -%}<span class="feat__badge">{{ badge }}</span>{%- endif -%}
  </div>
  <div class="pcard__body">
    {%- if eyebrow != blank -%}<p class="eyebrow" style="color:var(--orange)">{{ eyebrow }}</p>{%- endif -%}
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
      <span class="price">{{ card_price }}</span>
      <span class="btn" style="pointer-events:none">View Product</span>
    </div>
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

const sectionHeader = `<header class="hdr" data-header>
  <div class="wrap hdr__in">
    <a class="logo" href="{{ routes.root_url }}">
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
    </a>

    <nav class="nav">
      {%- for link in section.settings.menu.links -%}
        <a href="{{ link.url }}"{% if link.active %} aria-current="page"{% endif %}>{{ link.title }}</a>
      {%- endfor -%}
    </nav>

    <div class="tools">
      <a href="{{ routes.search_url }}" aria-label="Search">{% render 'icon', name: 'search', size: 19 %}</a>
      <a href="{{ routes.account_url }}" aria-label="Account">{% render 'icon', name: 'user', size: 19 %}</a>
      <a href="{{ routes.cart_url }}" aria-label="Cart">{% render 'icon', name: 'bag', size: 19 %}</a>
      <button class="burger" data-burger aria-expanded="false" aria-label="Menu">{% render 'icon', name: 'plus', size: 22 %}</button>
    </div>
  </div>
</header>

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
    { "type": "text", "id": "sub", "label": "Logo subtitle", "default": "Botanicals" }
  ],
  "enabled_on": { "groups": ["header"] }
}
{% endschema %}
`;

const sectionFooter = `<footer class="ftr">
  <div class="wrap">
    <div class="ftr__grid">
      <div>
        <div class="ftr__mark">{% render 'icon', name: 'mountain', size: 44 %}</div>
        <p class="ftr__creed">{{ section.settings.creed }}</p>
      </div>

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

const sectionHero = `<section class="hero">
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
      <div class="hero__cta">
        {%- if section.settings.cta_one_label != blank -%}
          <a class="btn" href="{{ section.settings.cta_one_url | default: routes.all_products_collection_url }}">{{ section.settings.cta_one_label }}</a>
        {%- endif -%}
        {%- if section.settings.cta_two_label != blank -%}
          <a class="btn btn--ghost" href="{{ section.settings.cta_two_url | default: routes.root_url }}">{{ section.settings.cta_two_label }}</a>
        {%- endif -%}
      </div>
    </div>
  </div>
</section>

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
    { "type": "url", "id": "cta_two_url", "label": "Button 2 link" }
  ],
  "presets": [{ "name": "Hero" }]
}
{% endschema %}
`;

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

const sectionProductFeature = `{%- liquid
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
<article class="feat{% if section.settings.flip %} feat--flip{% endif %}" data-rise>
  <div class="feat__media">
    {%- if section.settings.image != blank -%}
      <img src="{{ section.settings.image | image_url: width: 1600 }}" alt="{{ f_title | escape }}" loading="lazy" width="1600" height="1600">
    {%- elsif p != blank and p.featured_image -%}
      <img src="{{ p.featured_image | image_url: width: 1600 }}" alt="{{ f_title | escape }}" loading="lazy" width="1600" height="1600">
    {%- else -%}
      <img src="{{ section.settings.fallback | asset_url }}" alt="{{ f_title | escape }}" loading="lazy" width="1254" height="1254">
    {%- endif -%}
    {%- if section.settings.badge != blank -%}<span class="feat__badge">{{ section.settings.badge }}</span>{%- endif -%}
  </div>

  <div class="feat__body">
    {%- if section.settings.eyebrow != blank -%}<p class="eyebrow">{{ section.settings.eyebrow }}</p>{%- endif -%}
    <h3>{{ f_title }}</h3>
    {%- if section.settings.tagline != blank -%}<p class="feat__tag">{{ section.settings.tagline }}</p>{%- endif -%}
    {%- if f_body != blank -%}<p>{{ f_body }}</p>{%- endif -%}

    {%- if section.blocks.size > 0 -%}
      <div class="feat__meta">
        {%- for block in section.blocks -%}
          <span {{ block.shopify_attributes }}>{% render 'icon', name: block.settings.icon, size: 15 %} {{ block.settings.text }}</span>
        {%- endfor -%}
      </div>
    {%- endif -%}

    <div class="feat__foot">
      <span class="price">{{ f_price }} {% if section.settings.price_note != blank %}<small>{{ section.settings.price_note }}</small>{% endif %}</span>
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
    { "type": "text", "id": "price", "label": "Price (used if no product)", "default": "$14.99" },
    { "type": "text", "id": "price_note", "label": "Price note", "default": "Free shipping over $50" },
    { "type": "text", "id": "cta_label", "label": "Button label", "default": "View Product" },
    { "type": "url", "id": "link", "label": "Button link (used if no product)" }
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
        },
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

const sectionBundle = `<section class="sect sect--tight">
  <div class="wrap">
    <div class="bundle" data-rise>
      <div class="bundle__stack">
        <div class="ph"><img src="{{ 'morning.png' | asset_url }}" alt="Morning Ritual" loading="lazy" width="1254" height="1254"></div>
        <div class="ph"><img src="{{ 'evening.png' | asset_url }}" alt="Evening Ritual" loading="lazy" width="1254" height="1254"></div>
      </div>
      <div>
        {%- if section.settings.eyebrow != blank -%}<p class="eyebrow">{{ section.settings.eyebrow }}</p>{%- endif -%}
        <h3>{{ section.settings.heading }}</h3>
        {{ section.settings.body }}
        <div class="feat__foot" style="margin-top:1.8rem">
          <span class="price">{{ section.settings.price }} <small>{{ section.settings.price_note }}</small></span>
          {%- if section.settings.product != blank -%}
            {% form 'product', section.settings.product %}
              <input type="hidden" name="id" value="{{ section.settings.product.selected_or_first_available_variant.id }}">
              <button class="btn btn--orange" type="submit">{{ section.settings.cta }}</button>
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
    { "type": "product", "id": "product", "label": "Bundle product", "info": "Optional. Create a bundle product in Shopify to make the button add to cart." },
    { "type": "text", "id": "eyebrow", "label": "Eyebrow", "default": "Save 15%" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "The Full Ritual Set" },
    { "type": "richtext", "id": "body", "label": "Body", "default": "<p>Both blends together, the way they are meant to be used. One to open the day, one to close it. Forty pyramid bags total, wrapped in kraft and tied with twine.</p>" },
    { "type": "text", "id": "price", "label": "Price", "default": "$24.99" },
    { "type": "text", "id": "price_note", "label": "Price note", "default": "$29.98 bought separately" },
    { "type": "text", "id": "cta", "label": "Button label", "default": "Add Set to Cart" }
  ],
  "presets": [{ "name": "Bundle offer" }]
}
{% endschema %}
`;

const sectionMainProduct = `<div class="sect">
  <div class="wrap">
    <p class="crumbs">
      <a href="{{ routes.root_url }}">Home</a> /
      <a href="{{ routes.all_products_collection_url }}">Shop</a> / {{ product.title }}
    </p>

    <div class="pdp" data-gallery>
      <div class="gal">
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

      <div class="pinfo">
        {%- if section.settings.eyebrow != blank -%}
          <p class="eyebrow" style="color:var(--orange);margin-bottom:.9rem">{{ section.settings.eyebrow }}</p>
        {%- endif -%}
        <h1>{{ product.title }}</h1>
        {%- if product.metafields.custom.tagline -%}
          <p class="feat__tag">{{ product.metafields.custom.tagline }}</p>
        {%- endif -%}

        <p class="pinfo__price">{{ product.price | money }}</p>

        <div class="rte">{{ product.description }}</div>

        {% form 'product', product %}
          {%- comment -%}
            A single variant select is used rather than decorative option
            chips. Chips look nicer but need JS to map option values back to a
            variant id, and a half-wired picker that silently adds the wrong
            variant is worse than a plain one that works.
          {%- endcomment -%}
          {%- if product.has_only_default_variant -%}
            <select name="id" hidden aria-hidden="true">
              <option value="{{ product.selected_or_first_available_variant.id }}" selected>Default</option>
            </select>
          {%- else -%}
            <div class="opts">
              <div>
                <h4>Options</h4>
                <select name="id" class="variant-select" aria-label="Choose an option">
                  {%- for variant in product.variants -%}
                    <option value="{{ variant.id }}"{% if variant == product.selected_or_first_available_variant %} selected{% endif %}{% unless variant.available %} disabled{% endunless %}>
                      {{ variant.title }} &middot; {{ variant.price | money }}{% unless variant.available %} (sold out){% endunless %}
                    </option>
                  {%- endfor -%}
                </select>
              </div>
            </div>
          {%- endif -%}

          <div class="buyrow">
            <div class="stepper" data-qty>
              <button type="button" data-qty-step="-1" aria-label="Decrease">{% render 'icon', name: 'minus', size: 15 %}</button>
              <span data-qty-val>1</span>
              <button type="button" data-qty-step="1" aria-label="Increase">{% render 'icon', name: 'plus', size: 15 %}</button>
            </div>
            <input type="hidden" name="quantity" value="1" data-qty-input>
            <button class="btn" type="submit"{% unless product.available %} disabled{% endunless %}>
              {% if product.available %}Add to Cart &mdash; {{ product.price | money }}{% else %}Sold out{% endif %}
            </button>
          </div>
        {% endform %}

        <div class="reassure">
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
    }
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
            fallback_title: 'Morning Ritual', fallback_price: '$14.99',
            fallback_asset: 'morning.png', eyebrow: 'Blend No. 01',
            tagline: 'Awaken. Ground. Begin.', badge: 'Best Seller',
            blurb: 'Green tea, peppermint, ginger root and prunella vulgaris. A clean lift with no crash.',
            meta_a: '20 Bags', meta_b: 'Caffeinated' %}
        {% render 'product-card',
            fallback_title: 'Evening Ritual', fallback_price: '$14.99',
            fallback_asset: 'evening.png', eyebrow: 'Blend No. 02',
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
const templateIndex = JSON.stringify({
  sections: {
    hero: { type: 'hero', settings: {} },
    intro: { type: 'rich-text', settings: {} },
    feature_a: {
      type: 'product-feature',
      blocks: {
        s1: { type: 'spec', settings: { icon: 'leaf', text: 'Green Tea & Peppermint' } },
        s2: { type: 'spec', settings: { icon: 'cup', text: '20 Pyramid Bags' } },
        s3: { type: 'spec', settings: { icon: 'mortar', text: 'Steep 3-4 min' } },
      },
      block_order: ['s1', 's2', 's3'],
      settings: { fallback: 'morning.png', flip: false, eyebrow: 'Blend No. 01', badge: 'Best Seller', heading: 'Morning Ritual', tagline: 'Awaken. Ground. Begin.' },
    },
    feature_b: {
      type: 'product-feature',
      blocks: {
        s1: { type: 'spec', settings: { icon: 'leaf', text: 'Chamomile & Lavender' } },
        s2: { type: 'spec', settings: { icon: 'cup', text: '20 Pyramid Bags' } },
        s3: { type: 'spec', settings: { icon: 'mortar', text: 'Steep 3-5 min' } },
      },
      block_order: ['s1', 's2', 's3'],
      settings: {
        fallback: 'evening.png', flip: true, eyebrow: 'Blend No. 02', badge: 'Caffeine Free',
        heading: 'Evening Ritual', tagline: 'Calm. Unwind. Restore.',
        body: 'Chamomile and lavender for the shoulders. Lemon balm for the mind that will not stop running. Brewed the hour before bed, every night, until the body learns what the cup means.',
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
  order: ['hero', 'intro', 'feature_a', 'feature_b', 'icons', 'story', 'reviews', 'newsletter'],
}, null, 2);

const templateProduct = JSON.stringify({
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
      },
      block_order: ['r1', 'r2', 'r3', 'a1', 'a2', 'a3'],
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
    bundle: { type: 'bundle', settings: {} },
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
`;

  write(path.join(base, 'assets', 'theme.css'), css);
  fs.copyFileSync(path.join(root, 'assets', 'icons.js'), path.join(base, 'assets', 'icons.js'));
  fs.copyFileSync(path.join(root, 'assets', 'site.js'), path.join(base, 'assets', 'site.js'));
  fs.copyFileSync(path.join(root, 'assets', 'morning.png'), path.join(base, 'assets', 'morning.png'));
  fs.copyFileSync(path.join(root, 'assets', 'evening.png'), path.join(base, 'assets', 'evening.png'));

  // --- layout
  write(path.join(base, 'layout', 'theme.liquid'), themeLiquid);

  // --- snippets
  write(path.join(base, 'snippets', 'icon.liquid'), snippetIcon);
  write(path.join(base, 'snippets', 'product-card.liquid'), snippetProductCard);

  // --- sections
  const sections = {
    'announcement.liquid': sectionAnnouncement,
    'header.liquid': sectionHeader,
    'footer.liquid': sectionFooter,
    'hero.liquid': sectionHero,
    'rich-text.liquid': sectionRichText,
    'product-feature.liquid': sectionProductFeature,
    'icon-strip.liquid': sectionIconStrip,
    'story.liquid': sectionStory,
    'reviews.liquid': sectionReviews,
    'newsletter.liquid': sectionNewsletter,
    'bundle.liquid': sectionBundle,
    'main-product.liquid': sectionMainProduct,
    'main-collection.liquid': sectionMainCollection,
    'main-page.liquid': sectionMainPage,
    'main-cart.liquid': sectionMainCart,
    'main-search.liquid': sectionMainSearch,
    'main-404.liquid': sectionMain404,
    'main-list-collections.liquid': sectionMainList,
    'main-blog.liquid': sectionMainBlog,
    'main-article.liquid': sectionMainArticle,
    'header-group.json': headerGroup,
    'footer-group.json': footerGroup,
  };
  for (const [file, body] of Object.entries(sections)) {
    write(path.join(base, 'sections', file), body);
  }

  // --- templates
  const templates = {
    'index.json': templateIndex,
    'product.json': templateProduct,
    'collection.json': templateCollection,
    'page.json': templatePage,
    'cart.json': simpleTemplate('main-cart'),
    'search.json': simpleTemplate('main-search'),
    '404.json': simpleTemplate('main-404'),
    'list-collections.json': simpleTemplate('main-list-collections'),
    'blog.json': simpleTemplate('main-blog'),
    'article.json': simpleTemplate('main-article'),
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
