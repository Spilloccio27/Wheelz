-- ============================================================================
-- MechFlow — 08-cancellazione-utenti.sql
--
-- Correzione al trigger `protegge_ultimo_titolare()`.
--
-- IL DIFETTO
-- `profiles.id` riferisce `auth.users(id) on delete cascade`: cancellando un
-- utente dalla console di Supabase, la sua riga in `profiles` sparisce in
-- cascata e fa scattare il trigger. Se quell'utente è l'unico titolare —
-- cioè sempre, finché l'officina ha una persona sola — il trigger solleva
-- un'eccezione, la cascata fallisce e la cancellazione viene annullata.
-- Risultato: l'utente non si riesce più a eliminare da nessuna parte.
--
-- LA CORREZIONE
-- La guardia si applica solo quando c'è un utente autenticato, cioè quando
-- la richiesta arriva dall'applicazione. Con `auth.uid()` a NULL la
-- cancellazione viene dalla console o da uno script con la chiave di
-- servizio: chi ha le chiavi del database non va protetto da sé stesso.
--
-- Non apre nulla: per il ruolo `anon` anche `auth.uid()` è NULL, ma la
-- policy di cancellazione su `profiles` richiede di essere titolare della
-- stessa officina, e per un anonimo non è mai soddisfatta. È la stessa
-- eccezione che `blocca_cambio_ruolo()` ha da sempre.
--
-- NOTA: eliminare l'utente non elimina la sua scheda del personale, che
-- resta come dato storico. Se vuoi ripulire anche quella, in fondo trovi la
-- query — commentata.
-- ============================================================================

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '08-cancellazione-utenti') then
    raise exception 'Lo script 08 risulta già applicato. Non va eseguito due volte.';
  end if;
  if not exists (select 1 from public._migrazioni where nome = '02-auth') then
    raise exception 'Esegui prima 02-auth.sql.';
  end if;
end
$$;

create or replace function public.protegge_ultimo_titolare()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    return old;
  end if;

  if old.ruolo = 'titolare'
     and (select count(*) from public.profiles
          where officina_id = old.officina_id and ruolo = 'titolare' and attivo) <= 1 then
    raise exception 'Non puoi eliminare l’ultimo titolare dell’officina.' using errcode = '42501';
  end if;
  return old;
end
$$;

insert into public._migrazioni (nome) values ('08-cancellazione-utenti');

-- ---------------------------------------------------------------------------
-- Ripulire le schede personali rimaste senza utente.
-- Togli il commento ed esegui solo se vuoi davvero cancellarle.
-- ---------------------------------------------------------------------------
-- delete from public.employees e
-- where not exists (select 1 from public.profiles p where p.employee_id = e.id);
