drop function if exists public.peiyu_suck(integer);
drop function if exists public.peiyu_suck(integer, integer);
drop function if exists public.peiyu_suck_for(integer, integer);
drop function if exists public.peiyu_vibe(integer);
drop function if exists public.peiyu_vibe(integer, integer);
drop function if exists public.peiyu_vibe_for(integer, integer);
drop function if exists public.peiyu_ems(integer);
drop function if exists public.peiyu_ems(integer, integer);
drop function if exists public.peiyu_ems_for(integer, integer);
drop function if exists public.peiyu_touch(text, integer);
drop function if exists public.peiyu_touch(text, integer, integer);
drop function if exists public.peiyu_touch_for(text, integer, integer);
drop function if exists public.peiyu_set(integer, integer, integer, integer);

create or replace function public.peiyu_set(
  p_vibe integer default 0,
  p_suck integer default 0,
  p_ems integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := 'REPLACE_WITH_YOUR_DEVICE_ID';
  v_controller_token text;
  v_payload jsonb;
begin
  select controller_token
    into v_controller_token
  from public.toy_devices
  where device_id = v_device_id
    and is_enabled = true;

  if v_controller_token is null then
    raise exception 'toy device not enabled or missing';
  end if;

  v_payload := jsonb_build_object(
    'type', 'set_all',
    'source', 'peiyu',
    'vibe', greatest(0, least(coalesce(p_vibe, 0), 100)),
    'suck', greatest(0, least(coalesce(p_suck, 0), 100)),
    'ems', greatest(0, least(coalesce(p_ems, 0), 100))
  );

  return public.enqueue_toy_command(v_device_id, v_controller_token, v_payload);
end;
$$;

create or replace function public.peiyu_set_for(
  p_vibe integer default 0,
  p_suck integer default 0,
  p_ems integer default 0,
  p_duration_ms integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := 'REPLACE_WITH_YOUR_DEVICE_ID';
  v_controller_token text;
  v_payload jsonb;
begin
  select controller_token
    into v_controller_token
  from public.toy_devices
  where device_id = v_device_id
    and is_enabled = true;

  if v_controller_token is null then
    raise exception 'toy device not enabled or missing';
  end if;

  v_payload := jsonb_build_object(
    'type', 'set_all',
    'source', 'peiyu',
    'vibe', greatest(0, least(coalesce(p_vibe, 0), 100)),
    'suck', greatest(0, least(coalesce(p_suck, 0), 100)),
    'ems', greatest(0, least(coalesce(p_ems, 0), 100)),
    'duration_ms', greatest(0, least(coalesce(p_duration_ms, 0), 300000))
  );

  return public.enqueue_toy_command(v_device_id, v_controller_token, v_payload);
end;
$$;

create or replace function public.peiyu_stop()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := 'REPLACE_WITH_YOUR_DEVICE_ID';
  v_controller_token text;
  v_payload jsonb;
begin
  select controller_token
    into v_controller_token
  from public.toy_devices
  where device_id = v_device_id
    and is_enabled = true;

  if v_controller_token is null then
    raise exception 'toy device not enabled or missing';
  end if;

  v_payload := jsonb_build_object(
    'type', 'stop',
    'source', 'peiyu'
  );

  return public.enqueue_toy_command(v_device_id, v_controller_token, v_payload);
end;
$$;

create or replace function public.peiyu_pattern(
  p_steps jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := 'REPLACE_WITH_YOUR_DEVICE_ID';
  v_controller_token text;
  v_steps jsonb;
  v_payload jsonb;
begin
  if jsonb_typeof(p_steps) <> 'array' then
    raise exception 'pattern steps must be a jsonb array';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'suck', greatest(0, least(coalesce((step->>'suck')::integer, 0), 100)),
      'vibe', greatest(0, least(coalesce((step->>'vibe')::integer, 0), 100)),
      'ems', greatest(0, least(coalesce((step->>'ems')::integer, 0), 100)),
      'ms', greatest(0, least(coalesce((step->>'ms')::integer, 0), 300000))
    )
  )
    into v_steps
  from jsonb_array_elements(p_steps) as step;

  select controller_token
    into v_controller_token
  from public.toy_devices
  where device_id = v_device_id
    and is_enabled = true;

  if v_controller_token is null then
    raise exception 'toy device not enabled or missing';
  end if;

  v_payload := jsonb_build_object(
    'type', 'pattern',
    'source', 'peiyu',
    'steps', coalesce(v_steps, '[]'::jsonb)
  );

  return public.enqueue_toy_command(v_device_id, v_controller_token, v_payload);
end;
$$;

create or replace function public.pt(
  p_ch integer,
  p_level integer,
  p_ms integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level integer := greatest(0, least(coalesce(p_level, 0), 100));
  v_ms integer := greatest(0, least(coalesce(p_ms, 0), 300000));
begin
  if p_ch = 7 then
    if p_ms is null then
      return public.peiyu_set(0, v_level, 0);
    end if;
    return public.peiyu_set_for(0, v_level, 0, v_ms);
  elsif p_ch = 1 then
    if p_ms is null then
      return public.peiyu_set(v_level, 0, 0);
    end if;
    return public.peiyu_set_for(v_level, 0, 0, v_ms);
  elsif p_ch = 3 then
    if p_ms is null then
      return public.peiyu_set(0, 0, v_level);
    end if;
    return public.peiyu_set_for(0, 0, v_level, v_ms);
  else
    raise exception 'unsupported paper channel: %', p_ch
      using hint = 'Use 7 for suck, 1 for vibe, or 3 for ems.';
  end if;
end;
$$;

create or replace function public.pw(
  p_ch integer,
  p_levels integer[],
  p_ms_list integer[],
  p_auto_zero boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_len integer;
  v_steps jsonb := '[]'::jsonb;
  v_level integer;
  v_ms integer;
  i integer;
begin
  if p_levels is null or p_ms_list is null then
    raise exception 'levels and ms_list are required';
  end if;

  v_len := array_length(p_levels, 1);
  if v_len is null or v_len = 0 then
    raise exception 'levels must not be empty';
  end if;

  if array_length(p_ms_list, 1) is distinct from v_len then
    raise exception 'levels and ms_list length mismatch';
  end if;

  if p_ch not in (7, 1, 3) then
    raise exception 'unsupported paper channel: %', p_ch
      using hint = 'Use 7 for suck, 1 for vibe, or 3 for ems.';
  end if;

  for i in 1..v_len loop
    v_level := greatest(0, least(coalesce(p_levels[i], 0), 100));
    v_ms := greatest(0, least(coalesce(p_ms_list[i], 0), 300000));

    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'suck', case when p_ch = 7 then v_level else 0 end,
        'vibe', case when p_ch = 1 then v_level else 0 end,
        'ems', case when p_ch = 3 then v_level else 0 end,
        'ms', v_ms
      )
    );
  end loop;

  if coalesce(p_auto_zero, false) then
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object('suck', 0, 'vibe', 0, 'ems', 0, 'ms', 1000)
    );
  end if;

  return public.peiyu_pattern(v_steps);
