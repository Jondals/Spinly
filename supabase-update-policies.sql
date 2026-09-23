-- Spinly: edición en la nube de temas/presets propios (UPDATE).
-- Ejecutar UNA vez en Supabase → SQL Editor. Es idempotente (se puede repetir).
--
-- Sin esta política, RLS bloquea todo UPDATE sobre shared_themes/shared_presets
-- (solo existían select/insert/delete) y "Editar en la nube" no cambia ninguna fila.

-- 1) RLS: solo el autor edita su fila, y no puede "regalarla" a otro autor.
drop policy if exists "Temas compartidos: solo el autor edita" on public.shared_themes;
create policy "Temas compartidos: solo el autor edita"
  on public.shared_themes for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

drop policy if exists "Presets compartidos: solo el autor edita" on public.shared_presets;
create policy "Presets compartidos: solo el autor edita"
  on public.shared_presets for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- 2) Defensa extra a nivel de columna: solo el CONTENIDO es editable.
--    id, author_id y created_at quedan inmutables para cualquier cliente.
revoke update on public.shared_themes from anon, authenticated;
grant update (name, description, style_tag, category, segments, border_color, center_color, pointer_color)
  on public.shared_themes to authenticated;

revoke update on public.shared_presets from anon, authenticated;
grant update (name, options, theme, tags)
  on public.shared_presets to authenticated;
