-- ============================================================================
-- MechFlow — 05-sicurezza.sql
-- Row Level Security: i permessi vivono qui, non nell'interfaccia.
--
-- Da eseguire dopo 04-storage.sql.
--
-- Regola di fondo, valida per ogni tabella: senza un profilo attivo,
-- `officina_corrente()` restituisce NULL e nessuna condizione è soddisfatta.
-- Senza profilo non si legge nulla — nemmeno con una chiamata REST fatta a
-- mano con il token in mano, perché il filtro non passa dal front-end.
--
-- I tre ruoli:
--
--   titolare     tutto.
--   capofficina  operatività: clienti, veicoli, preventivi, schede, magazzino,
--                fornitori, personale. Niente spese, niente ricorrenti, niente
--                impostazioni in scrittura, niente report economici.
--                Sulle fatture: può emetterle (le crea chiudendo una scheda) e
--                rileggere quelle degli ultimi 7 giorni — quanto basta per
--                lavorare, non abbastanza per ricostruire il fatturato.
--   meccanico    le proprie schede, le proprie ore, i propri ricambi, i propri
--                turni e le proprie presenze. Dei colleghi vede nome e reparto
--                attraverso la vista `colleghi`, e nient'altro.
-- ============================================================================

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '05-sicurezza') then
    raise exception 'Lo script 05-sicurezza.sql risulta già applicato. Non va eseguito due volte.';
  end if;
  if not exists (select 1 from public._migrazioni where nome = '04-storage') then
    raise exception 'Esegui prima 04-storage.sql.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- RLS attiva ovunque.
--
-- `ENABLE` e non `FORCE`, ed è una scelta obbligata. Con `FORCE` le policy
-- valgono anche per il proprietario delle tabelle — e il proprietario è il
-- ruolo con cui girano le funzioni `SECURITY DEFINER` che creano i profili.
-- `fonda_officina()` scrive in `officine`, `settings`, `employees` e
-- `profiles` nel momento esatto in cui l'utente non ha ancora un profilo:
-- con `FORCE` ogni policy la respingerebbe, e nessuno riuscirebbe più a
-- registrarsi. Per farla passare servirebbe una policy di inserimento aperta
-- su `profiles`, che è precisamente ciò che non vogliamo.
--
-- Togliere `FORCE` non allenta nulla per chi usa l'applicazione: `anon` e
-- `authenticated` — gli unici ruoli che il browser può assumere — restano
-- pienamente soggetti alle policy. A bypassarle sono solo il proprietario e
-- `service_role`, cioè connessioni che hanno già le chiavi del database.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'officine', 'profiles', 'invites', 'settings',
    'customers', 'vehicles', 'suppliers', 'articles', 'movements', 'price_history',
    'orders', 'quotes', 'jobs', 'job_lines', 'invoices', 'expenses', 'recurring',
    'employees', 'shifts', 'attendance'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I no force row level security', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Profili, officine, inviti
-- ---------------------------------------------------------------------------

-- Ognuno vede il proprio profilo; il titolare vede quelli della sua officina.
create policy "profili lettura" on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (officina_id = public.officina_corrente() and public.e_operativo())
  );

-- Nessun insert dal client: i profili nascono da fonda_officina() o da
-- riscatta_invito(), entrambe SECURITY DEFINER. Niente policy di insert
-- significa che qualunque tentativo diretto viene respinto.

-- L'aggiornamento è consentito solo su di sé (nome) o dal titolare; il
-- trigger di 02-auth.sql sorveglia comunque la colonna `ruolo`.
create policy "profili aggiornamento" on public.profiles for update to authenticated
  using (id = auth.uid() or (officina_id = public.officina_corrente() and public.e_titolare()))
  with check (officina_id = public.officina_corrente());

create policy "profili cancellazione titolare" on public.profiles for delete to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare() and id <> auth.uid());

create policy "officine lettura" on public.officine for select to authenticated
  using (id = public.officina_corrente());

create policy "officine aggiornamento titolare" on public.officine for update to authenticated
  using (id = public.officina_corrente() and public.e_titolare())
  with check (id = public.officina_corrente());

-- Gli inviti li vede e li crea solo il titolare. Chi li riscatta non ha
-- bisogno di leggerli: ci pensa riscatta_invito() con i propri privilegi.
create policy "inviti titolare" on public.invites for all to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare())
  with check (officina_id = public.officina_corrente() and public.e_titolare());

-- ---------------------------------------------------------------------------
-- Impostazioni — tutti leggono (servono tariffe, ponti, aliquote),
-- solo il titolare scrive.
-- ---------------------------------------------------------------------------
create policy "impostazioni lettura" on public.settings for select to authenticated
  using (officina_id = public.officina_corrente());

create policy "impostazioni scrittura titolare" on public.settings for update to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare())
  with check (officina_id = public.officina_corrente());

create policy "impostazioni inserimento titolare" on public.settings for insert to authenticated
  with check (officina_id = public.officina_corrente() and public.e_titolare());

