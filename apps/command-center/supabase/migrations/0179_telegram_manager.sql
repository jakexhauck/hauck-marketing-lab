-- 0179: Telegram, through the Manager (docs/build-plans/hermes-agent-ops.md, Phase 3).
--
-- Jake gets a Telegram message only when something needs him: a card or a
-- request waiting on his OK, or an alert. Two small tables, both written by the
-- server only (service role); no browser reads them.
--
-- telegram_messages: every message the bot sent that a later event has to find
-- again. An approval is edited when the card is decided (in the app or in
-- Telegram); a change prompt is how Jake's force-reply is mapped back to its
-- card. payload_hash is the card version the approval showed, so an unchanged
-- rewrite does not ping twice.
--
-- telegram_alerts: one row per alert key ("runner", "turn:<agent>"), so an
-- incident is sent once and cleared when things are healthy again.

create table if not exists public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.agent_items(id) on delete cascade,
  chat_id text not null,
  message_id bigint not null,
  kind text not null,
  payload_hash text,
  state text not null default 'open',
  created_at timestamptz not null default now(),
  constraint telegram_messages_kind_check check (kind in ('approval', 'change_prompt')),
  constraint telegram_messages_state_check check (state in ('open', 'closed')),
  constraint telegram_messages_chat_message_key unique (chat_id, message_id)
);

create index if not exists telegram_messages_item_idx on public.telegram_messages (item_id, kind, state);

alter table public.telegram_messages enable row level security;

create table if not exists public.telegram_alerts (
  key text primary key,
  fails integer not null default 0,
  last_ref text,
  alerted_at timestamptz,
  detail text,
  updated_at timestamptz not null default now()
);

alter table public.telegram_alerts enable row level security;
