-- 0083: Jake's actual discovery script, in place of the placeholders.
--
-- 0074 seeded eighteen prompts and said in its own comment that they were
-- placeholders meant to be rewritten. They never were, because rewriting
-- eighteen rows through a web form is a worse job than writing the script in a
-- document, which is where it lived instead.
--
-- This is that document, as rows, with the keys wired: the questions that feed
-- the timeline line file their answers under installs, goal and avg_ticket, and
-- the three calcs turn those into the profit number Jake says out loud.
--
-- Discovery only. Pitch and Objection handling keep their placeholders, because
-- there is no real script for them yet and inventing one would be worse than
-- leaving the ones that are honestly marked as filler.
--
-- The seed is guarded twice:
--
--   1. It does nothing at all if any row anywhere already has an answer_key.
--      That is the signal that this migration (or Jake) has already been here,
--      and it is what makes a re-run safe.
--   2. It only deletes the six DISCOVERY placeholders from 0074, and only where
--      they are UNTOUCHED (updated_by is null: nothing has edited, moved,
--      refiled or retired them). A placeholder Jake reworded is a placeholder
--      Jake decided to keep, and it survives, unfiled, at the bottom of the
--      column. The pitch and objections placeholders are not touched at all.
--
-- Run AFTER 0082, which adds the columns this fills in.
-- Reached only via the service-role client in Functions.

do $mig$
declare
  base integer;
  cat_id uuid;
