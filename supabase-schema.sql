-- MTGCapsul — Supabase schema v0.1
-- Tonight's MVP: one rooms table holding game state as a jsonb blob.
-- TV hosts the game, phones join via 4-char code, state broadcast via Supabase Realtime.

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

create extension if not exists "pgcrypto";

-- ============================================================================
-- TABLES
-- ============================================================================

-- rooms: one row per active game night session
-- - code: 4-char alphanumeric join code (TV generates, phone enters)
-- - state: full gameState blob (mirrors the existing mtg_* localStorage shape)
-- - claimed_seats: which phone (device_id) claims which player slot
-- - host_device_id: the TV's device id (only the host writes canonical state)
create table if not exists public.rooms (
  code text primary key,
  state jsonb not null default '{}'::jsonb,
  claimed_seats jsonb not null default '{}'::jsonb,
  host_device_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

create or replace function public.touch_rooms_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_updated_at on public.rooms;
create trigger rooms_updated_at
  before update on public.rooms
  for each row execute function public.touch_rooms_updated_at();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================
-- Tonight's posture: if you know the code, you can read/write that room.
-- This is naive but fine for 3 trusted players around a table. Tighten later
-- with device-id claims + server-issued tokens when we go multi-pod.

alter table public.rooms enable row level security;

drop policy if exists "read_any_room" on public.rooms;
create policy "read_any_room" on public.rooms
  for select using (true);

drop policy if exists "insert_any_room" on public.rooms;
create policy "insert_any_room" on public.rooms
  for insert with check (true);

drop policy if exists "update_any_room" on public.rooms;
create policy "update_any_room" on public.rooms
  for update using (true) with check (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
-- Because automatic exposure is OFF (per setup), we explicitly grant anon access.

grant select, insert, update on public.rooms to anon;
grant usage on schema public to anon;

-- ============================================================================
-- REALTIME
-- ============================================================================
-- Enable Supabase Realtime broadcasts on this table so state changes
-- reach connected clients (TV + phones).

alter publication supabase_realtime add table public.rooms;

-- ============================================================================
-- DONE
-- ============================================================================
-- Sanity check: `select count(*) from public.rooms;` should return 0.
