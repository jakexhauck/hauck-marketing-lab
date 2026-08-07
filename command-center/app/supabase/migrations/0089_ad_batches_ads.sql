-- 0089: the ads inside a batch. What we are actually making, and from which file.
--
-- 0088 gave a batch its writing: competitors, angles, three primaries, three
-- headlines, and on a video batch the hook and the script. What it could not
-- say is how many ads that round is, what each one IS, or which creative each
-- one points at. A round of "four static ads: two before/after, a testimonial
-- and an offer" had nowhere to live, so the count lived in Jake's head and the
-- pairing of copy to image lived nowhere at all.
--
--   ads   [{ type, creativeId, creativeName }]
--
-- The COPY DOES NOT MOVE. Primary copy and headlines stay exactly where 0088
-- put them, on the batch, universal, three of each. Meta rotates that same copy
-- across every creative in the round, so per-ad copy would be three fields
-- nobody fills in and a second place to look for the text that actually ran.
-- An ad here is a creative plus a label for it, nothing more.
--
--   type          FREE TEXT, deliberately. A fixed list would be cleaner data
--                 and was offered; the call was that a format invented on a
--                 Tuesday must not wait on a deploy. The cost is real and
--                 known: "before and after", "Before & After" and "b/a" are
--                 three different strings, so nothing can count them yet. If
--                 that reporting is ever wanted, normalise then, on real rows,
--                 rather than guessing a vocabulary now.
--
--   creativeId    A Google Drive file id from the client's own creatives
--                 folder (tenants.creatives_drive_folder_id, added in 0079).
--                 Not a foreign key and not a copy of the file: Drive owns the
--                 bytes, this owns the address. Empty until one is linked, so
--                 an ad can be typed out before its creative exists.
--
--   creativeName  The file's name AT THE MOMENT IT WAS LINKED. Denormalised on
--                 purpose. The name is re-read live from Drive whenever the
--                 folder listing has the file, and this snapshot is only used
--                 when it does not: a creative moved, renamed or binned still
--                 reads as the thing it was instead of a bare id.
--
-- jsonb, matching competitors and angles, and for the same reason: the list is
-- only ever read as a whole batch and never queried across batches. A child
-- table would buy a join and a second endpoint for a read nobody makes. If ad
-- type ever needs aggregating across clients, that is the migration that earns
-- the table.
--
-- Whether these are static or video ads is already answered by the batch's
-- `kind`. A static batch's ads are its static ads, and "how many are we making"
-- is how many rows are in here.
--
-- Run AFTER 0088. Idempotent, additive, and invisible to code that does not
-- select it, so it is safe to apply ahead of the deploy that reads it.

alter table public.ad_batches
  add column if not exists ads jsonb not null default '[]'::jsonb;

comment on column public.ad_batches.ads is
  'The ads in this round: [{type, creativeId, creativeName}]. type is free text; '
  'creativeId is a Drive file id in the client''s creatives folder. Copy and '
  'headlines stay on the batch and are shared across all of these.';
