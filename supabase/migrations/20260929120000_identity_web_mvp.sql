begin;

do $guard$
begin
  if to_regclass('public.two_rooms_identity_rooms') is not null
     or to_regclass('public.two_rooms_identity_players') is not null
     or to_regclass('public.two_rooms_identity_assignments') is not null
     or to_regprocedure('public.two_rooms_identity_create_room(text, integer, text[], text, text)') is not null
     or to_regprocedure('public.two_rooms_identity_join_room(text, text, text, text)') is not null
     or to_regprocedure('public.two_rooms_identity_deal_room(text, text, jsonb)') is not null then
    raise exception 'two_rooms_identity resource already exists; inspect it before applying this migration';
  end if;
end
$guard$;

create table public.two_rooms_identity_rooms (
  room_code text primary key check (room_code ~ '^[0-9]{4}$'),
  owner_token_hash text not null check (owner_token_hash ~ '^[a-f0-9]{64}$'),
  capacity smallint not null check (capacity between 4 and 40),
  role_ids text[] not null check (cardinality(role_ids) between 4 and 40),
  status text not null default 'waiting' check (status in ('waiting', 'dealt')),
  created_at timestamptz not null default now(),
  dealt_at timestamptz
);

create table public.two_rooms_identity_players (
  id uuid primary key default gen_random_uuid(),
  room_code text not null references public.two_rooms_identity_rooms(room_code) on delete cascade,
  nickname varchar(16) not null check (char_length(btrim(nickname)) between 1 and 16),
  nickname_key text not null,
  player_token_hash text not null check (player_token_hash ~ '^[a-f0-9]{64}$'),
  seat smallint not null check (seat between 0 and 39),
  is_owner boolean not null default false,
  created_at timestamptz not null default now(),
  unique (room_code, id),
  unique (room_code, nickname_key),
  unique (room_code, seat),
  unique (room_code, player_token_hash)
);

create table public.two_rooms_identity_assignments (
  room_code text not null,
  player_id uuid not null,
  role_id text not null,
  instance_id uuid not null,
  assigned_at timestamptz not null default now(),
  primary key (room_code, player_id),
  unique (room_code, instance_id),
  foreign key (room_code, player_id)
    references public.two_rooms_identity_players(room_code, id) on delete cascade
);

alter table public.two_rooms_identity_rooms enable row level security;
alter table public.two_rooms_identity_players enable row level security;
alter table public.two_rooms_identity_assignments enable row level security;

revoke all on public.two_rooms_identity_rooms from public, anon, authenticated;
revoke all on public.two_rooms_identity_players from public, anon, authenticated;
revoke all on public.two_rooms_identity_assignments from public, anon, authenticated;
grant all on public.two_rooms_identity_rooms to service_role;
grant all on public.two_rooms_identity_players to service_role;
grant all on public.two_rooms_identity_assignments to service_role;

