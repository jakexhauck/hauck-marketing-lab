# Root and Ritual Botanicals: Shopify Theme Import Guide

**Prepared by Hauck Marketing. Steps verified against the Shopify Help Center on 25 July 2026.**

---

## What you have

Five separate Shopify themes, one per design direction. Each is a complete, installable Online Store 2.0 theme, not a mockup.

These are five different sites, not one site in five colourways. The page structure changes between them: where the story sits, how the product rows are built, whether the navigation is in the masthead or behind a menu button.

| File | Direction | Character |
|---|---|---|
| `root-ritual-01-faithful.zip` | Faithful | The existing comp, rebuilt properly |
| `root-ritual-02-parchment.zip` | Parchment | Cream dominant, arched frames, story high on the page |
| `root-ritual-03-deep-forest.zip` | Deep Forest | Green carries the page, trust marks under the hero |
| `root-ritual-04-field-guide.zip` | Field Guide | Editorial almanac: centred masthead, ruled data tables |
| `root-ritual-05-golden-hour.zip` | Golden Hour | Full-bleed photography, minimal chrome |

Each zip is about 5 MB and contains 60 files. All five pass Shopify's own `theme check` with zero errors.

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
2. Create **Morning Ritual**. Set your real price. Upload the product photo.
3. In the **Description** field, write the real product copy.
4. Save.
5. Repeat for **Evening Ritual**.

*Until you do this, both product rows on the homepage show the placeholder copy and the bundled product photos, and no price at all. That is deliberate. The theme will never show a price it invented, so an unfinished store cannot quote a number you never agreed to.*

### 3b. Create a collection

1. Go to **Products**, then **Collections**, then **Create collection**.
2. Name it **The Collection**. Set it to **Manual**.
3. Add both products.
4. Save.

### 3c. Create the pages

**Our Story**

1. Go to **Online Store**, then **Pages**, then **Add page**.
2. Title it **Our Story**.
3. Paste in the story copy.
4. Under **Theme template**, leave it on **page**.
5. Save.

**Contact**

1. **Add page**, title it **Contact**.
2. Under **Theme template**, choose **page.contact**. This is the important bit: it is what turns the page into a working contact form. Messages arrive at the sender email set under **Settings**, then **Notifications**.
3. Anything you type in the body appears above the form. Leaving it empty is fine.
4. Save.

**FAQ**

1. **Add page**, title it **Questions** or **FAQ**.
2. Under **Theme template**, choose **page.faq**.
3. Save, then open **Customize** and edit the questions in the **FAQ** section. Four are pre-written as a starting point; change them to yours.

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

### 3f. Set up the bundle, if you want one

The **Bundle offer** section sits on the collection page. It does no arithmetic of its own invention: it shows the real price of a real bundle product, and works the saving out from the products you tell it are inside.

1. In Shopify, create a product for the set itself, for example **The Full Ritual Set**, with its own price.
2. In **Customize**, open the collection page and click **Bundle offer**.
3. In **Bundle product**, choose the set you just made. That price is what customers see.
4. In the two **Included product** blocks, choose Morning Ritual and Evening Ritual. The "bought separately" figure and the "Save X%" badge are calculated from those two prices.
5. Click **Save**.

If you leave **Bundle product** empty, the section shows no price and no saving. Nothing is fabricated to fill the gap.

### 3g. Replace the placeholder reviews

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

All five carry the same set of sections, but each arranges them differently and builds several of them differently.

**Homepage sections**, all editable and reorderable in the theme customiser:
- Hero
- Section intro
- Product feature row, twice
- Icon strip
- Story
- Reviews
- Newsletter

**The homepage order differs by direction.** This is a deliberate part of each design, and you can still change it in **Customize** if you disagree.

| Direction | Order |
|---|---|
| Faithful | hero, intro, products, icons, story, reviews |
| Parchment | hero, intro, product, **story**, product, icons, reviews |
| Deep Forest | hero, **icons**, intro, products, story, reviews |
| Field Guide | hero, intro, **story**, products, icons, reviews |
| Golden Hour | hero, **products**, intro, story, icons, reviews |

**What is built differently, not just coloured differently:**

