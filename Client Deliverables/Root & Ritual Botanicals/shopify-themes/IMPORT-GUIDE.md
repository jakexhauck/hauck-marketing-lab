# Root and Ritual Botanicals: Shopify Theme Import Guide

**Prepared by Hauck Marketing. Steps verified against the Shopify Help Center on 25 July 2026.**

---

## What you have

Five separate Shopify themes, one per design direction. Each is a complete, installable Online Store 2.0 theme, not a mockup.

| File | Direction | Character |
|---|---|---|
| `root-ritual-01-faithful.zip` | Faithful | The existing comp, rebuilt properly |
| `root-ritual-02-parchment.zip` | Parchment | Cream dominant, illustration led |
| `root-ritual-03-deep-forest.zip` | Deep Forest | Green carries the page |
| `root-ritual-04-field-guide.zip` | Field Guide | Editorial almanac |
| `root-ritual-05-golden-hour.zip` | Golden Hour | Photography forward |

Each zip is about 5 MB and contains 44 files. All five passed Shopify's own `theme check` with zero errors.

**You can upload all five, compare them in preview, then publish one.** Uploading never touches your live site.

---

## Before you start

Three things to confirm:

1. **You are the store owner, or a staff member with the "Themes" permission.** Without it the Themes page is read only and there is no upload button.
2. **You have room in the theme library.** Basic, Grow and Advanced plans allow up to 20 themes. Shopify Plus allows up to 100. If you are at the cap, delete an old draft first.
3. **Do not unzip the files.** Shopify wants the zip exactly as delivered. Unzipping and rezipping on a Mac adds a `__MACOSX` folder that can cause the upload to fail.

---

## Part 1: Import a theme

1. Log in to your Shopify admin.
2. In the left sidebar, click **Online Store**. If you do not see it, the Online Store sales channel is not enabled. Add it under **Settings** then **Sales channels**.
3. Click **Themes**.
4. Scroll to the **Draft themes** section, below your published theme.
5. Click **Import theme**, then **Upload zip file**.
   *Some admin versions label this button **Add theme** instead. Same thing.*
6. In the **Import theme** dialog, click **Choose File**.
7. Select one of the five zip files.
8. Click **Upload**.

Wait for the upload to finish. It usually takes under a minute. The theme then appears in your **Draft themes** list, named after its direction, for example "Root and Ritual - Deep Forest".

**Repeat steps 4 to 8 for each of the five zips** if you want to compare them all.

---

## Part 2: Preview before you commit

1. Find the theme in the **Draft themes** list.
2. Click the **three dots** next to it, then **Preview**.
3. A new tab opens showing your store with that theme applied. Your live site is unaffected and customers see nothing.
4. Use the preview bar at the bottom to move around the store.

Do this for all five, then decide.

---

## Part 3: Set the theme up

A fresh theme has no idea what your products or menus are. Do these in order.

### 3a. Create the two products

1. Go to **Products**, then **Add product**.
2. Create **Morning Ritual**. Set the price to $14.99. Upload the product photo.
3. In the **Description** field, write the real product copy.
4. Save.
5. Repeat for **Evening Ritual**.

*Until you do this, both product rows on the homepage show the placeholder text and the bundled product photos. That is deliberate, so the theme looks right the moment it is uploaded.*

### 3b. Create a collection

1. Go to **Products**, then **Collections**, then **Create collection**.
2. Name it **The Collection**. Set it to **Manual**.
3. Add both products.
4. Save.

### 3c. Create the Our Story page

1. Go to **Online Store**, then **Pages**, then **Add page**.
2. Title it **Our Story**.
3. Paste in the story copy.
4. Under **Theme template**, leave it on **page**.
5. Save.

### 3d. Build the menus

1. Go to **Online Store**, then **Navigation**.
2. Open **Main menu**. Set it to: Home, Shop (link to your collection), Our Story, Contact.
3. Open **Footer menu**. Add your policy and info links.
4. Save.

### 3e. Connect the homepage sections

1. Go to **Online Store**, then **Themes**.
2. On your chosen draft theme, click **Customize**.
3. Click the first **Product feature row** in the left panel.
4. In **Product**, select **Morning Ritual**. The title, price, description and image now pull from the real product automatically.
5. Click the second **Product feature row** and select **Evening Ritual**.
6. Click **Save**.

