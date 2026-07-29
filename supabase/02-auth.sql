-- ============================================================================
-- Wheelz — 02-auth.sql
-- Officine, profili, inviti e le funzioni che governano l'accesso.
--
-- Da eseguire dopo 01-schema.sql.
--
-- I tre principi che questo file mette per iscritto nel database:
--
--   1. i profili NON si creano dal client. Esistono due sole strade, entrambe
--      funzioni SECURITY DEFINER: `fonda_officina()` per chi apre la propria
--      officina, `riscatta_invito()` per chi entra in una esistente;
--   2. il ruolo NON è modificabile dall'utente. Un trigger rifiuta qualunque
--      variazione della colonna `ruolo` che non arrivi dal titolare della
--      stessa officina (o dal service_role, per le migrazioni);
--   3. l'ultimo titolare non si può togliere di mezzo: né cambiandogli ruolo,
--      né disattivandolo, né cancellandolo. Un'officina senza titolare è
--      un'officina che nessuno può più amministrare.
-- ============================================================================

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '02-auth') then
    raise exception 'Lo script 02-auth.sql risulta già applicato. Non va eseguito due volte.';
  end if;
  if not exists (select 1 from public._migrazioni where nome = '01-schema') then
    raise exception 'Esegui prima 01-schema.sql.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Officine
-- ---------------------------------------------------------------------------
create table public.officine (
  id               uuid primary key default gen_random_uuid(),
  ragione_sociale  text not null,
  creata_da        uuid references auth.users(id) on delete set null,
  attiva           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profili — un profilo per utente, sempre legato a una sola officina
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  officina_id  uuid not null references public.officine(id) on delete cascade,
  email        text not null,
  nome         text not null default '',
  ruolo        text not null default 'meccanico'
               check (ruolo in ('titolare', 'capofficina', 'meccanico')),
  employee_id  uuid references public.employees(id) on delete set null,
  attivo       boolean not null default true,
  created_at   date not null default current_date
);

create index profiles_officina_idx on public.profiles (officina_id);

-- ---------------------------------------------------------------------------
-- Inviti
-- ---------------------------------------------------------------------------
create table public.invites (
  id           uuid primary key default gen_random_uuid(),
  officina_id  uuid not null references public.officine(id) on delete cascade,
  email        text not null,
  ruolo        text not null default 'meccanico'
               check (ruolo in ('titolare', 'capofficina', 'meccanico')),
  codice       text not null unique,
  usato        boolean not null default false,
  usato_da     uuid references auth.users(id) on delete set null,
  usato_il     timestamptz,
  scadenza     date not null default (current_date + 14),
  created_at   date not null default current_date
);

create index invites_officina_idx on public.invites (officina_id);
create index invites_codice_idx on public.invites (upper(codice)) where usato = false;

-- ---------------------------------------------------------------------------
-- Funzioni di contesto
--
-- SECURITY DEFINER e non STABLE per caso: le policy RLS di quasi tutte le
-- tabelle chiamano `officina_corrente()`, e se quella funzione leggesse
-- `profiles` sotto RLS avremmo una ricorsione infinita. Definendola come
-- owner della tabella si legge il profilo una volta e si esce.
-- ---------------------------------------------------------------------------
create or replace function public.officina_corrente()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.officina_id
  from public.profiles p
  where p.id = auth.uid() and p.attivo
$$;

create or replace function public.ruolo_corrente()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.ruolo
  from public.profiles p
  where p.id = auth.uid() and p.attivo
$$;

create or replace function public.e_titolare()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.ruolo_corrente() = 'titolare', false)
$$;

create or replace function public.e_operativo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.ruolo_corrente() in ('titolare', 'capofficina'), false)
$$;

/**
 * employee_id del profilo corrente: serve alle policy del meccanico, che
 * vede soltanto le proprie schede, le proprie ore e i propri turni.
 */
create or replace function public.dipendente_corrente()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.employee_id
  from public.profiles p
  where p.id = auth.uid() and p.attivo
$$;

grant execute on function public.officina_corrente() to authenticated;
grant execute on function public.ruolo_corrente() to authenticated;
grant execute on function public.e_titolare() to authenticated;
grant execute on function public.e_operativo() to authenticated;
grant execute on function public.dipendente_corrente() to authenticated;