-- ---------------------------------------------------------------------------
-- Anagrafiche operative: clienti, veicoli, fornitori
--
-- Il meccanico legge (deve sapere di chi è la macchina che ha sul ponte) ma
-- non scrive; titolare e capofficina fanno tutto.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['customers', 'vehicles', 'suppliers']
  loop
    execute format($f$
      create policy "%1$s lettura officina" on public.%1$I for select to authenticated
        using (officina_id = public.officina_corrente());

      create policy "%1$s scrittura operativi" on public.%1$I for insert to authenticated
        with check (officina_id = public.officina_corrente() and public.e_operativo());

      create policy "%1$s modifica operativi" on public.%1$I for update to authenticated
        using (officina_id = public.officina_corrente() and public.e_operativo())
        with check (officina_id = public.officina_corrente());

      create policy "%1$s cancellazione operativi" on public.%1$I for delete to authenticated
        using (officina_id = public.officina_corrente() and public.e_operativo());
    $f$, t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Magazzino
--
-- Tutti leggono il catalogo: il meccanico deve poter trovare il pezzo e la sua
-- ubicazione. Solo gli operativi modificano l'anagrafica.
-- I movimenti li può inserire anche il meccanico, ma soltanto scarichi legati
-- a una scheda sua: è il gesto di montare il pezzo, non di gestire il magazzino.
-- ---------------------------------------------------------------------------
create policy "articoli lettura officina" on public.articles for select to authenticated
  using (officina_id = public.officina_corrente());

create policy "articoli scrittura operativi" on public.articles for insert to authenticated
  with check (officina_id = public.officina_corrente() and public.e_operativo());

-- L'update resta aperto agli operativi; per il meccanico il ricalcolo di
-- giacenza e prezzo medio passa da registra_movimento(), che è SECURITY
-- INVOKER ma viene invocata all'interno della stessa transazione dello scarico.
create policy "articoli modifica operativi" on public.articles for update to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo())
  with check (officina_id = public.officina_corrente());

create policy "articoli cancellazione titolare" on public.articles for delete to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare());

create policy "movimenti lettura" on public.movements for select to authenticated
  using (
    officina_id = public.officina_corrente()
    and (
      public.e_operativo()
      or job_id in (
        select id from public.jobs
        where employee_ids ? public.dipendente_corrente()::text
      )
    )
  );

create policy "movimenti inserimento" on public.movements for insert to authenticated
  with check (
    officina_id = public.officina_corrente()
    and (
      public.e_operativo()
      or (
        tipo = 'scarico'
        and job_id in (
          select id from public.jobs
          where employee_ids ? public.dipendente_corrente()::text
        )
      )
    )
  );

-- I movimenti non si cancellano e non si riscrivono: un magazzino con la
-- storia modificabile non è un magazzino. Per correggere si fa una rettifica.
create policy "movimenti aggiornamento titolare" on public.movements for update to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare())
  with check (officina_id = public.officina_corrente());

create policy "storico prezzi lettura operativi" on public.price_history for select to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo());

create policy "storico prezzi inserimento operativi" on public.price_history for insert to authenticated
  with check (officina_id = public.officina_corrente() and public.e_operativo());

create policy "ordini operativi" on public.orders for all to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo())
  with check (officina_id = public.officina_corrente() and public.e_operativo());

-- ---------------------------------------------------------------------------
-- Preventivi — operatività piena, il meccanico non li vede nemmeno.
-- ---------------------------------------------------------------------------
create policy "preventivi operativi" on public.quotes for all to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo())
  with check (officina_id = public.officina_corrente() and public.e_operativo());

-- ---------------------------------------------------------------------------
-- Schede di lavoro
-- ---------------------------------------------------------------------------
create policy "schede lettura" on public.jobs for select to authenticated
  using (
    officina_id = public.officina_corrente()
    and (
      public.e_operativo()
      or employee_ids ? public.dipendente_corrente()::text
    )
  );

create policy "schede inserimento operativi" on public.jobs for insert to authenticated
  with check (officina_id = public.officina_corrente() and public.e_operativo());

-- Il meccanico può far avanzare le proprie schede: la scheda deve restare
-- sua sia prima sia dopo la modifica.
create policy "schede aggiornamento" on public.jobs for update to authenticated
  using (
    officina_id = public.officina_corrente()
    and (public.e_operativo() or employee_ids ? public.dipendente_corrente()::text)
  )
  with check (
    officina_id = public.officina_corrente()
    and (public.e_operativo() or employee_ids ? public.dipendente_corrente()::text)
  );

create policy "schede cancellazione operativi" on public.jobs for delete to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo() and invoice_id is null);

create policy "righe scheda lettura" on public.job_lines for select to authenticated
  using (
    officina_id = public.officina_corrente()
    and (
      public.e_operativo()
      or job_id in (
        select id from public.jobs where employee_ids ? public.dipendente_corrente()::text
      )
    )
  );