begin
  -- Already keyed: 0083 has run, or Jake has wired keys himself. Either way,
  -- putting the script back would duplicate a call he has since edited.
  if exists (select 1 from public.sales_playbook_items where answer_key is not null) then
    return;
  end if;

  delete from public.sales_playbook_items
   where updated_by is null
     and archived_at is null
     and section = 'discovery'
     and prompt in (
       $t$Walk me through how you get customers today.$t$,
       $t$How many jobs are you doing a month right now?$t$,
       $t$What is an average job worth to you?$t$,
       $t$What made you take this call?$t$,
       $t$What have you already tried, and what happened?$t$,
       $t$If this made sense today, is it your call alone?$t$
     );

  -- Whatever is left in Discovery keeps its place; the script goes under it.
  select coalesce(max(sort_order), -1) + 1 into base
    from public.sales_playbook_items
   where section = 'discovery';

  -- ===== Rapport =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Rapport$t$, 0) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'script',
     $t$How's the day going?$t$,
     $t$No longer than one or two minutes.$t$, null, '', 'number', base + 0),
    ('discovery', cat_id, 'script',
     $t$I'm going to get some context on your business, then go over how it all works and the best pricing option based on that. Sounds good?$t$,
     $t$Set the frame before anything else.$t$, null, '', 'number', base + 1),
    ('discovery', cat_id, 'question',
     $t$Where are you based, and how far out do you go?$t$,
     $t$The pre-pitch needs the city.$t$, 'city', '', 'number', base + 2);

  -- ===== Why are they on the call =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Why are they on the call$t$, 1) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question',
     $t$Besides just being curious, what specifically were you looking to get out of this call?$t$,
     $t$Do not accept anything surface level. You need an actual problem.$t$,
     'problem', '', 'number', base + 3),
    ('discovery', cat_id, 'script',
     $t$I guess that's the main problem. Is it a lead quality thing, a quantity thing, or more so consistency? Tell me about that.$t$,
     $t$Only if they give you nothing.$t$, null, '', 'number', base + 4),
    ('discovery', cat_id, 'script',
     $t$And what does that look like in April or October, when it's not 95 degrees out?$t$,
     $t$HVAC add-on, if they say they are busy enough.$t$, null, '', 'number', base + 5);

  -- ===== Current marketing =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Current marketing$t$, 2) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question', $t$How are you getting jobs right now?$t$,
     '', 'getting_jobs', '', 'number', base + 6),
    ('discovery', cat_id, 'question', $t$How's that working for you?$t$,
     '', null, '', 'number', base + 7),
    ('discovery', cat_id, 'question', $t$Residential or commercial?$t$,
     '', 'market', '', 'number', base + 8),
    ('discovery', cat_id, 'question', $t$Service and repair calls, or full system replacements?$t$,
     '', 'job_mix', '', 'number', base + 9),
    ('discovery', cat_id, 'question', $t$Who else are you paying for leads right now?$t$,
     $t$Angi, Thumbtack, HomeAdvisor, Networx. Get specific.$t$,
     'paying_for', '', 'number', base + 10);

  -- ===== Data collection =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Data collection$t$, 3) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question', $t$How many jobs did you run last month?$t$,
     '', 'jobs', '', 'number', base + 11),
    ('discovery', cat_id, 'question', $t$How many of those were replacements rather than service calls?$t$,
     $t$This is the number the goal is measured against.$t$,
     'installs', '', 'number', base + 12),
    ('discovery', cat_id, 'question', $t$What's your average ticket on a replacement?$t$,
     '', 'avg_ticket', '', 'number', base + 13),
    ('discovery', cat_id, 'question', $t$What did you do in revenue last year?$t$,
     '', 'revenue', '', 'number', base + 14),
    ('discovery', cat_id, 'question', $t$How long have you been at that number?$t$,
     '', 'stuck_for', '', 'number', base + 15),
    ('discovery', cat_id, 'question', $t$How many techs and trucks do you have running?$t$,
     '', 'crew', '', 'number', base + 16),
    ('discovery', cat_id, 'question', $t$What do your slow months look like?$t$,
     '', 'slow_months', '', 'number', base + 17);

  -- ===== Bridges =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Bridges$t$, 4) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question', $t$And have you worked with any lead-gen companies in the past?$t$,
     '', 'tried_before', '', 'number', base + 18),
    ('discovery', cat_id, 'question', $t$What did that look like?$t$,
     $t$Clarify. The pre-pitch recap reads this back to them.$t$,
     'tried_result', '', 'number', base + 19),
    ('discovery', cat_id, 'question', $t$Were those exclusive leads, or shared with three other contractors?$t$,
     '', 'exclusivity', '', 'number', base + 20),
    ('discovery', cat_id, 'script', $t$Is there anything else?$t$,
     '', null, '', 'number', base + 21),
    ('discovery', cat_id, 'script',
     $t$It sounds like you're doing pretty well already, and a lot of business owners would be happy to be where you're at. So what's the reason you're even on this call, rather than just sticking with what you're currently doing?$t$,
     '', null, '', 'number', base + 22),
    ('discovery', cat_id, 'question',
     $t$Are there any other companies or lead-gen alternatives you're looking at now?$t$,
     '', 'alternatives', '', 'number', base + 23);

  -- ===== Heaven =====
  --
  -- Where the call turns. The question below carries {installs} in its own
  -- words, so it reads back the number they gave twelve questions ago without
  -- Jake having to remember it, and the four calcs under it turn their goal
  -- into the profit figure the timeline line says out loud.
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Heaven$t$, 5) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question',
     $t$You mentioned you're at {installs} installs a month, so what's your goal? Where would you like to be?$t$,
     '', 'goal', '', 'number', base + 24),
    ('discovery', cat_id, 'question', $t$Why that number?$t$,
     '', 'why_goal', '', 'number', base + 25),
    ('discovery', cat_id, 'calc', $t$Extra installs a month$t$,
     '', 'gap_installs', $t$goal - installs$t$, 'number', base + 26),
    ('discovery', cat_id, 'calc', $t$Extra revenue a month$t$,
     '', 'gap_revenue', $t$gap_installs * avg_ticket$t$, 'money', base + 27),
    ('discovery', cat_id, 'calc', $t$Margin we assume$t$,
     $t$Change the 0.35 to change every profit number below it.$t$,
     'margin', $t$0.35$t$, 'number', base + 28),
    ('discovery', cat_id, 'calc', $t$Extra profit a month$t$,
     '', 'gap_profit', $t$gap_revenue * margin$t$, 'money', base + 29),
    ('discovery', cat_id, 'script',
     $t$And at your average ticket, that's another {gap_revenue} a month. What does that change for you?$t$,
     $t$Push it to revenue.$t$, null, '', 'number', base + 30);

  -- ===== Identity tie-down =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Identity tie-down$t$, 6) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question', $t$What would that money actually go towards?$t$,
     $t$The second truck, the extra tech, the trip with the kids.$t$,
     'what_for', '', 'number', base + 31),
    ('discovery', cat_id, 'script',
     $t$You seem like the type of person who would do whatever it takes to make that happen, to be able to provide for your family, and you're willing to invest in yourself in order to make that a reality.$t$,
     $t$Say it back using {what_for}.$t$, null, '', 'number', base + 32);

  -- ===== Timeline =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Timeline$t$, 7) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'question',
     $t$So for you, hitting {goal} installs a month consistently, and adding {gap_profit} a month in profit, is that a yesterday thing you're looking to solve, or is it more down the line?$t$,
     $t$Both numbers fill themselves in from earlier.$t$,
     'timeline', '', 'number', base + 33),
    ('discovery', cat_id, 'script',
     $t$Because if you want to be booked when the summer hits, we'd need to be running before that, not during it.$t$,
     $t$Seasonal lever.$t$, null, '', 'number', base + 34);

  -- ===== Pre-pitch =====
  insert into public.sales_playbook_categories (section, name, sort_order)
  values ('discovery', $t$Pre-pitch$t$, 8) returning id into cat_id;

  insert into public.sales_playbook_items
    (section, category_id, kind, prompt, hint, answer_key, formula, format, sort_order)
  values
    ('discovery', cat_id, 'script', $t$I can totally help.$t$,
     '', null, '', 'number', base + 35),
    ('discovery', cat_id, 'script',
     $t$Right now you're at {installs} installs a month, and you want {goal}.
The problem in the way is {problem}.
What you're currently doing is working, but it can only get you so far, so do you feel you need something additional?
And you've tried {tried_before}, and it didn't work because {tried_result}.
So to get to {goal} a month, you basically just need a partner to bring you the leads.
Is that pretty much the gist of it?$t$,
     $t$The recap. Every blank in it was filled earlier in this call.$t$,
     null, '', 'number', base + 36),
    ('discovery', cat_id, 'script',
     $t$I will say {first_name}, I know for a fact I can help you. And when I say that, I mean it: you seem like the type of person who, when you get in a home, will have no problem closing the job. We also only work with one company per area, so it wouldn't make logical sense for us to bring on someone who can't close the estimates we send them. Plus if we took on more than one per area, we'd be competing against ourselves, which makes no sense.$t$,
     '', null, '', 'number', base + 37),
    ('discovery', cat_id, 'question',
     $t$So because I don't have anyone in {city}, and because you're looking to grow your business, can I go ahead and walk through how I can do that for you?$t$,
     $t$The last thing said before the Pitch column.$t$,
     'permission', '', 'number', base + 38);
end $mig$;
