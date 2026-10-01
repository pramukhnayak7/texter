create table if not exists public.global_chat_messages (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
    content text not null check (char_length(btrim(content)) between 1 and 1000),
    created_at timestamptz not null default now()
);

create index if not exists global_chat_messages_created_at_idx
    on public.global_chat_messages (created_at desc);

alter table public.global_chat_messages enable row level security;

revoke all on table public.global_chat_messages from anon;
grant select, insert on table public.global_chat_messages to authenticated;

drop policy if exists "Authenticated users can read global chat" on public.global_chat_messages;
create policy "Authenticated users can read global chat"
    on public.global_chat_messages
    for select
    to authenticated
    using (true);

drop policy if exists "Users can send their own global chat messages" on public.global_chat_messages;
create policy "Users can send their own global chat messages"
    on public.global_chat_messages
    for insert
    to authenticated
    with check (auth.uid() = user_id);

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'global_chat_messages'
    ) then
        alter publication supabase_realtime add table public.global_chat_messages;
    end if;
end;
$$;
