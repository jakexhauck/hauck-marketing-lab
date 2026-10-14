#!/usr/bin/env python3
"""
Lead Scraper for Ad Agencies
Finds local businesses, checks their Meta ad status, scores them, and exports to Google Sheets.

Usage:
  python scrape.py "dentists" "Tampa, FL"
  python scrape.py "HVAC companies" "Phoenix, AZ"
  python scrape.py "med spas" "Miami, FL"
"""

import csv
import json
import os
import sys
import time
from datetime import datetime
from pathlib import Path

# Force UTF-8 on Windows so emoji / box-drawing chars don't crash cp1252 consoles
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

# Optional: Google Sheets integration
try:
    import gspread
    from google.oauth2.service_account import Credentials
    SHEETS_AVAILABLE = True
except ImportError:
    SHEETS_AVAILABLE = False

# Optional: Web search
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False


# ═══════════════════════════════════════
# CONFIGURATION — Edit these values
# ═══════════════════════════════════════

CONFIG = {
    # Google Places API (for search_businesses)
    "google_places_api_key": "AIzaSyBFQrlYlF9fXDJtWCgS5wWyaFx5qSSvGbk",

    # Google Sheets settings
    "google_sheet_id": "158Me4al0LpYH97WxfAY1UeVO3ErUjMJ_RNSy6DT_vZc",  # Paste your Google Sheet ID here
    "credentials_file": "credentials.json",  # Your Google service account key file

    # Scraping settings
    "max_results": 50,
    "min_rating": 3.5,
    "min_reviews": 20,
    "delay_between_searches": 2,  # seconds between requests (be respectful)

    # Scoring thresholds
    "score_5_keywords": ["boost post", "low quality", "stock photo", "blurry", "no cta"],
    "score_4_keywords": ["decent", "professional", "running"],
}

PROSPECTS_DIR = Path(__file__).parent / "prospects"
PROSPECTS_DIR.mkdir(exist_ok=True)


def score_prospect(has_facebook, running_ads, ad_count, ad_quality, rating, reviews):
    """Score a prospect 1-5 based on their ad status and online presence."""
    if running_ads and ad_quality in ("bad", "low"):
        return 5  # Running bad ads = easiest to close
    if running_ads and ad_quality in ("decent", "good"):
        return 4  # Running decent ads = might want better
    if has_facebook and not running_ads:
        return 3  # Facebook page but no ads
    if not has_facebook and rating >= 3.5 and reviews >= 20:
        return 2  # No Facebook but good business
    return 1  # No online presence


def search_businesses(niche, city, max_results=50):
    """
    Search Google Places (New) Text Search for businesses matching niche + city.
    Returns rich records: name, phone, website, address, rating, reviews.
    Facebook / ads fields are filled in later by check_meta_ads().
    """
    print(f"\n🔍 Searching Google Places for {niche} in {city}...")

    api_key = CONFIG["google_places_api_key"]
    if not api_key:
        print("   ❌ No GOOGLE_PLACES_API_KEY set. Add it to CONFIG or set env var.")
        return []

    url = "https://places.googleapis.com/v1/places:searchText"
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": api_key,
        "X-Goog-FieldMask": (
            "places.displayName,places.formattedAddress,places.nationalPhoneNumber,"
            "places.websiteUri,places.rating,places.userRatingCount,places.id"
        ),
    }

    results = []
    page_token = None

    while len(results) < max_results:
        body = {"textQuery": f"{niche} in {city}", "pageSize": min(20, max_results - len(results))}
        if page_token:
            body["pageToken"] = page_token

        try:
            r = requests.post(url, json=body, headers=headers, timeout=20)
            if r.status_code != 200:
                print(f"   ❌ Places API {r.status_code}: {r.text[:500]}")
                break
            data = r.json()
        except Exception as e:
            print(f"   ❌ Places API error: {e}")
            break

        for place in data.get("places", []):
            results.append({
                "name": place.get("displayName", {}).get("text", ""),
                "phone": place.get("nationalPhoneNumber", ""),
                "website": place.get("websiteUri", ""),
                "address": place.get("formattedAddress", ""),
                "rating": place.get("rating", 0) or 0,
                "reviews": place.get("userRatingCount", 0) or 0,
                "place_id": place.get("id", ""),
                # Filled in by check_meta_ads()
                "has_facebook": False,
                "running_ads": False,
                "ad_count": 0,
                "ad_quality": "unknown",
            })

        page_token = data.get("nextPageToken")
        if not page_token or len(results) >= max_results:
            break
        # Places API requires a short delay before nextPageToken is valid
        time.sleep(2)

    print(f"   ✅ Pulled {len(results)} businesses from Places")
    return results[:max_results]


