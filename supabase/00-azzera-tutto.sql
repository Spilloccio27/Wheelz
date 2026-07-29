-- ============================================================================
-- Wheelz — azzeramento completo, per ripartire da zero.
--
-- Cancella tutto quello che creano gli script da 01 a 06: tabelle, viste,
-- funzioni, trigger e policy. I bucket di storage restano (04 li aggiorna da
-- solo con un `on conflict`).
--
-- Verificato prima di proporlo: il database è vuoto, zero righe in tutte e
-- venti le tabelle. Se nel frattempo ci hai messo dei dati, FERMATI.
--
-- Dopo averlo eseguito, rilancia in ordine 01 → 02 → 03 → 04 → 05 → 06.
-- ============================================================================

-- Viste ----------------------------------------------------------------------
drop view if exists public.colleghi cascade;
drop view if exists public.riepilogo_officina cascade;

-- Tabelle (il cascade porta via indici, vincoli, trigger e policy) -----------
drop table if exists
  public.price_history,
  public.orders,
  public.expenses,
  public.recurring,
  public.invoices,
  public.movements,
  public.job_lines,
  public.jobs,
  public.quotes,
  public.attendance,
  public.shifts,
  public.employees,
  public.articles,
  public.suppliers,
  public.vehicles,
  public.customers,
  public.settings,
  public.invites,
  public.profiles,
  public.officine,
  public._migrazioni
cascade;

-- Funzioni -------------------------------------------------------------------
-- Il cascade toglie anche le policy di storage che le richiamano: le ricrea
-- 04-storage.sql.
drop function if exists public.officina_corrente() cascade;
drop function if exists public.ruolo_corrente() cascade;
drop function if exists public.e_titolare() cascade;
drop function if exists public.e_operativo() cascade;
drop function if exists public.dipendente_corrente() cascade;
drop function if exists public.fonda_officina(text, text) cascade;
drop function if exists public.riscatta_invito(text, text) cascade;
drop function if exists public.cambia_ruolo(uuid, text) cascade;
drop function if exists public.imposta_attivo(uuid, boolean) cascade;
drop function if exists public.blocca_cambio_ruolo() cascade;
drop function if exists public.protegge_ultimo_titolare() cascade;
drop function if exists public.registra_movimento(uuid, text, numeric, numeric, text, date, uuid, uuid, uuid) cascade;
drop function if exists public.ricevi_ordine(uuid, date) cascade;
drop function if exists public.genera_ricorrenti(uuid, date) cascade;
drop function if exists public.verifica_stessa_officina() cascade;
drop function if exists public.verifica_dipendente_profilo() cascade;

-- Policy di storage rimaste orfane -------------------------------------------
drop policy if exists "loghi lettura pubblica" on storage.objects;
drop policy if exists "loghi scrittura titolare" on storage.objects;
drop policy if exists "loghi aggiornamento titolare" on storage.objects;
drop policy if exists "loghi cancellazione titolare" on storage.objects;
drop policy if exists "documenti lettura officina" on storage.objects;
drop policy if exists "documenti scrittura officina" on storage.objects;
drop policy if exists "documenti aggiornamento officina" on storage.objects;
drop policy if exists "documenti cancellazione operativi" on storage.objects;

-- Controllo ------------------------------------------------------------------
-- Deve restituire zero righe.
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;
