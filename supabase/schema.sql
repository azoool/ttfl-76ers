-- TTFL 76ersFR : synchronisation d'équipe (Supabase / PostgreSQL).
--
-- À exécuter une fois dans Supabase → SQL Editor → New query → Run.
-- Le script peut être relancé sans danger (il ne supprime aucune donnée).
--
-- Modèle de confiance
--   * Chaque appareil se connecte anonymement (Supabase Auth → "Allow anonymous sign-ins").
--   * Une équipe est un groupe d'amis qui partagent un code d'invitation de 8 caractères.
--   * Tous les membres d'une équipe lisent et écrivent les picks de cette équipe ; personne d'autre.
--   * Seuls les picks PASSÉS (jusqu'au dernier deck joué) sont attendus : TTFL masque volontairement
--     les picks du soir et ceux préparés à l'avance, l'appli ne les demande pas.
--   * Un pseudo peut être ajouté par un coéquipier avant que son propriétaire ait installé l'appli ;
--     il le reprend ensuite en rejoignant l'équipe avec le même pseudo.

-- ───────────────────────────── Tables ─────────────────────────────

create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  -- 8 caractères sans I, O, 0, 1 (faciles à dicter)
  invite_code text not null unique check (invite_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  id         uuid primary key default gen_random_uuid(),
  team_id    uuid not null references public.teams (id) on delete cascade,
  -- appareil qui contrôle ce membre ; NULL tant que personne ne l'a réclamé
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (char_length(name) between 1 and 40),
  created_at timestamptz not null default now()
);
create unique index if not exists members_team_name_uidx on public.members (team_id, lower(name));
create unique index if not exists members_team_user_uidx on public.members (team_id, user_id) where user_id is not null;
create index if not exists members_user_idx on public.members (user_id);

create table if not exists public.picks (
  member_id  uuid not null references public.members (id) on delete cascade,
  date       date not null,
  player     text not null check (char_length(btrim(player)) between 1 and 80),
  score      integer,
  x2         boolean not null default false,
  source     text not null default 'import' check (source in ('import', 'releve', 'manual')),
  updated_at timestamptz not null default now(),
  primary key (member_id, date)
);

create or replace function public.touch_pick() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists picks_touch on public.picks;
create trigger picks_touch before update on public.picks
  for each row execute function public.touch_pick();

-- Code de synchronisation d'une équipe : un secret qui permet au script de relevé (qui tourne dans le navigateur
-- d'un membre, sur le site de TTFL) d'enregistrer des picks sans compte. On ne garde que son empreinte (sha256).
-- Aucune politique : personne ne lit cette table directement, seules les fonctions ci-dessous y accèdent.
create table if not exists public.sync_tokens (
  team_id      uuid primary key references public.teams (id) on delete cascade,
  token_hash   text not null,
  created_at   timestamptz not null default now(),
  last_sync_at timestamptz
);
alter table public.sync_tokens enable row level security;
revoke all on public.sync_tokens from anon, authenticated;

-- ───────────────────── Fonctions utilitaires (droits élevés) ─────────────────────
-- security definer : lisent `members` sans passer par ses propres règles de sécurité,
-- ce qui évite une récursion dans les politiques ci-dessous.

create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members m where m.team_id = p_team and m.user_id = auth.uid()
  );
$$;

create or replace function public.member_team(p_member uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select m.team_id from public.members m where m.id = p_member;
$$;

-- Code d'invitation tiré de l'aléa cryptographique de gen_random_uuid().
-- 256 est un multiple de 32 : aucun biais de tirage avec `% 32`.
create or replace function public.gen_invite_code() returns text
language plpgsql volatile set search_path = public as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_a bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_b bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  v_code text := '';
  i int;
begin
  -- octets 0 à 3 : les octets 6 et 8 d'un UUID v4 contiennent des bits fixes
  for i in 0..3 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_a, i) % 32) + 1, 1);
    v_code := v_code || substr(v_alphabet, (get_byte(v_b, i) % 32) + 1, 1);
  end loop;
  return v_code;
end $$;

-- ───────────────────────── Sécurité au niveau des lignes ─────────────────────────

alter table public.teams   enable row level security;
alter table public.members enable row level security;
alter table public.picks   enable row level security;

