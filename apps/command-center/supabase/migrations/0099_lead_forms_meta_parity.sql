-- 0099: the lead form draft grows into everything Meta's Instant Form builder has.
--
-- 0090 modelled the parts of a form we happened to use: a name, a type, an
-- intro, three kinds of question, a privacy line and a completion screen. That
-- was enough to draft with and not enough to TRANSCRIBE with: half of what the
-- builder asks for had no box here, so half of every form was still decided
-- inside Ads Manager where it cannot be reviewed, versioned or found again.
--
-- This adds the rest of Meta's builder, section by section, so the draft and the
-- real form are the same object and pasting is a walk down the page. Still
-- nothing here talks to Meta. The output is text on a clipboard.
--
-- WHAT IS NEW, in Meta's own order:
--
--   intent              gains 'rich_creative', Meta's third form type. The check
--                       is widened rather than dropped: an unknown type is still
--                       a bug, and a form whose type nobody recorded is a form
--                       somebody has to guess about.
--
--   intro_image_url     the background image behind the greeting.
--   intro_layout        paragraph | list. Meta draws the description as a
--                       paragraph or as a bulleted list and they read very
--                       differently, so which one was intended is recorded.
--
--   questions           same jsonb list, wider rows. Added per question:
--
--                       field_name  Meta's "field name": the key the lead
--                                   arrives under in the CRM. It is the single
--                                   most expensive thing to get wrong, because
--                                   it is invisible on the form and only shows
--                                   up as a column of nulls a week later.
--                       optional    Meta lets some questions be skipped. Default
--                                   false: a question nobody has to answer is
--                                   the exception, not the rule.
--                       multiSelect a choice where more than one answer can be
--                                   picked.
--                       minLength   short answer validation, 0 meaning unset.
--                       maxLength   the same.
--                       inlineContext  the small print under an appointment
--                                   picker or a store lookup.
--
--                       And two new kinds beside prefill/short/choice:
--                       'appointment' (Meta's appointment request) and
--                       'store_locator' (Meta's store lookup).
--
--                       CONDITIONALS ARE STILL showIf AND DELIBERATELY SO. Meta
--                       presents branching as a "conditional question" that owns
--                       its follow-ups, but a nested question cannot be reordered
--                       or re-pointed without rewriting the tree. The list stays
--                       FLAT and a follow-up is an ordinary question carrying a
--                       showIf, which the editor draws indented under the answer
--                       it belongs to. Same form, same paste, and moving a
--                       question is still one swap.
--
--   privacy_link_text   the words the policy link is shown as.
--   disclaimer_title    Meta's custom disclaimer has a title above its body; the
--                       body is the existing privacy_disclaimer.
--   consents            [{ text, optional }]. Meta's consent checkboxes. Each is
--                       its own tick with its own wording, which is why this is a
--                       list and not another paragraph.
--
--   completion_cta_type view_website | download | call_business |
--                       message_business | view_on_facebook. The BUTTON'S KIND,
--                       which decides whether the thing beside it is a URL or a
--                       phone number. completion_cta stays the button's TEXT.
--   completion_phone    the number, when the button calls.
--
--   locale              the form's language.
--   sharing             restricted | open. Meta's form sharing setting; open
--                       lets other advertisers on the page use the form.
--   tracking_params     [{ key, value }]. Meta's tracking parameters, which come
--                       back attached to every lead.
--
-- Run AFTER 0098. Idempotent.
-- Service-role only, admin-gated in _middleware.ts. Never client-reachable.

alter table public.ad_lead_forms
  add column if not exists intro_image_url     text not null default '',
  add column if not exists intro_layout        text not null default 'paragraph',
  add column if not exists privacy_link_text   text not null default '',
  add column if not exists disclaimer_title    text not null default '',
  add column if not exists consents            jsonb not null default '[]'::jsonb,
  add column if not exists completion_cta_type text not null default 'view_website',
  add column if not exists completion_phone    text not null default '',
  add column if not exists locale              text not null default 'English (US)',
  add column if not exists sharing             text not null default 'restricted',
  add column if not exists tracking_params     jsonb not null default '[]'::jsonb;

-- Meta's third form type. Dropped and re-added rather than altered, because a
-- check constraint cannot be widened in place.
alter table public.ad_lead_forms drop constraint if exists ad_lead_forms_intent_check;
alter table public.ad_lead_forms
  add constraint ad_lead_forms_intent_check
  check (intent in ('more_volume', 'higher_intent', 'rich_creative'));

alter table public.ad_lead_forms drop constraint if exists ad_lead_forms_intro_layout_check;
alter table public.ad_lead_forms
  add constraint ad_lead_forms_intro_layout_check
  check (intro_layout in ('paragraph', 'list'));

alter table public.ad_lead_forms drop constraint if exists ad_lead_forms_sharing_check;
alter table public.ad_lead_forms
  add constraint ad_lead_forms_sharing_check
  check (sharing in ('restricted', 'open'));

-- The button's kind, not its words. Constrained because each value changes what
-- the field beside it means, and an unrecognised one would leave the paste
-- saying "press the button" with nothing behind it.
alter table public.ad_lead_forms drop constraint if exists ad_lead_forms_cta_type_check;
alter table public.ad_lead_forms
  add constraint ad_lead_forms_cta_type_check
  check (completion_cta_type in (
    'view_website', 'download', 'call_business', 'message_business', 'view_on_facebook'
  ));

comment on column public.ad_lead_forms.completion_cta_type is
  'The completion button''s KIND. view_website and download use completion_url, '
  'call_business uses completion_phone, the other two use neither. '
  'completion_cta is the button''s visible text.';

comment on column public.ad_lead_forms.consents is
  'Meta''s consent checkboxes: [{ text, optional }]. One tick per entry, each '
  'with its own wording, because that is how Meta renders them.';
