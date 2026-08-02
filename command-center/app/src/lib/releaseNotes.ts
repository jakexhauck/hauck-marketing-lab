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
