create or replace function public.bobobei_panel_snapshot(
  p_device_id text,
  p_controller_token text,
  p_limit integer default 24
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_device public.toy_devices%rowtype;
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 50);
  v_recent jsonb := '[]'::jsonb;
  v_pending integer := 0;
  v_claimed integer := 0;
  v_error integer := 0;
begin
  select d.*
  into v_device
  from public.toy_devices as d
  where d.device_id = p_device_id
    and d.controller_token = p_controller_token
    and d.is_enabled = true;

  if not found then
    raise exception 'device unavailable or panel credential invalid'
      using errcode = '28000';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'payload', c.payload,
        'status', c.status,
        'claimed_at', c.claimed_at,
        'acked_at', c.acked_at,
        'error_text', c.error_text,
        'created_at', c.created_at,
        'updated_at', c.updated_at
      )
      order by c.created_at desc
    ),
    '[]'::jsonb
  )
  into v_recent
  from (
    select tc.*
    from public.toy_commands as tc
    where tc.device_id = p_device_id
    order by tc.created_at desc
    limit v_limit
  ) as c;

  select
    count(*) filter (where tc.status = 'pending'),
    count(*) filter (where tc.status = 'claimed'),
    count(*) filter (where tc.status = 'error')
  into v_pending, v_claimed, v_error
  from public.toy_commands as tc
  where tc.device_id = p_device_id;

  return jsonb_build_object(
    'display_name', v_device.display_name,
    'bridge_online', coalesce(v_device.last_seen_at >= now() - interval '6 seconds', false),
    'last_seen_at', v_device.last_seen_at,
    'server_now', now(),
    'queue', jsonb_build_object(
      'pending', v_pending,
      'claimed', v_claimed,
      'error', v_error
    ),
    'recent_commands', v_recent
  );
end;
$$;

revoke execute on function public.bobobei_panel_snapshot(text, text, integer)
  from public, anon, authenticated;
grant execute on function public.bobobei_panel_snapshot(text, text, integer)
  to anon;

comment on function public.bobobei_panel_snapshot(text, text, integer) is
  'Returns a token-scoped, secret-free snapshot for the private Bobobei MCP panel.';

notify pgrst, 'reload schema';
