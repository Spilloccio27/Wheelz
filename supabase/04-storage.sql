-- ============================================================================
-- MechFlow — 04-storage.sql
-- Due bucket e le loro regole d'accesso.
--
-- Da eseguire dopo 03-ordini.sql.
--
--   loghi      pubblico in lettura — il logo compare nelle stampe e nei
--              documenti, non ha senso firmarlo ogni volta;
--   documenti  privato — fatture, DDT, foto dei danni e dei pezzi sostituiti.
--              Si legge solo con link firmato, valido un'ora (lo genera
--              storageService.urlDi()).
--
-- La struttura del percorso è parte del modello di sicurezza:
--
--     <officina_id>/<cartella>/<timestamp>-<random>-<nome file>
--
-- Il primo segmento è l'officina, e ogni policy lo confronta con l'officina
-- di chi sta chiedendo. Nel database salviamo soltanto il percorso: il file
-- non entra mai in una colonna.
-- ============================================================================

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '04-storage') then
    raise exception 'Lo script 04-storage.sql risulta già applicato. Non va eseguito due volte.';
  end if;
  if not exists (select 1 from public._migrazioni where nome = '03-ordini') then
    raise exception 'Esegui prima 03-ordini.sql.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'loghi', 'loghi', true, 2 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documenti', 'documenti', false, 12 * 1024 * 1024,
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policy — bucket `loghi`
-- Lettura libera (è pubblico), scrittura solo dal titolare della propria
-- officina: il logo è un dato d'identità, non lo cambia il primo che passa.
-- ---------------------------------------------------------------------------
drop policy if exists "loghi lettura pubblica" on storage.objects;
create policy "loghi lettura pubblica"
  on storage.objects for select
  using (bucket_id = 'loghi');

drop policy if exists "loghi scrittura titolare" on storage.objects;
create policy "loghi scrittura titolare"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'loghi'
    and public.e_titolare()
    and (storage.foldername(name))[1] = public.officina_corrente()::text
  );

drop policy if exists "loghi aggiornamento titolare" on storage.objects;
create policy "loghi aggiornamento titolare"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'loghi'
    and public.e_titolare()
    and (storage.foldername(name))[1] = public.officina_corrente()::text
  );

drop policy if exists "loghi cancellazione titolare" on storage.objects;
create policy "loghi cancellazione titolare"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'loghi'
    and public.e_titolare()
    and (storage.foldername(name))[1] = public.officina_corrente()::text
  );

-- ---------------------------------------------------------------------------
-- Policy — bucket `documenti`
-- Si legge e si scrive solo dentro la cartella della propria officina, e solo
-- se si ha un profilo attivo. Nessun profilo, nessun file: vale anche per una
-- chiamata diretta alle API di Storage con il token in mano.
-- ---------------------------------------------------------------------------
drop policy if exists "documenti lettura officina" on storage.objects;
create policy "documenti lettura officina"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documenti'
    and public.officina_corrente() is not null
    and (storage.foldername(name))[1] = public.officina_corrente()::text
  );

drop policy if exists "documenti scrittura officina" on storage.objects;
create policy "documenti scrittura officina"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documenti'
    and public.officina_corrente() is not null
    and (storage.foldername(name))[1] = public.officina_corrente()::text
  );

drop policy if exists "documenti aggiornamento officina" on storage.objects;
create policy "documenti aggiornamento officina"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documenti'
    and (storage.foldername(name))[1] = public.officina_corrente()::text
  );

-- La cancellazione di un allegato è riservata a chi ha responsabilità
-- operativa: il meccanico carica le foto del danno, non le fa sparire.
drop policy if exists "documenti cancellazione operativi" on storage.objects;
create policy "documenti cancellazione operativi"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documenti'
    and public.e_operativo()
    and (storage.foldername(name))[1] = public.officina_corrente()::text
  );

insert into public._migrazioni (nome) values ('04-storage');
