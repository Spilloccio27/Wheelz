-- ============================================================================
-- MechFlow — 01-schema.sql
-- Tabelle di dominio dell'officina.
--
-- Da eseguire per primo, nell'SQL Editor di Supabase.
-- Lo script è idempotente per rifiuto: se è già stato applicato, si ferma con
-- un errore invece di rifare il lavoro. Il registro è la tabella _migrazioni.
--
-- Convenzione sui nomi: le colonne sono snake_case, i campi JavaScript sono
-- camelCase, e dataService.js traduce automaticamente nei due versi
-- (prezzo_medio ⇄ prezzoMedio). Aggiungere una colonna non richiede toccare
-- nessuna mappa: basta rispettare la convenzione.
-- ============================================================================

create extension if not exists "pgcrypto";

create table if not exists public._migrazioni (
  nome          text primary key,
  applicata_il  timestamptz not null default now()
);

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '01-schema') then
    raise exception
      'Lo script 01-schema.sql risulta già applicato (%). Non va eseguito due volte.',
      (select applicata_il from public._migrazioni where nome = '01-schema');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Clienti
-- ---------------------------------------------------------------------------
create table public.customers (
  id              uuid primary key default gen_random_uuid(),
  officina_id     uuid not null,
  tipo            text not null default 'privato' check (tipo in ('privato', 'azienda')),
  nome            text default '',
  cognome         text default '',
  ragione_sociale text default '',
  codice_fiscale  text default '',
  piva            text default '',
  sdi             text default '',
  pec             text default '',
  telefono        text default '',
  cellulare       text default '',
  email           text default '',
  indirizzo       text default '',
  cap             text default '',
  citta           text default '',
  provincia       text default '',
  note            text default '',
  attivo          boolean not null default true,
  created_at      date not null default current_date
);

-- ---------------------------------------------------------------------------
-- Veicoli
-- ---------------------------------------------------------------------------
create table public.vehicles (
  id                       uuid primary key default gen_random_uuid(),
  officina_id              uuid not null,
  customer_id              uuid references public.customers(id) on delete restrict,
  targa                    text not null,
  vin                      text default '',
  marca                    text default '',
  modello                  text default '',
  allestimento             text default '',
  anno                     integer,
  alimentazione            text default '',
  cilindrata               integer,
  potenza_kw               integer,
  km                       integer not null default 0,
  km_annui                 integer,
  colore                   text default '',
  tipo_pneumatici          text default '',
  misura_pneumatici        text default '',
  codice_motore            text default '',
  codice_chiave            text default '',
  scadenza_revisione       date,
  scadenza_bollo           date,
  scadenza_assicurazione   date,
  tagliando_data           date,
  tagliando_km             integer,
  prossimo_tagliando_data  date,
  prossimo_tagliando_km    integer,
  scadenza_distribuzione   date,
  distribuzione_km         integer,
  -- Solo il percorso nel bucket `documenti`, mai il file.
  foto_path                text,
  note                     text default '',
  attivo                   boolean not null default true,
  created_at               date not null default current_date,
  -- La targa è unica dentro l'officina, non nel mondo: due officine possono
  -- avere lo stesso veicolo in scheda.
  unique (officina_id, targa)
);

-- ---------------------------------------------------------------------------
-- Fornitori
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id                      uuid primary key default gen_random_uuid(),
  officina_id             uuid not null,
  ragione_sociale         text not null,
  tipo                    text not null default 'ricambista'
                          check (tipo in ('ricambista', 'terzista', 'servizi')),
  piva                    text default '',
  referente               text default '',
  telefono                text default '',
  email                   text default '',
  indirizzo               text default '',
  citta                   text default '',
  condizioni_pagamento    text default '',
  sconto_praticato        numeric(5,2) not null default 0,
  tempi_consegna_giorni   integer not null default 1,
  note                    text default '',
  attivo                  boolean not null default true,
  created_at              date not null default current_date
);

-- ---------------------------------------------------------------------------
-- Magazzino ricambi
-- ---------------------------------------------------------------------------
create table public.articles (
  id              uuid primary key default gen_random_uuid(),
  officina_id     uuid not null,
  codice          text not null,
  codice_oe       text default '',
  descrizione     text not null,
  marca           text default '',
  categoria       text default 'Altro',
  applicabilita   text default '',
  unita           text not null default 'pz',
  giacenza        numeric(12,3) not null default 0,
  scorta_minima   numeric(12,3) not null default 0,
  punto_riordino  numeric(12,3) not null default 0,
  ubicazione      text default '',
  -- Prezzo medio ponderato: quattro decimali perché sui minuteria a 0,15 €
  -- due decimali si mangiano il margine nell'arrotondamento.
  prezzo_medio    numeric(12,4) not null default 0,
  prezzo_listino  numeric(12,2) not null default 0,
  ricarico        numeric(6,4) not null default 0.38,
  aliquota_iva    numeric(5,2) not null default 22,
  supplier_id     uuid references public.suppliers(id) on delete set null,
  attivo          boolean not null default true,
  note            text default '',
  created_at      date not null default current_date,
  unique (officina_id, codice)
);

