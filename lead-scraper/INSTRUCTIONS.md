# Lead Scraper — Claude Code Instructions

You are helping a user set up and run an automated lead scraping tool for their ad agency.

## What This Project Does
- Searches for local businesses by niche and city
- Pulls contact info, Google ratings, and review counts
- Checks Meta Ad Library for active Facebook/Instagram ads
- Scores prospects 1-5 (5 = running bad ads = easiest to close)
- Exports to Google Sheets and local CSV

## First Time Setup

When the user first opens this project, walk them through:

1. **Install dependencies**: `pip install -r requirements.txt`
2. **Google Sheets setup** (if they want Sheets integration):
   - Go to console.cloud.google.com
   - Create a project (or use existing)
   - Enable Google Sheets API and Google Drive API
   - Create a service account → download JSON key → save as `credentials.json` in this folder
   - Create a Google Sheet, copy the Sheet ID from the URL
   - Share the sheet with the service account email (Editor access)
   - Paste the Sheet ID into `scrape.py` CONFIG section
3. **Make search_businesses() work**: Replace the placeholder function with real web search logic. Use web search to find actual businesses on Google Maps / Google Search for the given niche and city.

## How to Run
```
python scrape.py "dentists" "Tampa, FL"
python scrape.py "HVAC companies" "Phoenix, AZ"
```

## Scoring System
- 5 = Running ads but they look bad (easiest client to close)
- 4 = Running ads, decent quality (pitch better results)
- 3 = Has Facebook page but no ads (needs education)
- 2 = No Facebook page, good reviews (potential but more work)
- 1 = No online presence (skip)

## Important
- The search_businesses() function uses placeholder data. Your first task is to make it actually search the web.
- Be respectful with search rates — 2-3 second delay between requests
- Only include businesses with 3.5+ stars and 20+ reviews
- Always save a local CSV backup even if Google Sheets works
