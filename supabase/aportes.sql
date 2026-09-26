-- aportes.sql - el tablón de ideas y errores de Path to the Sanctuary
--
-- Se pega entero en Supabase > SQL Editor > New query > Run. Se puede volver a
-- ejecutar sin romper nada (también si ya ejecutaste una versión anterior: lo
-- que hubiera en "aportes" y "votos" se pasa a "ideas" y "errores", y las
-- columnas que ya no se usan se borran).
-- La web nunca escribe en las tablas directamente: solo llama a las funciones
-- de abajo, que lo comprueban todo antes, y sube archivos al bucket "adjuntos".

-- ---------- Tablas ----------

-- el id es el código que ve la gente: "IDEA-12" o "ERR-12". Cada tabla lleva su
-- propia cuenta, así que puede haber una IDEA-55 y un ERR-55.
-- Los votos van en la misma fila: "votos" es cuántos hay y "votantes" quién ha
-- votado (un número al azar por navegador), para que nadie vote dos veces.
-- La web ve "votos" pero nunca "votantes".
-- Desde el panel (Table Editor) solo se tocan "estado" y "visible".

create table if not exists public.ideas (
  id           text primary key check (id ~ '^IDEA-[0-9]+$'),
  titulo       text not null check (char_length(titulo) between 4 and 120),
  descripcion  text not null check (char_length(descripcion) between 10 and 4000),
  -- capturas, vídeos o registros: [{"ruta", "nombre", "tipo", "peso"}]
  adjuntos     jsonb not null default '[]',
  estado       text not null default 'abierto'
               check (estado in ('abierto', 'confirmado', 'en_curso', 'resuelto', 'duplicado', 'descartado')),
  visible      boolean not null default true,
  votos        integer not null default 0,
  votantes     uuid[] not null default '{}',
  creado       timestamptz not null default now()
);

create table if not exists public.errores (
  id           text primary key check (id ~ '^ERR-[0-9]+$'),
  titulo       text not null check (char_length(titulo) between 4 and 120),
  descripcion  text not null check (char_length(descripcion) between 10 and 4000),
  pasos        text check (char_length(pasos) <= 3000),
  version      text check (char_length(version) <= 30),
  plataforma   text check (char_length(plataforma) <= 40),
  adjuntos     jsonb not null default '[]',
  estado       text not null default 'abierto'
               check (estado in ('abierto', 'confirmado', 'en_curso', 'resuelto', 'duplicado', 'descartado')),
  visible      boolean not null default true,
  votos        integer not null default 0,
  votantes     uuid[] not null default '{}',
  creado       timestamptz not null default now()
);

-- para quien ya tenía estas tablas con más columnas
drop trigger if exists tocar_actualizado on public.ideas;
drop trigger if exists tocar_actualizado on public.errores;
drop function if exists public.tocar_actualizado();
alter table public.ideas
  drop column if exists numero,
  drop column if exists respuesta,
  drop column if exists duplicado_de,
  drop column if exists autor,
  drop column if exists actualizado;
alter table public.errores
  drop column if exists numero,
  drop column if exists respuesta,
  drop column if exists duplicado_de,
  drop column if exists autor,
  drop column if exists actualizado;

-- para encontrar rápido qué ha votado un navegador
create index if not exists ideas_votantes on public.ideas using gin (votantes);
create index if not exists errores_votantes on public.errores using gin (votantes);

-- ---------- Desde las primeras versiones (tablas "aportes" y "votos") ----------

