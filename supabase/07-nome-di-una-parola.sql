-- ============================================================================
-- MechFlow — 07-nome-di-una-parola.sql
--
-- Correzione a `fonda_officina()` e `riscatta_invito()`.
--
-- IL DIFETTO
-- Il campo "nome e cognome" della registrazione veniva spezzato così:
--
--     nome    = prima parola
--     cognome = nullif(resto, '')
--
-- Con un nome di una parola sola — "Mattia", "Giuseppe" — il resto è una
-- stringa vuota, `nullif` la trasformava in NULL, e la colonna `cognome` è
-- NOT NULL: la registrazione si fermava con
--
--     null value in column "cognome" of relation "employees"
--     violates not-null constraint
--
-- Colpiva sia chi fonda l'officina sia chi entra con un invito, quindi
-- bastava un meccanico che scrivesse solo il nome per non farlo entrare.
--
-- LA CORREZIONE
-- Il cognome mancante diventa una stringa vuota, non NULL. Il calcolo è
-- spostato nelle variabili di dichiarazione, dove si legge.
--
-- Serve solo a chi ha già eseguito la vecchia versione di 02-auth.sql:
-- su un'installazione nuova il file 02 è già corretto e questo script si
-- limita a registrarsi.
-- ============================================================================

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '07-nome-di-una-parola') then
    raise exception 'Lo script 07 risulta già applicato. Non va eseguito due volte.';
  end if;
  if not exists (select 1 from public._migrazioni where nome = '02-auth') then
    raise exception 'Esegui prima 02-auth.sql.';
  end if;
end
$$;

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

grant execute on function public.fonda_officina(text, text) to authenticated;
grant execute on function public.riscatta_invito(text, text) to authenticated;

insert into public._migrazioni (nome) values ('07-nome-di-una-parola');
