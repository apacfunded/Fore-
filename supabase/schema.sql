-- Fore! schema. Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists rounds (
  id              bigserial primary key,
  status          text not null default 'open' check (status in ('open','settling','settled')),
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz not null,
  blockhash       text,
  seed            bigint,
  entry_count     int,
  winner_entry_id bigint,
  pool_lamports   bigint,
  payout_lamports bigint,
  practice        boolean not null default false,  -- won before the pool reached MIN_POOL_SOL, so no payout
  settled_at      timestamptz
);
alter table rounds add column if not exists practice boolean not null default false;
create index if not exists rounds_status_idx on rounds (status, id desc);
-- Only one round can be open at a time
create unique index if not exists one_open_round on rounds ((status)) where status = 'open';

create table if not exists entries (
  id          bigserial primary key,
  round_id    bigint not null references rounds(id) on delete cascade,
  wallet      text not null,          -- where the player wants to be paid
  handle      text,
  callout_url text not null,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  unique (round_id, wallet),
  unique (round_id, ip_hash),         -- one entry per internet connection per round
  unique (callout_url)                -- each callout can only be used once, ever
);
create index if not exists entries_round_idx on entries (round_id, id);

create table if not exists payouts (
  id           bigserial primary key,
  round_id     bigint not null unique references rounds(id),
  entry_id     bigint not null references entries(id),
  wallet       text not null,
  handle       text,
  lamports     bigint not null,
  status       text not null default 'pending' check (status in ('pending','paid','skipped')),
  tx_signature text,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists payouts_status_idx on payouts (status, id desc);

-- One row holding the running pool estimate
create table if not exists pool_state (
  id                  int primary key check (id = 1),
  accrued_sol         numeric not null default 0,
  adjust_sol          numeric not null default 0,
  last_accrual_at     timestamptz,
  last_sol_usd        numeric,
  last_volume_h24_usd numeric,
  unlocked_at         timestamptz          -- set when the pool first reaches MIN_POOL_SOL
);
alter table pool_state add column if not exists unlocked_at timestamptz;
insert into pool_state (id) values (1) on conflict (id) do nothing;

-- Lock the tables down. The site only talks to them through its own server routes
-- using the service role key, so the public anon key gets no access at all.
alter table rounds     enable row level security;
alter table entries    enable row level security;
alter table payouts    enable row level security;
alter table pool_state enable row level security;