-- ---------------------------------------------------------------------------
-- Personale
-- ---------------------------------------------------------------------------
create table public.employees (
  id                uuid primary key default gen_random_uuid(),
  officina_id       uuid not null,
  nome              text not null default '',
  cognome           text not null default '',
  ruolo             text not null default 'meccanico'
                    check (ruolo in ('titolare', 'capofficina', 'meccanico')),
  reparto           text default '',
  contratto         text default '',
  livello           text default '',
  paga_oraria       numeric(10,2) not null default 0,
  specializzazione  text default '',
  data_assunzione   date,
  telefono          text default '',
  email             text default '',
  certificazioni    jsonb not null default '[]'::jsonb,
  colore            integer not null default 0,
  attivo            boolean not null default true,
  -- `produttivo` = può vendere ore su una scheda. Chi sta in accettazione o
  -- in amministrazione resta nel costo del lavoro ma esce dal denominatore
  -- della produttività: quelle ore non sono mai state fatturabili.
  produttivo        boolean not null default true,
  created_at        date not null default current_date
);

create table public.shifts (
  id           uuid primary key default gen_random_uuid(),
  officina_id  uuid not null,
  employee_id  uuid not null references public.employees(id) on delete cascade,
  data         date not null,
  ora_inizio   text not null default '08:00',
  ora_fine     text not null default '18:00',
  postazione   text default '',
  note         text default '',
  created_at   date not null default current_date
);

create table public.attendance (
  id                 uuid primary key default gen_random_uuid(),
  officina_id        uuid not null,
  employee_id        uuid not null references public.employees(id) on delete cascade,
  data               date not null,
  tipo               text not null default 'presenza'
                     check (tipo in ('presenza', 'ferie', 'permesso', 'malattia', 'festivo')),
  ore_ordinarie      numeric(6,2) not null default 0,
  ore_straordinario  numeric(6,2) not null default 0,
  ritardo_min        integer not null default 0,
  note               text default '',
  created_at         date not null default current_date,
  -- Una sola registrazione per persona e per giorno: due presenze lo stesso
  -- giorno vorrebbero dire ore contate due volte nella produttività.
  unique (employee_id, data)
);

-- ---------------------------------------------------------------------------
-- Preventivi
-- ---------------------------------------------------------------------------
create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  officina_id      uuid not null,
  numero           text not null,
  data             date not null default current_date,
  valido_al        date,
  customer_id      uuid references public.customers(id) on delete restrict,
  vehicle_id       uuid references public.vehicles(id) on delete set null,
  tipo_intervento  text default '',
  stato            text not null default 'bozza'
                   check (stato in ('bozza', 'inviato', 'accettato', 'rifiutato', 'scaduto')),
  righe            jsonb not null default '[]'::jsonb,
  sconto_globale   numeric(5,2) not null default 0,
  note             text default '',
  job_id           uuid,
  created_at       date not null default current_date,
  unique (officina_id, numero)
);

-- ---------------------------------------------------------------------------
-- Schede di lavoro
-- ---------------------------------------------------------------------------
create table public.jobs (
  id                      uuid primary key default gen_random_uuid(),
  officina_id             uuid not null,
  numero                  text not null,
  customer_id             uuid references public.customers(id) on delete restrict,
  vehicle_id              uuid references public.vehicles(id) on delete restrict,
  km_ingresso             integer not null default 0,
  tipo_intervento         text default '',
  difetto                 text default '',
  diagnosi                text default '',
  lavorazioni             text default '',
  stato                   text not null default 'accettato'
                          check (stato in ('accettato', 'in_lavorazione', 'attesa_ricambi',
                                           'pronto', 'consegnato', 'fatturato', 'annullato')),
  ponte                   integer,
  garanzia                boolean not null default false,
  job_origine_garanzia    uuid references public.jobs(id) on delete set null,
  ore_previste            numeric(6,2) not null default 0,
  data_apertura           date not null default current_date,
  data_inizio             date,
  data_consegna_prevista  date,
  data_consegna           date,
  employee_ids            jsonb not null default '[]'::jsonb,
  allegati                jsonb not null default '[]'::jsonb,
  note                    text default '',
  quote_id                uuid references public.quotes(id) on delete set null,
  invoice_id              uuid,
  created_at              date not null default current_date,
  unique (officina_id, numero)
);