### 3f. Replace the placeholder reviews

**Do this before launch. This is not optional.**

1. Still in **Customize**, click the **Reviews** section.
2. Each of the three review blocks currently reads "PLACEHOLDER - replace with a real customer review before launch."
3. Replace each with a genuine customer quote and name.
4. If you have no reviews yet, delete the whole Reviews section rather than inventing any. Fake reviews breach Shopify's terms and, in the US, FTC rules.
5. Click **Save**.

---

## Part 4: Publish

Once you are happy with the preview:

1. Go to **Online Store**, then **Themes**.
2. Find your chosen theme in **Draft themes**.
3. Click **Publish**.
4. Confirm.

The theme is now live. The previously published theme moves down into your draft list, so you can switch back instantly if something is wrong.

### Rolling back

1. Go to **Online Store**, then **Themes**.
2. Find the previous theme in **Draft themes**.
3. Click **Publish**.

That is the entire rollback. It takes about five seconds.

---

## Part 5: Tidy up

Once you have picked a winner, delete the four you did not choose so the theme library stays clean.

1. Click the **three dots** next to a theme you are not using.
2. Click **Remove**.
3. Confirm.

Never remove the published theme.

---

## What is in each theme

Every direction ships with the same structure. Only the styling differs.

**Homepage sections**, all editable and reorderable in the theme customiser:
- Hero
- Section intro
- Product feature row, twice
- Icon strip
- Story
- Reviews
- Newsletter

**Other templates**: product, collection, page, cart, search, 404, blog, article, collections list.

**Extra sections you can add**: Bundle offer, for the "Full Ritual Set".

Everything uses the locked brand palette (Mountain Green `#203126`, Parchment Cream `#F3EBDD`, Orange Accent `#C86A22`, Weathered Brown `#6A4A32`) and the brand fonts (Cormorant Garamond and Libre Baskerville, with Jost for small caps).

---

## Known limitations, stated plainly

1. **Reviews are placeholder.** Covered above. Replace or delete before launch.
2. **The bundle price and the "Save 15%" claim are invented** to demonstrate the layout. Set real numbers, or remove the Bundle section.
3. **Variant selection is a plain dropdown**, not the styled chips you saw in the mockup. The chips need custom JavaScript to map option values back to a variant ID. A half wired picker that silently adds the wrong variant is worse than a plain one that works, so this ships plain. Chips can be built properly in a follow up.
4. **Fonts load from Google, not from Shopify's CDN.** This is the only warning Shopify's theme checker raises. It costs a little page speed. Self hosting the fonts inside the theme is a small follow up job if you want a perfect score.
5. **The two product photos are bundled inside each theme** as fallbacks so the store never looks broken. Once you upload real product images in Shopify, those take over automatically.
6. **Golden Hour stretches the photos past their native size.** Those images are 1254 pixels square, and that direction runs them full bleed. It looks right today but that direction will reward a proper photo shoot at 2400 pixels or larger more than the other four.

---

## Troubleshooting

**"There was an error uploading your theme"**
The zip was probably unzipped and rezipped. Use the original file exactly as delivered.

**The upload works but the store looks unstyled**
Hard refresh with Ctrl+F5, or Cmd+Shift+R on a Mac. Shopify caches stylesheets aggressively.

**Icons show as empty squares**
`icons.js` did not load. In the theme editor open **Assets** and confirm `icons.js` is present. If your store has an app that blocks or defers theme scripts, allow this one.

**The homepage shows placeholder products**
You have not connected real products yet. See step 3e.

**I cannot find the Themes page**
The Online Store channel is not enabled, or your staff account lacks the Themes permission.

**I published the wrong one**
See "Rolling back" above. It is instant and nothing is lost.

---

## If you want changes

Every one of these is a settings change in **Customize**, not a code change: headings, body copy, button labels, images, the announcement bar, section order, and which sections appear at all.

Anything structural, such as new page types, a proper variant picker, or a blog layout, comes back to us.

---

*Root and Ritual Botanicals. Concept themes prepared by Hauck Marketing, July 2026.*