-- lo que hubiera se copia a "ideas" y "errores" con sus votos, y las tablas
-- viejas se borran. Si venían con id numérico (1, 2, 3...), cada tipo se numera
-- en el orden en que llegó
do $$
begin
  if to_regclass('public.aportes') is null then
    return;
  end if;

  alter table public.aportes add column if not exists adjuntos jsonb not null default '[]';

  -- de id viejo a id nuevo
  if (select data_type from information_schema.columns
      where table_schema = 'public' and table_name = 'aportes' and column_name = 'id') = 'bigint' then
    create temp table mapa on commit drop as
      select id::text as viejo, tipo, row_number() over (partition by tipo order by id)::integer as numero
      from public.aportes;
  else
    create temp table mapa on commit drop as
      select id as viejo, tipo, numero from public.aportes;
  end if;
  alter table mapa add column nuevo text;
  update mapa set nuevo = case tipo when 'error' then 'ERR-' else 'IDEA-' end || numero;

  -- quién votó cada uno
  create temp table viejos_votos on commit drop as
    select null::text as aporte, null::uuid as votante, null::timestamptz as creado limit 0;
  if to_regclass('public.votos') is not null then
    insert into viejos_votos select aporte_id::text, votante, creado from public.votos;
  end if;

  insert into public.ideas (id, titulo, descripcion, adjuntos, estado, visible, votos, votantes, creado)
  select m.nuevo, a.titulo, a.descripcion, a.adjuntos, a.estado, a.visible,
         cardinality(v.lista), v.lista, a.creado
  from public.aportes a
  join mapa m on m.viejo = a.id::text
  cross join lateral (
    select coalesce(array_agg(vv.votante order by vv.creado), '{}') as lista
    from viejos_votos vv where vv.aporte = a.id::text
  ) v
  where a.tipo = 'idea'
  on conflict (id) do nothing;

  insert into public.errores (id, titulo, descripcion, pasos, version, plataforma, adjuntos, estado,
                              visible, votos, votantes, creado)
  select m.nuevo, a.titulo, a.descripcion, a.pasos, a.version, a.plataforma, a.adjuntos, a.estado,
         a.visible, cardinality(v.lista), v.lista, a.creado
  from public.aportes a
  join mapa m on m.viejo = a.id::text
  cross join lateral (
    select coalesce(array_agg(vv.votante order by vv.creado), '{}') as lista
    from viejos_votos vv where vv.aporte = a.id::text
  ) v
  where a.tipo = 'error'
  on conflict (id) do nothing;

  drop table if exists public.votos;
  drop table public.aportes;
end;
$$;

drop function if exists public.aportes_tocar();

-- ---------- Permisos de las tablas ----------

alter table public.ideas enable row level security;
alter table public.errores enable row level security;

-- la web puede leer lo visible, pero nunca "votantes"
revoke all on public.ideas, public.errores from anon, authenticated;
grant select (id, titulo, descripcion, adjuntos, estado, votos, creado)
  on public.ideas to anon, authenticated;
grant select (id, titulo, descripcion, pasos, version, plataforma, adjuntos, estado, votos, creado)
  on public.errores to anon, authenticated;

drop policy if exists "se leen las visibles" on public.ideas;
create policy "se leen las visibles" on public.ideas
  for select to anon, authenticated using (visible);

drop policy if exists "se leen los visibles" on public.errores;
create policy "se leen los visibles" on public.errores
  for select to anon, authenticated using (visible);

-- ---------- Archivos adjuntos (Storage) ----------

-- bucket público: cualquiera puede ver un archivo si tiene su enlace.
-- Máximo 10 MB por archivo y solo imágenes, vídeos y texto (registros .log/.txt)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('adjuntos', 'adjuntos', true, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'text/plain'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- freno contra avalanchas: cuántos archivos se han subido en la última hora
create or replace function public.adjuntos_ultima_hora() returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*) from storage.objects
  where bucket_id = 'adjuntos' and created_at > now() - interval '1 hour';
$$;

-- la web puede subir archivos nuevos (nunca borrar ni cambiar), cada navegador
-- dentro de su carpeta, y como mucho 200 archivos por hora entre todos
drop policy if exists "adjuntos: subir" on storage.objects;
create policy "adjuntos: subir" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'adjuntos'
    and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and public.adjuntos_ultima_hora() < 200
  );

-- ---------- Funciones que llama la web ----------

-- las de versiones anteriores
drop function if exists public.enviar_aporte(text, text, text, text, text, text, text, uuid);
drop function if exists public.enviar_aporte(text, text, text, text, text, text, jsonb, uuid);
drop function if exists public.votar(bigint, uuid);
drop function if exists public.votar(text, uuid);
drop function if exists public.mis_votos(uuid);