- **Hero.** Faithful splits copy and photo. Parchment arches the photo and captions it like a botanical plate. Deep Forest closes with a band of trust marks. Field Guide replaces the subheading with a ruled Origin / Method / Batch table. Golden Hour runs full height with a frame credit.
- **Product rows.** Field Guide renders the specs as a ruled two-column table with specimen numbers. Golden Hour runs each product as a full-bleed band with the copy over the photograph, alternating sides.
- **Header and footer.** Field Guide centres the wordmark under a dated rule. Golden Hour removes the inline navigation entirely and puts it behind a menu button at every screen size, then closes with a full-width creed band.
- **Product page.** Field Guide adds a ruled spec table. Golden Hour drops the thumbnail rail and stacks every photograph at full size.

**Other templates**: product, collection, page, contact, FAQ, cart, search, 404, blog, article, collections list, gift card, and the password page shown before launch.

**Customer accounts**: login, register, account, order detail, addresses, account activation, and password reset. Customers can log in and see their order history.

**Extra sections you can add**: Bundle offer, for the "Full Ritual Set".

Everything uses the locked brand palette (Mountain Green `#203126`, Parchment Cream `#F3EBDD`, Orange Accent `#C86A22`, Weathered Brown `#6A4A32`) and the brand fonts (Cormorant Garamond and Libre Baskerville, with Jost for small caps).

---

## Known limitations, stated plainly

1. **Reviews are placeholder.** Covered above. Replace or delete before launch. This is the one thing in the theme that will embarrass you if you skip it.
2. **Fonts load from Google, not from Shopify's CDN.** This is the only warning Shopify's theme checker raises, seven times across the two layouts. It costs a little page speed. Self hosting the fonts inside the theme is a small follow up job if you want a perfect score.
3. **The two product photos are bundled inside each theme** as fallbacks so the store never looks broken. Once you upload real product images in Shopify, those take over automatically.
4. **Golden Hour stretches the photos past their native size.** Those images are 1254 pixels square, and that direction runs them full bleed. It looks right today, but that direction will reward a proper photo shoot at 2400 pixels or larger more than the other four.
5. **Nothing here has been run against a real catalogue yet.** The themes were verified with `theme check` and rendered locally with an empty store, which is the state you will upload them in. The first person to connect real products and click through checkout will be you.

### Things that used to be on this list and are now fixed

- **The variant picker is real.** Selecting an option updates the price, the photo, and the Add to Cart button, and writes the variant into the URL so a copied link opens on the right one. Combinations that do not exist are struck through; combinations that exist but are out of stock stay visible and are marked sold out. If JavaScript fails to load, the picker falls back to a plain dropdown that still adds the correct variant, so the form can never submit the wrong thing.
- **No price is invented anywhere.** The bundle works its saving out from the products you nominate. Product rows show no price until a product is connected. There is an automated check in the build that fails if anyone ever types a price into the theme again.

---

## Troubleshooting

**"There was an error uploading your theme"**
The zip was probably unzipped and rezipped. Use the original file exactly as delivered.

**The upload works but the store looks unstyled**
Hard refresh with Ctrl+F5, or Cmd+Shift+R on a Mac. Shopify caches stylesheets aggressively.

**Icons show as empty squares**
`icons.js` did not load. In the theme editor open **Assets** and confirm `icons.js` is present. If your store has an app that blocks or defers theme scripts, allow this one.

**The homepage shows placeholder products, or no prices**
You have not connected real products yet. See step 3e. The missing price is intentional until then.

**The Contact page shows my typed text but no form**
The page is on the wrong template. Edit the page, and under **Theme template** choose **page.contact**, not **page**.

**Customers cannot log in**
Customer accounts are a store setting, not a theme one. Go to **Settings**, then **Customer accounts**, and enable them.

**I cannot find the Themes page**
The Online Store channel is not enabled, or your staff account lacks the Themes permission.

**I published the wrong one**
See "Rolling back" above. It is instant and nothing is lost.

---

## If you want changes

Every one of these is a settings change in **Customize**, not a code change: headings, body copy, button labels, images, the announcement bar, section order, and which sections appear at all.

Anything structural, such as new page types or a redesigned blog layout, comes back to us.

---

*Root and Ritual Botanicals. Concept themes prepared by Hauck Marketing, July 2026.*
