-- 0086: which offer was on the table, and what was actually quoted.
--
-- 0057 recorded what a meeting BECAME (the outcome, the cash, the retainer) and
-- nothing about what was offered. That was fine while there was one offer. There
-- are six families and ten variants of them now, every one written as a range:
-- 5 to 10% of a new client, $99 to $250 an appointment, $250 to $350 setup.
--
-- Recording the family alone would answer nothing worth asking. "Performance
-- based" cannot tell you whether the 7% closes better than the 10%, or whether
-- charging the setup fee is what lost the deal. So two columns:
--
--   offer_variant  which of the ten, as an id from functions/lib/salesOffers.ts.
--                  Its own text column rather than a key inside the jsonb, so
--                  "how does each offer close" is a group by rather than a scan.
--
--   offer_terms    the numbers actually said, as {"setup":300,"rate":7}. jsonb
--                  because the terms differ per variant: a retainer has three,
--                  a free trial has one, and a column each would be nine mostly
--                  empty columns.
--
-- Both are OPTIONAL and stay optional. An outcome recorded in a hurry with no
-- offer picked is still an outcome, and refusing it to protect a statistic would
-- be the wrong trade.
--
-- No check constraint on offer_variant. The list of variants lives in TypeScript
-- and is shared by the endpoint that writes and the panel that asks; a copy of
-- it here would be a second source of truth that goes stale the first time Jake
-- adds an offer. cleanOffer is the gate, and it refuses anything not on the list.
--
-- Cleared, like the reason and the deal, whenever the outcome says nobody
-- turned up: an offer cannot have been made to somebody who never arrived.
--
-- Run AFTER 0085. Idempotent: safe to re-run.
-- Reached only via the service-role client in Functions.

alter table public.sales_calls
  add column if not exists offer_variant text;

alter table public.sales_calls
  add column if not exists offer_terms jsonb;

-- The read that pays for this column: every recorded call carrying one offer,
-- grouped. Partial, because most rows will never have an offer on them.
create index if not exists sales_calls_offer_variant_idx
  on public.sales_calls (offer_variant)
  where offer_variant is not null;
