-- Body-control commands are ephemeral. Never replay an old queue when Bluefy
-- reconnects after being backgrounded or closed.
update public.toy_commands
set status = 'error',
    acked_at = coalesce(acked_at, now()),
    error_text = coalesce(error_text, 'expired before Bluefy could claim it')
where status in ('pending', 'claimed')
  and created_at < now() - interval '5 minutes';

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
set search_path = ''
as $$
declare
  v_command_id uuid;
begin
  if not exists (
    select 1
    from public.toy_devices
    where device_id = p_device_id
      and device_token = p_device_token
      and is_enabled = true
  ) then
    raise exception 'device not found or device token invalid';
  end if;

  update public.toy_devices
  set last_seen_at = now()
  where device_id = p_device_id;

  -- Clear abandoned work before choosing the next command. Five minutes is
  -- deliberately longer than the panel's longest allowed 120-second action.
  update public.toy_commands
  set status = 'error',
      acked_at = coalesce(acked_at, now()),
      error_text = coalesce(error_text, 'expired before Bluefy could claim it')
  where device_id = p_device_id
    and status in ('pending', 'claimed')
    and created_at < now() - interval '5 minutes';

  select c.id
  into v_command_id
  from public.toy_commands as c
  where c.device_id = p_device_id
    and c.status = 'pending'
    and c.created_at >= now() - interval '5 minutes'
    and (not p_stop_only or c.payload->>'type' = 'stop')
  order by
    case when c.payload->>'type' = 'stop' then 0 else 1 end,
    c.created_at
  for update skip locked
  limit 1;

  if v_command_id is null then
    return;
  end if;

  update public.toy_commands as c
  set status = 'claimed',
      claimed_at = now()
  where c.id = v_command_id
  returning c.id, c.payload
  into command_id, payload;

  return next;
end;
$$;