-- enviar una idea o un error; devuelve su id ("IDEA-12" o "ERR-40").
-- p_votante es el número al azar de este navegador: su carpeta de adjuntos y
-- su primer voto
create or replace function public.enviar_aporte(
  p_tipo text,
  p_titulo text,
  p_descripcion text,
  p_pasos text,
  p_version text,
  p_plataforma text,
  p_adjuntos jsonb,
  p_votante uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  siguiente integer;
  nuevo text;
  limpios jsonb;
begin
  if p_votante is null then
    raise exception 'falta_votante';
  end if;
  if p_tipo is null or p_tipo not in ('idea', 'error') then
    raise exception 'tipo_no_valido';
  end if;

  -- freno contra avalanchas: 60 envíos por hora entre todos
  if (select count(*) from ideas where creado > now() - interval '1 hour')
     + (select count(*) from errores where creado > now() - interval '1 hour') >= 60 then
    raise exception 'demasiados_envios';
  end if;

  -- los adjuntos: 4 como mucho, subidos de verdad y en la carpeta de este navegador
  p_adjuntos := coalesce(p_adjuntos, '[]'::jsonb);
  if jsonb_typeof(p_adjuntos) <> 'array' or jsonb_array_length(p_adjuntos) > 4 then
    raise exception 'adjuntos_no_validos';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_adjuntos) e
    where jsonb_typeof(e) <> 'object'
       or coalesce(e ->> 'ruta', '') !~ ('^' || p_votante::text || '/[A-Za-z0-9._-]{1,100}$')
       or char_length(coalesce(e ->> 'nombre', '')) not between 1 and 120
       or coalesce(e ->> 'tipo', '') !~ '^(image|video|text)/[a-z0-9.+-]+$'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'adjuntos' and o.name = e ->> 'ruta')
  ) then
    raise exception 'adjuntos_no_validos';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'ruta', e ->> 'ruta',
           'nombre', e ->> 'nombre',
           'tipo', e ->> 'tipo',
           'peso', case when e ->> 'peso' ~ '^\d{1,12}$' then (e ->> 'peso')::bigint end)), '[]'::jsonb)
    into limpios
    from jsonb_array_elements(p_adjuntos) e;

  -- el siguiente número de su tabla: el más alto de los ids ("ERR-55" -> 55)
  -- más uno. El candado hace que dos envíos a la vez no se lleven el mismo.
  -- Quien lo envía ya cuenta como el primer voto
  perform pg_advisory_xact_lock(hashtext('aportes:' || p_tipo));

  if p_tipo = 'idea' then
    select coalesce(max(split_part(id, '-', 2)::integer), 0) + 1 into siguiente from ideas;
    nuevo := 'IDEA-' || siguiente;
    insert into ideas (id, titulo, descripcion, adjuntos, votos, votantes)
    values (nuevo, btrim(p_titulo), btrim(p_descripcion), limpios, 1, array[p_votante]);
  else
    select coalesce(max(split_part(id, '-', 2)::integer), 0) + 1 into siguiente from errores;
    nuevo := 'ERR-' || siguiente;
    insert into errores (id, titulo, descripcion, pasos, version, plataforma, adjuntos, votos, votantes)
    values (nuevo, btrim(p_titulo), btrim(p_descripcion),
            nullif(btrim(p_pasos), ''), nullif(btrim(p_version), ''), nullif(btrim(p_plataforma), ''),
            limpios, 1, array[p_votante]);
  end if;

  return nuevo;
end;
$$;

-- votar o quitar el voto; devuelve {"votos": n, "votado": true/false}
create or replace function public.votar(p_aporte text, p_votante uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  tabla text;
  lista uuid[];
  votado boolean;
begin
  tabla := case when p_aporte like 'IDEA-%' then 'ideas' when p_aporte like 'ERR-%' then 'errores' end;
  if tabla is null or p_votante is null then
    raise exception 'no_existe';
  end if;

  -- "for update" bloquea la fila: dos votos a la vez no se pisan
  execute format('select votantes from %I where id = $1 and visible for update', tabla)
    into lista using p_aporte;
  if lista is null then
    raise exception 'no_existe';
  end if;

  votado := not (p_votante = any(lista));
  lista := case when votado then array_append(lista, p_votante) else array_remove(lista, p_votante) end;
  execute format('update %I set votantes = $1, votos = cardinality($1) where id = $2', tabla)
    using lista, p_aporte;

  return json_build_object('votos', cardinality(lista), 'votado', votado);
end;
$$;

-- qué ha votado ya este navegador
create or replace function public.mis_votos(p_votante uuid)
returns table (aporte_id text)
language sql
stable
security definer
set search_path = public
as $$
  select id from ideas where votantes @> array[p_votante]
  union all
  select id from errores where votantes @> array[p_votante];
$$;

revoke execute on function public.adjuntos_ultima_hora() from public;
revoke execute on function public.enviar_aporte(text, text, text, text, text, text, jsonb, uuid) from public;
revoke execute on function public.votar(text, uuid) from public;
revoke execute on function public.mis_votos(uuid) from public;
grant execute on function public.adjuntos_ultima_hora() to anon, authenticated;
grant execute on function public.enviar_aporte(text, text, text, text, text, text, jsonb, uuid) to anon, authenticated;
grant execute on function public.votar(text, uuid) to anon, authenticated;
grant execute on function public.mis_votos(uuid) to anon, authenticated;
