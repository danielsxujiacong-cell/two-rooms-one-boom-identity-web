begin;

alter table public.two_rooms_identity_rooms
  drop constraint two_rooms_identity_rooms_capacity_check,
  add constraint two_rooms_identity_rooms_capacity_check
    check (capacity between 1 and 40),
  drop constraint two_rooms_identity_rooms_role_ids_check,
  add constraint two_rooms_identity_rooms_role_ids_check
    check (cardinality(role_ids) between 1 and 40);

create or replace function public.two_rooms_identity_create_room(
  p_code text,
  p_capacity integer,
  p_role_ids text[],
  p_owner_token_hash text,
  p_player_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_player_id uuid;
  v_invalid_count integer;
begin
  if p_code is null or p_code !~ '^[0-9]{4}$' then
    raise exception using errcode = 'P0001', message = 'invalid_room_code';
  end if;
  if p_capacity not between 1 and 40 then
    raise exception using errcode = 'P0001', message = 'invalid_capacity';
  end if;
  if p_role_ids is null or cardinality(p_role_ids) <> p_capacity then
    raise exception using errcode = 'P0001', message = 'invalid_deck';
  end if;
  if p_owner_token_hash !~ '^[a-f0-9]{64}$' or p_player_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'token_invalid';
  end if;

  select count(*) into v_invalid_count
  from (
    select role_id
    from unnest(p_role_ids) as deck(role_id)
    group by role_id
    having count(*) > case when role_id in ('blue_team', 'red_team') then 40 else 1 end
  ) invalid;
  if v_invalid_count > 0 or exists (select 1 from unnest(p_role_ids) r where r is null) then
    raise exception using errcode = 'P0001', message = 'invalid_deck';
  end if;

  insert into public.two_rooms_identity_rooms (room_code, owner_token_hash, capacity, role_ids)
  values (p_code, p_owner_token_hash, p_capacity::smallint, p_role_ids);

  insert into public.two_rooms_identity_players (room_code, nickname, nickname_key, player_token_hash, seat, is_owner)
  values (p_code, '房主', '房主', p_player_token_hash, 0, true)
  returning id into v_player_id;

  return jsonb_build_object('success', true, 'roomCode', p_code, 'playerId', v_player_id, 'playerCount', 1);
end
$function$;

commit;
