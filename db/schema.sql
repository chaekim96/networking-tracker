-- ===========================================================================
-- Secure Networking Tracker — contacts table, constraints, and RLS policies
-- Apply with: npm run db:push   (uses DATABASE_URL from .env.local)
-- ===========================================================================

-- gen_random_uuid() lives in pgcrypto. Neon usually has it, but be explicit.
create extension if not exists pgcrypto;


-- ---------------------------------------------------------------------------
-- 1. TABLE
-- ---------------------------------------------------------------------------
create table if not exists public.contacts (
  -- Surrogate primary key. Random UUIDs, not sequential integers, so a row id
  -- leaks nothing about how many contacts exist or who owns neighbouring rows.
  id         uuid        primary key default gen_random_uuid(),

  -- THE OWNERSHIP COLUMN. Every RLS policy below compares against this.
  -- Defaults to auth.user_id(), the id of the signed-in user as seen from
  -- inside Postgres. The DATABASE stamps the owner; the client never sends it.
  -- NOT NULL means a row can never exist without an owner, so it can never
  -- become invisible-but-present or readable by everyone.
  user_id    text        not null default auth.user_id(),

  -- The one genuinely required piece of contact data.
  name       text        not null,

  -- Optional context. NULL is meaningful here: "I don't know where they work"
  -- is different from "they work nowhere", so these stay nullable.
  company    text,
  role       text,
  met_at     text,                     -- where you met them
  notes      text,

  -- Restricted vocabulary, defended by the CHECK constraint below.
  priority   text        not null default 'medium',

  created_at timestamptz not null default now(),

  -- NOT NULL alone still permits the empty string '', so an empty name would
  -- slip through. This rejects '' and whitespace-only names at the database.
  constraint contacts_name_not_blank
    check (length(btrim(name)) > 0),

  -- The requirement that priority is only ever one of three values, enforced
  -- where it cannot be bypassed. A request that skips the UI and the API and
  -- talks straight to the Data API still cannot write priority = 'urgent'.
  constraint contacts_priority_valid
    check (priority in ('high', 'medium', 'low'))
);

-- Every query this app makes is "my rows, newest first". This index matches
-- that access pattern so RLS filtering stays cheap as the table grows.
create index if not exists contacts_user_id_created_at_idx
  on public.contacts (user_id, created_at desc);


-- ---------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------------
-- Before this line: any role with table privileges sees EVERY row.
-- After this line: the table defaults to DENY. No row is visible or writable
-- to anyone until a policy explicitly permits it. RLS turns the table from
-- "allow unless forbidden" into "forbid unless allowed".
alter table public.contacts enable row level security;

-- Table-level privileges are separate from row-level policies, and BOTH must
-- pass. These grants say "the authenticated role may attempt these verbs";
-- the policies below decide which rows those verbs may actually touch.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select, insert, update, delete on public.contacts to authenticated;
  end if;
end
$$;


-- ---------------------------------------------------------------------------
-- 3. THE FOUR OWNERSHIP POLICIES
-- ---------------------------------------------------------------------------
-- Four separate policies rather than one FOR ALL policy: each verb states its
-- own rule explicitly, so the intent is auditable and a future change to one
-- verb cannot silently widen the others.

drop policy if exists contacts_select_own on public.contacts;
drop policy if exists contacts_insert_own on public.contacts;
drop policy if exists contacts_update_own on public.contacts;
drop policy if exists contacts_delete_own on public.contacts;

-- SELECT — which rows you are allowed to READ.
-- Rows failing USING are not an error; they simply do not exist as far as the
-- query is concerned. Another user's contacts return zero rows, not "denied".
create policy contacts_select_own
  on public.contacts
  for select
  to authenticated
  using (auth.user_id() = user_id);

-- INSERT — what the NEW row is allowed to look like.
-- INSERT has no existing row to test, so it takes WITH CHECK only. This blocks
-- writing a row stamped with somebody else's user_id.
create policy contacts_insert_own
  on public.contacts
  for insert
  to authenticated
  with check (auth.user_id() = user_id);

-- UPDATE — needs BOTH clauses, and they stop two different attacks.
--   USING      = which existing rows you may edit at all.
--                Blocks: editing a contact that belongs to someone else.
--   WITH CHECK = what the row is allowed to look like AFTERWARDS.
--                Blocks: taking your own row and reassigning user_id to
--                another account, i.e. giving your data away or planting a
--                row in someone else's list.
-- With only USING, that second attack succeeds.
create policy contacts_update_own
  on public.contacts
  for update
  to authenticated
  using (auth.user_id() = user_id)
  with check (auth.user_id() = user_id);

-- DELETE — which rows you may remove. No WITH CHECK, because a deleted row has
-- no "after" state to validate.
create policy contacts_delete_own
  on public.contacts
  for delete
  to authenticated
  using (auth.user_id() = user_id);
