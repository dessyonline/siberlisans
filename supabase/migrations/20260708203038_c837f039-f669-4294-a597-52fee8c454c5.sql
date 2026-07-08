-- ENUMs
create type public.support_ticket_status as enum ('open','pending','closed');
create type public.support_ticket_priority as enum ('low','normal','high','urgent');

-- Tickets
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null check (char_length(subject) between 2 and 160),
  status public.support_ticket_status not null default 'open',
  priority public.support_ticket_priority not null default 'normal',
  last_message_at timestamptz not null default now(),
  last_message_by_admin boolean not null default false,
  unread_for_user int not null default 0,
  unread_for_admin int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

grant select, insert, update on public.support_tickets to authenticated;
grant all on public.support_tickets to service_role;

alter table public.support_tickets enable row level security;

create policy "users read own tickets"
  on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create policy "users create own tickets"
  on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid());

create policy "users update own tickets, admin any"
  on public.support_tickets for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create index support_tickets_user_idx on public.support_tickets(user_id, last_message_at desc);
create index support_tickets_status_idx on public.support_tickets(status, last_message_at desc);

-- Messages
create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

grant select, insert on public.support_messages to authenticated;
grant all on public.support_messages to service_role;

alter table public.support_messages enable row level security;

create policy "read messages of accessible tickets"
  on public.support_messages for select to authenticated
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (t.user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
    )
  );

create policy "send messages to accessible tickets"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id
        and (t.user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
    )
    and is_admin = public.has_role(auth.uid(),'admin')
  );

create index support_messages_ticket_idx on public.support_messages(ticket_id, created_at);

-- updated_at trigger
create or replace function public.support_tickets_touch()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create trigger trg_support_tickets_touch
  before update on public.support_tickets
  for each row execute function public.support_tickets_touch();

-- On new message: bump ticket counters/last_message
create or replace function public.support_messages_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets
    set last_message_at = new.created_at,
        last_message_by_admin = new.is_admin,
        unread_for_user = case when new.is_admin then unread_for_user + 1 else unread_for_user end,
        unread_for_admin = case when new.is_admin then unread_for_admin else unread_for_admin + 1 end,
        status = case
          when status = 'closed' then 'open'
          when new.is_admin then 'pending'
          else 'open'
        end
    where id = new.ticket_id;
  return new;
end $$;

create trigger trg_support_messages_after_insert
  after insert on public.support_messages
  for each row execute function public.support_messages_after_insert();

-- Mark read RPCs
create or replace function public.support_mark_read_user(_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.support_tickets
    set unread_for_user = 0
    where id = _ticket_id and user_id = auth.uid();
end $$;

create or replace function public.support_mark_read_admin(_ticket_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_role(auth.uid(),'admin') then
    raise exception 'forbidden';
  end if;
  update public.support_tickets
    set unread_for_admin = 0
    where id = _ticket_id;
end $$;

grant execute on function public.support_mark_read_user(uuid) to authenticated;
grant execute on function public.support_mark_read_admin(uuid) to authenticated;

-- Realtime
alter publication supabase_realtime add table public.support_tickets;
alter publication supabase_realtime add table public.support_messages;
alter table public.support_tickets replica identity full;
alter table public.support_messages replica identity full;