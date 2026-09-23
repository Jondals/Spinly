# Spinly × Supabase — Guía de setup

Este documento es lo que hay que crear/ejecutar **a mano en el panel de Supabase**
antes de implementar la parte de perfil, compartir y comunidad.

## 1. Proyecto y claves

1. Crea un proyecto en https://supabase.com (región cercana a tus usuarios).
2. Copia **Project URL** y **anon public key** (Project Settings → API).
3. Crea `.env.local` en la raíz del proyecto a partir de `.env.example`:

```
REACT_APP_SUPABASE_URL=https://rwpvqvssxtibieuxmpwa.supabase.co
REACT_APP_SUPABASE_ANON_KEY=sb_publishable_ruJY6ZyQ7oexMTRVLN3ctg_AO6OokIR
```

Sin estas variables la app funciona en modo 100% local (la nube queda desactivada).

## 2. SQL a ejecutar (SQL Editor → New query → Run)

```sql
-- ====== PROFILES ======
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Perfiles públicos de lectura"
  on public.profiles for select using (true);

create policy "Usuario edita su propio perfil"
  on public.profiles for update using (auth.uid() = id);

create policy "Usuario crea su propio perfil"
  on public.profiles for insert with check (auth.uid() = id);

-- Perfil automático al registrarse
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ====== SHARED THEMES ======
create table if not exists public.shared_themes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  style_tag text,
  category text,
  segments jsonb not null default '[]'::jsonb,
  border_color text,
  center_color text,
  pointer_color text,
  light_color text check (light_color is null or light_color ~ '^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$'),
  created_at timestamptz not null default now()
);

alter table public.shared_themes enable row level security;

create policy "Temas compartidos: lectura pública"
  on public.shared_themes for select using (true);

create policy "Temas compartidos: solo el autor crea"
  on public.shared_themes for insert with check (auth.uid() = author_id);

create policy "Temas compartidos: solo el autor borra"
  on public.shared_themes for delete using (auth.uid() = author_id);

-- ====== SHARED PRESETS ======
create table if not exists public.shared_presets (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  options jsonb not null default '[]'::jsonb,
  theme jsonb not null default '{}'::jsonb,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.shared_presets enable row level security;

create policy "Presets compartidos: lectura pública"
  on public.shared_presets for select using (true);

create policy "Presets compartidos: solo el autor crea"
  on public.shared_presets for insert with check (auth.uid() = author_id);

create policy "Presets compartidos: solo el autor borra"
  on public.shared_presets for delete using (auth.uid() = author_id);
```

### 2b. Edición en la nube (UPDATE) — necesario para "Editar" en Comunidad

Ejecuta también `supabase-update-policies.sql` (raíz del proyecto). Añade la política
"solo el autor edita" (`using` + `with check` sobre `auth.uid() = author_id`) en ambas
tablas y limita el UPDATE a las columnas de contenido: `id`, `author_id` y `created_at`
quedan inmutables. Sin esto, "Editar" muestra un aviso y no modifica nada.

## 3. Bucket de avatares (Storage)

1. Ve a **Storage → New bucket**.
2. Nombre: `avatars` (exacto, minúsculas).
3. Marca **Public bucket** = activado.
4. En **Policies** del bucket, añade estas dos (SQL alternativo abajo):

```sql
-- Lectura pública de avatares
create policy "Avatares: lectura pública"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- Cada usuario solo escribe en su propia carpeta avatars/{uid}/...
create policy "Avatares: subir al propio espacio"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "Avatares: actualizar el propio espacio"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
```

## 4. Autenticación

- **Authentication → Providers → Email**: activado.
- **Authentication → Providers → Anonymous sign-ins**: **activado** (obligatorio:
  el login del proyecto es SOLO con nombre de usuario vía `signInAnonymously()`,
  sin email ni contraseña en ningún punto).
- Para desarrollo local, desactiva temporalmente
  **Authentication → Providers → Email → "Confirm email"** (o configura SMTP),
  para poder probar el registro sin verificar correos.

## 5. Checklist (implementado en el código)

- [x] Perfil en el Header: icono circular + menú (clic fuera/Escape) con formulario
      SOLO de "Nombre de usuario" + foto opcional. Login anónimo
      (`signInAnonymously`) y guardado en `profiles` (id = uid). Persiste al
      recargar. "Editar perfil" reutiliza el mismo formulario. Sin email jamás.
      Si `avatar_url` es null (o la URL falla) se muestra un placeholder neutro.
- [x] Botón "Compartir" en tarjetas propias de Themes/Presets (siempre con
      `author_id`; pide sesión y avisa si no la hay o si Supabase falla).
- [x] Toggle "Mis temas/Mis presets ↔ Comunidad" con buscador (nombre o autor),
      join a `profiles` para pintar nombre + foto del autor, "Descargar" (temas)
      y "Usar" (presets, se copia a Mis presets y se carga en la ruleta).
- [x] En Comunidad, SOLO en tus propias filas (author_id = tu uid): "Editar" (UPDATE
      de la misma fila, reutiliza el formulario de guardar) y "Borrar de la nube"
      (DELETE con confirmación de doble clic). Local y nube son copias independientes.
- [x] Manejo de errores de red sin romper el modo 100% local: todos los
      servicios devuelven `{ ok, data } | { ok, error }` y nunca lanzan
      excepciones a la UI. Sin variables en `.env.local`, la nube queda
      desactivada y la app funciona igual que siempre.