create function public.two_rooms_identity_create_room(
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
  if p_capacity not between 4 and 40 then
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
    having count(*) > case when role_id in ('blue_team', 'red_team') then 10 else 1 end
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

create function public.two_rooms_identity_join_room(
  p_code text,
  p_nickname text,
  p_nickname_key text,
  p_player_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_room public.two_rooms_identity_rooms%rowtype;
  v_player public.two_rooms_identity_players%rowtype;
  v_count integer;
begin
  if p_code is null or p_code !~ '^[0-9]{4}$' then
    raise exception using errcode = 'P0001', message = 'invalid_room_code';
  end if;
  if p_player_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'token_invalid';
  end if;

  select * into v_room
  from public.two_rooms_identity_rooms
  where room_code = p_code
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'room_not_found';
  end if;

  select * into v_player
  from public.two_rooms_identity_players
  where room_code = p_code and player_token_hash = p_player_token_hash;
  if found then
    select count(*) into v_count from public.two_rooms_identity_players where room_code = p_code;
    return jsonb_build_object('success', true, 'roomCode', p_code, 'playerId', v_player.id, 'playerCount', v_count, 'status', v_room.status);
  end if;

  if v_room.status <> 'waiting' then
    raise exception using errcode = 'P0001', message = 'room_locked';
  end if;
  if p_nickname is null or char_length(btrim(p_nickname)) not between 1 and 16 or p_nickname_key is null then
    raise exception using errcode = 'P0001', message = 'invalid_nickname';
  end if;

  select count(*) into v_count from public.two_rooms_identity_players where room_code = p_code;
  if v_count >= v_room.capacity then
    raise exception using errcode = 'P0001', message = 'room_full';
  end if;

  insert into public.two_rooms_identity_players (room_code, nickname, nickname_key, player_token_hash, seat, is_owner)
  values (p_code, p_nickname, p_nickname_key, p_player_token_hash, v_count::smallint, false)
  returning id into v_player.id;

  return jsonb_build_object('success', true, 'roomCode', p_code, 'playerId', v_player.id, 'playerCount', v_count + 1, 'status', 'waiting');
exception
  when unique_violation then
    raise exception using errcode = 'P0001', message = 'nickname_taken';
end
$function$;

create function public.two_rooms_identity_deal_room(
  p_code text,
  p_owner_token_hash text,
  p_assignments jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_room public.two_rooms_identity_rooms%rowtype;
  v_player_count integer;
  v_valid_player_count integer;
  v_assignment_count integer;
  v_distinct_player_count integer;
  v_distinct_instance_count integer;
  v_assigned_roles text[];
  v_expected_roles text[];
begin
  select * into v_room
  from public.two_rooms_identity_rooms
  where room_code = p_code
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'room_not_found';
  end if;
  if p_owner_token_hash is null or p_owner_token_hash <> v_room.owner_token_hash then
    raise exception using errcode = 'P0001', message = 'not_owner';
  end if;
  if v_room.status = 'dealt' then
    return jsonb_build_object('success', true, 'alreadyDealt', true);
  end if;

  select count(*) into v_player_count from public.two_rooms_identity_players where room_code = p_code;
  if v_player_count <> v_room.capacity then
    raise exception using errcode = 'P0001', message = 'room_not_full';
  end if;
  if coalesce(jsonb_typeof(p_assignments), '') <> 'array' then
    raise exception using errcode = 'P0001', message = 'invalid_deck';
  end if;
  if jsonb_array_length(p_assignments) <> v_room.capacity then
    raise exception using errcode = 'P0001', message = 'invalid_deck';
  end if;

  select count(*), count(distinct value->>'player_id'), count(distinct value->>'instance_id')
  into v_assignment_count, v_distinct_player_count, v_distinct_instance_count
  from jsonb_array_elements(p_assignments);
  if v_assignment_count <> v_room.capacity
     or v_distinct_player_count <> v_room.capacity
     or v_distinct_instance_count <> v_room.capacity then
    raise exception using errcode = 'P0001', message = 'invalid_deck';
  end if;

  select count(*) into v_valid_player_count
  from jsonb_array_elements(p_assignments) item
  join public.two_rooms_identity_players player
    on player.room_code = p_code
   and player.id = (item.value->>'player_id')::uuid;
  if v_valid_player_count <> v_room.capacity then
    raise exception using errcode = 'P0001', message = 'invalid_deck';
  end if;

  select array_agg(item.value->>'role_id' order by item.value->>'role_id')
  into v_assigned_roles
  from jsonb_array_elements(p_assignments) item;
  select array_agg(role_id order by role_id)
  into v_expected_roles
  from unnest(v_room.role_ids) deck(role_id);
  if v_assigned_roles is distinct from v_expected_roles then
    raise exception using errcode = 'P0001', message = 'invalid_deck';
  end if;

  insert into public.two_rooms_identity_assignments (room_code, player_id, role_id, instance_id)
  select p_code, (item.value->>'player_id')::uuid, item.value->>'role_id', (item.value->>'instance_id')::uuid
  from jsonb_array_elements(p_assignments) item;

  update public.two_rooms_identity_rooms set status = 'dealt', dealt_at = now() where room_code = p_code;
  return jsonb_build_object('success', true, 'alreadyDealt', false);
end
$function$;

revoke all on function public.two_rooms_identity_create_room(text, integer, text[], text, text) from public, anon, authenticated;
revoke all on function public.two_rooms_identity_join_room(text, text, text, text) from public, anon, authenticated;
revoke all on function public.two_rooms_identity_deal_room(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.two_rooms_identity_create_room(text, integer, text[], text, text) to service_role;
grant execute on function public.two_rooms_identity_join_room(text, text, text, text) to service_role;
grant execute on function public.two_rooms_identity_deal_room(text, text, jsonb) to service_role;

comment on table public.two_rooms_identity_rooms is 'Two Rooms identity web MVP rooms.';
comment on table public.two_rooms_identity_players is 'Two Rooms identity web MVP player sessions.';
comment on table public.two_rooms_identity_assignments is 'Two Rooms identity web MVP private role assignments.';

commit;
