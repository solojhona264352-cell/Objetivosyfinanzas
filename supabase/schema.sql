-- ============================================================
--  BITÁCORA — Esquema para Supabase
--  Copiá y pegá TODO esto en: Supabase → SQL Editor → New query → Run
-- ============================================================

-- 1) Tabla principal ------------------------------------------------------
-- Guardamos el estado completo de la app (perfiles + datos personales +
-- datos compartidos de la casa) como un documento JSON por "workspace".
-- Un workspace = una casa. Todos los que usen el mismo id ven lo mismo.

create table if not exists public.bitacora_state (
  id          text primary key,
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- 2) Actualizar updated_at solo -------------------------------------------
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

-- 3) Tiempo real -----------------------------------------------------------
-- Hace falta para que los cambios lleguen solos al otro dispositivo.
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

-- 4) Seguridad (RLS) -------------------------------------------------------
alter table public.bitacora_state enable row level security;

-- OPCIÓN A (la que queda activa): app privada entre ustedes, sin login.
-- Cualquiera que tenga la URL y la anon key puede leer y escribir.
-- Es simple y alcanza para un uso familiar, PERO no publiques la URL.
drop policy if exists "acceso abierto con anon key" on public.bitacora_state;
create policy "acceso abierto con anon key"
  on public.bitacora_state
  for all
  using (true)
  with check (true);

-- OPCIÓN B (recomendada si querés más seguridad): exigir usuario logueado.
-- Para usarla: borrá la policy de arriba, descomentá estas dos líneas y
-- activá el login por email en Supabase → Authentication.
--
-- drop policy if exists "acceso abierto con anon key" on public.bitacora_state;
-- create policy "solo usuarios logueados"
--   on public.bitacora_state for all
--   using (auth.role() = 'authenticated')
--   with check (auth.role() = 'authenticated');

-- 5) Fila inicial ----------------------------------------------------------
-- Cambiá 'casa' si usaste otro VITE_WORKSPACE_ID en el .env
insert into public.bitacora_state (id, data)
values ('casa', '{}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
--  Listo. Ahora andá a Project Settings → API y copiá:
--    Project URL  -> VITE_SUPABASE_URL
--    anon public  -> VITE_SUPABASE_ANON_KEY
-- ============================================================