alter table public.quotes
  add constraint quotes_job_id_fkey foreign key (job_id)
  references public.jobs(id) on delete set null;

create table public.job_lines (
  id              uuid primary key default gen_random_uuid(),
  officina_id     uuid not null,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  tipo            text not null default 'manodopera'
                  check (tipo in ('manodopera', 'ricambio', 'esterno')),
  descrizione     text not null default '',
  codice          text default '',
  article_id      uuid references public.articles(id) on delete set null,
  tariffa_id      text,
  ore             numeric(8,2),
  tariffa_oraria  numeric(10,2),
  costo_orario    numeric(10,4),
  quantita        numeric(12,3),
  prezzo          numeric(12,2),
  costo_unitario  numeric(12,4),
  sconto          numeric(5,2) not null default 0,
  aliquota_iva    numeric(5,2) not null default 22,
  employee_id     uuid references public.employees(id) on delete set null,
  data            date not null default current_date,
  created_at      date not null default current_date
);

-- ---------------------------------------------------------------------------
-- Movimenti di magazzino
-- ---------------------------------------------------------------------------
create table public.movements (
  id               uuid primary key default gen_random_uuid(),
  officina_id      uuid not null,
  article_id       uuid not null references public.articles(id) on delete restrict,
  tipo             text not null check (tipo in ('carico', 'scarico', 'reso', 'rettifica')),
  quantita         numeric(12,3) not null,
  prezzo_unitario  numeric(12,4) not null default 0,
  causale          text default '',
  job_id           uuid references public.jobs(id) on delete set null,
  order_id         uuid,
  supplier_id      uuid references public.suppliers(id) on delete set null,
  data             date not null default current_date,
  created_at       date not null default current_date
);

-- ---------------------------------------------------------------------------
-- Fatture
-- ---------------------------------------------------------------------------
create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  officina_id       uuid not null,
  numero            text not null,
  progressivo       integer not null,
  anno              integer not null,
  data              date not null default current_date,
  scadenza          date,
  customer_id       uuid references public.customers(id) on delete restrict,
  vehicle_id        uuid references public.vehicles(id) on delete set null,
  job_id            uuid references public.jobs(id) on delete set null,
  righe             jsonb not null default '[]'::jsonb,
  sconto_globale    numeric(5,2) not null default 0,
  stato             text not null default 'emessa'
                    check (stato in ('emessa', 'parziale', 'incassata', 'insoluta', 'annullata')),
  pagamenti         jsonb not null default '[]'::jsonb,
  metodo_pagamento  text,
  allegato_path     text,
  note              text default '',
  created_at        date not null default current_date,
  -- Numerazione progressiva per anno, senza buchi né doppioni: è un vincolo
  -- del database, non una buona intenzione dell'applicazione.
  unique (officina_id, anno, progressivo),
  unique (officina_id, numero)
);

alter table public.jobs
  add constraint jobs_invoice_id_fkey foreign key (invoice_id)
  references public.invoices(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Spese e ricorrenti
-- ---------------------------------------------------------------------------
create table public.recurring (
  id            uuid primary key default gen_random_uuid(),
  officina_id   uuid not null,
  descrizione   text not null,
  categoria     text not null default 'Altro',
  supplier_id   uuid references public.suppliers(id) on delete set null,
  imponibile    numeric(12,2) not null default 0,
  aliquota_iva  numeric(5,2) not null default 22,
  tipo          text not null default 'fisso' check (tipo in ('fisso', 'variabile')),
  giorno_mese   integer not null default 1 check (giorno_mese between 1 and 28),
  attivo        boolean not null default true,
  data_inizio   date,
  data_fine     date,
  created_at    date not null default current_date
);

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  officina_id       uuid not null,
  data              date not null default current_date,
  categoria         text not null default 'Altro',
  descrizione       text not null default '',
  supplier_id       uuid references public.suppliers(id) on delete set null,
  imponibile        numeric(12,2) not null default 0,
  aliquota_iva      numeric(5,2) not null default 22,
  tipo              text not null default 'variabile' check (tipo in ('fisso', 'variabile')),
  stato             text not null default 'da_pagare' check (stato in ('da_pagare', 'pagata')),
  scadenza          date,
  metodo_pagamento  text default '',
  allegato_path     text,
  allegato_nome     text,
  recurring_id      uuid references public.recurring(id) on delete set null,
  order_id          uuid,
  note              text default '',
  created_at        date not null default current_date
);

