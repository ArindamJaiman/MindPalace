-- MindPalace cloud sync schema.
-- Every row belongs to one user; row-level security restricts access to the owner.
-- Rows are soft-deleted (deleted = true) so deletions propagate to other devices.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  accent text not null default '#8b7bff',
  folders text[] not null default '{}',
  fidget jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.notes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null default '',
  content text not null default '',
  folder text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, id)
);

create table public.tasks (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  title text not null default '',
  details text not null default '',
  done boolean not null default false,
  priority smallint not null default 0 check (priority between 0 and 3),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  due timestamptz,
  due_has_time boolean not null default false,
  remind_at timestamptz,
  reminded boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, id)
);

-- Lets a future scheduled job find reminders that are due, for server-sent push.
create index tasks_pending_reminders_idx on public.tasks (remind_at)
  where not done and not deleted and not reminded and remind_at is not null;

create table public.completions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  task_id text not null,
  title text not null default '',
  at timestamptz not null,
  tags text[] not null default '{}',
  priority smallint not null default 0,
  xp integer not null default 0,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, id)
);

create table public.attachments (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  type text not null default 'application/octet-stream',
  size bigint not null default 0,
  created_at timestamptz not null default now(),
  deleted boolean not null default false,
  primary key (user_id, id)
);

-- ---------- last-writer-wins, enforced by the server ----------
-- Clients upsert freely; an update carrying an older updated_at than the stored row is skipped,
-- so a device that was offline can never clobber newer edits.

create or replace function public.keep_newest()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

create trigger profiles_keep_newest before update on public.profiles for each row execute function public.keep_newest();
create trigger notes_keep_newest before update on public.notes for each row execute function public.keep_newest();
create trigger tasks_keep_newest before update on public.tasks for each row execute function public.keep_newest();
create trigger completions_keep_newest before update on public.completions for each row execute function public.keep_newest();

-- ---------- row-level security ----------

-- Only signed-in users touch these tables (RLS below narrows that to their own rows).
grant select, insert, update, delete on public.profiles, public.notes, public.tasks, public.completions, public.attachments to authenticated;
revoke all on public.profiles, public.notes, public.tasks, public.completions, public.attachments from anon;

alter table public.profiles enable row level security;
alter table public.notes enable row level security;
alter table public.tasks enable row level security;
alter table public.completions enable row level security;
alter table public.attachments enable row level security;

create policy "own profile: select" on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "own profile: insert" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "own profile: update" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "own notes: select" on public.notes for select to authenticated using ((select auth.uid()) = user_id);
create policy "own notes: insert" on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own notes: update" on public.notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own notes: delete" on public.notes for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own tasks: select" on public.tasks for select to authenticated using ((select auth.uid()) = user_id);
create policy "own tasks: insert" on public.tasks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own tasks: update" on public.tasks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own tasks: delete" on public.tasks for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own completions: select" on public.completions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own completions: insert" on public.completions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own completions: update" on public.completions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own completions: delete" on public.completions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "own attachments: select" on public.attachments for select to authenticated using ((select auth.uid()) = user_id);
create policy "own attachments: insert" on public.attachments for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own attachments: update" on public.attachments for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own attachments: delete" on public.attachments for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------- file storage: attachments/<user id>/<attachment id> ----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', false, 52428800)
on conflict (id) do nothing;

create policy "own files: select" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: update" on storage.objects for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "own files: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------- realtime: live sync between open devices ----------

alter publication supabase_realtime add table public.notes, public.tasks, public.completions, public.attachments, public.profiles;
