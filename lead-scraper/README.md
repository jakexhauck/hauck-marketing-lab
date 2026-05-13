# Lead Scraper for Ad Agencies

Find local business prospects automatically. Scores them by how easy they are to close.

## Quick Start

1. Open this folder in Claude Code (VS Code)
2. Tell Claude: "Set up the lead scraper for me. Make the search function work with real web search."
3. Claude will configure everything
4. Run: `python scrape.py "dentists" "Tampa, FL"`
5. Check your prospects/ folder for the CSV

## Google Sheets (Optional)

1. Set up Google API credentials (ask Claude to walk you through it)
2. Save your key as `credentials.json` in this folder
3. Paste your Google Sheet ID into `scrape.py`
4. Share the sheet with your service account email
5. Run the scraper — prospects appear in a new tab automatically

## Files

- `scrape.py` — The main scraping script
- `INSTRUCTIONS.md` — Instructions for Claude Code (tell Claude to read this file)
- `requirements.txt` — Python dependencies
- `prospects/` — Where CSV files are saved
- `credentials.json` — Your Google API key (you create this)

## Need Help?

Open Claude Code and ask. The INSTRUCTIONS.md file tells it everything about this project.
