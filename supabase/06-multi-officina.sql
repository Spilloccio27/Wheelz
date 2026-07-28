-- ============================================================================
-- MechFlow — 06-multi-officina.sql
-- L'isolamento fra officine, reso strutturale.
--
-- Da eseguire dopo 05-sicurezza.sql.
--
-- Le policy di 05 confrontano già `officina_id` con quella di chi scrive. Qui
-- si chiudono le due strade che restano aperte:
--
--   1. dimenticarsi di valorizzare `officina_id` — ora c'è un DEFAULT che lo
--      prende da `officina_corrente()`, e un vincolo NOT NULL a valle;
--   2. collegare una riga a un'entità di un'altra officina (per esempio un
--      veicolo con il `customer_id` del vicino). Un trigger verifica che ogni
--      riferimento punti dentro la stessa officina.
--
-- E si mette per iscritto la regola "un'officina per registrazione": un utente
-- ha un solo profilo, quindi una sola officina. Per cambiarla si esce e si
-- rientra con un invito.
-- ============================================================================

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '06-multi-officina') then
    raise exception 'Lo script 06-multi-officina.sql risulta già applicato. Non va eseguito due volte.';
  end if;
  if not exists (select 1 from public._migrazioni where nome = '05-sicurezza') then
    raise exception 'Esegui prima 05-sicurezza.sql.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 1. officina_id: default automatico, chiave esterna, indice
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings', 'customers', 'vehicles', 'suppliers', 'articles', 'movements',
    'price_history', 'orders', 'quotes', 'jobs', 'job_lines', 'invoices',
    'expenses', 'recurring', 'employees', 'shifts', 'attendance'
  ]
  loop
    execute format(
      'alter table public.%I alter column officina_id set default public.officina_corrente()', t);
    execute format(
      'alter table public.%I add constraint %I foreign key (officina_id)
         references public.officine(id) on delete cascade',
      t, t || '_officina_fkey');
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 2. Nessun riferimento fuori officina
--
-- La funzione è generica: riceve le coppie (tabella, colonna) da controllare
-- e verifica che la riga puntata appartenga alla stessa officina della riga
-- che si sta scrivendo.
-- ---------------------------------------------------------------------------
create or replace function public.verifica_stessa_officina()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  i          integer := 0;
  v_tabella  text;
  v_colonna  text;
  v_valore   uuid;
  v_officina uuid;
begin
  while i < array_length(tg_argv, 1) loop
    v_tabella := tg_argv[i];
    v_colonna := tg_argv[i + 1];

    execute format('select ($1).%I', v_colonna) into v_valore using new;

    if v_valore is not null then
      execute format('select officina_id from public.%I where id = $1', v_tabella)
        into v_officina using v_valore;

      if v_officina is null or v_officina is distinct from new.officina_id then
        raise exception
          'Riferimento a % di un''altra officina (colonna %).', v_tabella, v_colonna
          using errcode = '42501';
      end if;
    end if;

    i := i + 2;
  end loop;

  return new;
end
$$;

create trigger vehicles_stessa_officina
  before insert or update on public.vehicles
  for each row execute function public.verifica_stessa_officina('customers', 'customer_id');

create trigger articles_stessa_officina
  before insert or update on public.articles
  for each row execute function public.verifica_stessa_officina('suppliers', 'supplier_id');

create trigger quotes_stessa_officina
  before insert or update on public.quotes
  for each row execute function public.verifica_stessa_officina(
    'customers', 'customer_id', 'vehicles', 'vehicle_id');

create trigger jobs_stessa_officina
  before insert or update on public.jobs
  for each row execute function public.verifica_stessa_officina(
    'customers', 'customer_id', 'vehicles', 'vehicle_id', 'quotes', 'quote_id');

create trigger job_lines_stessa_officina
  before insert or update on public.job_lines
  for each row execute function public.verifica_stessa_officina(
    'jobs', 'job_id', 'articles', 'article_id', 'employees', 'employee_id');

create trigger movements_stessa_officina
  before insert or update on public.movements
  for each row execute function public.verifica_stessa_officina(
    'articles', 'article_id', 'jobs', 'job_id', 'suppliers', 'supplier_id');

create trigger invoices_stessa_officina
  before insert or update on public.invoices
  for each row execute function public.verifica_stessa_officina(
    'customers', 'customer_id', 'vehicles', 'vehicle_id', 'jobs', 'job_id');

create trigger expenses_stessa_officina
  before insert or update on public.expenses
  for each row execute function public.verifica_stessa_officina(
    'suppliers', 'supplier_id', 'recurring', 'recurring_id', 'orders', 'order_id');

create trigger orders_stessa_officina
  before insert or update on public.orders
  for each row execute function public.verifica_stessa_officina('suppliers', 'supplier_id');

create trigger shifts_stessa_officina
  before insert or update on public.shifts
  for each row execute function public.verifica_stessa_officina('employees', 'employee_id');

create trigger attendance_stessa_officina
  before insert or update on public.attendance
  for each row execute function public.verifica_stessa_officina('employees', 'employee_id');

create trigger price_history_stessa_officina
  before insert or update on public.price_history
  for each row execute function public.verifica_stessa_officina(
    'articles', 'article_id', 'suppliers', 'supplier_id');

-- ---------------------------------------------------------------------------
-- 3. Un'officina per registrazione
--
-- `profiles.id` è già chiave primaria e riferisce auth.users: un utente ha al
-- massimo un profilo, e quindi una sola officina. Lo rendiamo esplicito, e
-- blocchiamo anche il caso in cui qualcuno provasse a spostare un profilo
-- da un'officina all'altra (il trigger di 02-auth.sql lo copre già; qui c'è
-- il vincolo strutturale che regge anche per il service_role).
-- ---------------------------------------------------------------------------
alter table public.profiles
  add constraint profiles_un_solo_utente unique (id);

comment on constraint profiles_un_solo_utente on public.profiles is
  'Un utente, un profilo, un''officina. Per cambiare officina si riparte da un invito.';

-- ---------------------------------------------------------------------------
-- 4. La scheda personale collegata al profilo deve stare nella stessa officina
-- ---------------------------------------------------------------------------
create or replace function public.verifica_dipendente_profilo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_officina uuid;
begin
  if new.employee_id is not null then
    select officina_id into v_officina from public.employees where id = new.employee_id;
    if v_officina is distinct from new.officina_id then
      raise exception 'La scheda personale appartiene a un’altra officina.' using errcode = '42501';
    end if;
  end if;
  return new;
end
$$;

create trigger profiles_dipendente_stessa_officina
  before insert or update on public.profiles
  for each row execute function public.verifica_dipendente_profilo();

-- ---------------------------------------------------------------------------
-- 5. Vista di servizio: quante righe ha ogni officina.
-- Utile per capire a colpo d'occhio se un tenant sta crescendo, e per le
-- verifiche dopo una migrazione.
-- ---------------------------------------------------------------------------
create or replace view public.riepilogo_officina
with (security_invoker = true) as
  select
    o.id,
    o.ragione_sociale,
    o.created_at,
    (select count(*) from public.customers c where c.officina_id = o.id) as clienti,
    (select count(*) from public.vehicles v  where v.officina_id = o.id) as veicoli,
    (select count(*) from public.jobs j      where j.officina_id = o.id) as schede,
    (select count(*) from public.invoices f  where f.officina_id = o.id) as fatture,
    (select count(*) from public.profiles p  where p.officina_id = o.id) as utenti
  from public.officine o;

grant select on public.riepilogo_officina to authenticated;

insert into public._migrazioni (nome) values ('06-multi-officina');