-- Droits de base : rien pour `anon` (visiteur non connecté) ; lecture pour les connectés.
-- Les écritures sur teams/members passent uniquement par les fonctions ci-dessous.
revoke all on public.teams, public.members, public.picks from anon, authenticated;
grant select on public.teams, public.members to authenticated;
grant select, insert, update, delete on public.picks to authenticated;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select to authenticated
  using (public.is_team_member(id));

drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (public.is_team_member(team_id));

drop policy if exists picks_select on public.picks;
create policy picks_select on public.picks for select to authenticated
  using (public.is_team_member(public.member_team(member_id)));

drop policy if exists picks_insert on public.picks;
create policy picks_insert on public.picks for insert to authenticated
  with check (public.is_team_member(public.member_team(member_id)));

drop policy if exists picks_update on public.picks;
create policy picks_update on public.picks for update to authenticated
  using (public.is_team_member(public.member_team(member_id)))
  with check (public.is_team_member(public.member_team(member_id)));

drop policy if exists picks_delete on public.picks;
create policy picks_delete on public.picks for delete to authenticated
  using (public.is_team_member(public.member_team(member_id)));

-- ───────────────────────── Fonctions appelées par l'appli ─────────────────────────

create or replace function public.create_team(p_team_name text, p_my_name text)
returns table (out_team_id uuid, out_invite_code text, out_member_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_code   text;
  v_team   uuid;
  v_member uuid;
  v_try    int := 0;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  p_team_name := btrim(coalesce(p_team_name, ''));
  p_my_name   := btrim(coalesce(p_my_name, ''));
  if char_length(p_team_name) not between 1 and 60 then
    raise exception 'Nom d''équipe invalide (1 à 60 caractères)' using errcode = '22023';
  end if;
  if char_length(p_my_name) not between 1 and 40 then
    raise exception 'Pseudo invalide (1 à 40 caractères)' using errcode = '22023';
  end if;
  if (select count(*) from public.teams t where t.created_by = v_uid) >= 5 then
    raise exception 'Trop d''équipes créées depuis cet appareil' using errcode = '53400';
  end if;

  loop
    v_code := public.gen_invite_code();
    exit when not exists (select 1 from public.teams t where t.invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'Impossible de générer un code d''invitation' using errcode = '55000';
    end if;
  end loop;

  insert into public.teams (name, invite_code, created_by)
  values (p_team_name, v_code, v_uid) returning id into v_team;
  insert into public.members (team_id, user_id, name)
  values (v_team, v_uid, p_my_name) returning id into v_member;

  return query select v_team, v_code, v_member;
end $$;

create or replace function public.join_team(p_code text, p_my_name text)
returns table (out_team_id uuid, out_team_name text, out_invite_code text, out_member_id uuid)
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_team   public.teams%rowtype;
  v_member public.members%rowtype;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  p_my_name := btrim(coalesce(p_my_name, ''));
  if char_length(p_my_name) not between 1 and 40 then
    raise exception 'Pseudo invalide (1 à 40 caractères)' using errcode = '22023';
  end if;

  select * into v_team from public.teams t where t.invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'Code d''invitation inconnu' using errcode = 'P0002';
  end if;

  -- déjà membre depuis cet appareil : on renvoie simplement son membre
  select * into v_member from public.members m where m.team_id = v_team.id and m.user_id = v_uid;
  if not found then
    -- pseudo déjà présent (ajouté par un coéquipier, ou ancien appareil) : on le reprend
    select * into v_member from public.members m
      where m.team_id = v_team.id and lower(m.name) = lower(p_my_name) for update;
    if found then
      update public.members set user_id = v_uid where id = v_member.id returning * into v_member;
    else
      if (select count(*) from public.members m where m.team_id = v_team.id) >= 12 then
        raise exception 'Équipe complète (12 membres maximum)' using errcode = '53400';
      end if;
      insert into public.members (team_id, user_id, name)
      values (v_team.id, v_uid, p_my_name) returning * into v_member;
    end if;
  end if;

  return query select v_team.id, v_team.name, v_team.invite_code, v_member.id;
end $$;

-- Aperçu d'une équipe à partir de son code d'invitation, avant de la rejoindre : son nom et ses membres
-- (pseudos et « déjà lié à un appareil ou non », jamais de picks), pour que le nouvel arrivant choisisse qui il est.
-- Qui connaît le code peut de toute façon rejoindre l'équipe et tout voir : l'aperçu n'ouvre aucun accès de plus.
create or replace function public.preview_team(p_code text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_team public.teams%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  select * into v_team from public.teams t where t.invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then
    raise exception 'Code d''invitation inconnu' using errcode = 'P0002';
  end if;
  return jsonb_build_object(
    'team_name', v_team.name,
    'members', coalesce(
      (select jsonb_agg(jsonb_build_object('name', m.name, 'claimed', m.user_id is not null) order by lower(m.name))
         from public.members m where m.team_id = v_team.id),
      '[]'::jsonb)
  );
end $$;

-- Ajoute (ou retrouve) un membre pas encore inscrit : sert à enregistrer l'historique d'un coéquipier.
create or replace function public.add_member(p_team uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_member uuid;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  p_name := btrim(coalesce(p_name, ''));
  if char_length(p_name) not between 1 and 40 then
    raise exception 'Pseudo invalide (1 à 40 caractères)' using errcode = '22023';
  end if;

  select m.id into v_member from public.members m
    where m.team_id = p_team and lower(m.name) = lower(p_name);
  if found then
    return v_member;
  end if;
  if (select count(*) from public.members m where m.team_id = p_team) >= 12 then
    raise exception 'Équipe complète (12 membres maximum)' using errcode = '53400';
  end if;
  insert into public.members (team_id, name) values (p_team, p_name) returning id into v_member;
  return v_member;
end $$;

-- Quitte l'équipe. Par défaut les picks déjà partagés restent (le membre devient « non réclamé »).
create or replace function public.leave_team(p_team uuid, p_delete boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '28000';
  end if;
  if p_delete then
    delete from public.members m where m.team_id = p_team and m.user_id = v_uid; -- supprime aussi ses picks
  else
    update public.members m set user_id = null where m.team_id = p_team and m.user_id = v_uid;
  end if;
end $$;

-- Change le code d'invitation (à faire si le lien a été diffusé trop largement).
create or replace function public.rotate_invite_code(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_try  int := 0;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  loop
    v_code := public.gen_invite_code();
    exit when not exists (select 1 from public.teams t where t.invite_code = v_code);
    v_try := v_try + 1;
    if v_try > 20 then
      raise exception 'Impossible de générer un code d''invitation' using errcode = '55000';
    end if;
  end loop;
  update public.teams set invite_code = v_code where id = p_team;
  return v_code;
end $$;

-- Crée (ou remplace) le code de synchronisation de l'équipe. Renvoyé une seule fois : seule son empreinte est gardée.
-- 24 caractères tirés comme le code d'invitation (3 × 40 bits d'aléa cryptographique).
create or replace function public.create_sync_token(p_team uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_a text := public.gen_invite_code();
  v_b text := public.gen_invite_code();
  v_c text := public.gen_invite_code();
begin
  if not public.is_team_member(p_team) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  insert into public.sync_tokens (team_id, token_hash)
  values (p_team, encode(sha256(convert_to(v_a || v_b || v_c, 'UTF8')), 'hex'))
  on conflict (team_id) do update
    set token_hash = excluded.token_hash, created_at = now(), last_sync_at = null;
  return v_a || '-' || v_b || '-' || v_c;
end $$;

-- État de la synchronisation automatique, pour les membres de l'équipe.
create or replace function public.sync_status(p_team uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v public.sync_tokens%rowtype;
begin
  if not public.is_team_member(p_team) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  select * into v from public.sync_tokens t where t.team_id = p_team;
  if not found then
    return jsonb_build_object('enabled', false);
  end if;
  return jsonb_build_object('enabled', true, 'created_at', v.created_at, 'last_sync_at', v.last_sync_at);
end $$;

-- Enregistre les picks relevés sur TTFL. Appelée sans compte, avec le code de synchronisation de l'équipe :
--   p_members = [ { "name": "pseudo TTFL", "picks": [ { "date": "2026-11-18", "player": "…", "score": 46, "x2": false } ] } ]
-- Un pseudo inconnu crée le membre (12 maximum) ; un pick passé est ajouté ou corrigé ; les picks à venir sont refusés
-- (TTFL les cache) ; une ligne illisible est ignorée sans faire échouer le reste. Les picks inchangés ne sont pas réécrits.
create or replace function public.sync_team_picks(p_token text, p_members jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_team    uuid;
  v_hash    text := encode(sha256(convert_to(upper(regexp_replace(coalesce(p_token, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex');
  v_today   date := (now() at time zone 'Europe/Paris')::date;
  v_item    jsonb;
  v_pick    jsonb;
  v_name    text;
  v_member  uuid;
  v_rows    int;
  n_members int := 0;
  n_picks   int := 0;
  n_created int := 0;
  n_skipped int := 0;
begin
  select t.team_id into v_team from public.sync_tokens t where t.token_hash = v_hash;
  if v_team is null then
    raise exception 'Code de synchronisation invalide' using errcode = '28000';
  end if;
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) > 12 then
    raise exception 'Données invalides' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_members) loop
    v_name := btrim(coalesce(v_item ->> 'name', ''));
    if char_length(v_name) not between 1 and 40
       or jsonb_typeof(v_item -> 'picks') is distinct from 'array'
       or jsonb_array_length(v_item -> 'picks') > 400 then
      n_skipped := n_skipped + 1;
      continue;
    end if;

    select m.id into v_member from public.members m where m.team_id = v_team and lower(m.name) = lower(v_name);
    if v_member is null then
      if (select count(*) from public.members m where m.team_id = v_team) >= 12 then
        n_skipped := n_skipped + 1;
        continue;
      end if;
      insert into public.members (team_id, name) values (v_team, v_name) returning id into v_member;
      n_created := n_created + 1;
    end if;
    n_members := n_members + 1;

    for v_pick in select * from jsonb_array_elements(v_item -> 'picks') loop
      begin
        if (v_pick ->> 'date')::date > v_today or (v_pick ->> 'date')::date < v_today - 400 then
          continue;
        end if;
        insert into public.picks (member_id, date, player, score, x2, source)
        values (
          v_member,
          (v_pick ->> 'date')::date,
          btrim(v_pick ->> 'player'),
          nullif(v_pick ->> 'score', '')::int,
          coalesce((v_pick ->> 'x2')::boolean, false),
          'releve'
        )
        on conflict (member_id, date) do update
          set player = excluded.player, score = excluded.score, x2 = excluded.x2, source = 'releve'
          where (public.picks.player, public.picks.score, public.picks.x2)
                is distinct from (excluded.player, excluded.score, excluded.x2);
        get diagnostics v_rows = row_count;
        n_picks := n_picks + v_rows;
      exception when others then
        null; -- ligne illisible (date, nombre ou joueur invalide) : ignorée
      end;
    end loop;
  end loop;

  update public.sync_tokens set last_sync_at = now() where team_id = v_team;
  return jsonb_build_object('members', n_members, 'picks', n_picks, 'created', n_created, 'skipped', n_skipped);
end $$;

-- ───────────────────────────── Droits d'exécution ─────────────────────────────
-- Par défaut PostgreSQL autorise tout le monde à exécuter une fonction : on referme, puis on rouvre
-- uniquement aux comptes connectés (les connexions anonymes de Supabase ont le rôle `authenticated`).

revoke all on function public.gen_invite_code()                    from public, anon, authenticated;
revoke all on function public.is_team_member(uuid)                 from public, anon;
revoke all on function public.member_team(uuid)                    from public, anon;
revoke all on function public.create_team(text, text)              from public, anon;
revoke all on function public.join_team(text, text)                from public, anon;
revoke all on function public.preview_team(text)                   from public, anon;
revoke all on function public.add_member(uuid, text)               from public, anon;
revoke all on function public.leave_team(uuid, boolean)            from public, anon;
revoke all on function public.rotate_invite_code(uuid)             from public, anon;
revoke all on function public.create_sync_token(uuid)              from public, anon;
revoke all on function public.sync_status(uuid)                    from public, anon;
-- sync_team_picks est appelée sans compte (script de relevé) : le code de synchronisation fait office de clé.
revoke all on function public.sync_team_picks(text, jsonb)         from public;

grant execute on function public.is_team_member(uuid)              to authenticated;
grant execute on function public.member_team(uuid)                 to authenticated;
grant execute on function public.create_team(text, text)           to authenticated;
grant execute on function public.join_team(text, text)             to authenticated;
grant execute on function public.preview_team(text)                to authenticated;
grant execute on function public.add_member(uuid, text)            to authenticated;
grant execute on function public.leave_team(uuid, boolean)         to authenticated;
grant execute on function public.rotate_invite_code(uuid)          to authenticated;
grant execute on function public.create_sync_token(uuid)           to authenticated;
grant execute on function public.sync_status(uuid)                 to authenticated;
grant execute on function public.sync_team_picks(text, jsonb)      to anon, authenticated;
