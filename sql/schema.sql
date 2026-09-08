-- ============================================================================
-- Tablero de Mando y Control de la Plana Mayor — esquema de base de datos
-- ============================================================================
-- Cómo usar este archivo:
--   1. Entra a tu proyecto en https://supabase.com → "SQL Editor" → "New query".
--   2. Pega TODO este archivo y presiona "Run". Se puede volver a ejecutar sin
--      problema (usa IF NOT EXISTS / OR REPLACE en casi todo).
--   3. Después de correrlo, crea las cuentas de la Plana Mayor en
--      "Authentication → Users" y su fila en `perfiles` (ver LEEME.md).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- PERFILES: quién es cada usuario y qué rol tiene.
-- No hay política de INSERT/UPDATE para el cliente a propósito: las cuentas y
-- roles los crea el 2do Comandante desde el panel de Supabase, no la app.
-- ---------------------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  grado text,
  rol text not null check (rol in ('comandante', 'segundo_comandante', 'jefe_plana_mayor', 'jefe_campo', 'staff')),
  campo text, -- solo aplica si rol = 'jefe_campo' (ej. 'P-1', 'P-2'...)
  creado timestamptz not null default now()
);
alter table public.perfiles enable row level security;
drop policy if exists "perfiles_select" on public.perfiles;
create policy "perfiles_select" on public.perfiles for select to authenticated using (true);

-- Funciones de apoyo: leen el rol/campo del usuario que hace la petición.
create or replace function public.rol_actual() returns text
language sql stable as $$ select rol from public.perfiles where id = auth.uid() $$;

create or replace function public.campo_actual() returns text
language sql stable as $$ select campo from public.perfiles where id = auth.uid() $$;

create or replace function public.es_mando() returns boolean
language sql stable as $$ select public.rol_actual() in ('comandante', 'segundo_comandante', 'jefe_plana_mayor') $$;

-- ---------------------------------------------------------------------------
-- AJUSTES: configuración compartida por módulo (una fila por módulo), en vez
-- de repetir una tabla de config por cada uno. Ej.: clave='documentacion',
-- valor={"campos":["P-1","P-2","P-3","P-4","P-5"],"diasAlerta":3}.
-- ---------------------------------------------------------------------------
create table if not exists public.ajustes (
  clave text primary key,
  valor jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);
alter table public.ajustes enable row level security;
drop policy if exists "ajustes_select" on public.ajustes;
create policy "ajustes_select" on public.ajustes for select to authenticated using (true);
drop policy if exists "ajustes_write" on public.ajustes;
create policy "ajustes_write" on public.ajustes for all to authenticated using (public.es_mando()) with check (public.es_mando());

insert into public.ajustes (clave, valor) values
  ('documentacion', '{"campos":["P-1","P-2","P-3","P-4","P-5"],"diasAlerta":3}'),
  ('partes', '{"unidad":"","comandante":"","membreteTropa":["","",""],
    "cuadros":{"columnas":["Efectivo","Presentes","Servicio","Comisión","Permiso","Sanidad","Arresto","Otros"],
               "filas":["Tte. Coronel","Mayor","Capitán","Teniente","Subteniente","Suboficiales","Sargentos","EE.CC."]},
    "tropa":{"columnas":["Comp. \"A\"","Comp. \"B\"","Comp. \"C\"","Comp. \"D\"","Comp. \"E\""],
             "filas":["Efectivo","Guardia Cuartel","Servicio Interno","Comisión","Francos","Bajas","No Forman","Forman"]}}'),
  ('radiograma', '{"plantillas":[],"telefono":"","lugar":"La Paz","membrete":"COMANDO GENERAL DEL EJÉRCITO","unidad":""}')
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- DOCUMENTOS: Seguimiento de Documentación (P-1…P-5).
-- Un jefe_campo solo puede crear/editar/borrar documentos de SU campo; el
-- mando (comandante/2do comandante/jefe de plana mayor) puede con cualquiera.
-- Todos pueden leer todo.
-- ---------------------------------------------------------------------------
create table if not exists public.documentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrante', 'saliente')),
  campo text not null,
  referencia text,
  fecha date,
  contraparte text,
  asunto text,
  plazo date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'tramite', 'cumplido')),
  proveido text,
  observaciones text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.documentos enable row level security;
