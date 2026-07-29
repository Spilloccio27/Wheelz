-- ============================================================================
-- Wheelz — 99-svuota-demo.sql
-- Script di servizio: svuota i dati operativi di UNA officina.
--
-- Serve dopo aver caricato i dati dimostrativi con `npm run seed`, quando si
-- vuole ripartire da un gestionale vuoto senza rifare schema, policy e utenti.
--
-- ATTENZIONE: cancella davvero. Non c'è cestino.
--
-- Cosa NON tocca, ed è voluto:
--   - la tabella `officine` e la sua riga;
--   - `profiles` e `invites`: gli utenti restano, con i loro ruoli;
--   - `settings`: la configurazione dell'officina (tariffe, ricarichi,
--     obiettivi) sopravvive, perché ricostruirla a mano è il lavoro noioso.
--
-- USO
--   1. trova l'id della tua officina:
--        select id, ragione_sociale from public.officine;
--   2. incolla l'id nella variabile qui sotto;
--   3. esegui.
--
-- A differenza degli altri script questo NON si registra in _migrazioni:
-- è pensato per essere eseguito più volte.
-- ============================================================================

do $$
declare
  -- ⬇⬇⬇  INCOLLA QUI L'ID DELL'OFFICINA DA SVUOTARE  ⬇⬇⬇
  v_officina uuid := '00000000-0000-0000-0000-000000000000';

  v_conta bigint;
begin
  if v_officina = '00000000-0000-0000-0000-000000000000' then
    raise exception
      'Prima di eseguire questo script devi incollare l''id dell''officina nella variabile v_officina.';
  end if;

  if not exists (select 1 from public.officine where id = v_officina) then
    raise exception 'Nessuna officina con id %.', v_officina;
  end if;

  -- L'ordine conta: si va dalle foglie verso la radice, così le chiavi
  -- esterne non protestano.

  -- Le schede puntano alle fatture e viceversa: prima si sciolgono i legami.
  update public.jobs   set invoice_id = null where officina_id = v_officina;
  update public.quotes set job_id     = null where officina_id = v_officina;
  update public.orders set expense_id = null where officina_id = v_officina;

  delete from public.job_lines     where officina_id = v_officina;
  delete from public.movements     where officina_id = v_officina;
  delete from public.price_history where officina_id = v_officina;
  delete from public.invoices      where officina_id = v_officina;
  delete from public.jobs          where officina_id = v_officina;
  delete from public.quotes        where officina_id = v_officina;
  delete from public.expenses      where officina_id = v_officina;
  delete from public.recurring     where officina_id = v_officina;
  delete from public.orders        where officina_id = v_officina;
  delete from public.articles      where officina_id = v_officina;
  delete from public.vehicles      where officina_id = v_officina;
  delete from public.customers     where officina_id = v_officina;
  delete from public.suppliers     where officina_id = v_officina;
  delete from public.attendance    where officina_id = v_officina;
  delete from public.shifts        where officina_id = v_officina;

  -- I dipendenti collegati a un profilo restano: cancellarli lascerebbe
  -- utenti senza scheda personale.
  delete from public.employees e
  where e.officina_id = v_officina
    and not exists (select 1 from public.profiles p where p.employee_id = e.id);

  select count(*) into v_conta from public.employees where officina_id = v_officina;

  raise notice 'Officina % svuotata. Restano % dipendenti collegati a un utente.', v_officina, v_conta;
end
$$;

-- ---------------------------------------------------------------------------
-- I file su storage vanno rimossi a parte: il database conserva solo i
-- percorsi, non i file. Dalla dashboard di Supabase, oppure:
--
--   delete from storage.objects
--   where bucket_id = 'documenti'
--     and (storage.foldername(name))[1] = '<officina_id>';
--
--   delete from storage.objects
--   where bucket_id = 'loghi'
--     and (storage.foldername(name))[1] = '<officina_id>';
-- ---------------------------------------------------------------------------
