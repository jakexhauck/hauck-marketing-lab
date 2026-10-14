-- 0084: the sales script as Jake actually wrote it, discovery AND pitch.
--
-- 0083 put a version of the discovery in, but it was a version: lines reworded
-- to fit a row, questions invented to fill keys nobody asked for, headings
-- renamed. Jake read it back and said the same thing twice, which is the only
-- review that matters here: this is a script he reads out loud on the phone,
-- and a script that is nearly what you wrote is worse than no script, because
-- you have to check every line against the one in your head.
--
-- So this replaces it with the document, line for line. Three things changed
-- from the paste and nothing else:
--
--   1. Em dashes became commas or full stops. House rule, everywhere.
--   2. Three placeholders became tokens, because they are the whole reason any
--      of this exists: [X] installs is {installs}, [#] installs/month is {goal},
--      $[X]/month in profit is {gap_profit}, and the push-to-revenue line takes
--      {gap_revenue}. [CITY], [NAME] in the pitch numbers, and every other
--      bracket stay exactly as typed, because nothing on the call fills them.
--   3. The section headings became the categories they obviously are.
--
-- Two calcs, not four. 0083 had gap_installs and margin as rows of their own,
-- which meant four numbers on screen to produce the two Jake says out loud. The
-- arithmetic is inlined instead: change the 0.35 in gap_profit to change the
-- margin.
--
-- Objection handling is left alone, still holding its 0074 placeholders. There
-- is no real objections script yet, and an empty column would be worse than one
-- honestly marked as filler.
--
-- Guarded on its own last line existing, so a re-run does nothing. It clears
-- only what was SEEDED (updated_by is null) in discovery and pitch: anything
-- Jake has edited, moved or refiled is his and survives.
--
-- Run AFTER 0083. Reached only via the service-role client in Functions.

do $mig$
declare
  cat_id uuid;
begin
  if exists (
    select 1 from public.sales_playbook_items
     where prompt = $t$TIE DOWN: So the only way I make money is if you make money first. Does that feel fair to you?$t$
  ) then
    return;
  end if;

  -- Seeded rows only. A row Jake has touched has an updated_by and stays.
  delete from public.sales_playbook_items
   where updated_by is null
     and section in ('discovery', 'pitch');

  -- Headings left with nothing under them go too, for the same reason and by
  -- the same test.
  delete from public.sales_playbook_categories
   where updated_by is null
     and section in ('discovery', 'pitch')
     and not exists (
       select 1 from public.sales_playbook_items i where i.category_id = sales_playbook_categories.id
     );

  -- =========================================================
  -- DISCOVERY
  -- =========================================================

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Rapport$t$, 0) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'script', $t$How's the day going?$t$,
     $t$No longer than 1 to 2 minutes. Set your frame.$t$, null, '', 'number', 0),
    ('discovery', cat_id, 'script',
     $t$Going to get some context on your business, then go over how it all works and the best pricing option based on that.$t$,
     '', null, '', 'number', 1),
    ('discovery', cat_id, 'script', $t$Sounds good?$t$, '', null, '', 'number', 2);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Why are they on the call?$t$, 1) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question',
     $t$Besides just being curious, what specifically were you looking to get out of this call?$t$,
     $t$Do not accept anything surface level. We need an actual problem.$t$,
     null, '', 'number', 3),
    ('discovery', cat_id, 'script',
     $t$I guess that's the main problem.. Is it a lead quality thing… quantity.. Or more so consistency… Tell me about that?$t$,
     $t$If no problem.$t$, null, '', 'number', 4),
    ('discovery', cat_id, 'script',
     $t$And what does that look like in April or October, when it's not 95 degrees out?$t$,
     $t$HVAC add-on if they say "we're busy enough".$t$, null, '', 'number', 5);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Current marketing$t$, 2) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question', $t$How are you getting jobs right now?$t$, '', null, '', 'number', 6),
    ('discovery', cat_id, 'question', $t$How's that working for you?$t$, '', null, '', 'number', 7),
    ('discovery', cat_id, 'question', $t$Residential or commercial?$t$, '', null, '', 'number', 8),
    ('discovery', cat_id, 'question', $t$Service/repair calls or full system replacements?$t$, '', null, '', 'number', 9),
    ('discovery', cat_id, 'question', $t$Who else are you paying for leads right now?$t$,
     $t$(Angi, Thumbtack, HomeAdvisor, Networx) Get specific.$t$, null, '', 'number', 10);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Data collection$t$, 3) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question', $t$How many jobs did you run last month?$t$, '', null, '', 'number', 11),
    -- The number every later line is measured against.
    ('discovery', cat_id, 'question', $t$How many of those were replacements vs. service calls?$t$,
     '', 'installs', '', 'number', 12),
    ('discovery', cat_id, 'question', $t$What's your average ticket on a replacement?$t$,
     '', 'avg_ticket', '', 'number', 13),
    ('discovery', cat_id, 'question', $t$What'd you do in revenue last year?$t$, '', null, '', 'number', 14),
    ('discovery', cat_id, 'question', $t$How long have you been at that number?$t$, '', null, '', 'number', 15),
    ('discovery', cat_id, 'question', $t$How many techs / trucks do you have running?$t$, '', null, '', 'number', 16),
    ('discovery', cat_id, 'question', $t$What do your slow months look like?$t$, '', null, '', 'number', 17);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Bridges$t$, 4) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question', $t$And have you worked with any lead-gen companies in the past?$t$,
     '', null, '', 'number', 18),
    ('discovery', cat_id, 'question', $t$What did that look like?$t$, $t$Clarify.$t$, null, '', 'number', 19),
    ('discovery', cat_id, 'question', $t$Were those exclusive leads or shared with 3 other contractors?$t$,
     '', null, '', 'number', 20),
    ('discovery', cat_id, 'question', $t$Is there anything else?$t$, '', null, '', 'number', 21),
    ('discovery', cat_id, 'script',
     $t$I mean it sounds like you're doing pretty well already, and a lot of business owners would be happy to be where you're at.. So what's the reason you're even on this call rather than just sticking with what you're currently doing?$t$,
     '', null, '', 'number', 22),
    ('discovery', cat_id, 'question',
     $t$Are there any other companies or lead-gen alternatives you're looking at now?$t$,
     '', null, '', 'number', 23);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Heaven$t$, 5) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question',
     $t$You mentioned you're at {installs} installs/month, so what's your goal, where would you like to be?$t$,
     '', 'goal', '', 'number', 24),
    ('discovery', cat_id, 'question', $t$Why that number?$t$, '', null, '', 'number', 25),
    ('discovery', cat_id, 'calc', $t$Extra revenue a month$t$, '',
     'gap_revenue', $t$(goal - installs) * avg_ticket$t$, 'money', 26),
    ('discovery', cat_id, 'calc', $t$Extra profit a month$t$,
     $t$Change the 0.35 to change the margin.$t$,
     'gap_profit', $t$(goal - installs) * avg_ticket * 0.35$t$, 'money', 27),
    ('discovery', cat_id, 'script',
     $t$And at your average ticket, that's another {gap_revenue} a month. What does that change for you?$t$,
     $t$Push to revenue.$t$, null, '', 'number', 28);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Identity tie down$t$, 6) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'script', $t$You seem like the type of person who…$t$,
     $t$Ex: they want to add $25k/mo so they can put on a second truck / hire another tech / take their kids to Disney World.$t$,
     null, '', 'number', 29),
    ('discovery', cat_id, 'script',
     $t$You seem like the type of person who would do whatever it takes to make that happen and be able to provide for your kids and family, and you're willing to invest in yourself in order to make that a reality.$t$,
     '', null, '', 'number', 30);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Timeline$t$, 7) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question',
     $t$So for you, hitting {goal} installs/month consistently, and adding {gap_profit}/month in profit, is that like a yesterday thing you're looking to solve, or is it more down the line, like a couple weeks or a couple months?$t$,
     '', null, '', 'number', 31),
    ('discovery', cat_id, 'script',
     $t$Because if you want to be booked when [the summer / the cold] hits, we'd need to be running before that, not during it.$t$,
     $t$Seasonal lever.$t$, null, '', 'number', 32);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Pre-pitch$t$, 8) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'script', $t$I can totally help.$t$, '', null, '', 'number', 33),
    ('discovery', cat_id, 'script',
     $t$RECAP:
Current state
Goal
Problem in the way$t$, '', null, '', 'number', 34),
    ('discovery', cat_id, 'script',
     $t$What you're currently doing is working, but it can only get you so far, so do you feel you need something additional?$t$,
     '', null, '', 'number', 35),
    ('discovery', cat_id, 'script', $t$And you've tried XYZ and it didn't work because XYZ.$t$,
     '', null, '', 'number', 36),
    ('discovery', cat_id, 'script', $t$So to get to GOAL, you basically just need a partner to bring you XYZ.$t$,
     '', null, '', 'number', 37),
    ('discovery', cat_id, 'script', $t$Is that pretty much the gist of it?$t$, '', null, '', 'number', 38),
    ('discovery', cat_id, 'script',
     $t$I will say {first_name}, I know for a fact I can help you. And when I say that I mean it, you seem like the type of person who when you get in a home, you'll have no problem closing the job. And as well, we only work with 1 company per area, so it wouldn't make logical sense for us to bring on someone who won't be able to close the estimates we send them. Plus if we took on more than 1 per area, we'd basically be competing against ourselves, which makes no sense.$t$,
     '', null, '', 'number', 39),
    ('discovery', cat_id, 'script',
     $t$So because I don't have anyone in [CITY] and because you're looking to grow your business, I'll tell you I can definitely help. So can I go ahead and walk through how I can do that for you?$t$,
     '', null, '', 'number', 40);

  -- =========================================================
  -- PITCH
  -- =========================================================

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Backstory$t$, 0) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'script', $t$How I started [3] years ago$t$, '', null, '', 'number', 0),
    ('pitch', cat_id, 'script', $t$Over $[150k] spent on ads at this point$t$, '', null, '', 'number', 1),
    ('pitch', cat_id, 'script', $t$Working with about [#] local service businesses now$t$, '', null, '', 'number', 2),
    ('pitch', cat_id, 'script', $t$EXCLUSIVITY$t$, '', null, '', 'number', 3),
    ('pitch', cat_id, 'script', $t$Make sense?$t$, '', null, '', 'number', 4),
    ('pitch', cat_id, 'script', $t$SHOW CLIENT AD ACCOUNT$t$, '', null, '', 'number', 5);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Pillar 1: custom branded video ads$t$, 1) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'script', $t$How this is different from what they've tried$t$, '', null, '', 'number', 6),
    ('pitch', cat_id, 'script', $t$WHAT: Custom branded video ads on Facebook and Instagram$t$, '', null, '', 'number', 7),
    ('pitch', cat_id, 'script',
     $t$WHY: Higher close rate, all exclusive to you, building your brand in your market so you're not just another quote$t$,
     '', null, '', 'number', 8),
    ('pitch', cat_id, 'script',
     $t$HOW: Targeting homeowners in your service area whose system is aging out or already failing, and putting your face in front of them at the moment they're deciding to replace, not repair$t$,
     '', null, '', 'number', 9),
    ('pitch', cat_id, 'script',
     $t$DESIRED STATE: Only serious bottom-of-funnel homeowners coming in, low lead volume so there's no chasing, and you're not the cheapest quote, you're the one they already know and trust$t$,
     '', null, '', 'number', 10),
    ('pitch', cat_id, 'script', $t$Does this make sense?$t$, '', null, '', 'number', 11);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Pillar 2: pre-qualification$t$, 2) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'script',
     $t$Current state: shared leads, renters, tire kickers, people price-shopping five contractors$t$,
     '', null, '', 'number', 12),
    ('pitch', cat_id, 'script',
     $t$Pre-qualify leads:
Homeowner, not renter
Single family home
Age of current system
Repair vs. full replacement
Timeline
Have they already had someone out?$t$, '', null, '', 'number', 13),
    ('pitch', cat_id, 'script',
     $t$No chasing leads, all qualified homeowners with intent and real timelines.$t$,
     '', null, '', 'number', 14);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Pillar 3: VSL$t$, 3) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'script', $t$Current state: they don't know you before you show up$t$, '', null, '', 'number', 15),
    ('pitch', cat_id, 'script', $t$Video sales letter: pre-sell, build trust, set expectations$t$, '', null, '', 'number', 16),
    ('pitch', cat_id, 'script', $t$How: 1 to 2 minute video on the backend$t$, '', null, '', 'number', 17),
    ('pitch', cat_id, 'script',
     $t$Desired: basically referral-quality leads who've already seen and heard you before your tech pulls in the driveway$t$,
     '', null, '', 'number', 18);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Pillar 4: self-booked estimates$t$, 4) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'script',
     $t$Current: chasing leads, playing phone tag, driving out to dead appointments$t$,
     '', null, '', 'number', 19),
    ('pitch', cat_id, 'script',
     $t$Self-booked estimate appointments: no follow-up, no chasing, basically a referral who already knows you and trusts you$t$,
     '', null, '', 'number', 20),
    ('pitch', cat_id, 'script', $t$Video gets the most serious ones to book in.$t$, '', null, '', 'number', 21),
    ('pitch', cat_id, 'script',
     $t$High-quality in-home estimates on your calendar, all inbound, without you or your office chasing anyone.$t$,
     '', null, '', 'number', 22),
    ('pitch', cat_id, 'script', $t$Make sense?$t$, '', null, '', 'number', 23);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Check in / tie down$t$, 5) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'question',
     $t$Now last question, I know it's a bit cheesy, scale of 1 to 10, pricing aside?$t$,
     '', null, '', 'number', 24),
    ('pitch', cat_id, 'question', $t$Why not a 1?$t$, '', null, '', 'number', 25),
    ('pitch', cat_id, 'question', $t$Why not a 10?$t$,
     $t$Tie down they're 100% confident.$t$, null, '', 'number', 26);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Setting up the investment$t$, 6) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'script', $t$In terms of the investment, there's a few steps.$t$,
     $t$Pen and paper.$t$, null, '', 'number', 27),
    ('pitch', cat_id, 'script', $t$First is ad spend, familiar?$t$, '', null, '', 'number', 28),
    ('pitch', cat_id, 'script',
     $t$Explain the ad spend and what it does (the more you spend, the more results you see).$t$,
     '', null, '', 'number', 29),
    ('pitch', cat_id, 'script',
     $t$Minimum I recommend is starting out with $[50]/day, that gets you a minimum of [#] in-home estimate appointments per month.$t$,
     '', null, '', 'number', 30),
    ('pitch', cat_id, 'script',
     $t$Have clients spending $[200]/day, but that's when you're looking to scale even more.$t$,
     '', null, '', 'number', 31),
    ('pitch', cat_id, 'script',
     $t$At your close rate of [X]% and your average ticket of {avg_ticket}, [#] estimates is $[X] in revenue.$t$,
     $t$Math out loud.$t$, null, '', 'number', 32),
    ('pitch', cat_id, 'script', $t$Does the ad spend make sense?$t$, '', null, '', 'number', 33),
    ('pitch', cat_id, 'script',
     $t$And that's the only money you put up front. Which leads me into how I get paid.$t$,
     '', null, '', 'number', 34);

  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('pitch', $t$Price drop: performance based$t$, 7) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('pitch', cat_id, 'script',
     $t$So the way the investment works is it's all tied to you actually making money and installing systems.$t$,
     '', null, '', 'number', 35),
    ('pitch', cat_id, 'script',
     $t$That's why I don't do a pay-per-lead or pay-per-appointment model, that's what Angi does, and you already know how that goes. You pay whether the lead is real or not.$t$,
     '', null, '', 'number', 36),
    ('pitch', cat_id, 'script',
     $t$So here's how mine works:
There's no setup fee. Zero. Nothing to start.
I get paid a percentage of the jobs I actually bring you, [5-10]% of each new job that comes through our system.$t$,
     '', null, '', 'number', 37),
    ('pitch', cat_id, 'script',
     $t$So if we run a campaign and it doesn't produce, I don't make anything. All the risk is on me. The only thing you're out is the ad spend, and you control that number.$t$,
     '', null, '', 'number', 38),
    ('pitch', cat_id, 'script',
     $t$Math it out: On a $[10k] replacement, that's $[500-1,000] to me, and $[9,000+] to you, on a customer you didn't have before.$t$,
     '', null, '', 'number', 39),
    ('pitch', cat_id, 'script',
     $t$TIE DOWN: So the only way I make money is if you make money first. Does that feel fair to you?$t$,
     '', null, '', 'number', 40);
end $mig$;