drop policy if exists "documentos_select" on public.documentos;
create policy "documentos_select" on public.documentos for select to authenticated using (true);
drop policy if exists "documentos_insert" on public.documentos;
create policy "documentos_insert" on public.documentos for insert to authenticated
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and campo = public.campo_actual()));
drop policy if exists "documentos_update" on public.documentos;
create policy "documentos_update" on public.documentos for update to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and campo = public.campo_actual()))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and campo = public.campo_actual()));
drop policy if exists "documentos_delete" on public.documentos;
create policy "documentos_delete" on public.documentos for delete to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and campo = public.campo_actual()));

-- ---------------------------------------------------------------------------
-- PARTES: Partes Diarios (Cuadros / Tropa). Escritura reservada al mando en
-- esta primera fase; toda la Plana Mayor los ve en tiempo real.
-- ---------------------------------------------------------------------------
create table if not exists public.partes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cuadros', 'tropa')),
  fecha date not null,
  unidad text,
  comandante text,
  columnas jsonb not null default '[]'::jsonb,
  filas jsonb not null default '[]'::jsonb,
  observaciones text,
  parte_al text,
  lugar_fecha text,
  firmas jsonb,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.partes enable row level security;
drop policy if exists "partes_select" on public.partes;
create policy "partes_select" on public.partes for select to authenticated using (true);
drop policy if exists "partes_write" on public.partes;
create policy "partes_write" on public.partes for all to authenticated using (public.es_mando()) with check (public.es_mando());

