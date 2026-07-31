-- 0074: the sales call playbook — the prompts worked through on Sales > On Call.
--
-- On Call shipped with its three columns hardcoded in a TypeScript file, which
-- was honest for a shape review and wrong the moment Jake wanted to change a
-- question. A script that lives in the bundle can only be edited by a deploy,
-- and the person who writes the script is not the person who deploys.
--
-- So the prompts become rows. The three SECTIONS stay in code
-- (functions/lib/salesPlaybook.ts) because they are the shape of a sales call
-- rather than a preference: find out what is wrong, say what you do about it,
-- answer the reason they give for not doing it. Reordering those would be a
-- different call, not a different playbook.
--
-- `prompt` and `hint` are PLAIN TEXT and are rendered as text everywhere. That
-- is deliberate and is the whole trust boundary: unlike cold_call_assets.html
-- (0058), nothing here ever reaches dangerouslySetInnerHTML, so there is no
-- sanitizer to keep in step. Writes go through cleanPrompt/cleanHint, which cap
-- the length and flatten control characters, and nothing else.
--
-- Retiring a prompt is `archived_at`, never a delete, matching cold_call_assets:
-- a question Jake pulled in March is worth being able to look at in June. The
-- endpoint does allow a hard delete, for the row somebody added by mistake
-- thirty seconds ago.
--
-- Run AFTER 0001..0073. Idempotent: safe to re-run, and the seed below will not
-- duplicate itself.
-- Reached only via the service-role client in Functions (admin session gated in
-- _middleware.ts, owner gated in the handler).

create table if not exists public.sales_playbook_items (
  id          uuid primary key default gen_random_uuid(),

  -- Which column it appears in. Checked here as well as in the handler: the
  -- three sections are the shape of the call and a fourth one arriving by way
  -- of a typo would draw nothing anywhere.
  section     text not null check (section in ('discovery', 'pitch', 'objections')),

  -- The line Jake reads mid-call, and the small grey line under it.
  prompt      text not null,
  hint        text not null default '',

  -- Jake's order within its section. Ties break on id.
  sort_order  integer not null default 0,

  -- Retired: off the call, still on the management page under "retired".
  archived_at timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.admin_accounts(id) on delete set null
);

-- The read is always "the live prompts of one section, in order", so that is
-- the index.
create index if not exists sales_playbook_items_section_idx
  on public.sales_playbook_items (section, sort_order, created_at);

alter table public.sales_playbook_items enable row level security;
-- No policies: service-role only, same as cold_call_assets.

-- =========================
-- Seed: the placeholder prompts On Call shipped with.
--
-- Seeded rather than left empty so the page opens on something to edit instead
-- of on a blank screen with three headings. These are PLACEHOLDERS and are
-- meant to be rewritten: they are here to be edited, not to be right.
--
-- Guarded on the table being empty rather than on each row, so once Jake has
-- deleted a question he does not want, re-running this migration does not put
-- it back.
-- =========================
insert into public.sales_playbook_items (section, prompt, hint, sort_order)
select * from (values
  ('discovery', 'Walk me through how you get customers today.', 'Let them talk. Where the leads come from, who chases them.', 0),
  ('discovery', 'How many jobs are you doing a month right now?', 'The number to hold every later claim against.', 1),
  ('discovery', 'What is an average job worth to you?', 'Ticket size. You cannot price the offer without it.', 2),
  ('discovery', 'What made you take this call?', 'The actual trigger. Slow month, a competitor, a bad agency.', 3),
  ('discovery', 'What have you already tried, and what happened?', 'Old burns. These become the objections later.', 4),
  ('discovery', 'If this made sense today, is it your call alone?', 'Find the partner or spouse now, not at the close.', 5),

  ('pitch', 'Play back the problem in their words.', 'Use what they said in Discovery. "So right now you are..."', 0),
  ('pitch', 'How the system works, in three steps.', 'Plain language. No platform names, no jargon.', 1),
  ('pitch', 'The proof: a client like them, and the numbers.', 'One story, told properly. Not a list of logos.', 2),
  ('pitch', 'Run their own numbers back at them.', 'Their ticket size times a realistic month against the fee.', 3),
  ('pitch', 'The offer: what it costs and what happens next.', 'Say the price, then stop talking.', 4),

  ('objections', '"It is too expensive."', 'Go back to the maths. Cost per job, not cost per month.', 0),
  ('objections', '"I need to think about it."', 'Find out what about it. Thinking is never the real answer.', 1),
  ('objections', '"I need to talk to my partner."', 'Should have surfaced in Discovery. Book them both.', 2),
  ('objections', '"I tried an agency before and it did not work."', 'Ask what specifically failed, then separate us from it.', 3),
  ('objections', '"I am already too busy / booked out."', 'Better jobs, not more jobs. Raise the ticket.', 4),
  ('objections', '"I could just do this myself."', 'Cost of their hours, and the cost of learning on their own money.', 5),
  ('objections', '"Call me after the season / next quarter."', 'Lead time. What is built now works then.', 6)
) as seed(section, prompt, hint, sort_order)
where not exists (select 1 from public.sales_playbook_items);