def check_meta_ads(business_name):
    """
    Check Meta Ad Library for active ads from this business by scraping the
    public search page. Returns {has_facebook, running_ads, ad_count, ad_quality}.

    Public Ad Library search URL:
      https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US&q=<name>&search_type=keyword_unordered

    Note: Meta serves a heavy JS shell; we parse the embedded JSON server payload
    that lists ad counts. If the structure changes or we hit a rate limit, we
    fall back to has_facebook=unknown so scoring still works.

    Swap-out path: when ready, replace this body with a call to the official
    Meta Ad Library API (https://www.facebook.com/ads/library/api/) — keep the
    return shape identical so callers don't change.
    """
    try:
        from urllib.parse import quote_plus
        q = quote_plus(business_name)
        url = (
            "https://www.facebook.com/ads/library/?active_status=active"
            f"&ad_type=all&country=US&q={q}&search_type=keyword_unordered"
        )
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
            ),
            "Accept-Language": "en-US,en;q=0.9",
        }
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code != 200:
            return {"has_facebook": False, "running_ads": False, "ad_count": 0, "ad_quality": "unknown"}

        html = r.text
        # Heuristic 1: Meta shows "~N results" or "N results" on the search page
        import re
        m = re.search(r'"total_count":\s*(\d+)', html)
        if not m:
            m = re.search(r'(\d+)\s+result[s]?\b', html, re.IGNORECASE)
        ad_count = int(m.group(1)) if m else 0

        # Heuristic 2: if the page mentions the business at all, assume FB presence
        has_facebook = business_name.split()[0].lower() in html.lower() if business_name else False

        running_ads = ad_count > 0
        # Quality is hard to determine without inspecting creatives — leave as "unknown"
        # so the scorer treats them as Score 4 (running ads, decent) by default.
        ad_quality = "decent" if running_ads else "none"

        return {
            "has_facebook": has_facebook or running_ads,
            "running_ads": running_ads,
            "ad_count": ad_count,
            "ad_quality": ad_quality,
        }
    except Exception:
        return {"has_facebook": False, "running_ads": False, "ad_count": 0, "ad_quality": "unknown"}


def export_to_csv(prospects, niche, city):
    """Save prospects to a local CSV file."""
    date_str = datetime.now().strftime("%Y-%m-%d")
    safe_city = city.replace(",", "").replace(" ", "-").lower()
    safe_niche = niche.replace(" ", "-").lower()
    filename = PROSPECTS_DIR / f"{safe_city}-{safe_niche}-{date_str}.csv"

    headers = [
        "Score", "Business Name", "Phone", "Website", "Address",
        "Rating", "Reviews", "Facebook Page", "Running Ads",
        "Number of Ads", "Ad Quality Notes",
        "Outreach Date", "Response", "Notes", "Follow-Up Date"
    ]

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for p in prospects:
            writer.writerow([
                p["score"],
                p["name"],
                p["phone"],
                p["website"],
                p["address"],
                p["rating"],
                p["reviews"],
                "Yes" if p["has_facebook"] else "No",
                "Yes" if p["running_ads"] else "No",
                p["ad_count"],
                p["ad_quality"],
                "", "", "", ""  # Empty tracking columns
            ])

    print(f"\n💾 Saved to {filename}")
    return filename


