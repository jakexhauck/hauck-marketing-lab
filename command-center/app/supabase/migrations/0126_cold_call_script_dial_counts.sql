-- 0126: the script test counts its dials in Postgres instead of in the Worker.
--
-- The A/B test on the dialing scripts (0058) derives every number it shows from
-- cold_call_dials on each read, which is the right call: nobody can type a count
-- next to their favourite script. What it did to get them was read EVERY dial
-- ever recorded, two columns wide, and roll them up in the Worker.
--
-- PostgREST caps a response at 1000 rows and says so only in the Content-Range
-- header, which nothing was reading. So the 1001st dial did not break anything
-- loudly; it just started truncating the answer. By 2026-09-10 the table held
-- 1303 attributed dials, the newest 303 never arrived, and Variation 5 and
-- Variation 6 reported "Not dialed yet" while somebody was dialing them. The
-- older variations were wrong too, quietly: Variation 2 showed 168 of its 234.
--
-- The file that read them predicted this in a comment and asked for a window by
-- date. A window would still have been a sample. This groups instead, so the
-- answer is one row per script per outcome, about seventy rows in total, and it
-- cannot outgrow the cap however many calls get made.
--
-- The counting RULES stay in TypeScript (functions/lib/coldCallDials.ts), which
-- is deliberate: what counts as a pickup is argued over where commission is, and
-- it must mean one thing on the tracker and the same thing here. This view
-- counts rows and decides nothing.
--
-- Run AFTER 0001..0125. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions.
-- Served by cold_call_dials_script_idx (script_id, outcome), created in 0058.

create or replace view public.cold_call_script_dial_counts as
  select
    script_id,
    outcome,
    count(*)::int as dials
  from public.cold_call_dials
  where script_id is not null
  group by script_id, outcome;

comment on view public.cold_call_script_dial_counts is
  'Dials per script per outcome, for the A/B script test. Grouped in Postgres so the Worker never pulls the whole dial table to count it, and never silently loses the newest 300 rows of it to PostgREST''s 1000-row cap.';