-- ---------------------------------------------------------------------------
-- fonda_officina — chi si registra senza invito apre la propria officina e ne
-- diventa titolare. Crea officina, profilo, impostazioni e la scheda personale.
-- ---------------------------------------------------------------------------
create or replace function public.fonda_officina(
  p_ragione_sociale text,
  p_nome            text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_utente    uuid := auth.uid();
  v_email     text;
  v_officina  uuid;
  v_dip       uuid;
  -- Chi si registra scrive quello che vuole nel campo "nome e cognome":
  -- una parola sola, tre parole, o niente. `cognome` è NOT NULL, quindi la
  -- parte mancante dev'essere una stringa vuota e non NULL.
  v_completo  text := trim(coalesce(p_nome, ''));
  v_nome      text := coalesce(nullif(split_part(v_completo, ' ', 1), ''), 'Titolare');
  v_cognome   text := trim(substr(v_completo, length(split_part(v_completo, ' ', 1)) + 1));
begin
  if v_utente is null then
    raise exception 'Serve un utente autenticato.' using errcode = '42501';
  end if;

  -- Un'officina per registrazione: se il profilo esiste già, non se ne fonda
  -- una seconda. La funzione è quindi anche idempotente.
  if exists (select 1 from public.profiles where id = v_utente) then
    raise exception 'Questo utente appartiene già a un’officina.' using errcode = '23505';
  end if;

  select email into v_email from auth.users where id = v_utente;

  insert into public.officine (ragione_sociale, creata_da)
  values (coalesce(nullif(trim(p_ragione_sociale), ''), 'La mia officina'), v_utente)
  returning id into v_officina;

  insert into public.settings (officina_id, ragione_sociale)
  values (v_officina, coalesce(nullif(trim(p_ragione_sociale), ''), 'La mia officina'));

  insert into public.employees (officina_id, nome, cognome, ruolo, reparto, email, data_assunzione)
  values (v_officina, v_nome, v_cognome, 'titolare', 'Direzione', v_email, current_date)
  returning id into v_dip;

  insert into public.profiles (id, officina_id, email, nome, ruolo, employee_id)
  values (v_utente, v_officina, v_email, coalesce(nullif(trim(p_nome), ''), v_email), 'titolare', v_dip);

  return v_officina;
end
$$;

grant execute on function public.fonda_officina(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- riscatta_invito — atomico per costruzione.
--
-- Il `for update` sulla riga dell'invito serializza due riscatti simultanei:
-- il secondo trova `usato = true` e viene respinto. Un invito vale una volta
-- sola, anche se il codice gira in una chat di gruppo.
-- ---------------------------------------------------------------------------
create or replace function public.riscatta_invito(
  p_codice text,
  p_nome   text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_utente    uuid := auth.uid();
  v_email     text;
  v_invito    public.invites%rowtype;
  v_dip       uuid;
  -- Stessa cautela di fonda_officina: `cognome` è NOT NULL, e chi arriva su
  -- invito può benissimo scrivere solo il proprio nome.
  v_completo  text := trim(coalesce(p_nome, ''));
  v_nome      text := coalesce(nullif(split_part(v_completo, ' ', 1), ''), 'Nuovo');
  v_cognome   text := trim(substr(v_completo, length(split_part(v_completo, ' ', 1)) + 1));
begin
  if v_utente is null then
    raise exception 'Serve un utente autenticato.' using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where id = v_utente) then
    raise exception 'Questo utente appartiene già a un’officina.' using errcode = '23505';
  end if;

  select * into v_invito
  from public.invites
  where upper(codice) = upper(trim(p_codice))
  for update;

  if not found then
    raise exception 'Codice invito non valido.' using errcode = '22023';
  end if;
  if v_invito.usato then
    raise exception 'Questo invito è già stato utilizzato.' using errcode = '22023';
  end if;
  if v_invito.scadenza < current_date then
    raise exception 'Questo invito è scaduto.' using errcode = '22023';
  end if;

  select email into v_email from auth.users where id = v_utente;

  -- L'invito è nominale: se è stato emesso per un indirizzo, deve essere
  -- quello. Altrimenti basterebbe farsi passare il codice da un collega.
  if nullif(trim(v_invito.email), '') is not null
     and lower(trim(v_invito.email)) <> lower(v_email) then
    raise exception 'Questo invito è intestato a un altro indirizzo email.' using errcode = '42501';
  end if;

  insert into public.employees (officina_id, nome, cognome, ruolo, reparto, email, data_assunzione)
  values (
    v_invito.officina_id,
    v_nome,
    v_cognome,
    v_invito.ruolo,
    case when v_invito.ruolo = 'meccanico' then 'Meccanica' else 'Accettazione' end,
    v_email,
    current_date
  )
  returning id into v_dip;

  insert into public.profiles (id, officina_id, email, nome, ruolo, employee_id)
  values (v_utente, v_invito.officina_id, v_email,
          coalesce(nullif(trim(p_nome), ''), v_email), v_invito.ruolo, v_dip);

  update public.invites
  set usato = true, usato_da = v_utente, usato_il = now()
  where id = v_invito.id;

  return v_invito.officina_id;
end
$$;

grant execute on function public.riscatta_invito(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger: il ruolo non si cambia da soli
-- ---------------------------------------------------------------------------
create or replace function public.blocca_cambio_ruolo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_chiamante_ruolo    text;
  v_chiamante_officina uuid;
begin
  -- Il service_role (script di migrazione, seed, cron) non passa da auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if new.ruolo is distinct from old.ruolo then
    select ruolo, officina_id into v_chiamante_ruolo, v_chiamante_officina
    from public.profiles where id = auth.uid();

    if v_chiamante_ruolo is distinct from 'titolare'
       or v_chiamante_officina is distinct from old.officina_id then
      raise exception 'Il ruolo può essere modificato soltanto dal titolare dell’officina.'
        using errcode = '42501';
    end if;

    -- Nemmeno il titolare può degradare sé stesso se è rimasto l'unico.
    if old.ruolo = 'titolare'
       and (select count(*) from public.profiles
            where officina_id = old.officina_id and ruolo = 'titolare' and attivo) <= 1 then
      raise exception 'Non puoi rimuovere l’ultimo titolare dell’officina.' using errcode = '42501';
    end if;
  end if;

  -- L'officina di appartenenza non si cambia: si esce e si entra con invito.
  if new.officina_id is distinct from old.officina_id then
    raise exception 'L’officina di un profilo non è modificabile.' using errcode = '42501';
  end if;

  -- Disattivare l'ultimo titolare equivale a rimuoverlo.
  if old.attivo and not new.attivo and old.ruolo = 'titolare'
     and (select count(*) from public.profiles
          where officina_id = old.officina_id and ruolo = 'titolare' and attivo) <= 1 then
    raise exception 'Non puoi disattivare l’ultimo titolare dell’officina.' using errcode = '42501';
  end if;

  return new;
end
$$;

create trigger profiles_blocca_cambio_ruolo
  before update on public.profiles
  for each row execute function public.blocca_cambio_ruolo();

create or replace function public.protegge_ultimo_titolare()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Nessun utente autenticato significa che la cancellazione arriva dalla
  -- console o da uno script con la chiave di servizio — tipicamente perché si
  -- sta eliminando l'utente da Supabase, e la riga qui sparisce in cascata.
  -- Chi ha le chiavi del database non ha bisogno di essere protetto da sé
  -- stesso, e senza questa eccezione l'utente diventava incancellabile.
  -- La guardia resta dov'è utile: dentro l'applicazione, dove `auth.uid()`
  -- c'è sempre. Per `anon` la policy di cancellazione non passa comunque.
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

create trigger profiles_protegge_ultimo_titolare
  before delete on public.profiles
  for each row execute function public.protegge_ultimo_titolare();

-- ---------------------------------------------------------------------------
-- Cambio ruolo e attivazione: unica via consentita al client
-- ---------------------------------------------------------------------------
create or replace function public.cambia_ruolo(p_profilo uuid, p_ruolo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.e_titolare() then
    raise exception 'Solo il titolare può cambiare i ruoli.' using errcode = '42501';
  end if;
  if p_ruolo not in ('titolare', 'capofficina', 'meccanico') then
    raise exception 'Ruolo non valido.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_profilo and officina_id = public.officina_corrente()
  ) then
    raise exception 'Profilo non trovato in questa officina.' using errcode = '42501';
  end if;

  update public.profiles set ruolo = p_ruolo where id = p_profilo;
end
$$;

create or replace function public.imposta_attivo(p_profilo uuid, p_attivo boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.e_titolare() then
    raise exception 'Solo il titolare può attivare o disattivare gli utenti.' using errcode = '42501';
  end if;
  if p_profilo = auth.uid() and not p_attivo then
    raise exception 'Non puoi disattivare te stesso.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = p_profilo and officina_id = public.officina_corrente()
  ) then
    raise exception 'Profilo non trovato in questa officina.' using errcode = '42501';
  end if;

  update public.profiles set attivo = p_attivo where id = p_profilo;
end
$$;

grant execute on function public.cambia_ruolo(uuid, text) to authenticated;
grant execute on function public.imposta_attivo(uuid, boolean) to authenticated;

insert into public._migrazioni (nome) values ('02-auth');