def export_to_sheets(prospects, niche, city):
    """Push prospects to Google Sheets."""
    if not SHEETS_AVAILABLE:
        print("\n⚠️  Google Sheets not available. Install with: pip install gspread google-auth")
        return None

    sheet_id = CONFIG["google_sheet_id"]
    creds_file = CONFIG["credentials_file"]

    if not sheet_id:
        print("\n⚠️  No Google Sheet ID configured. Edit CONFIG in scrape.py")
        return None

    if not os.path.exists(creds_file):
        print(f"\n⚠️  Credentials file not found: {creds_file}")
        print("   Follow the README to set up Google Sheets API credentials.")
        return None

    try:
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive"
        ]
        creds = Credentials.from_service_account_file(creds_file, scopes=scopes)
        gc = gspread.authorize(creds)
        sh = gc.open_by_key(sheet_id)

        # Create new tab
        date_str = datetime.now().strftime("%Y-%m-%d")
        tab_name = f"{city} - {niche.title()} - {date_str}"

        try:
            worksheet = sh.add_worksheet(title=tab_name, rows=len(prospects) + 5, cols=15)
        except Exception:
            # Tab might already exist
            worksheet = sh.worksheet(tab_name)
            worksheet.clear()

        # Headers
        headers = [
            "Score", "Business Name", "Phone", "Website", "Address",
            "Rating", "Reviews", "Facebook Page", "Running Ads",
            "# of Ads", "Ad Quality",
            "Outreach Date", "Response", "Notes", "Follow-Up Date"
        ]

        # Build all rows
        rows = [headers]
        for p in prospects:
            rows.append([
                p["score"],
                p["name"],
                p["phone"],
                p["website"],
                p["address"],
                p["rating"],
                p["reviews"],
                "Yes" if p["has_facebook"] else "No",
                "Yes" if p["running_ads"] else "No",
                p["ad_count"],
                p["ad_quality"],
                "", "", "", ""
            ])

        worksheet.update(rows, value_input_option="RAW")

        # Format header row
        worksheet.format("A1:O1", {
            "textFormat": {"bold": True},
            "backgroundColor": {"red": 0.85, "green": 0.92, "blue": 1.0}
        })

        # Freeze header row
        worksheet.freeze(rows=1)

        print(f"\n📊 Pushed to Google Sheets: tab '{tab_name}'")
        return tab_name

    except Exception as e:
        print(f"\n❌ Google Sheets error: {e}")
        print("   CSV backup was still saved locally.")
        return None


def main():
    if len(sys.argv) < 3:
        print("Usage: python scrape.py \"niche\" \"city, state\"")
        print("Example: python scrape.py \"dentists\" \"Tampa, FL\"")
        sys.exit(1)

    niche = sys.argv[1]
    city = sys.argv[2]

    print(f"""
╔══════════════════════════════════════╗
║     LEAD SCRAPER FOR AD AGENCIES     ║
╚══════════════════════════════════════╝

  Niche: {niche}
  City:  {city}
  Max:   {CONFIG['max_results']} businesses
  Min:   {CONFIG['min_rating']}⭐ / {CONFIG['min_reviews']} reviews
""")

    # Search for businesses
    businesses = search_businesses(niche, city, CONFIG["max_results"])

    # Check Meta Ad Library for each business
    if businesses:
        print(f"\n🔎 Checking Meta Ad Library for {len(businesses)} businesses...")
        for i, b in enumerate(businesses, 1):
            meta = check_meta_ads(b["name"])
            b.update(meta)
            print(f"   [{i}/{len(businesses)}] {b['name']}: "
                  f"{'ads' if meta['running_ads'] else 'no ads'} ({meta['ad_count']})")
            time.sleep(CONFIG["delay_between_searches"])

    # Score and filter
    prospects = []
    for b in businesses:
        score = score_prospect(
            b.get("has_facebook", False),
            b.get("running_ads", False),
            b.get("ad_count", 0),
            b.get("ad_quality", "none"),
            b.get("rating", 0),
            b.get("reviews", 0)
        )

        if b["rating"] >= CONFIG["min_rating"] and b["reviews"] >= CONFIG["min_reviews"]:
            b["score"] = score
            prospects.append(b)

    # Sort by score (desc), then rating (desc)
    prospects.sort(key=lambda x: (-x["score"], -x["rating"]))

    print(f"\n✅ Found {len(prospects)} qualified prospects")

    # Show score breakdown
    scores = {}
    for p in prospects:
        scores[p["score"]] = scores.get(p["score"], 0) + 1
    for s in sorted(scores.keys(), reverse=True):
        labels = {5: "Bad ads (easiest)", 4: "Decent ads", 3: "FB, no ads", 2: "No FB, good biz", 1: "Skip"}
        print(f"   Score {s}: {scores[s]} prospects — {labels.get(s, '')}")

    # Export
    csv_file = export_to_csv(prospects, niche, city)
    export_to_sheets(prospects, niche, city)

    print(f"""
╔══════════════════════════════════════╗
║              DONE! ✅                ║
╠══════════════════════════════════════╣
║  {len(prospects):3d} prospects found and scored      ║
║  CSV saved to prospects/ folder      ║
║                                      ║
║  Next: Open your Google Sheet and    ║
║  start outreaching Score 5s first!   ║
╚══════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()