-- Una ricorrente genera una sola spesa per mese: è questo indice a rendere
-- idempotente `generateRecurring`, non la buona volontà del client.
--
-- Il cast a `timestamp` non è pignoleria: su una colonna `date` PostgreSQL
-- risolve `date_trunc` sulla variante con fuso orario, che è STABLE — e una
-- funzione STABLE in un indice viene rifiutata, perché il risultato
-- cambierebbe al cambiare del fuso della sessione. Con il cast esplicito si
-- usa `date_trunc(text, timestamp)`, che è IMMUTABLE.
create unique index expenses_ricorrente_mese_uidx
  on public.expenses (recurring_id, (date_trunc('month', data::timestamp)))
  where recurring_id is not null;

-- ---------------------------------------------------------------------------
-- Impostazioni (una riga per officina)
-- ---------------------------------------------------------------------------
create table public.settings (
  id                          uuid primary key default gen_random_uuid(),
  officina_id                 uuid not null unique,
  ragione_sociale             text not null default 'La mia officina',
  piva                        text default '',
  codice_fiscale              text default '',
  rea                         text default '',
  indirizzo                   text default '',
  cap                         text default '',
  citta                       text default '',
  provincia                   text default '',
  telefono                    text default '',
  email                       text default '',
  pec                         text default '',
  sito_web                    text default '',
  iban                        text default '',
  logo_path                   text,
  tariffe                     jsonb not null default
    '[{"id":"mecc","nome":"Meccanica generale","prezzoOrario":45},
      {"id":"diag","nome":"Diagnosi ed elettrauto","prezzoOrario":58},
      {"id":"clima","nome":"Climatizzazione","prezzoOrario":50},
      {"id":"gomm","nome":"Gommista","prezzoOrario":35},
      {"id":"carr","nome":"Carrozzeria","prezzoOrario":52}]'::jsonb,
  ricarico_ricambi            numeric(6,4) not null default 0.38,
  aliquota_iva_default        numeric(5,2) not null default 22,
  aliquote                    jsonb not null default '[22,10,4,0]'::jsonb,
  numero_ponti                integer not null default 3,
  ore_apertura                numeric(5,2) not null default 8,
  giorni_lavorativi           jsonb not null default '[1,2,3,4,5,6]'::jsonb,
  oneri_contributivi          numeric(6,4) not null default 0.32,
  giorni_pagamento_default    integer not null default 30,
  giorni_validita_preventivo  integer not null default 30,
  giorni_alert_scheda         integer not null default 5,
  giorni_alert_scadenze       integer not null default 30,
  obiettivi                   jsonb not null default
    '{"fatturatoMese":42000,"oreVenduteGiorno":18,"marginalita":0.55,
      "incidenzaRicambi":0.3,"produttivita":0.8}'::jsonb,
  numerazione                 jsonb not null default '{}'::jsonb,
  created_at                  date not null default current_date
);

-- ---------------------------------------------------------------------------
-- Indici: tutte le query dell'applicazione filtrano per officina, e quasi
-- tutte anche per data o per entità collegata.
-- ---------------------------------------------------------------------------
create index customers_officina_idx   on public.customers (officina_id);
create index vehicles_officina_idx    on public.vehicles (officina_id);
create index vehicles_customer_idx    on public.vehicles (customer_id);
create index vehicles_targa_idx       on public.vehicles (officina_id, upper(targa));
create index suppliers_officina_idx   on public.suppliers (officina_id);
create index articles_officina_idx    on public.articles (officina_id);
create index articles_ricerca_idx     on public.articles (officina_id, upper(codice), upper(codice_oe));
create index employees_officina_idx   on public.employees (officina_id);
create index shifts_officina_data_idx on public.shifts (officina_id, data);
create index attendance_off_data_idx  on public.attendance (officina_id, data);
create index attendance_emp_data_idx  on public.attendance (employee_id, data);
create index quotes_officina_data_idx on public.quotes (officina_id, data desc);
create index jobs_officina_data_idx   on public.jobs (officina_id, data_apertura desc);
create index jobs_stato_idx           on public.jobs (officina_id, stato);
create index jobs_vehicle_idx         on public.jobs (vehicle_id);
create index job_lines_job_idx        on public.job_lines (job_id);
create index job_lines_data_idx       on public.job_lines (officina_id, data);
create index job_lines_employee_idx   on public.job_lines (employee_id, data);
create index movements_article_idx    on public.movements (article_id, data desc);
create index movements_off_data_idx   on public.movements (officina_id, data desc);
create index invoices_officina_idx    on public.invoices (officina_id, data desc);
create index invoices_customer_idx    on public.invoices (customer_id);
create index invoices_scadenza_idx    on public.invoices (officina_id, scadenza) where stato <> 'incassata';
create index expenses_officina_idx    on public.expenses (officina_id, data desc);
create index recurring_officina_idx   on public.recurring (officina_id);

insert into public._migrazioni (nome) values ('01-schema');
