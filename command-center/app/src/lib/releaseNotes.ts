// What changed in the console, and who has already been told.
//
// The agency console has more than one person in it now, so a feature that
// ships silently is a feature only the person who asked for it knows about.
// Every release that changes what someone can DO gets an entry here, and the
// admin shell shows it once per person.
//
// Pure and testable: no React, no storage, no Date.now(). The component owns
// reading and writing; this file owns what a release is and which ones a given
// person still owes a look at.

export interface Release {
  // Stable, sortable, and never reused: this is the value stored against a
  // person to say "seen up to here". Renaming one re-shows the release, which
  // is the safe direction to be wrong in.
  id: string;
  // "27 July 2026", written out rather than derived, so the note reads the same
  // in every timezone.
  date: string;
  title: string;
  // One line per thing a person can now do. Written for the person using it,
  // not for the person who built it: no file names, no table names.
  items: string[];
}

// Newest FIRST. The list is the source of truth for the popup and its order.
export const RELEASES: Release[] = [
  {
    id: "2026-08-22-scrape-wizard-cities",
    date: "22 August 2026",
    title: "New scrape asks the niche, then the size, then hands you the city list",
    items: [
      "Three steps in the order the answers depend on each other. The trade decides what 'already done' means for a city, and the size decides how many cities you are allowed, so both are asked before you pick a single one.",
      "Step three is the Cities table itself, with a tick box on every row. You are picking cities while looking at what has already been done in each one, for the trade you just chose, rather than typing names and hoping.",
      "The counter reads 12 of 40. At the cap the remaining boxes go dead instead of letting you build a list the runner will silently cut: Quick takes 1 city, Standard 40, Deep 400. Dropping to a smaller size trims the list and says how many it dropped.",
      "The paste box still works and now ticks rows instead of replacing them. Paste a list and each city is matched to its row, history and all. A city we have never seen gets a row of its own so it can still be ticked.",
      "Picking states and letting it guess the suburbs is gone. Those curated suburbs are all in the table now, so you can see and tick them yourself.",
    ],
  },
  {
    id: "2026-08-22-city-coverage-per-trade",
    date: "22 August 2026",
    title: "Cities remembers what you scraped, and which trade you scraped it for",
    items: [
      "The Cities tab now lists every city you have ever worked, not just the 999 biggest. The cities you type in yourself are wealthy suburbs (Mercer Island, Los Gatos, Gig Harbor, Bloomfield Hills), almost none of which are big enough for a population list, so 409 cities you had already scraped were showing up nowhere at all. They now carry their runs, their leads and their date. An off-list city has no rank and no population; it has everything else.",
      "Every row says which trades it has been worked for, and picking a trade scopes the counts to it. Los Gatos has been run for garage doors and never for windows, so it now reads as open for windows instead of a plain green tick.",
      "A new filter, Open for this trade: cities that have been worked before, for something else. That is the shortlist worth taking to the next niche.",
      "The wizard marks a city before you spend the run on it. Paste your list, pick the trade, and each city says what is already there: amber for done, indigo for worked under another trade.",
      "A line like 'Frisco / Southlake TX' now counts as two cities. It used to be searched literally, one query with a slash in it, matching no city anywhere.",
    ],
  },
  {
    id: "2026-08-21-dialer-hides-booked",
    date: "21 August 2026",
    title: "A prospect who is already booked stays off the power dialer",
    items: [
      "Ringing someone who is already booked no longer puts a card on the dialer. Calling a booked prospect back, from their contact record or anywhere else, used to raise a card asking what the call became, and none of the six outcomes fit a prospect who already has a meeting in the diary, so it sat there.",
      "The call still counts as a dial. Nothing changes about your numbers; what changes is that nobody is asked to judge a call whose answer was settled days ago.",
      "A prospect marked Not Interested is still shown. Say the word if you want them treated the same way.",
    ],
  },
  {
    id: "2026-08-21-run-size-caps",
    date: "21 August 2026",
    title: "A run size says how many cities it will take",
    items: [
      "Quick, Standard and Deep now show their city limit on the button: one city, up to 40, up to 400. Picking a size too small for the list you pasted used to scrape the first city and drop the rest without saying so.",
    ],
  },
  {
    id: "2026-08-21-dialer-stability",
    date: "21 August 2026",
    title: "The power dialer stops throwing you out mid-shift",
    items: [
      "Being signed out while calling is fixed. A moment where the database did not answer was being read as your account no longer existing, so the console signed you out, wiped what it held, and the reload after it asked you to log in again. A read that fails now says so and your session is left alone.",
      "Cards no longer vanish and come back. The same failure could report a quiet moment on the phones instead of admitting it had not read anything, which cleared every call off the screen for eight seconds. Your calls stay put while it asks again.",
      "The dials-today counter holds its number instead of dropping to zero and climbing back.",
      "An outcome you press stays pressed. The card the poll used to put back a second or two after you marked it, so the same call sat there asking to be judged twice, is gone for good the moment you press.",
      "A call already marked no longer bounces back onto the screen when a second press is refused. The outcome was recorded the first time.",
      "The pipeline board says which side failed rather than blaming GoHighLevel for everything.",
    ],
  },
  {
    id: "2026-08-21-booking-timezone",
    date: "21 August 2026",
    title: "A booking is confirmed in the prospect's timezone",
    items: [
      "The timezone you pick when booking is now the timezone the prospect is told. It goes to GoHighLevel as the contact's own zone, so the confirmation and every reminder read on their clock.",
      "This was wrong before. GoHighLevel was never given a timezone for these contacts, so it fell back to the account's, which is Eastern. A meeting agreed as noon in California went out in writing as three in the afternoon. The appointment itself was always at the right moment; only the hour named in the message was wrong.",
      "The picker opens on the prospect's own clock rather than yours, so a booking made without touching it is right by default.",
      "The picker is down to Eastern, Central and Pacific. A prospect outside those three is still offered their own zone, marked (theirs), so they can be told the correct hour.",
      "Picking a zone while booking also corrects it on the lead, so the clock on the call card agrees with what the prospect was sent.",
    ],
  },
  {
    id: "2026-08-21-leads-timezone-filter",
    date: "21 August 2026",
    title: "Leads can be filtered to one timezone",
    items: [
      "Leads has a timezone picker: Eastern, Central, Mountain, Pacific, or every timezone. It reads the area code of each number, the same way the call card works out what time it is where the prospect is.",
      "Mountain is in the list because 32 of the leads waiting are in it. Without it they would have had no zone to be found under.",
      "The filter runs against the whole list, not the rows on screen. The table shows 200 at a time out of 215, so a filter done in the browser would have quietly missed the tail and given you a total that did not match it.",
      "Downloading the CSV while a timezone is picked hands over that timezone only. It marks what it gives you as sent, so a file wider than the screen would have burned leads you never saw.",
      "A handful of numbers will be an hour out. Several states straddle a zone line, and each area code is filed under the zone most of its territory keeps.",
    ],
  },
  {
    id: "2026-08-21-not-my-niche",
    date: "21 August 2026",
    title: "Not my niche is a button, and it does not count as a dial",
    items: [
      "The call card has a Not my niche button, next to Not qualified. Use it for a business in a trade you do not sell to. It ends the prospect exactly as the other nos do and moves you on to the next call.",
      "A Not my niche call is left out of Dials today, out of the tracker's calls made, and out of a script's dial count. Ringing the wrong business measures the list, not the day, and counting it made the number climb the worse the list was.",
      "Not qualified still counts as a dial. Somebody who could have bought and does not is a call that happened, so nothing about that button has changed.",
      "Today's 56 Not qualified calls have been re-filed as Not my niche, because that is what they were: every one came off the power dialer and none lasted more than seven seconds. Dials today for 21 August drops from 104 to 48. The 19th and 20th are untouched.",
    ],
  },
  {
    id: "2026-08-21-leads-page-sends-what-you-tick",
    date: "21 August 2026",
    title: "Leads sends what you tick, and stops running out of Cloudflare",
    items: [
      "Send to power dialer no longer greys itself out. The page was still refusing anything that scored under 50 a full day after the score stopped deciding anything, and an imported lead has no score at all, so every one of the 75 leads waiting on Import leads was untickable while the send was ready to take all of them.",
      "The Score column is gone. It still puts the best businesses at the top of the list, which is the job it was doing; you no longer have to read it.",
      "The Status column is gone. Nobody on this page has been contacted yet, so it could only ever say the same thing on every row.",
      "Landline numbers no longer appear anywhere on Leads, and the 194 that were sitting there have been deleted. They could never be sent and could never be dialled, so they only ever made the counts look bigger than the work.",
      "A big send stops dying halfway through. It was asking Cloudflare for 65 things in one go against a limit of 50, so a full batch failed after about eight leads had already gone to GoHighLevel. It now asks for about 23.",
      "A batch that does fail no longer takes the whole send with it. The rest still go, and the receipt tells you what landed instead of just saying it stopped.",
      "If a lead reaches GoHighLevel but cannot be marked as sent here, the receipt now warns you, so you do not send it twice.",
      "The list can show more than 200 leads. There is a Show all button when there are more.",
      "Downloading the CSV is a button rather than a link. It marks the rows it hands over as sent, and a link is something a browser can follow on its own.",
    ],
  },
  {
    id: "2026-08-21-garage-doors-is-a-trade",
    date: "21 August 2026",
    title: "Garage door companies can be scraped",
    items: [
      "Garage door installation is a trade you can pick in the scrape wizard. These firms install and repair the same doors, so both count.",
      "They were being thrown away on purpose until now: garage doors sit on the exclusion list every other trade inherits, so that a windows or roofing list never fills up with them. That exclusion still holds everywhere else.",
      "Counter shops and supply yards are still refused. The firm has to be one Google calls a garage door business, not a shop that sells the parts.",
    ],
  },
  {
    id: "2026-08-21-leads-run-says-what-can-be-rung",
    date: "21 August 2026",
    title: "A scrape run now says how many leads can actually be rung",
    items: [
      "A run now says how many leads are left to call, in place of how many it kept. Kept counted writes, not businesses: one company found by three of the ten search terms was counted three times, so a run reading 78 kept had put 40 businesses in the table, 16 of them callable. The number beside a run is now counted the same way the list is, so it always matches what you see when you click into it.",
      "Somebody asking not to be contacted is now one command instead of a hand edit of a text file. The number is refused by the CSV download and by both send buttons, it leaves Leads, and it stays refused even if it has already been sent.",
      "A lead ticked but refused for being on that list now says so, instead of claiming it had already been sent.",
      "Leads found through the directory top-up, when a city comes back thin, had no phone type recorded and so could never be sent to anything. They are now checked the same way as everything else.",
      "A scrape that gets stopped and started again keeps the numbers it already reported. Restarting used to set every count on that run back to zero, so a run half way through read as having found nothing.",
    ],
  },
  {
    id: "2026-08-20-qualifier-requires-the-trade",
    date: "20 August 2026",
    title: "Leads has to look like the trade, not merely avoid looking wrong",
    items: [
      "The qualifier used to work by rejection alone: it knew a long list of businesses to throw away, and kept anything that list did not happen to mention. That is why dentists, opticians, a jeweller and a self-storage yard were sitting in Leads. A business now has to show a sign of the trade before it is kept at all.",
      "To reach a calling list, the trade has to be what the business is listed AS, not just a word in its name. A window tinting shop and a stained glass studio were both reaching windows lists on the strength of the word in their sign.",
      "74 leads that no longer qualify have been taken off Leads. They are not deleted: they stay in the database, a re-scrape still enriches them, and every value the change overwrote was written down first so it can be put back. Nothing already sent or queued was touched.",
      "Downloading a CSV now asks which trade you want. The list holds every trade ever scraped, including ones no longer worked, and a download that did not ask was quietly mixing them together.",
      "A run that gets stopped part way now reads queued instead of sitting on running for ever, and picks up where it left off when a runner is started again.",
      "The 202 leftover HVAC leads have been retired. HVAC stopped being a trade we hunt some time ago, but its leads stayed in the pool, scored above everything else and sorted to the top of any list that did not ask which trade it wanted. The ones already called are untouched.",
    ],
  },
  {
    id: "2026-08-20-import-leads-page",
    date: "20 August 2026",
    title: "Import leads: one place for lists from other scrapers",
    items: [
      "There is a new page beside Leads called Import leads. Drop in a CSV from any external scraper, confirm which column is which, and the rows land in the same list everything else lives in.",
      "Imported leads work exactly like scraped ones: same table, same filters, same Send to power dialer. They are not scored, because a score is what our own qualifier thought of a business it found, and a row from someone else's file has no such history.",
      "A number already in the table is skipped rather than added twice, and the result says how many. Rows with no phone number are left out, since this is a calling list.",
      "The CSV download button has moved onto that page, and now downloads the list you are looking at rather than everything.",
    ],
  },
  {
    id: "2026-08-20-sent-leads-leave-the-list",
    date: "20 August 2026",
    title: "A lead you have sent to the power dialer leaves the list",
    items: [
      "Once a lead goes to the power dialer it disappears from Leads entirely, on every filter, not just the Ready to send one. It could never be sent twice anyway, so it was only offering work already done and making the counts read higher than the number of leads left to action.",
      "The Already sent option is gone from the filter, because there is nothing left for it to show.",
      "Across every niche that takes the list from 810 down to 387, which is the number actually left to work.",
    ],
  },
  {
    id: "2026-08-20-score-no-longer-blocks-a-send",
    date: "20 August 2026",
    title: "A low score no longer stops you sending a lead",
    items: [
      "Ready to send was hiding good leads. It refused anything scoring under 50, which on the windows and doors list meant 5 of 26 sendable companies were shown and the other 21 were not. The score now sorts the list instead of policing it, so the best are still at the top and the rest are reachable.",
      "The same change applies to the CSV download, so the file matches the list it came from.",
      "Send to Cold Call is gone. Send to power dialer does that job and tags them for the dialer at the same time.",
      "A lead that has already gone out is still never sent again, however many times it is ticked.",
      "Landlines are still held back. That rule is untouched, and on this list it is now the only thing between a lead and a send.",
    ],
  },
  {
    id: "2026-08-20-cold-call-power-dialer-first",
    date: "20 August 2026",
    title: "Cold Call opens on the Power dialer, and the stages are one board",
    items: [
      "Cold Call opens on Power dialer. It is the page to have beside the GoHighLevel power dialer while it works the list: the call you just had appears on it and you record what happened.",
      "New Lead, No Answer Day 1, No Answer Day 2, Call Back and Booked are no longer five pages. They are the five columns of one new page, Pipeline: the cold calling board read live from GoHighLevel, so it shows where every prospect stands right now.",
      "A card on that board opens the contact in GoHighLevel. Nothing on the page moves a card: the dialer and your workflows do that, and a second place to drag them would let the two disagree.",
      "The board draws up to 500 prospects and says so if there are more. The old stage pages read one page of 100 and said nothing.",
      "An old link or bookmark to one of the stage pages now opens the board.",
    ],
  },
  {
    id: "2026-08-20-windows-doors-trade",
    date: "20 August 2026",
    title: "Windows and doors is its own trade, and a dead scrape is no longer blocking you",
    items: [
      "There is a new trade in the picker: Windows and doors installation. It hunts replacement windows, entry doors, patio doors and storm doors. Garage door companies are deliberately not in it.",
      "The trade that used to be called Siding and windows is now Siding, gutters and insulation, and no longer collects window or door firms. Two trades cannot both claim the same kind of business, or picking one of them would quietly return the other's leads. If you want windows, pick the new trade.",
      "The all-trades option still finds everything, windows and doors included.",
      "A scrape that died on 17 August was still showing as running, which was the message on your screen and was also refusing to let you start a new one. It has been closed out as failed, because it stopped at 8 of its 280 searches rather than finishing.",
    ],
  },
  {
    id: "2026-08-20-hvac-dropped",
    date: "20 August 2026",
    title: "HVAC is no longer a trade the lead scraper hunts",
    items: [
      "The trade picker offers five trades instead of six. Heating and cooling is gone from it.",
      "The all-trades option no longer collects HVAC either. It was hunting furnace, air conditioning and heating firms directly, so removing the HVAC button on its own would have left them still arriving through the catch-all.",
      "Every remaining trade now refuses an HVAC company outright, including ones that only say Mechanical or Air Conditioning in their category.",
      "The 129 HVAC companies already in the book have been taken out of the calling list. They cannot be dialled, texted or sent onward. Their call history is kept and still readable, including the ones marked Not Interested and the six asking for a call back.",
    ],
  },
  {
    id: "2026-08-11-conversion-asset-fields-saved",
    date: "11 August 2026",
    title: "Conversion Assets now keeps everything you type into it",
    items: [
      "The steering notes on a Unique Mechanism asset are saved. Until now they were typed, the save reported success, and the text was thrown away between the screen and the database, so the prompt the screen handed over said 'none given' and the page got built from the trade alone.",
      "The method name on that same asset is saved, for the same reason.",
      "The gift on an Owner Story asset is saved: the offer, the code and the terms. All three were being dropped the same way, which meant the page could not hand over the thing its text message had already promised.",
      "If you filled any of those in before today, open the asset and type them again. What was typed then was never stored, so there is nothing to recover.",
    ],
  },
  {
    id: "2026-08-10-calendar-sync",
    date: "10 August 2026",
    title: "A client's own calendar now protects their booking times",
    items: [
      "New clients are asked to link their Google Calendar when they first sign in, alongside their Facebook page and Instagram account. Existing clients are not: nobody is locked out of an app they were already using.",
      "Once linked, the times they are already busy stop being offered on the Home Estimate calendar. A dentist appointment in their own diary now blocks that slot without anyone typing anything.",
      "A meeting that moves moves its block. A meeting that is cancelled gives the slot straight back.",
      "Every appointment now lands in their calendar, not just the ones booked inside this app. Bookings taken on a booking page or added by us appear too, and a cancelled one is removed, which nothing did before.",
      "Runs every fifteen minutes on its own.",
    ],
  },
  {
    id: "2026-08-10-crm-connection",
    date: "10 August 2026",
    title: "A client's reporting wiring is now a screen",
    items: [
      "Fulfillment, GHL, Connection is a new tab beside Conversion Assets: whether the reporting app is installed for a client, and what it has actually sent.",
      "The event board lists all nineteen events, each with when it last arrived and how many have. A client whose reporting quietly died now shows as a row of grey dots instead of as a question nobody asked.",
      "Stages lists every live pipeline stage, the status it currently reads as, and a dropdown to correct the ones that read wrong. Leaving a stage on 'by name' keeps today's behaviour.",
      "Provision writes the webhook address and the required tag into a client's account, so building an automation is picking a value from a dropdown rather than pasting an address and a secret by hand.",
      "Source switches a client between the old hand-built automations and the new app. It stays locked until the app has been seen to deliver for that client, because turning it on early would leave them reporting nothing.",
    ],
  },
  {
    id: "2026-08-10-lead-form-builder",
    date: "10 August 2026",
    title: "Lead forms are built here, not in Ads Manager",
    items: [
      "Paid Ads, Ad Builder, Lead Form is now Meta's own instant form builder: form type, intro, questions, privacy and completion, in Meta's order, with a working preview of the form beside it.",
      "The preview is fillable. Tap an answer and the follow-up appears exactly where Facebook would put it, so a branch that never fires is caught here instead of after the money is spent.",
      "Conditional questions are built the way Facebook builds them: press Follow-up on the answer that should reveal it, and the question sits nested under that answer.",
      "Moving a question takes its follow-ups with it, and renaming an answer carries its rules across. Neither can quietly un-branch a form any more.",
      "Every question now carries the field name the lead arrives under, shown before it matters rather than found as a column of blanks a week later.",
      "Appointment requests and store locators are available, alongside prefill, short answer and multiple choice.",
      "Privacy gained a link label, a disclaimer title and real consent checkboxes. Completion gained Meta's five button kinds, and only shows the URL or the phone number the chosen button actually uses.",
      "Settings holds the form language, sharing and tracking parameters.",
      "Copy form now prints the whole thing, follow-ups nested under their answers and field names in a column, so building the real form in Ads Manager is a walk down the page.",
    ],
  },
  {
    id: "2026-08-10-client-inbox-handoff-gate",
    date: "10 August 2026",
    title: "A client's Inbox holds their work, not ours",
    items: [
      "The client Inbox now shows one thing: the chats for estimates we book and leads we hand off. A lead we are still working does not appear in it.",
      "Everything upstream is gone from their view. The raw opt-ins, the seven-day no-answer chase and anything binned stay on our side, where they were always meant to be.",
      "A lead arrives in their Inbox at the moment it reaches the Sales pipeline, and stays for good after that, whether it goes on to win or lose.",
      "This is a real gate, not a tidier list: a thread we have not handed over cannot be opened or replied to from the client app even with its link.",
      "Reviews, Chats is untouched. A past customer we have asked for a review is the client's own customer, so those threads still show.",
      "A client whose pipelines we cannot read keeps seeing everything, exactly as before. Nobody's Inbox goes blank because a setting is missing.",
      "If a client does not call their hand-off pipeline Sales, set the pipeline on their client record and the Inbox follows it.",
    ],
  },
  {
    id: "2026-08-10-conversion-assets",
    date: "10 August 2026",
    title: "Follow Up Creation becomes Conversion Assets, and stops writing copy",
    items: [
      "The follow-up texts are universal now. They are written once and they live in GoHighLevel, so the app no longer asks you to write one. Everything to do with the message is gone from this screen.",
      "Every client gets the same three pages, and the screen opens on those three as cards: Recent Work, Owner Story, Unique Mechanism. Each card says when its text goes out, what the page is for, and whether it has been built.",
      "Recent Work is the first text a new lead gets. Up to five before and after jobs, reviews you paste in, and a fixed set of trust facts: licensed, insured, years in business, jobs completed, warranty, service area.",
      "Owner Story is the second. You give a photo, their name, and bullet notes to steer it. You do not write the story: the notes are the raw material and the page gets written from them.",
      "That text promises a gift on the website, so the Owner Story page now carries it. The offer starts at 10% off and you can change it, add a code, and add terms. The page cannot be finished without one, because a page that does not hand it over is a promise we already broke.",
      "Unique Mechanism goes out with the estimate reminders. It names their process and frames it as nobody else's. Almost nothing is required: give it a method name and some steering if you have them, and leave it blank if you do not.",
      "Nothing on that page is a claim anybody could fact check. No statistics, no certifications, no awards. It is how they work and why the usual way falls short, which is what makes it safe to run for any client in any niche.",
      "Unique Mechanism asks for nothing. No calendar, no button, no phone number. Everyone reading it already has an appointment, so it exists to make them keep it. Its Booking step does not exist at all.",
      "The page addresses are fixed: /recent-work, /meet-the-owner and /our-process, the same for every client, because one universal text can only carry one address. The Link step hands you the two lines to paste into GoHighLevel.",
      "Fill the design in once. The second and third asset for the same client open with the colours, the logo, the appointment type and the calendar already carried over.",
      "The live preview beside the form draws the right page for the asset you picked: the proof grid with its reviews and trust chips, the owner with the gift above the button, or the named method as numbered steps.",
      "The three texts themselves now live in the app as fixed reference. You cannot edit them here, because they live in GoHighLevel, but the Content step shows you the exact message this page is answering, and the prompt quotes it so the first screen of the page pays off what the text promised.",
      "The last step hands you a finished prompt, not a summary. Copy it, paste it into Claude, and the page comes back. It carries the file path, the mount id, the design, the content, the calendar embed and every build rule, so it works pasted into a fresh Claude with nothing else open.",
      "The whole panel now fills the screen instead of sitting as a short card in a tall page, and the form and the preview each scroll on their own.",
    ],
  },
  {
    id: "2026-08-10-ghl-follow-up-creation",
    date: "10 August 2026",
    title: "Follow-up pages get built from a screen instead of a chat window",
    items: [
      "New page under Fulfillment: GHL. Its first section is Follow Up Creation, where the asset pages our SMS follow-ups link to get planned.",
      "It asks in a fixed order: the client, which follow-up, then the message. Nothing about design, assets or booking is asked until the message is signed off, because the message is what decides what the page has to be.",
      "The message box opens with a starting pattern for whichever angle you pick, lifted off the two Willis follow-ups that are live. Change the angle after you have written something and your writing stays put.",
      "Or press Generate 3 and Claude writes three, in the owner's voice, differing by angle rather than by wording. Read them, press Use this on the one you want, then edit it. There is a box beside the button for steering a run (\"mention the $100 off\").",
      "Generating runs on your own machine and your own Claude account, so there is no new key and no new bill. It therefore only works while you are running the app locally: on the live site the same button hands you the brief to paste into Claude instead.",
      "Character and segment counts sit above the message box, so a follow-up does not quietly cost three sends.",
      "Design asks only what it still needs to know. Upload a design kit and it stops asking about colours, because the kit is the answer. Pull from a website and it asks whether to use that site's colours or ones you pick. The plain default still asks.",
      "The logo, the design kit and every photo are uploaded from your machine. No hunting for a link to paste, and a thumbnail appears so you can see the right file went into the right place.",
      "The assets step tells you what the page needs rather than leaving you to guess: one photo, or two, or at least three. Choose a before and after slider and it asks for the before photo and the after photo by name, in that order, so a pair can never end up the wrong way round.",
      "New leads get two asset sends and the screen holds you to it. The second one inherits the client, the look, the colours, the logo, the appointment and the calendar, so only the message and the pictures are asked again.",
      "Finish one and you get the build brief and the two-line stub for the GHL page, both with a copy button.",
    ],
  },
  {
    id: "2026-08-09-social-connect-gate",
    date: "9 August 2026",
    title: "Clients connect their own Facebook and Instagram, and cannot skip it",
    items: [
      "A client signing in now meets a connect screen before anything else, and stays on it until their Facebook page and Instagram account are linked to their sub-account. No app behind it, so there is nothing to click past.",
      "They do it themselves: a button opens Facebook, they approve, then they pick which page to connect. We never ask for their password and never touch it for them.",
      "Facebook's approval screen names LeadConnector, the partner we post through, so the connect screen warns them about that first. Otherwise the first client who reads it emails asking who that is.",
      "Instagram has to be a Business account linked to the Facebook page. If Facebook offers nothing back, the screen says exactly that rather than failing quietly.",
      "New on a client's record: Social connect gate. Waive it for anyone who genuinely cannot pass, a business with no page yet, somebody who is not an admin of their own page, a personal Instagram, or Meta having a bad morning. It is the only way through, and it is per client.",
    ],
  },
  {
    id: "2026-08-07-competitor-ads-are-just-links",
    date: "7 August 2026",
    title: "A competitor ad is just a link, and adding one no longer eats the row",
    items: [
      "Competitors on Copy & Angles asked for a name, a link and a notes box. It is one box now: the link. You are pasting an ad you have just found, not filing a report on it, and the other two were left empty every time.",
      "That also fixes a real bug. A row needed something typed in it to survive being saved, so pressing Add and then clicking away deleted the row you had just made, in front of you. Adding a row now leaves it alone until you either fill it in or remove it.",
      "The same fault was waiting on Angles and on Ads. Both are fixed the same way, so an empty row you have just added stays put on all three.",
      "A pasted link is tidied when you leave the box: 'facebook.com/ads/library/...' becomes a real link you can click straight back out to.",
    ],
  },
  {
    // Supersedes 2026-08-07-ad-builder, which shipped this morning and is left
    // below rather than edited: changing an entry's words without changing its
    // id means nobody who already read it ever sees the correction.
    id: "2026-08-07-ad-builder-three-pages",
    date: "7 August 2026",
    title: "The Ad Builder is three pages, and the round is gone",
    items: [
      "Ad Builder is now Copy & Angles, Ads and Lead Form. There is no round to pick before you can write anything: what is on the page is this client's current set, always.",
      "Ads is a plain list. Add one at the bottom, type what it is, link the creative it is made from. The type is free text, so 'video' sits beside 'before and after' and 'testimonial' and you are never waiting on us to add a format.",
      "Because of that, the Static and Video split is gone. Video is a type of ad now, not a kind of batch.",
      "Copy and headlines are unchanged: still three and three, still shared across every ad, because one set of text rotated over several creatives is how a round actually runs.",
      "Lead Form is unchanged. Questions, answers, disqualifying answers, conditional logic and both screens, with a Copy form button that hands you the whole thing as text to paste into Meta.",
      "What this costs, so nobody is surprised by it: there is no history. Overwriting last month's primary copy loses it. Rounds were what kept the old version, and they were removed on purpose because picking one before every edit was not worth a lookback that almost never happened.",
      "Master is gone with the rounds. With one set per client there is nothing to read back: the pages are the record.",
    ],
  },
  {
    id: "2026-08-07-ad-builder",
    date: "7 August 2026",
    title: "Ads get written in the console, not in a notes app",
    items: [
      "Fulfillment > Paid Ads has a new Ad Builder tab. It is where a round of ads is written: the competitors worth stealing from, the angles, and the three primaries and three headlines that actually launch. Video batches also carry the hook and the script.",
      "Work is filed per client and per round, so last month's copy is still findable next month, and a headline stays next to the competitor ad that provoked it.",
      "Three of each, on purpose. There is no Add button for a fourth primary or a fourth headline: three is the discipline the page exists to hold. A blank slot is fine.",
      "Master lists everything written for that client, static and video together, newest first. It is read only. Editing stays on Static or Video so one round of copy only ever has one place that writes it.",
      "Every field saves itself when you leave it. Nothing to press, and no half-written batch lost to a closed tab.",
      "This is agency-side only. No client can reach it, which is deliberate: it holds competitor research and copy that has not launched.",
    ],
  },
  {
    id: "2026-08-04-appointments-reach-google-calendar",
    date: "4 August 2026",
    title: "Booked appointments reach the client's Google Calendar",
    items: [
      "Booking or moving an appointment copies it to the connected Google Calendar, which is what it was always meant to do. It had been throwing every one of those writes away: the code treated a missing field in Google's reply as a failure, and the failure was swallowed rather than shown, so nothing ever said the calendar had not been written.",
      "Anything booked before today is not on the calendar and will not appear retroactively. Appointments booked from now on will be.",
      "A mirror that genuinely fails now writes to the logs instead of disappearing, so the next one is findable.",
    ],
  },
  {
    id: "2026-08-03-client-data-is-that-client",
    date: "3 August 2026",
    title: "Every Fulfillment page shows the client you picked",
    items: [
      "Picking a client on Fulfillment now shows THAT client. A client whose GoHighLevel is not connected yet was quietly served the agency's env credentials, which are Willis Windows': every page, from Software to Paid Ads to Website, read Willis's leads, conversations, calendar and revenue under the other client's name, with nothing on screen to say whose numbers they were.",
      "That fallback is gone. A client that has not been wired up says \"not connected\" instead, which is the truth and tells you what to go and do.",
      "The same fallback was on the Meta ad account, the Google place, the GA4 property and the internal notification numbers. All four now read the client's own or nothing.",
      "Made Better Landscaping is the client this was hiding: its GoHighLevel is still on \"pending\", so its pages will read as not connected until its credentials go in on Client setup > Wiring. Willis Windows and Test Account both have their own and are unaffected.",
    ],
  },
  {
    id: "2026-08-03-task-categories-order",
    date: "3 August 2026",
    title: "Task categories go in the order you want them",
    items: [
      "Manage categories: every category now has an up and a down arrow. The order you set is the order of the filter chips above the checklist and of the dropdown on every row, so you only have to arrange them once.",
      "The close button on that panel was floating in the middle of its own header. It is on the right, where it has always looked like it should be.",
    ],
  },
  {
    id: "2026-08-03-call-opens-on-the-row",
    date: "3 August 2026",
    title: "A call opens on the row you clicked",
    items: [
      "The On Call tab is gone. Click a call on Sales Calls and the whole thing opens over the page: the script, the ticks, the answers, the timer and the outcome, exactly as before.",
      "No more picker asking which call you are on. You just clicked it.",
      "Rows you can open lift under the mouse and pick up a green edge, so the page shows you at a glance which calls are still work.",
      "Calls in the Recorded block do not open. They are answered, their notes were filed when you saved, and what happened on them is on the row itself.",
      "The outcome buttons stay on the row, so a no-show is still one click from the list without opening anything.",
      "Old links to a call still work and land in the same place.",
      "The grey line explaining that an outcome tags the contact and moves the card is off both Sales Calls and the call itself. It was true on every load, which is another way of saying nobody read it twice.",
      "Same treatment across the Admin Center: the caption describing where a page's numbers come from is gone from Sales Pipeline, Sales Data, Playbook, the funnel and its three breakdown tables, Client setup (intake answers and Wiring), Fulfillment Software, Website pages, Dialing scripts, Objection handling, the Team list and the setter's Awaiting result.",
      "The amber nags about your own unfinished work are gone too: \"2 meetings have no outcome recorded\", \"3 meetings have no time on the calendar\", \"4 meetings have no calendar recorded\" and \"5 open deals have not moved in 14 days\". What is left in that row is only the kind of warning that means the page cannot be trusted: the account is not connected, the calendar could not be read, no sales calendar was found, a stage is missing. Stale deals are still badged per column on the board itself, beside the cards they are about.",
    ],
  },
  {
    id: "2026-08-03-on-call-answers",
    date: "3 August 2026",
    title: "The sales call fills itself in as you go",
    items: [
      "On Call: type their answer under a question and it now travels forward. Ask how many replacements they ran last month, and later in the same call the timeline line already reads \"hitting 30 installs/month consistently, and adding $59,850/month in profit\" with both numbers in it.",
      "Calculations: a row can work a number out from earlier answers, so the extra revenue and the extra profit are done for you rather than in your head while someone is talking.",
      "Playbook: a row is now a question, a script line you read out, or a calculation. Script lines keep their line breaks and lose the answer box they never needed.",
      "Discovery and Pitch are the real script now, word for word, under their own headings.",
      "The Objection handling column is gone. It only ever held the seven placeholder objections it shipped with, and a column of invented lines beside two columns of the real script was one you read past on every call.",
      "Recording an outcome drops the numbers the call established into the notes, so they go onto the contact instead of being binned with the scratch.",
      "Recording an outcome now asks which offer was pitched: the six families, the ten variants between them, and a box for the number you actually quoted inside a range. Asked on every outcome where they turned up, because which offer gets turned down is worth more than which one closed.",
      "The money boxes on a close follow the offer. A monthly retainer asks for the monthly, the term and the cash; a fully performance-based deal asks for nothing, because nothing changes hands at signing. Paid in full can no longer be recorded as a monthly.",
      "New \"Which offer closes\" table on Sales Data: every offer you pitched this month, how many closed, and the close rate on each, best first.",
      "Objection handling is gone as a column, and the four pillar blocks are off the Pitch. The pillars are retired rather than deleted, so they are one click from coming back under Show retired lines.",
    ],
  },
  {
    id: "2026-08-02-client-app-on-a-phone",
    date: "2 August 2026",
    title: "The client app works properly on a phone",
    items: [
      "The tab bar at the bottom now opens the Ads Dashboard where Chats used to be. Chats has not gone anywhere: it is under All features, one tap away.",
      "Lead Tracker, Ads Dashboard and Meta Data used to be wide tables you had to drag sideways to read. On a phone each is now a stack of cards, so a lead's name and its status are on screen together.",
      "Tap a lead's phone number or email on a phone to call or write to them.",
      "All features now lists every page in the account. Four pages (Lead Tracker, Meta Data, Creatives and Schedule) were missing from it, which on a phone meant there was no way to open them at all.",
      "Settings, dark mode and Sign out are now on the All features page. On a phone there had been no way to reach any of the three.",
    ],
  },
  {
    id: "2026-08-02-organic-page",
    date: "2 August 2026",
    title: "Website leads have their own page",
    items: [
      "New Organic page in the client app: the leads their own website produced, next to the ads leads that already had a page.",
      "Two columns, Estimate Form and Chat Widget, matching the two stages of the Organic pipeline in GoHighLevel.",
      "Click a lead to read the message they actually sent and whatever they typed into the form.",
      "The page only appears for clients who have an Organic pipeline, so a client whose website we do not manage never sees an empty tab.",
      "Read only: these leads are called back, not messaged from the app.",
    ],
  },
  {
    id: "2026-08-02-intake-services-step",
    date: "2 August 2026",
    title: "The intake form asks what services they sell",
    items: [
      "A new step between Targeting and Your story: six boxes, one service per box.",
      "Separate boxes on purpose. A single line reading \"landscaping, design and build\" has to be split by hand afterwards, and the split is a guess.",
      "The first two are required, the rest are for whoever offers more.",
      "They show up per service on the client's answers card, ready to build ads and pages around.",
      "The form is eight screens now instead of seven.",
    ],
  },
  {
    id: "2026-08-02-intake-password-rule",
    date: "2 August 2026",
    title: "The intake form asks for a real password",
    items: [
      "Step 3 now states the rule on the field: upper and lower case, at least one symbol and number, at least 12 characters.",
      "It is checked when they press Continue and again on our side, so a weak one cannot get through by posting around the form.",
      "They are told one thing to fix at a time rather than all three at once.",
      "This applies to the client intake form only. Passwords you set for staff in Team are unchanged.",
    ],
  },
  {
    id: "2026-08-02-intake-password-visible",
    date: "2 August 2026",
    title: "You can read back the password a client chose",
    items: [
      "Open a row on Onboarding > Submissions and their login is at the top: the email, and the password they typed. Press the eye to show it, or the copy button to take it.",
      "This is for getting somebody in over the phone without resetting anything.",
      "It only works for forms filled in from today onward. Anything submitted before this was hashed on arrival and cannot be recovered; those rows say so and point you at the client's Team card to set a new one.",
      "Only an admin can see it, and only on that one screen. It is never sent back to the client's own browser, and it is not what signs them in.",
    ],
  },
  {
    id: "2026-08-02-intake-form-questions",
    date: "2 August 2026",
    title: "The intake form asks for what we actually use",
    items: [
      "The address is asked in parts now: street, suite, city, state and ZIP, instead of one box that came back as a city name half the time.",
      "Targeting asks for ZIP CODES, not \"areas\". No more turning \"the west side\" into an ad set by hand.",
      "The area call-out question says what it is for: what the ad calls the people who see it, like \"Metro Detroit Homeowners...\".",
      "Availability is one line per day, Monday to Sunday, asking the hours they would LIKE to be booked in. A blank day is a day off.",
      "Two questions are gone. \"How would you like to hear about new leads?\" (it is SMS and the app, so there was nothing to choose) and \"I have installed the LeadConnector app\" (clients do not need it).",
      "The three asset links are clearly optional, and the instruction to make the link viewable by anyone is now highlighted, with a line telling them to message Jake rather than give up.",
      "The line under the review screen about what happens when they send it is gone.",
    ],
  },
  {
    id: "2026-08-02-onboarding-submissions",
    date: "2 August 2026",
    title: "You can read what a client wrote on the intake form again",
    items: [
      "Onboarding > Client setup opens with What the client told us: every answer they gave on the intake form, sat above the checklist you work from.",
      "Onboarding has a new Submissions tab listing every form the funnel has taken, including the ones somebody is halfway through typing right now.",
      "Open any row to read the whole form. Nothing about a submission was visible in the app before this, so a half-finished one was invisible until the person came back and finished it.",
      "A finished form is supposed to create the client on the spot. If that did not happen the tab says so at the top, and Create the client on that row finishes the job.",
      "The answers are read-only wherever they appear. What the client typed stays what the client typed; the values we push to their GoHighLevel are edited separately, as before.",
    ],
  },
  {
    id: "2026-08-02-leads-cities",
    date: "2 August 2026",
    title: "Leads has a Cities tab that knows where you have already been",
    items: [
      "Leads > Cities lists the 1000 biggest US cities with population and growth, and marks what you have already done in each.",
      "Two separate counts, not one \"scraped\" tick: Runs is how many scrapes named that city, Leads is how many businesses you actually hold from it.",
      "They are kept apart because they disagree. A city you ran and got nothing from reads \"Ran, nothing found\", which is the row worth looking at before you spend another run there.",
      "Filter to \"Ran, no leads\" to find exactly those, or \"Never touched\" to plan the next scrape.",
      "Narrow by niche to ask a different question: a city worked for roofing is untouched for HVAC, and the tab will say so.",
      "Search, sort by any column, and filter by state. Nothing is typed in by hand and nothing needs updating: the marks are worked out from your run history every time the page loads.",
    ],
  },
  {
    id: "2026-08-02-cold-call-calendar-titles",
    date: "2 August 2026",
    title: "A meeting booked from the app is named by the calendar, like any other",
    items: [
      "Booking a cold call prospect no longer renames the appointment. GoHighLevel's cold call calendar names its own events, and a booking made here now gets that same name.",
      "Before this, the app forced every one of them to \"Discovery call - ...\", so the same meeting read one way when you booked it in GoHighLevel and another when you booked it from the app.",
      "It also built that name from the prospect's first and last name. A scraped business arrives with its company split across those two boxes, so typing the person's first name on the call produced titles like \"Discovery call - Mohamad Heating & Cooling\" for a company actually called \"BM Heating & Cooling\".",
      "If you want the meetings named differently, change the event title on the calendar in GoHighLevel. Every booking follows it, from either side.",
    ],
  },
  {
    id: "2026-08-02-cockpit-paid-ads-matches-client",
    date: "2 August 2026",
    title: "Paid Ads in the cockpit is now the client's own Paid Ads",
    items: [
      "Fulfillment > Paid Ads shows the client's own pages for whichever client is in the picker: Dashboard, Lead Tracker and Meta Data, laid out exactly as the client sees them.",
      "Meta Data is new to the cockpit. Checking a client's raw daily spend no longer means entering their live app.",
      "Lead Tracker is new to the cockpit too, with the same search and date range the client has.",
      "Ad Tracking, Data & Leads and Campaigns are gone. The first two were the same numbers drawn a second way, and Campaigns is covered by the Dashboard's \"View by: Campaign\".",
      "Ad Library is now Creatives, and points at a Google Drive folder instead of holding its own copy.",
      "Pick the folder by walking your actual Drive, or by searching it by name. No pasting links, so a typo can no longer send a client to a folder that does not exist.",
      "The files in the folder are shown as a grid, with the picture on each one where Google gives us it. Clicking any of them opens it in Drive.",
      "Clients get a Creatives row in their own sidebar, showing only their own folder. They cannot change which folder it points at; that is yours alone.",
      "A client with no folder set yet is told so plainly rather than shown an empty gallery.",
      "The \"Refresh spend\" button and the \"spend is N days behind\" warning are still yours only, sitting above the sheet. Clients never see either.",
      "An old Paid Ads link that pointed at one of the retired tabs now opens the Dashboard instead of a dead view.",
    ],
  },
  {
    id: "2026-08-01-client-nav-and-meta",
    date: "1 August 2026",
    title: "Every page has its own row, and Meta Data reads a day at a time",
    items: [
      "Sales and Paid Ads no longer hide their pages behind tabs. Leads, Schedule, Lead Tracker, Ads Dashboard and Meta Data are each their own row in the sidebar.",
      "Home is gone and the app opens on the Lead Tracker. Home was a stop on the way to the page you actually wanted.",
      "Meta Data now shows one row per day instead of one row per ad. Click any day to open it and see each ad underneath, biggest spender first.",
      "A day's reach is marked with a \"less than or equal to\" sign when more than one ad ran. Reach counts people rather than views, so adding two ads together counts anyone who saw both of them twice, and only Meta can work out the real figure.",
      "CTR and CPM on a day are worked out from that day's totals, so a nearly-dead ad with six impressions no longer pulls the day's numbers around.",
      "Sending leads to Cold Call or SMS now marks each one the moment it lands, rather than all of them at the end. A batch that was interrupted used to leave every lead in it looking unsent, so the same businesses could be sent and dialled a second time.",
      "A lead already in the call list is skipped and marked, so it stops reappearing on the Leads page.",
      "200 leads that had already been sent but still showed as pending have been corrected.",
    ],
  },
  {
    id: "2026-08-01-phone-format",
    date: "1 August 2026",
    title: "Phone numbers read the way you dial them",
    items: [
      "Numbers in the cold calling suite now show as 248-555-0171 instead of +12485550171. The country code is dropped and the digits are grouped three, three, four.",
      "Applies on the calling queue, the number on the call card, the Leads sourcing table and the phone box on the booking panel.",
      "Only what you see changed. The full number is still stored and still sent to GoHighLevel, so dialling and reminders are untouched.",
      "A number that is not a US one is left exactly as it is rather than being squeezed into that shape.",
    ],
  },
  {
    id: "2026-08-01-callback-clash",
    date: "1 August 2026",
    title: "A callback time already promised cannot be promised twice",
    items: [
      "Picking a callback time now strikes through any time already agreed with another prospect on that day, and hovering it says who has it.",
      "It reads every caller's callbacks, not just your own, because two people on the phones agreeing the same 1pm is the version of this that actually happens.",
      "Blocked times are shown struck through rather than removed, so you can see the clash and offer the half hour either side instead of wondering why the list looks short.",
      "A callback with no time still blocks nothing. \"Call me Thursday\" is a day, not a slot.",
      "Re-opening a prospect to move their callback still shows the time they already hold as available, since it is not a clash with themselves.",
      "If a callback turns into a booked demo, that time frees up again.",
      "Booking a demo was never affected: GoHighLevel owns those slots and stops offering one the moment it is taken. Callbacks live only in this book, which is why nothing was stopping a double-booking until now.",
    ],
  },
  {
    id: "2026-08-01-cold-call-outcomes",
    date: "1 August 2026",
    title: "Three ways to say no, one press each",
    items: [
      "The call card now has six buttons: No answer, Not qualified, Heard opener said no, Heard pitch said no, Call back, Booked.",
      "Recording a no used to take two clicks: press Not interested, then pick a reason from a list of five. The reason IS the outcome now, so it is one press at the moment you have just been told no and want the next number.",
      "Only \"Heard pitch, said no\" counts as a pass-through, because that is the only one where the pitch actually happened. A disqualification or a no during the opener still counts as a pickup, but not as a pitch, so the number that measures the script stops being inflated.",
      "The Objections column on the Tracker reads from these outcomes, so it says how far the calls got rather than which reason was picked.",
      "Every no still moves the prospect to Not Interested in GoHighLevel exactly as before. How far the call got is reported here, not over there.",
      "Dials already logged were converted using the reason recorded at the time, so nothing was guessed and no history was lost.",
    ],
  },
  {
    id: "2026-08-01-booking-contact-details",
    date: "1 August 2026",
    title: "Booking a meeting asks who it is with",
    items: [
      "The booking panel now has First name, Phone and Email above the calendar. Scraped prospects arrive as a business with a switchboard number and no person on them, so the details you learn on the call had nowhere to go.",
      "Whatever is already known is filled in for you. Leaving a field alone keeps what is there; clearing one does not wipe it, so a stray keystroke mid-call cannot delete the only number a prospect has.",
      "A phone number can be typed the way anyone actually says it. (248) 555-0171, 248.555.0171 and 2485550171 are all the same number.",
      "A number or address that is not usable is refused with a plain reason instead of being quietly ignored, which used to mean the meeting was booked against the old number and looked like it had worked.",
      "What you type is saved back onto the prospect, so whoever opens them next sees the person rather than the switchboard, and the calendar invite carries their real name.",
      "A prospect with no phone and no email at all can now be booked by typing one in. Before, there was no way to book them.",
    ],
  },
  {
    id: "2026-08-01-cold-call-suite-finished",
    date: "1 August 2026",
    title: "Cold Calling reads from Google Docs, and the pipeline actually fills",
    items: [
      "The stages in the app now carry the same names as the board in GoHighLevel: No Answer Day 1 and No Answer Day 2, not 1st Dial and 2nd Dial. They had drifted apart, and because the sync matches a stage by its exact name, every prospect sitting in a No Answer stage was being skipped instead of pulled into the list. Those come in now.",
      "Sending leads to Cold Call from the Leads tab tags them so GoHighLevel puts them on the board. Handing leads out from Assign leads always did this; sending them from Leads did not, so a batch became contacts over there and never reached the pipeline.",
      "Scripts, SOPs and objection handling are now pointed at a document in the SOP Hub instead of being typed into this app twice. Open Management > Scripts, pick the Google Doc, and edit the words in Docs from then on. Anything not pointed at a document yet still shows the text it already had.",
      "Objection handling appears underneath the script in the same panel, so it is on screen for every call. The separate Objections button is gone, and so is the Call shelf page it was filed under.",
      "The Not Interested tab is gone. Marking somebody not interested still records it and still moves them in GoHighLevel; there is simply no page listing a queue nobody works.",
      "Every page in the admin console now opens with the same header panel as the client app: the section name, its pages as a sliding switcher beside it, and the page's buttons on the right.",
      "The test leads have been deleted, here and in GoHighLevel, including the ones that had booked calls. The dialing numbers and the script booking rates start from real dials only.",
      "Pulling prospects in from GoHighLevel now reads the whole board rather than the first hundred cards. Sending a batch of 200 used to bring back 100 and look like it had finished.",
    ],
  },
  {
    id: "2026-07-31-reorder-inside-a-category",
    date: "31 July 2026",
    title: "Tasks can be reordered inside a category",
    items: [
      "Operations > Tasks: the drag handle used to disappear the moment you picked a category chip, so the only way to reorder was to go back to All and find the row among everything else. It stays now.",
      "Dragging inside a category reorders that category and moves nothing the filter is hiding. The tasks you cannot see keep their positions exactly.",
      "Reordering under All is unchanged.",
    ],
  },
  {
    id: "2026-07-31-playbook-categories",
    date: "31 July 2026",
    title: "Headings inside the sales playbook",
    items: [
      'Sales > Playbook: each of the three columns can be cut into headings of your own. "Add a heading" at the bottom of a column, then file prompts under it from the dropdown on each one.',
      "A heading is a real thing, not a label typed twice. Rename it once and every prompt under it follows. Move it with the arrows and its whole block moves.",
      "Prompts you have not filed sit in a block at the bottom of their column, and On Call draws them under \"Anything else\". Adding a prompt without picking a heading still works, so you can catch a question mid-thought and file it later.",
      "Deleting a heading never deletes the questions under it. They drop to that unfiled block, still on the call, where you can refile them.",
      "On Call shows the headings as you work down each column. The count in the column heading is still the whole column, not one per heading.",
    ],
  },
  {
    id: "2026-07-31-keys-panel",
    date: "31 July 2026",
    title: "Agency keys, pasted and applied without a terminal",
    items: [
      "Onboarding has a third tab, Keys. It holds every agency credential the app runs on, grouped by what each one switches on: paid ads, lead sync, calendars, email, Drive, sign-in, the scheduled jobs.",
      'Each key says one of three things. "Not set" means nowhere. "Saved, pending restart" means it is stored but the running app has not picked it up. "Live" means it is actually in use.',
      'Saving a key no longer leaves you a shell command. Paste what you have, then press "Apply and restart" once at the bottom and the whole batch goes live together, in about two minutes.',
      "Four keys are invented rather than pasted, and now have a Generate button: the session secret, both scheduled-job secrets, and the push notification pair. Each one warns you what changing it costs first, because rotating the session secret signs everybody out and rotating the push pair unsubscribes every device.",
      "A generated value is shown once so it can be copied where it is also needed, then masked like everything else.",
      "Six keys are visible but deliberately not editable: the three that grant this page its own access, and the three database ones a new client never needs touched.",
      "The same panel is on Settings > Secrets, so it can be worked from either side.",
    ],
  },
  {
    id: "2026-07-31-on-call",
    date: "31 July 2026",
    title: "A page to work the sales call on, while you are on it",
    items: [
      'Sales has a new page, On Call. Every meeting on Sales Calls now has a "Start call" button that opens it on that prospect.',
      "Three columns in the order the call runs: discovery, pitch, objection handling. Tick each prompt as you cover it and type what they said underneath. The heading counts how far through each column you are.",
      "Who you are talking to sits along the top, with their number, when it was booked, where they came from, anything written on a previous call, and a clock counting the call.",
      "The call ends where it always did: the same five outcomes, the same figures, the same tagging. Recording one clears the page and takes you back to the list.",
      "Your ticks and notes survive a reload but stay in this browser. They are not saved to the meeting yet.",
      'A second new page, Sales > Playbook, is where those three columns are written. Add a prompt, reword one, move it up or down, or retire it. Edits save as you leave the box and are live on the next call, with no deploy.',
      "The playbook starts with a set of placeholder prompts so the page opens on something to edit rather than three empty headings. They are meant to be rewritten.",
      "Retiring a prompt takes it off the call but keeps it readable, so a question pulled in March can still be looked at in June. Deleting outright is there for the one added by mistake.",
    ],
  },
  {
    id: "2026-07-31-schedule-on-a-phone",
    date: "31 July 2026",
    title: "The Schedule tab works on a phone now",
    items: [
      "Sales > Schedule: a job's buttons sit two by two on a phone instead of running off the side of the card. The fourth one, Payment, could not be reached at all before.",
      "Month view: tapping a day now shows that day's work underneath the calendar. On a phone it used to do nothing. The squares carry a coloured dot per job rather than a name squeezed down to one letter.",
      "Week view: the seven days are full width and slide sideways, three at a time, with the hours and the dates staying put as you scroll. Job names are readable instead of being cut to an initial.",
      "The view switcher (Jobs, Month, Week, Agenda) spans the width on a phone, and the page's heading lines up with everything under it.",
      "The bottom bar drops the Chat tab and centres the All button. Five tabs: Today, Sales, All, Chats, Contacts.",
    ],
  },
  {
    id: "2026-07-31-client-app-chrome",
    date: "31 July 2026",
    title: "New page headers, a rebuilt Home, and account controls in the rail",
    items: [
      "Every page now opens with a raised header panel instead of a title over a line, and the tabs inside it are a segmented control whose active pill slides between them.",
      "Explanatory paragraphs under page titles are gone everywhere. The title and the tab names say what the page is.",
      "Settings, light/dark and Sign out moved out of the top-right avatar menu and into the bottom of the sidebar, beside Team, matching this console. The top right is now just the notification bell.",
      "Home is rebuilt as a two-column brief: the day on the left (what is booked, what is unread, what needs closing out) and the month on the right (leads, revenue, pipeline health). No more greeting banner taking the top third.",
      "A client can no longer see our Cold Calling board anywhere in their app. The server stops sending it rather than the page hiding it.",
      "Paid Ads: the Results row was being cut in half on shorter windows. Fixed, and the table now reads at a comfortable size.",
      "Sales shows its page even on a day with no hand-offs, instead of collapsing to an empty message.",
      "The Customers row was retired from the client sidebar.",
    ],
  },
  {
    id: "2026-07-31-onboarding-one-page",
    date: "31 July 2026",
    title: "Onboarding is one page, and it starts at the signature",
    items: [
      "The pipeline board is gone. Onboarding opens on a client and their checklist: pick whoever you are working on, tick your way down, press Go Live and they leave the page.",
      'Two new sections above the old ones. "Kickoff" is the three things you do the moment they sign: book the call, send the welcome email with the agreement and the form, send the text. "Onboarding call" is the whole call, from their sub-account through their ads manager to their subdomain.',
      "The picker shows the clients still being stood up. Tick the box beside it to reach someone who is already live.",
      "A client you add by hand now starts in onboarding like everyone else, so they appear on this page. They see the holding screen until you press Go Live, same as a client who came through the form.",
      "Go Live works. It was refusing every client on a count that no longer matched what a tick is saved against.",
    ],
  },
  {
    id: "2026-07-30-onboarding-no-approve-step",
    date: "30 July 2026",
    title: "A finished intake form becomes a client on its own",
    items: [
      'The "Waiting on you" column is gone. Finishing the form now creates the client, their login, their setup record and their Drive folder on the spot, so they land straight in "Being set up" with the checklist already seeded.',
      'The middle column is now "Needs a hand", and it should always be empty. A client only appears there if that automatic setup failed, and the approve button on their card is the retry.',
      "A new client still cannot see anything until you press Go Live. Signing in shows them the holding screen, exactly as before.",
    ],
  },
  {
    id: "2026-07-30-sales-is-selling-only",
    date: "30 July 2026",
    title: "Sales is the selling now, and the dialing lives in one place",
    items: [
      'The "Cold Call Data" tab has left Sales. The same month, every caller at once, is on Cold Call > Tracker with the caller box set to "Agency", so there is one page to read the phones off instead of two that could disagree.',
      'The funnel strip on Sales Data now starts at "On calendar". Dials, Talked and Booked came off it for the same reason, and the divider that used to sit in the middle of it is gone with them.',
      "Nothing was lost: every dial ever logged is still counted, still on Cold Call, and Sales Data still reads meetings through to New MRR and cash collected.",
    ],
  },
  {
    id: "2026-07-29-sales-what-was-sold",
    date: "29 July 2026",
    title: "Sales records what was sold, where it came from and why the nos were nos",
    items: [
      'Recording a close now asks what they pay monthly and for how many months, alongside the cash taken on the call. A $2,000/month client who paid $500 today used to be filed as $500.',
      'Sales Calls and Sales Data both show "New MRR" beside "Cash collected", and Sales Data has a New MRR column per day. The contract value is worked out for you as you type.',
      'Answering "Not Interested" or "Not Qualified" now asks why, from a fixed list. Sales Data counts them under "Why they said no", so what is actually killing deals is a list rather than a feeling.',
      'Sales Data has a "Where the meetings came from" table: booked, showed, show rate, closed, close rate, MRR and cash for each source. Cold-call meetings and meetings that came in on their own are no longer one number.',
      "Every outcome now opens one panel with a notes box, so you can write down what was said. The notes show on the row, which is what makes a follow-up three weeks later worth having.",
      "On the Sales board, an open deal that has not moved in 14 days gets an amber dot, says how many days it has sat, and is counted on its column and at the top of the page.",
      "Notes stay with the meeting: correcting an outcome later does not wipe them.",
    ],
  },
  {
    id: "2026-07-29-sales-reads-itself",
    date: "29 July 2026",
    title: "The Sales pages read the calendar and the board on their own",
    items: [
      'Sales Calls, Sales Pipeline and Sales Data no longer have a "Read the calendar" or "Read the board" button. There is nothing to press: the pages keep themselves current.',
      "Each one reads GoHighLevel when you open it, again the moment you come back to the tab, and on a timer while you sit on it. A meeting booked on a phone, or a deal you dragged in the CRM, turns up without you asking.",
      "The line saying what the read brought in stays, so you can still see when something new arrived.",
    ],
  },
  {
    id: "2026-07-29-agency-availability",
    date: "29 July 2026",
    title: "Availability on Agency shows the whole roster's week at once",
    items: [
      "With the picker on Agency, Availability no longer asks you to pick somebody. It draws the same week grid a caller paints, with everybody on it at once.",
      "Each caller has their own colour, listed under the grid with the hours they have marked. Where two or more overlap, the cell splits into a stripe each, so a busy hour and a thin one are told apart at a glance.",
      "Hover any cell to read who is on at that half hour. The lines under the grid say when the phones are covered each day, and name the days nobody is on.",
      "The top line separates two numbers that are easy to confuse: covered hours (how much of the week has anybody on it) and person-hours (how much phone time you are actually buying), plus how many hours between 8am and 8pm nobody has claimed.",
      "The agency view is read-only. Painting a cell shared by three people would have to pick one of them to write to, so changing somebody's hours still means picking their name first.",
    ],
  },
  {
    id: "2026-07-29-sops-live-from-drive",
    date: "29 July 2026",
    title: "The SOPs tab reads your whole Drive folder, properly formatted",
    items: [
      "Operations > SOPs now shows your Drive SOPs. It always read them live, but nothing was ever linked to read, so the tab sat empty since the day it shipped.",
      "It opens on your two folders, Agency SOPS and Client SOPS, and you click in from there, exactly as in Drive. It used to put all 25 folders on screen at once with no sense of which sat inside which.",
      "Every folder is there now, however deep. It used to stop three levels down, which hid 15 SOPs including the whole Cold Email course, and both ad swipefiles. Empty folders show too, as empty folders, rather than quietly not existing.",
      "Search ignores where you are. One box, every SOP in the folder, and each result says which folder it came from.",
      "SOPs are formatted again. Bold, italic and underline were being thrown away on the way in, so every SOP read as flat grey text. Over a thousand of them are back.",
      "A Doc split into tabs now reads as separate sections with their tab names, and a contents list beside it to jump between them. Before, the tabs were run together end to end with nothing marking the joins: five cold call scripts read as one long script.",
      "The reader is a document now rather than a panel: a page with proper margins, bigger body text, and your headings in the brand type.",
      "Add a Doc to the folder in Drive, switch back to the tab, and it is there. A tab left untouched catches up on its own every few minutes.",
      "Editing an SOP in Drive while you have it open now updates what you are reading. It used to keep showing the version from when you first opened it.",
      "An SOP that gets moved or deleted in Drive while you have it open says so, instead of sitting there as a page that no longer exists.",
    ],
  },
  {
    id: "2026-07-29-agency-cold-call-tracker",
    date: "29 July 2026",
    title: "The cold call tracker now has an agency view",
    items: [
      'The person picker above the cold calling pages says "Agency" instead of "Everyone".',
      "With it on Agency, Tracker no longer asks you to pick somebody. It draws the same tracker you get for one caller, with every caller's day added together: the same tiles, the same columns, the same Average and Total MTD.",
      "The totals match the sum of the individual trackers, including any dialing somebody typed in by hand for calls made off-app. The subtitle says how many people are in the month and how many of its days contain typed counts.",
      "Nothing on the agency view can be typed into, since a cell there is a total of several people rather than anybody's own row. Pick a name to type.",
      'The "Why they said no" counts are merged across the roster too, so one row tells you what the whole team is hearing that day.',
    ],
  },
  {
    id: "2026-07-28-objections-panel",
    date: "28 July 2026",
    title: "Objection handling is one click away, and the dial stages say what they mean",
    items: [
      "New Objections button next to Dialing script. It opens the objection handling document as its own floating panel on the right, so it and the script can be open at once: the script in one hand, the answer to what was just said in the other.",
      "Like the script panel, it can be dragged anywhere and resized, and the page underneath keeps working while it is open.",
      'The two dial stages now read "No Answer Day 1" and "No Answer Day 2" instead of "1st Dial" and "2nd Dial", which is what the GoHighLevel automations have always called them.',
    ],
  },
  {
    id: "2026-07-28-callback-time-and-scripts",
    date: "28 July 2026",
    title: "Callbacks now have a time, and each call names its script",
    items: [
      'The third outcome button is now "Call back" rather than "Hot lead". It always moved the prospect into Call Back in GoHighLevel; now it says so.',
      "Picking when to ring them back is a proper calendar with the times beside it, the same one booking uses, instead of a typed date box.",
      'You can give a callback a time. The task that lands in GoHighLevel is due at that time rather than always 9am. A time is optional: "Thursday, some time" stays exactly that.',
      'The Callbacks queue shows the time next to the day, so "Today" and "Today 2:30 pm" are no longer the same chip.',
      "On the call card you can now choose which script the call is being recorded against, per prospect. Switching variation call by call is how a script test actually gets run.",
    ],
  },
  {
    id: "2026-07-28-task-categories",
    date: "28 July 2026",
    title: "Tasks can be sorted into your own categories",
    items: [
      "Every task now has a Category, picked from a list you build yourself. There is nothing preset: add the categories that match how you actually work.",
      "Add, rename, recolour and remove them from Manage above the list, or from the bottom of any task's category dropdown.",
      "The row of buttons above the checklist filters it to one category at a time, with a live count on each. Uncategorised shows up as its own filter whenever something has no category yet.",
      "Removing a category never removes the work. Anything filed under it stays in the list as uncategorised.",
      "Drag-to-reorder stays available on the full list. While a filter is on, the drag handles hide, since reordering part of a list would shuffle the rest.",
    ],
  },
  {
    id: "2026-07-28-ghl-lead-sync",
    date: "28 July 2026",
    title: "Prospects added in GoHighLevel now show up here",
    items: [
      "Anyone added to the cold calling board in GoHighLevel now appears in the console automatically. Until now the console only knew about prospects typed or imported here, so anything created over there sat in no queue and no count.",
      "It happens on its own when you open Cold Call. If anything new came across, a line at the top says how many.",
      "Nobody gets added twice. A prospect already in the book is recognised by their number even if it is written differently, or by their GoHighLevel record.",
      "New arrivals land unassigned and in the stage GoHighLevel has them in, so they drop straight into the right page.",
    ],
  },
  {
    id: "2026-07-27-health-watchdog",
    date: "27 July 2026",
    title: "The console now checks itself every half hour",
    items: [
      "Connections are checked automatically every 30 minutes, so something breaking overnight is known by morning instead of whenever someone next opens Settings.",
      "If something that was working stops working, admin devices get one notification saying what went down and which page goes dark with it. Nothing that stays broken nags you again.",
      "A new Scheduled health checks row shows when the last automatic check ran, and goes red if the checker itself stops.",
    ],
  },
  {
    id: "2026-07-27-cold-call-sops",
    date: "27 July 2026",
    title: "Cold calling: SOPs you can read on the job",
    items: [
      "New SOPs page in cold calling: how the job is done, written by Jake and readable by everyone. Pick a document from the dropdown and it opens full width, laid out to be read start to finish.",
      "SOPs live on their own page rather than in the mid-call panel, because they are for reading before the first dial and between calls, not while somebody is on the line.",
    ],
  },
  {
    id: "2026-07-27-settings-control-room",
    date: "27 July 2026",
    title: "Settings tells you what is broken, and what breaks with it",
    items: [
      "Agency Settings now opens on a short list of what needs you, worst first, instead of a wall of settings. Everything working stays quiet.",
      "Every connection says what it feeds. When something goes down you are told the page that goes dark with it, not the name of a key.",
      "A By surface view answers the other direction: pick a page that looks empty and see everything it needs to work.",
      "Per client: see and fix a client's own credentials in the app, without going near a terminal.",
      "Read this page on the live site, not localhost. Localhost cannot see the real credentials and says so at the top.",
    ],
  },
  {
    id: "2026-07-27-cold-call-availability",
    date: "27 July 2026",
    title: "Cold calling: your hours, and one place to run it from",
    items: [
      "New Availability page: paint the hours you are on the phones for the week. Drag across the grid to mark a block, drag back across it to clear.",
      "Everything on the owner's side now lives under one Management tab: assigning leads, the team's availability, the scripts, the call shelf and the stage check.",
      "The Settings tab is gone. Its three panels moved into Management under their own names, and old links still open the right page.",
    ],
  },
];

// The newest release, or null when there are none.
export function latestRelease(): Release | null {
  return RELEASES[0] ?? null;
}

// What to show someone who last saw `seenId`.
//
// A person with nothing stored is NOT shown the whole history: they get the
// latest release only. Someone signing in for the first time wants to know what
// the console does now, not to read a changelog back to the beginning.
//
// An unrecognised `seenId` (a release renamed or removed since they saw it) is
// treated the same as nothing stored, so a stale value can never hide every
// release forever.
export function unseenReleases(seenId: string | null | undefined): Release[] {
  if (!seenId) return RELEASES.slice(0, 1);
  const index = RELEASES.findIndex((r) => r.id === seenId);
  if (index === -1) return RELEASES.slice(0, 1);
  // Everything newer than the one they saw. Index 0 means fully caught up.
  return RELEASES.slice(0, index);
}

// The per-person storage key. Keyed by admin id so two people sharing a browser
// do not mark each other's updates as read, and so signing in as someone else
// does not hide their notes.
//
// A missing id gets its own key rather than a shared one: an unidentified
// session marking "seen" must not silently answer for a real account.
export function seenStorageKey(adminId: string | null | undefined): string {
  return `hml.admin.release.seen.${adminId || "anonymous"}`;
}
