-- ============================================================
--  BITÁCORA — Esquema con cuentas y login
--
--  Copiá y pegá TODO esto en: Supabase → SQL Editor → New query → Run
--  Se puede correr aunque ya hayas ejecutado el schema anterior:
--  no borra los datos que ya tenías.
-- ============================================================

-- 1) Hogares --------------------------------------------------------------
-- Un "hogar" agrupa a las personas que comparten datos (vos y tu pareja).
-- Cada hogar tiene un código de invitación para sumar gente.

create table if not exists public.households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null default 'Mi casa',
  invite_code  text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- 2) Miembros de cada hogar -----------------------------------------------
create table if not exists public.household_members (
  household_id uuid references public.households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members(user_id);

-- 3) Los datos de la app ---------------------------------------------------
-- Una fila por hogar. Todo el estado (perfiles, metas, hábitos, finanzas)
-- vive acá como un documento JSON.

create table if not exists public.bitacora_state (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- 4) Actualizar updated_at solo -------------------------------------------
create or replace function public.bitacora_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bitacora_state_touch on public.bitacora_state;
create trigger bitacora_state_touch
  before update on public.bitacora_state
  for each row execute function public.bitacora_touch_updated_at();

-- 5) ¿A qué hogares pertenece el usuario actual? ---------------------------
-- Función auxiliar. El "security definer" evita que las políticas se
-- llamen a sí mismas en círculo (un error clásico de RLS con tablas de
-- membresía, que rompe todo con "infinite recursion detected").

create or replace function public.my_household_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select household_id
  from public.household_members
  where user_id = auth.uid();
$$;

-- 6) Seguridad: cada uno ve SOLO lo de su hogar ---------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.bitacora_state    enable row level security;

-- Hogares
drop policy if exists "ver mis hogares" on public.households;
create policy "ver mis hogares" on public.households
  for select using (id in (select public.my_household_ids()));

drop policy if exists "crear hogar" on public.households;
create policy "crear hogar" on public.households
  for insert with check (auth.uid() = created_by);

drop policy if exists "editar mi hogar" on public.households;
create policy "editar mi hogar" on public.households
  for update using (id in (select public.my_household_ids()));

-- Miembros
drop policy if exists "ver miembros de mis hogares" on public.household_members;
create policy "ver miembros de mis hogares" on public.household_members
  for select using (household_id in (select public.my_household_ids()));

drop policy if exists "sumarme a un hogar" on public.household_members;
create policy "sumarme a un hogar" on public.household_members
  for insert with check (auth.uid() = user_id);

drop policy if exists "salirme de un hogar" on public.household_members;
create policy "salirme de un hogar" on public.household_members
  for delete using (auth.uid() = user_id);

-- Datos: solo los de los hogares a los que pertenezco.
-- OJO: acá se elimina la política vieja que dejaba entrar a cualquiera.
drop policy if exists "acceso abierto con anon key" on public.bitacora_state;

drop policy if exists "ver datos de mi hogar" on public.bitacora_state;
create policy "ver datos de mi hogar" on public.bitacora_state
  for select using (id in (select public.my_household_ids()::text));

drop policy if exists "crear datos de mi hogar" on public.bitacora_state;
create policy "crear datos de mi hogar" on public.bitacora_state
  for insert with check (id in (select public.my_household_ids()::text));

drop policy if exists "editar datos de mi hogar" on public.bitacora_state;
create policy "editar datos de mi hogar" on public.bitacora_state
  for update using (id in (select public.my_household_ids()::text));

-- 7) Sumarse a un hogar con el código de invitación ------------------------
-- Tiene que ser una función porque, por seguridad, un usuario NO puede
-- leer la tabla de hogares a los que todavía no pertenece.

create or replace function public.join_household(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  select id into target
  from public.households
  where upper(invite_code) = upper(trim(code));

  if target is null then
    raise exception 'Ese código no existe. Revisalo y probá de nuevo.';
  end if;

  insert into public.household_members (household_id, user_id)
  values (target, auth.uid())
  on conflict do nothing;

  return target;
end;
$$;

-- 8) Crear el hogar propio la primera vez ---------------------------------
create or replace function public.create_my_household(household_name text default 'Mi casa')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Tenés que iniciar sesión.';
  end if;

  insert into public.households (name, created_by)
  values (coalesce(nullif(trim(household_name), ''), 'Mi casa'), auth.uid())
  returning id into new_id;

  insert into public.household_members (household_id, user_id)
  values (new_id, auth.uid());

  insert into public.bitacora_state (id, data)
  values (new_id::text, '{}'::jsonb)
  on conflict (id) do nothing;

  return new_id;
end;
$$;

-- 9) Tiempo real -----------------------------------------------------------
alter table public.bitacora_state replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'bitacora_state'
  ) then
    alter publication supabase_realtime add table public.bitacora_state;
  end if;
end $$;

-- ============================================================
--  LISTO.
--
--  Falta un paso en el panel: Authentication → Sign In / Providers,
--  verificá que "Email" esté habilitado. Si querés entrar sin tener
--  que confirmar el mail, desactivá ahí "Confirm email".
--
--  ¿Tenías datos cargados de antes (en el hogar 'casa')?
--  Registrate en la app, y en Cuenta → Datos del hogar copiá el ID.
--  Después corré esto UNA sola vez, reemplazando PEGA-TU-ID-ACA:
--
--    update public.bitacora_state
--    set data = (select data from public.bitacora_state where id = 'casa')
--    where id = 'PEGA-TU-ID-ACA';
--
-- ============================================================