create policy "righe scheda inserimento" on public.job_lines for insert to authenticated
  with check (
    officina_id = public.officina_corrente()
    and (
      public.e_operativo()
      or job_id in (
        select id from public.jobs where employee_ids ? public.dipendente_corrente()::text
      )
    )
  );

create policy "righe scheda aggiornamento" on public.job_lines for update to authenticated
  using (
    officina_id = public.officina_corrente()
    and (
      public.e_operativo()
      or job_id in (
        select id from public.jobs where employee_ids ? public.dipendente_corrente()::text
      )
    )
  )
  with check (officina_id = public.officina_corrente());

create policy "righe scheda cancellazione" on public.job_lines for delete to authenticated
  using (
    officina_id = public.officina_corrente()
    and (
      public.e_operativo()
      or job_id in (
        select id from public.jobs where employee_ids ? public.dipendente_corrente()::text
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Fatture
--
-- Il titolare vede tutto. Il capofficina emette e rilegge solo gli ultimi
-- sette giorni: gli serve per lavorare, non basta per ricostruire il
-- fatturato del periodo. Il meccanico non vede nulla.
-- ---------------------------------------------------------------------------
create policy "fatture lettura titolare" on public.invoices for select to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare());

create policy "fatture lettura recente capofficina" on public.invoices for select to authenticated
  using (
    officina_id = public.officina_corrente()
    and public.ruolo_corrente() = 'capofficina'
    and data >= current_date - 7
  );

create policy "fatture emissione operativi" on public.invoices for insert to authenticated
  with check (officina_id = public.officina_corrente() and public.e_operativo());

create policy "fatture aggiornamento titolare" on public.invoices for update to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare())
  with check (officina_id = public.officina_corrente());

-- Le fatture non si cancellano: si annullano cambiando stato. Nessuna policy
-- di delete significa che non c'è modo di toglierle di mezzo dal client.

-- ---------------------------------------------------------------------------
-- Spese e ricorrenti — solo il titolare, in lettura e in scrittura.
-- ---------------------------------------------------------------------------
create policy "spese titolare" on public.expenses for all to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare())
  with check (officina_id = public.officina_corrente() and public.e_titolare());

create policy "ricorrenti titolare" on public.recurring for all to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare())
  with check (officina_id = public.officina_corrente() and public.e_titolare());

-- La ricezione di un ordine genera una spesa: la funzione ricevi_ordine() è
-- SECURITY INVOKER, quindi anche il capofficina deve poter inserire quella
-- singola riga. Solo l'inserimento, e solo in quella categoria.
create policy "spese da ordine capofficina" on public.expenses for insert to authenticated
  with check (
    officina_id = public.officina_corrente()
    and public.ruolo_corrente() = 'capofficina'
    and order_id is not null
    and categoria = 'Ricambi e materiali'
  );

-- ---------------------------------------------------------------------------
-- Personale
--
-- Il meccanico vede la propria riga e basta. Per i colleghi c'è la vista
-- `colleghi`, che espone nome, cognome, reparto e colore — nessuna paga,
-- nessun contratto, nessun recapito.
-- ---------------------------------------------------------------------------
create policy "personale lettura" on public.employees for select to authenticated
  using (
    officina_id = public.officina_corrente()
    and (public.e_operativo() or id = public.dipendente_corrente())
  );

create policy "personale scrittura operativi" on public.employees for insert to authenticated
  with check (officina_id = public.officina_corrente() and public.e_operativo());

create policy "personale modifica operativi" on public.employees for update to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo())
  with check (officina_id = public.officina_corrente());

create policy "personale cancellazione titolare" on public.employees for delete to authenticated
  using (officina_id = public.officina_corrente() and public.e_titolare());

create or replace view public.colleghi
with (security_invoker = true) as
  select id, officina_id, nome, cognome, reparto, colore, attivo
  from public.employees;

grant select on public.colleghi to authenticated;

create policy "turni lettura" on public.shifts for select to authenticated
  using (
    officina_id = public.officina_corrente()
    and (public.e_operativo() or employee_id = public.dipendente_corrente())
  );

create policy "turni scrittura operativi" on public.shifts for all to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo())
  with check (officina_id = public.officina_corrente() and public.e_operativo());

create policy "presenze lettura" on public.attendance for select to authenticated
  using (
    officina_id = public.officina_corrente()
    and (public.e_operativo() or employee_id = public.dipendente_corrente())
  );

create policy "presenze scrittura operativi" on public.attendance for all to authenticated
  using (officina_id = public.officina_corrente() and public.e_operativo())
  with check (officina_id = public.officina_corrente() and public.e_operativo());

-- Il meccanico può registrare le proprie ore, non quelle dei colleghi.
create policy "presenze proprie meccanico" on public.attendance for insert to authenticated
  with check (
    officina_id = public.officina_corrente()
    and employee_id = public.dipendente_corrente()
  );

insert into public._migrazioni (nome) values ('05-sicurezza');
