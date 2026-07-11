create extension if not exists pgcrypto;

create table if not exists public.toy_devices (
  device_id text primary key,
  display_name text not null,
  device_token text not null,
  controller_token text not null,
  is_enabled boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.toy_commands (
  id uuid primary key default gen_random_uuid(),
  device_id text not null references public.toy_devices(device_id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'done', 'error')),
  claimed_at timestamptz,
  acked_at timestamptz,
  error_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists toy_commands_claim_idx
  on public.toy_commands (device_id, status, created_at);

alter table public.toy_devices enable row level security;
alter table public.toy_commands enable row level security;

drop policy if exists "rpc only devices" on public.toy_devices;
drop policy if exists "rpc only commands" on public.toy_commands;

create policy "rpc only devices"
  on public.toy_devices
  for all
  using (false)
  with check (false);

create policy "rpc only commands"
  on public.toy_commands
  for all
  using (false)
  with check (false);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists toy_devices_touch_updated_at on public.toy_devices;
create trigger toy_devices_touch_updated_at
before update on public.toy_devices
for each row execute function public.touch_updated_at();

drop trigger if exists toy_commands_touch_updated_at on public.toy_commands;
create trigger toy_commands_touch_updated_at
before update on public.toy_commands
for each row execute function public.touch_updated_at();

create or replace function public.enqueue_toy_command(
  p_device_id text,
  p_controller_token text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command_id uuid;
begin
  if not exists (
    select 1 from public.toy_devices
    where device_id = p_device_id
      and controller_token = p_controller_token
      and is_enabled = true
  ) then
    raise exception 'device not found or controller token invalid';
  end if;

  insert into public.toy_commands (device_id, payload)
  values (p_device_id, p_payload)
  returning id into v_command_id;

  return v_command_id;
end;
$$;

create or replace function public.claim_toy_command(
  p_device_id text,
  p_device_token text,
  p_stop_only boolean default false
)
returns table (
  command_id uuid,
  payload jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command_id uuid;
begin
  if not exists (
    select 1 from public.toy_devices
    where device_id = p_device_id
      and device_token = p_device_token
      and is_enabled = true
  ) then
    raise exception 'device not found or device token invalid';
  end if;

  update public.toy_devices
  set last_seen_at = now()
  where device_id = p_device_id;

  select c.id
  into v_command_id
  from public.toy_commands c
  where c.device_id = p_device_id
    and c.status = 'pending'
    and (not p_stop_only or c.payload->>'type' = 'stop')
  order by
    case when c.payload->>'type' = 'stop' then 0 else 1 end,
    c.created_at
  for update skip locked
  limit 1;

  if v_command_id is null then
    return;
  end if;

  update public.toy_commands c
  set status = 'claimed',
      claimed_at = now()
  where c.id = v_command_id
  returning c.id, c.payload
  into command_id, payload;

  return next;
end;
$$;

create or replace function public.ack_toy_command(
  p_device_id text,
  p_device_token text,
  p_command_id uuid,
  p_status text,
  p_error_text text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('done', 'error') then
    raise exception 'invalid ack status';
  end if;

  if not exists (
    select 1 from public.toy_devices
    where device_id = p_device_id
      and device_token = p_device_token
      and is_enabled = true
  ) then
    raise exception 'device not found or device token invalid';
  end if;

  update public.toy_commands
  set status = p_status,
      acked_at = now(),
      error_text = p_error_text
  where id = p_command_id
    and device_id = p_device_id
    and status = 'claimed';

  return found;
end;
$$;

create or replace function public.begin_toy_session(
  p_device_id text,
  p_device_token text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_command_id uuid;
begin
  if not exists (
    select 1 from public.toy_devices
    where device_id = p_device_id
      and device_token = p_device_token
      and is_enabled = true
  ) then
    raise exception 'device not found or device token invalid';
  end if;

  delete from public.toy_commands
  where device_id = p_device_id
    and status = 'pending';

  update public.toy_devices
  set last_seen_at = now()
  where device_id = p_device_id;

  insert into public.toy_commands (device_id, payload)
  values (
    p_device_id,
    jsonb_build_object('type', 'stop', 'source', 'bluefy', 'session_start', true)
  )
  returning id into v_command_id;

  return v_command_id;
end;
$$;

revoke execute on function public.enqueue_toy_command(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.claim_toy_command(text, text, boolean) from public, anon, authenticated;
revoke execute on function public.ack_toy_command(text, text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.begin_toy_session(text, text) from public, anon, authenticated;

grant execute on function public.enqueue_toy_command(text, text, jsonb) to anon, authenticated;
grant execute on function public.claim_toy_command(text, text, boolean) to anon, authenticated;
grant execute on function public.ack_toy_command(text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.begin_toy_session(text, text) to anon, authenticated;

insert into public.toy_devices (
  device_id,
  display_name,
  device_token,
  controller_token
)
values (
  'REPLACE_WITH_YOUR_DEVICE_ID',
  'YOUR_DEVICE_NAME',
  'REPLACE_WITH_YOUR_DEVICE_TOKEN',
  'REPLACE_WITH_YOUR_CONTROLLER_TOKEN'
)
on conflict (device_id) do update set
  display_name = excluded.display_name,
  device_token = excluded.device_token,
  controller_token = excluded.controller_token,
  is_enabled = true,
  updated_at = now();
