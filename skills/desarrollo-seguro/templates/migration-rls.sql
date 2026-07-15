-- GOLDEN PATH — Migración con RLS (Supabase / Postgres).
--
-- Nombre de archivo: supabase/migrations/YYYYMMDDhhmmss_descripcion.sql
-- Header obligatorio: explicar POR QUÉ existe la tabla, no solo qué contiene.
--
-- Política (INV-5): toda tabla nace con RLS activa + policies EN ESTA MISMA
-- migración. Una tabla sin RLS queda legible vía PostgREST con la anon key
-- pública — "las policies después" es una fuga hasta que alguien se acuerde.
--
-- Adaptar: nombre de tabla, columnas de negocio y el lookup de tenant.

-- ── Tabla ────────────────────────────────────────────────────────────────────
create table if not exists public.mi_tabla (
  id uuid primary key default gen_random_uuid(),
  -- Multi-tenant: toda tabla de negocio lleva su columna de tenant. Sin ella no
  -- hay filtro de scope posible (INV-4) ni policy por tenant (INV-5).
  org_id uuid not null,
  -- columnas de negocio...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índice para el filtro de tenant (toda query filtra por org_id).
create index if not exists mi_tabla_org_id_idx on public.mi_tabla (org_id);

-- ── RLS: obligatoria, misma migración ────────────────────────────────────────
alter table public.mi_tabla enable row level security;

-- Deny-by-default: con RLS activa y sin policies, nadie lee ni escribe vía
-- PostgREST (la anon key rebota). Abrir SOLO lo que se necesite:
--
--   · Arquitectura prescrita (acceso únicamente vía Edge Functions con
--     service_role, que bypassa RLS): NO crear policies para anon ni para
--     authenticated. Deny-by-default es el estado correcto — dejar este
--     comentario como constancia de que es intencional.
--
--   · Si el proyecto SÍ permite lectura directa authenticated→BD (decisión
--     documentada), usar el patrón de tenant:

-- create policy "mi_tabla_select_tenant"
--   on public.mi_tabla for select
--   to authenticated
--   using (
--     org_id = (select org_id from public.user_profiles where user_id = auth.uid())
--   );

-- Escrituras (insert/update/delete): por defecto NO se crean policies — las
-- escrituras van por Edge Function con autorización explícita. Crear policies
-- de escritura solo con justificación documentada en esta migración.

-- ── Recordatorio post-migración ──────────────────────────────────────────────
-- Tras cambios de schema/policies: NOTIFY pgrst, 'reload schema';