-- ---------------------------------------------------------------------------
-- RADIOGRAMAS: historial de radiogramas guardados. Escritura reservada al
-- mando; toda la Plana Mayor los ve.
-- ---------------------------------------------------------------------------
create table if not exists public.radiogramas (
  id uuid primary key default gen_random_uuid(),
  membrete text,
  codigo text,
  unidad text,
  contenido jsonb not null default '{}'::jsonb,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.radiogramas enable row level security;
drop policy if exists "radiogramas_select" on public.radiogramas;
create policy "radiogramas_select" on public.radiogramas for select to authenticated using (true);
drop policy if exists "radiogramas_write" on public.radiogramas;
create policy "radiogramas_write" on public.radiogramas for all to authenticated using (public.es_mando()) with check (public.es_mando());

-- ---------------------------------------------------------------------------
-- CALENDARIO_ITEMS: agenda compartida. Escritura reservada al mando.
-- ---------------------------------------------------------------------------
create table if not exists public.calendario_items (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  hora time,
  titulo text not null,
  tipo text not null default 'actividad' check (tipo in ('actividad', 'pendiente')),
  completado boolean not null default false,
  descripcion text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.calendario_items enable row level security;
drop policy if exists "calendario_select" on public.calendario_items;
create policy "calendario_select" on public.calendario_items for select to authenticated using (true);
drop policy if exists "calendario_write" on public.calendario_items;
create policy "calendario_write" on public.calendario_items for all to authenticated using (public.es_mando()) with check (public.es_mando());

-- ---------------------------------------------------------------------------
-- TABLON_MENSAJES: Sala de Coordinación. Cualquiera publica un "mensaje";
-- solo el mando puede publicar/fijar una "disposicion" (aviso destacado).
-- ---------------------------------------------------------------------------
create table if not exists public.tablon_mensajes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'mensaje' check (tipo in ('mensaje', 'disposicion')),
  titulo text,
  contenido text not null,
  adjunto_url text,
  fijado boolean not null default false,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.tablon_mensajes enable row level security;
drop policy if exists "tablon_select" on public.tablon_mensajes;
create policy "tablon_select" on public.tablon_mensajes for select to authenticated using (true);
drop policy if exists "tablon_insert" on public.tablon_mensajes;
create policy "tablon_insert" on public.tablon_mensajes for insert to authenticated
  with check (public.es_mando() or (tipo = 'mensaje' and fijado = false));
drop policy if exists "tablon_update" on public.tablon_mensajes;
create policy "tablon_update" on public.tablon_mensajes for update to authenticated
  using (public.es_mando() or creado_por = auth.uid())
  with check (public.es_mando() or (creado_por = auth.uid() and tipo = 'mensaje' and fijado = false));
drop policy if exists "tablon_delete" on public.tablon_mensajes;
create policy "tablon_delete" on public.tablon_mensajes for delete to authenticated
  using (public.es_mando() or creado_por = auth.uid());

-- ---------------------------------------------------------------------------
-- MEMORANDUMS: felicitaciones y sanciones. Solo el mando emite/anula; toda la
-- Plana Mayor puede verlos (transparencia dentro de la unidad).
-- ---------------------------------------------------------------------------
create table if not exists public.memorandums (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('felicitacion', 'sancion')),
  destinatario_nombre text not null,
  destinatario_campo text,
  motivo text not null,
  detalle text,
  estado text not null default 'borrador' check (estado in ('borrador', 'emitido', 'anulado')),
  emitido_por uuid references public.perfiles (id),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.memorandums enable row level security;
drop policy if exists "memorandums_select" on public.memorandums;
create policy "memorandums_select" on public.memorandums for select to authenticated using (true);
drop policy if exists "memorandums_write" on public.memorandums;
create policy "memorandums_write" on public.memorandums for all to authenticated using (public.es_mando()) with check (public.es_mando());

-- ---------------------------------------------------------------------------
-- SECCIONES: portales de navegación (Comando, P-1...P-5, y las que agregue el
-- mando después desde "Gestionar Secciones"). Le da a la unidad su propia
-- estructura en vez de una lista fija de módulos.
-- ---------------------------------------------------------------------------
create table if not exists public.secciones (
  id uuid primary key default gen_random_uuid(),
  clave text unique not null,
  nombre text not null,
  icono text,
  descripcion text,
  orden int not null default 0,
  creado timestamptz not null default now()
);
alter table public.secciones enable row level security;
drop policy if exists "secciones_select" on public.secciones;
create policy "secciones_select" on public.secciones for select to authenticated using (true);
drop policy if exists "secciones_write" on public.secciones;
create policy "secciones_write" on public.secciones for all to authenticated using (public.es_mando()) with check (public.es_mando());

insert into public.secciones (clave, nombre, icono, descripcion, orden) values
  ('comando', 'Comando y Plana Mayor', '🎖️', 'Coordinación, partes, radiogramas y calendario de toda la unidad.', 0),
  ('P-1', 'P-1 Personal', '🧑‍🤝‍🧑', 'Efectivos, hojas de vida, vacaciones, permisos y memorandums.', 1),
  ('P-2', 'P-2 Inteligencia', '🔎', 'Reportes de inteligencia y novedades.', 2),
  ('P-3', 'P-3 Operaciones', '🗺️', 'Partes diarios, calendario de actividades y documentación operativa.', 3),
  ('P-4', 'P-4 Logística', '🚚', 'Control de inventario, armamento, vehículos y suministros.', 4),
  ('P-5', 'P-5 Acción Cívica', '🤝', 'Actividades cívico-militares y relación con la comunidad.', 5),
  ('inspectoria', 'Inspectoría', '🛡️', 'Documentación y seguimiento de inspección.', 6),
  ('ayudantia', 'Ayudantía y Otros', '🗂️', 'Radiogramas, correspondencia y otras tareas de ayudantía.', 7)
on conflict (clave) do nothing;

insert into public.ajustes (clave, valor) values ('personal', '{"derechoAnual":20}') on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- PERSONAL: registro de efectivos / hoja de vida (P-1).
-- ---------------------------------------------------------------------------
create table if not exists public.personal (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  grado text,
  arma_especialidad text,
  ci text,
  fecha_nacimiento date,
  fecha_alta date,
  situacion text not null default 'activo' check (situacion in ('activo', 'baja', 'comision', 'otro')),
  telefono text,
  direccion text,
  notas text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.personal enable row level security;
drop policy if exists "personal_select" on public.personal;
create policy "personal_select" on public.personal for select to authenticated using (true);
drop policy if exists "personal_write" on public.personal;
create policy "personal_write" on public.personal for all to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'));

-- ---------------------------------------------------------------------------
-- VACACIONES_MOVIMIENTOS: saldo y movimientos de vacaciones/permisos/compensaciones (P-1).
-- ---------------------------------------------------------------------------
create table if not exists public.vacaciones_movimientos (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal (id) on delete cascade,
  tipo text not null check (tipo in ('vacacion', 'permiso', 'compensacion')),
  dias numeric not null default 0,
  fecha_inicio date,
  fecha_fin date,
  motivo text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.vacaciones_movimientos enable row level security;
drop policy if exists "vacaciones_select" on public.vacaciones_movimientos;
create policy "vacaciones_select" on public.vacaciones_movimientos for select to authenticated using (true);
drop policy if exists "vacaciones_write" on public.vacaciones_movimientos;
create policy "vacaciones_write" on public.vacaciones_movimientos for all to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'));

-- ---------------------------------------------------------------------------
-- FALTAS_MEDICAS: falta a lista y bajas médicas (P-1).
-- ---------------------------------------------------------------------------
create table if not exists public.faltas_medicas (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal (id) on delete cascade,
  tipo text not null check (tipo in ('falta', 'baja_medica')),
  fecha_inicio date not null,
  fecha_fin date,
  motivo text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.faltas_medicas enable row level security;
drop policy if exists "faltas_select" on public.faltas_medicas;
create policy "faltas_select" on public.faltas_medicas for select to authenticated using (true);
drop policy if exists "faltas_write" on public.faltas_medicas;
create policy "faltas_write" on public.faltas_medicas for all to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'));

-- ---------------------------------------------------------------------------
-- REPORTES_INTELIGENCIA (P-2).
-- ---------------------------------------------------------------------------
create table if not exists public.reportes_inteligencia (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  fuente text,
  asunto text not null,
  clasificacion text not null default 'rutinario' check (clasificacion in ('rutinario', 'importante', 'urgente')),
  contenido text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.reportes_inteligencia enable row level security;
drop policy if exists "intel_select" on public.reportes_inteligencia;
create policy "intel_select" on public.reportes_inteligencia for select to authenticated using (true);
drop policy if exists "intel_write" on public.reportes_inteligencia;
create policy "intel_write" on public.reportes_inteligencia for all to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-2'))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-2'));

-- ---------------------------------------------------------------------------
-- LOGISTICA_ITEMS: control de inventario (P-4).
-- ---------------------------------------------------------------------------
create table if not exists public.logistica_items (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('armamento', 'vehiculo', 'municion', 'equipo', 'combustible', 'otro')),
  descripcion text not null,
  cantidad numeric not null default 1,
  estado text not null default 'operativo' check (estado in ('operativo', 'mantenimiento', 'baja')),
  observaciones text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
alter table public.logistica_items enable row level security;
drop policy if exists "logistica_select" on public.logistica_items;
create policy "logistica_select" on public.logistica_items for select to authenticated using (true);
drop policy if exists "logistica_write" on public.logistica_items;
create policy "logistica_write" on public.logistica_items for all to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-4'))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-4'));

-- ---------------------------------------------------------------------------
-- ACTIVIDADES_CIVICAS (P-5).
-- ---------------------------------------------------------------------------
create table if not exists public.actividades_civicas (
  id uuid primary key default gen_random_uuid(),
  fecha date not null default current_date,
  lugar text,
  tipo text not null default 'otro' check (tipo in ('salud', 'educacion', 'infraestructura', 'donacion', 'otro')),
  descripcion text not null,
  beneficiarios int,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.actividades_civicas enable row level security;
drop policy if exists "civica_select" on public.actividades_civicas;
create policy "civica_select" on public.actividades_civicas for select to authenticated using (true);
drop policy if exists "civica_write" on public.actividades_civicas;
create policy "civica_write" on public.actividades_civicas for all to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-5'))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-5'));

-- ---------------------------------------------------------------------------
-- AJUSTE DE FIDELIDAD CON SIPE (formatos reales que usa el Ejército):
-- vacaciones con "reserva colectiva", hoja de vida con secciones
-- identificación/antecedentes, memorandums con el detalle completo del
-- formato de sanción (hechos, fundamento, sanción), y Sala de Coordinación
-- con asunto/prioridad/confirmación (acuse de recibo).
-- ---------------------------------------------------------------------------

-- VACACIONES: "Reserva colectiva" (5 días, igual que SIPE) + columnas Efecto/Estado.
update public.ajustes set valor = valor || '{"reservaColectiva":5}'::jsonb
  where clave = 'personal' and not (valor ? 'reservaColectiva');
alter table public.vacaciones_movimientos add column if not exists efecto text not null default 'resta' check (efecto in ('suma', 'resta'));
alter table public.vacaciones_movimientos add column if not exists estado text not null default 'aprobado' check (estado in ('pendiente', 'aprobado', 'rechazado'));

-- HOJA DE VIDA (personal): separa apellidos/nombres y agrega foto, como SIPE.
alter table public.personal add column if not exists apellidos text;
alter table public.personal add column if not exists foto_url text;

-- ANTECEDENTES de la hoja de vida (sección "02-ANTECEDENTES" de SIPE: méritos/deméritos).
create table if not exists public.personal_antecedentes (
  id uuid primary key default gen_random_uuid(),
  personal_id uuid not null references public.personal (id) on delete cascade,
  tipo text not null check (tipo in ('merito', 'demerito', 'otro')),
  fecha date not null default current_date,
  motivo text not null,
  impuesto_por text,
  creado_por uuid references public.perfiles (id),
  creado timestamptz not null default now()
);
alter table public.personal_antecedentes enable row level security;
drop policy if exists "antecedentes_select" on public.personal_antecedentes;
create policy "antecedentes_select" on public.personal_antecedentes for select to authenticated using (true);
drop policy if exists "antecedentes_write" on public.personal_antecedentes;
create policy "antecedentes_write" on public.personal_antecedentes for all to authenticated
  using (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'))
  with check (public.es_mando() or (public.rol_actual() = 'jefe_campo' and public.campo_actual() = 'P-1'));

-- MEMORANDUMS: campos completos del formato de sanción de SIPE (identificación, hechos, fundamento, sanción).
alter table public.memorandums add column if not exists fecha date not null default current_date;
alter table public.memorandums add column if not exists seccion_emisora text;
alter table public.memorandums add column if not exists numero text;
alter table public.memorandums add column if not exists gestion text;
alter table public.memorandums add column if not exists lugar text;
alter table public.memorandums add column if not exists destinatario_grado text;
alter table public.memorandums add column if not exists cargo_destinatario text;
alter table public.memorandums add column if not exists hechos text;
alter table public.memorandums add column if not exists reglamento text;
alter table public.memorandums add column if not exists faltas jsonb not null default '[]'::jsonb;
alter table public.memorandums add column if not exists tipo_sancion text check (tipo_sancion in ('arresto', 'llamada_atencion', 'otra'));
alter table public.memorandums add column if not exists duracion text;
alter table public.memorandums add column if not exists lugar_cumplimiento text;
alter table public.memorandums add column if not exists cumplimiento_inicio timestamptz;
alter table public.memorandums add column if not exists cumplimiento_fin timestamptz;

-- SALA DE COORDINACIÓN: asunto, prioridad, tipo de documento y "Para" (formato SIPE).
alter table public.tablon_mensajes add column if not exists asunto text;
alter table public.tablon_mensajes add column if not exists prioridad text not null default 'informativa' check (prioridad in ('informativa', 'importante', 'inmediata'));
alter table public.tablon_mensajes add column if not exists confirmacion text not null default 'solo_conocimiento' check (confirmacion in ('solo_conocimiento', 'conocimiento_conformidad'));
alter table public.tablon_mensajes add column if not exists tipo_documento text check (tipo_documento in ('disposicion', 'radiograma', 'comunicado', 'oficio'));
alter table public.tablon_mensajes add column if not exists destinatario_id uuid references public.perfiles (id);

-- Acuse de recibo ("conocimiento y conformidad") por persona, para mensajes/disposiciones que lo piden.
create table if not exists public.tablon_confirmaciones (
  id uuid primary key default gen_random_uuid(),
  mensaje_id uuid not null references public.tablon_mensajes (id) on delete cascade,
  perfil_id uuid not null references public.perfiles (id),
  confirmado timestamptz not null default now(),
  unique (mensaje_id, perfil_id)
);
alter table public.tablon_confirmaciones enable row level security;
drop policy if exists "confirmaciones_select" on public.tablon_confirmaciones;
create policy "confirmaciones_select" on public.tablon_confirmaciones for select to authenticated using (true);
drop policy if exists "confirmaciones_insert" on public.tablon_confirmaciones;
create policy "confirmaciones_insert" on public.tablon_confirmaciones for insert to authenticated with check (perfil_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Tiempo real: agrega las tablas a la publicación de Supabase Realtime para
-- que los cambios se transmitan en vivo a todos los que estén conectados.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.documentos;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.partes;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.radiogramas;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.calendario_items;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.tablon_mensajes;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.memorandums;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.secciones;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.personal;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.vacaciones_movimientos;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.faltas_medicas;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.reportes_inteligencia;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.logistica_items;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.actividades_civicas;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.personal_antecedentes;
exception when duplicate_object then null; end $$;
do $$
begin
  alter publication supabase_realtime add table public.tablon_confirmaciones;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Bucket de almacenamiento para adjuntos de la Sala de Coordinación.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', true)
on conflict (id) do nothing;

drop policy if exists "adjuntos_select" on storage.objects;
create policy "adjuntos_select" on storage.objects for select to authenticated using (bucket_id = 'adjuntos');
drop policy if exists "adjuntos_insert" on storage.objects;
create policy "adjuntos_insert" on storage.objects for insert to authenticated with check (bucket_id = 'adjuntos');