end;
$$;

create or replace function public.pm(
  p_suck integer[],
  p_vibe integer[],
  p_ems integer[],
  p_ms_list integer[],
  p_auto_zero boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_len integer;
  v_steps jsonb := '[]'::jsonb;
  i integer;
begin
  if p_suck is null or p_vibe is null or p_ems is null or p_ms_list is null then
    raise exception 'suck, vibe, ems, and ms_list arrays are required';
  end if;

  v_len := array_length(p_ms_list, 1);
  if v_len is null or v_len = 0 then
    raise exception 'ms_list must not be empty';
  end if;

  if array_length(p_suck, 1) is distinct from v_len
     or array_length(p_vibe, 1) is distinct from v_len
     or array_length(p_ems, 1) is distinct from v_len then
    raise exception 'suck, vibe, ems, and ms_list length mismatch';
  end if;

  for i in 1..v_len loop
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object(
        'suck', greatest(0, least(coalesce(p_suck[i], 0), 100)),
        'vibe', greatest(0, least(coalesce(p_vibe[i], 0), 100)),
        'ems', greatest(0, least(coalesce(p_ems[i], 0), 100)),
        'ms', greatest(0, least(coalesce(p_ms_list[i], 0), 300000))
      )
    );
  end loop;

  if coalesce(p_auto_zero, false) then
    v_steps := v_steps || jsonb_build_array(
      jsonb_build_object('suck', 0, 'vibe', 0, 'ems', 0, 'ms', 1000)
    );
  end if;

  return public.peiyu_pattern(v_steps);
end;
$$;

create or replace function public.pz()
returns uuid
language sql
security definer
set search_path = public
as $$
  select public.peiyu_stop();
$$;

create or replace function public.pc()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id text := 'REPLACE_WITH_YOUR_DEVICE_ID';
  v_controller_token text;
  v_payload jsonb;
begin
  select controller_token
    into v_controller_token
  from public.toy_devices
  where device_id = v_device_id
    and is_enabled = true;

  if v_controller_token is null then
    raise exception 'toy device not enabled or missing';
  end if;

  v_payload := jsonb_build_object(
    'type', 'probe',
    'source', 'peiyu'
  );

  return public.enqueue_toy_command(v_device_id, v_controller_token, v_payload);
end;
$$;

revoke execute on function public.peiyu_set(integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.peiyu_set_for(integer, integer, integer, integer) from public, anon, authenticated;
revoke execute on function public.peiyu_stop() from public, anon, authenticated;
revoke execute on function public.peiyu_pattern(jsonb) from public, anon, authenticated;

grant execute on function public.pt(integer, integer, integer) to anon, authenticated;
grant execute on function public.pw(integer, integer[], integer[], boolean) to anon, authenticated;
grant execute on function public.pm(integer[], integer[], integer[], integer[], boolean) to anon, authenticated;
grant execute on function public.pz() to anon, authenticated;
grant execute on function public.pc() to anon, authenticated;
