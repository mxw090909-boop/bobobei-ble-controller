alter table public.toy_devices
  add column if not exists runtime_state jsonb not null default '{}'::jsonb,
  add column if not exists runtime_updated_at timestamptz;

create or replace function public.report_toy_state(
  p_device_id text,
  p_device_token text,
  p_state jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if jsonb_typeof(p_state) <> 'object' or pg_column_size(p_state) > 4096 then
    raise exception 'state must be a small json object';
  end if;

  update public.toy_devices
  set runtime_state = p_state,
      runtime_updated_at = now(),
      last_seen_at = now()
  where device_id = p_device_id
    and device_token = p_device_token
    and is_enabled = true;

  if not found then
    raise exception 'device not found or device token invalid';
  end if;

  return true;
end;
$$;

create or replace function public.ps()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.toy_devices%rowtype;
begin
  select *
    into v_device
  from public.toy_devices
  where device_id = 'REPLACE_WITH_YOUR_DEVICE_ID'
    and is_enabled = true
  limit 1;

  if v_device.device_id is null then
    raise exception 'toy device not enabled or missing';
  end if;

  return coalesce(v_device.runtime_state, '{}'::jsonb) || jsonb_build_object(
    'online', coalesce(v_device.runtime_updated_at > now() - interval '15 seconds', false),
    'updated_at', v_device.runtime_updated_at
  );
end;
$$;

create or replace function public.pg(p_spec jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device_id text := 'REPLACE_WITH_YOUR_DEVICE_ID';
  v_controller_token text;
  v_shape text := lower(coalesce(p_spec->>'shape', ''));
  v_after text := nullif(lower(coalesce(p_spec->>'after', '')), '');
  v_duration_ms integer;
  v_period_ms integer;
  v_rise_ms integer;
  v_payload jsonb;
  v_suck_min integer;
  v_suck_max integer;
  v_vibe_min integer;
  v_vibe_max integer;
  v_ems_min integer;
  v_ems_max integer;
begin
  if jsonb_typeof(p_spec) <> 'object' then
    raise exception 'motion spec must be a json object';
  end if;

  if v_shape not in ('ramp', 'wave', 'alternate', 'hold', 'breathe', 'wander', 'drive') then
    raise exception 'unsupported motion shape: %', v_shape;
  end if;

  if v_after is not null and v_after not in ('resume_auto', 'hold_last', 'zero') then
    raise exception 'unsupported after mode: %', v_after;
  end if;

  v_duration_ms := case
    when p_spec ? 'duration_ms' and p_spec->>'duration_ms' is not null
      then greatest(0, least((p_spec->>'duration_ms')::integer, 3600000))
    else null
  end;
  v_period_ms := greatest(600, least(coalesce((p_spec->>'period_ms')::integer, 6000), 120000));
  v_rise_ms := greatest(600, least(coalesce((p_spec->>'rise_ms')::integer, v_period_ms * 4), 3600000));

  v_suck_min := greatest(0, least(coalesce((p_spec->>'suck_min')::integer, (p_spec->>'suck')::integer, 0), 100));
  v_suck_max := greatest(v_suck_min, least(coalesce((p_spec->>'suck_max')::integer, (p_spec->>'suck')::integer, v_suck_min), 100));
  v_vibe_min := greatest(0, least(coalesce((p_spec->>'vibe_min')::integer, (p_spec->>'vibe')::integer, 0), 100));
  v_vibe_max := greatest(v_vibe_min, least(coalesce((p_spec->>'vibe_max')::integer, (p_spec->>'vibe')::integer, v_vibe_min), 100));
  v_ems_min := greatest(0, least(coalesce((p_spec->>'ems_min')::integer, (p_spec->>'ems')::integer, 0), 100));
  v_ems_max := greatest(v_ems_min, least(coalesce((p_spec->>'ems_max')::integer, (p_spec->>'ems')::integer, v_ems_min), 100));

  select controller_token
    into v_controller_token
  from public.toy_devices
  where device_id = v_device_id
    and is_enabled = true
  limit 1;

  if v_controller_token is null then
    raise exception 'toy device not enabled or missing';
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'type', 'motion',
    'source', 'peiyu',
    'shape', v_shape,
    'suck_min', v_suck_min,
    'suck_max', v_suck_max,
    'vibe_min', v_vibe_min,
    'vibe_max', v_vibe_max,
    'ems_min', v_ems_min,
    'ems_max', v_ems_max,
    'period_ms', v_period_ms,
    'rise_ms', v_rise_ms,
    'duration_ms', v_duration_ms,
    'after', v_after,
    'loss_boost', coalesce((p_spec->>'loss_boost')::boolean, true)
  ));

  return public.enqueue_toy_command(v_device_id, v_controller_token, v_payload);
end;
$$;

revoke execute on function public.report_toy_state(text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.ps() from public, anon, authenticated;
revoke execute on function public.pg(jsonb) from public, anon, authenticated;

grant execute on function public.report_toy_state(text, text, jsonb) to anon, authenticated;
grant execute on function public.ps() to anon, authenticated;
grant execute on function public.pg(jsonb) to anon, authenticated;
