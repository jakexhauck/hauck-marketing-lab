-- 0090: lead forms, drafted here and pasted into Meta.
--
-- Meta's Instant Form builder is a bad place to THINK. It is inside Ads Manager,
-- it cannot be reviewed next to the copy the form belongs to, there is no draft
-- state worth the name, and a form written in it is unfindable next month. So
-- the questions, the options, the branching and the screens either side get
-- written here, beside the round of ads they serve, and pasted across when they
-- are right. Nothing in this table talks to Meta. It is a drafting table, the
-- same as ad_batches, and the only thing it produces is text on a clipboard.
--
-- A form is PER CLIENT and lives in its own list, NOT inside a batch. One form
-- usually serves several rounds of ads, so owning it from a batch would mean
-- rebuilding it every round and having edits to one never reach the other.
-- A batch points AT one instead: see ad_batches.form_id below.
--
-- The column layout follows Meta's own builder top to bottom (name, intent,
-- intro, questions, privacy, completion) so pasting is a walk down the page
-- rather than a hunt.
--
--   intent            more_volume | higher_intent. Meta's two form types. It
--                     changes nothing here; it is recorded so the paste is a
--                     complete instruction and nobody has to remember which
--                     kind this one was.
--
--   questions         The whole question list, in order, as jsonb. Shape:
--
--                       { id, kind, label, prefill, options[], showIf }
--
--                     id      a stable local id ("q1", "q2"). Its only job is
--                             to be the target of another question's showIf,
--                             which is why it cannot be the array index:
--                             reordering or deleting a question would silently
--                             re-point every rule that named it.
--                     kind    prefill | short | choice.
--                             prefill = Meta fills it from the profile (email,
--                             phone, full name). short = a typed answer.
--                             choice = multiple choice, and the only kind that
--                             can be branched on.
--                     label   the question as it is asked. On a prefill this is
--                             Meta's own wording, kept editable because Meta
--                             lets it be edited.
--                     prefill which profile field, when kind is prefill. A
--                             suggestion list is offered in the UI but the box
--                             takes any text: the list is Meta's and Meta adds
--                             to it.
--                     options [{ label, disqualify }], choice only. disqualify
--                             marks the answer that ends the form as a bad fit,
--                             which is the "outcome" half of the logic and the
--                             same primitive the Willis funnel calls dq.
--                     showIf  { questionId, optionLabel } or null. The question
--                             is asked only when that earlier choice was given.
--                             This is Meta's conditional question and nothing
--                             more: one antecedent, one value. Arbitrary boolean
--                             logic is not modelled because Meta cannot express
--                             it, and a builder that drafts what the target
--                             cannot accept is worse than no builder.
--
-- jsonb rather than a questions table, for the third time and the same reason:
-- it is read as a whole form, never queried across forms. The id inside each
-- row is what a child table would have given us and is the only part we need.
--
-- Run AFTER 0089. Idempotent.
-- Service-role only, admin-gated in _middleware.ts. Never client-reachable.

create table if not exists public.ad_lead_forms (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,

  -- Named while being written, like a batch, so it may be empty.
  name        text not null default '',

  intent      text not null default 'more_volume'
              check (intent in ('more_volume', 'higher_intent')),

  intro_headline    text not null default '',
  intro_description text not null default '',

  questions   jsonb not null default '[]'::jsonb,

  privacy_url        text not null default '',
  privacy_disclaimer text not null default '',

  completion_headline text not null default '',
  completion_body     text not null default '',
  -- Meta offers a fixed set of button labels and adds to it. Free text, so a
  -- new one never waits on a deploy.
  completion_cta      text not null default '',
  completion_url      text not null default '',

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- The only read: one client's forms, newest first.
create index if not exists ad_lead_forms_tenant_idx
  on public.ad_lead_forms (tenant_id, created_at desc);

alter table public.ad_lead_forms enable row level security;
-- No policies. Service-role only, same as ad_batches.

-- Which form a round of ads feeds. NULL is the normal state for every batch
-- written before now and for any round that is not a lead-form campaign.
--
-- ON DELETE SET NULL, deliberately not cascade: binning a form must never take
-- a round of written copy with it. The batch simply stops naming one.
alter table public.ad_batches
  add column if not exists form_id uuid references public.ad_lead_forms(id) on delete set null;

comment on column public.ad_batches.form_id is
  'The lead form this round feeds, or null. Set null when the form is deleted; '
  'the batch and its copy survive.';
