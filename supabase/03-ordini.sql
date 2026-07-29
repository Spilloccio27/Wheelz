-- ============================================================================
-- Wheelz — 03-ordini.sql
-- Ordini a fornitore, storico prezzi d'acquisto e le due funzioni che tengono
-- in piedi il magazzino: `registra_movimento` e `ricevi_ordine`.
--
-- Da eseguire dopo 02-auth.sql.
--
-- Perché queste due operazioni stanno nel database e non solo nel client:
-- toccano più tabelle insieme (movimento + articolo + storico prezzi, oppure
-- ordine + n carichi + spesa) e devono essere atomiche. Se il browser si
-- chiude a metà, il magazzino non deve restare a metà.
-- ============================================================================

do $$
begin
  if exists (select 1 from public._migrazioni where nome = '03-ordini') then
    raise exception 'Lo script 03-ordini.sql risulta già applicato. Non va eseguito due volte.';
  end if;
  if not exists (select 1 from public._migrazioni where nome = '02-auth') then
    raise exception 'Esegui prima 02-auth.sql.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Ordini a fornitore
-- ---------------------------------------------------------------------------
create table public.orders (
  id              uuid primary key default gen_random_uuid(),
  officina_id     uuid not null,
  numero          text not null,
  supplier_id     uuid references public.suppliers(id) on delete restrict,
  stato           text not null default 'bozza'
                  check (stato in ('bozza', 'inviato', 'ricevuto', 'annullato')),
  data_ordine     date not null default current_date,
  data_prevista   date,
  data_ricezione  date,
  righe           jsonb not null default '[]'::jsonb,
  expense_id      uuid references public.expenses(id) on delete set null,
  note            text default '',
  created_at      date not null default current_date,
  unique (officina_id, numero)
);

create index orders_officina_idx on public.orders (officina_id, data_ordine desc);
create index orders_supplier_idx on public.orders (supplier_id);

alter table public.movements
  add constraint movements_order_id_fkey foreign key (order_id)
  references public.orders(id) on delete set null;

alter table public.expenses
  add constraint expenses_order_id_fkey foreign key (order_id)
  references public.orders(id) on delete set null;

-- ---------------------------------------------------------------------------
-- Storico prezzi d'acquisto
-- ---------------------------------------------------------------------------
create table public.price_history (
  id           uuid primary key default gen_random_uuid(),
  officina_id  uuid not null,
  article_id   uuid not null references public.articles(id) on delete cascade,
  supplier_id  uuid references public.suppliers(id) on delete set null,
  prezzo       numeric(12,4) not null,
  quantita     numeric(12,3) not null default 0,
  order_id     uuid references public.orders(id) on delete set null,
  data         date not null default current_date,
  created_at   date not null default current_date
);

create index price_history_article_idx on public.price_history (article_id, data desc);
create index price_history_officina_idx on public.price_history (officina_id, data desc);

-- ---------------------------------------------------------------------------
-- registra_movimento — l'unico modo corretto di muovere la giacenza.
--
-- Sul carico ricalcola il prezzo medio ponderato:
--     (giacenza × prezzoMedio + qta × prezzoCarico) / (giacenza + qta)
-- con la stessa eccezione del client: a giacenza nulla o negativa fa testo il
-- prezzo del carico, perché mediare su una giacenza inesistente produrrebbe
-- un costo inventato.
-- ---------------------------------------------------------------------------
create or replace function public.registra_movimento(
  p_article_id  uuid,
  p_tipo        text,
  p_quantita    numeric,
  p_prezzo      numeric default null,
  p_causale     text default '',
  p_data        date default current_date,
  p_job_id      uuid default null,
  p_order_id    uuid default null,
  p_supplier_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_art       public.articles%rowtype;
  v_giacenza  numeric;
  v_medio     numeric;
  v_prezzo    numeric;
  v_mov       uuid;
begin
  if p_tipo not in ('carico', 'scarico', 'reso', 'rettifica') then
    raise exception 'Tipo di movimento non valido: %', p_tipo using errcode = '22023';
  end if;
  if coalesce(p_quantita, 0) = 0 then
    raise exception 'La quantità del movimento non può essere zero.' using errcode = '22023';
  end if;
  if p_tipo <> 'rettifica' and p_quantita < 0 then
    raise exception 'La quantità deve essere positiva.' using errcode = '22023';
  end if;

  -- Il lock serializza due scarichi sullo stesso articolo: senza, due schede
  -- aperte insieme potrebbero prendere lo stesso ultimo pezzo.
  select * into v_art from public.articles where id = p_article_id for update;
  if not found then
    raise exception 'Articolo non trovato.' using errcode = '22023';
  end if;

  v_giacenza := v_art.giacenza;
  v_medio    := v_art.prezzo_medio;
  v_prezzo   := coalesce(p_prezzo, v_medio);

  if p_tipo = 'carico' then
    if v_giacenza <= 0 then
      v_medio := v_prezzo;
    else
      v_medio := (v_giacenza * v_medio + p_quantita * v_prezzo) / (v_giacenza + p_quantita);
    end if;
    v_giacenza := v_giacenza + p_quantita;

  elsif p_tipo in ('scarico', 'reso') then
    if p_quantita > v_giacenza then
      raise exception 'Giacenza insufficiente per %: disponibili %.', v_art.descrizione, v_giacenza
        using errcode = '23514';
    end if;
    v_giacenza := v_giacenza - p_quantita;
    v_prezzo := v_medio;  -- esce al costo con cui è entrato

  else -- rettifica
    if v_giacenza + p_quantita < 0 then
      raise exception 'La rettifica porterebbe la giacenza sotto zero.' using errcode = '23514';
    end if;
    v_giacenza := v_giacenza + p_quantita;
  end if;

  insert into public.movements
    (officina_id, article_id, tipo, quantita, prezzo_unitario, causale, data,
     job_id, order_id, supplier_id)
  values
    (v_art.officina_id, p_article_id, p_tipo, p_quantita, round(v_prezzo, 4), p_causale, p_data,
     p_job_id, p_order_id, p_supplier_id)
  returning id into v_mov;

  update public.articles
  set giacenza       = round(v_giacenza, 3),
      prezzo_medio   = round(v_medio, 4),
      prezzo_listino = round(round(v_medio, 4) * (1 + coalesce(ricarico, 0)), 2)
  where id = p_article_id;

  if p_tipo = 'carico' then
    insert into public.price_history
      (officina_id, article_id, supplier_id, prezzo, quantita, order_id, data)
    values
      (v_art.officina_id, p_article_id, coalesce(p_supplier_id, v_art.supplier_id),
       round(v_prezzo, 4), p_quantita, p_order_id, p_data);
  end if;

  return v_mov;
end
$$;

grant execute on function public.registra_movimento(uuid, text, numeric, numeric, text, date, uuid, uuid, uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- ricevi_ordine — carico di tutte le righe + spesa generata, in transazione.
-- Idempotente: un ordine già ricevuto non si carica una seconda volta.
-- ---------------------------------------------------------------------------
create or replace function public.ricevi_ordine(
  p_order_id uuid,
  p_data     date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_ordine      public.orders%rowtype;
  v_riga        jsonb;
  v_imponibile  numeric := 0;
  v_spesa       uuid;
  v_iva         numeric;
begin
  select * into v_ordine from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Ordine non trovato.' using errcode = '22023';
  end if;
  if v_ordine.stato = 'ricevuto' then
    return v_ordine.expense_id;  -- già fatto, nulla da rifare
  end if;

  for v_riga in select * from jsonb_array_elements(v_ordine.righe)
  loop
    if (v_riga->>'articleId') is null then
      continue;
    end if;
    perform public.registra_movimento(
      (v_riga->>'articleId')::uuid,
      'carico',
      (v_riga->>'quantita')::numeric,
      (v_riga->>'prezzo')::numeric,
      'Ricezione ordine ' || v_ordine.numero,
      p_data,
      null,
      v_ordine.id,
      v_ordine.supplier_id
    );
    v_imponibile := v_imponibile
      + (v_riga->>'quantita')::numeric * (v_riga->>'prezzo')::numeric;
  end loop;

  select aliquota_iva_default into v_iva
  from public.settings where officina_id = v_ordine.officina_id;

  insert into public.expenses
    (officina_id, data, categoria, descrizione, supplier_id, imponibile, aliquota_iva,
     tipo, stato, scadenza, metodo_pagamento, order_id)
  values
    (v_ordine.officina_id, p_data, 'Ricambi e materiali',
     'Fornitura ricambi — ordine ' || v_ordine.numero, v_ordine.supplier_id,
     round(v_imponibile, 2), coalesce(v_iva, 22), 'variabile', 'da_pagare',
     p_data + 30, 'Bonifico', v_ordine.id)
  returning id into v_spesa;

  update public.orders
  set stato = 'ricevuto', data_ricezione = p_data, expense_id = v_spesa
  where id = p_order_id;

  return v_spesa;
end
$$;

grant execute on function public.ricevi_ordine(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- genera_ricorrenti — la stessa idempotenza di `generateRecurring` lato client,
-- ma garantita dall'indice unico su (recurring_id, mese) creato in 01-schema.
-- Utile per farla girare da un cron di Supabase il primo del mese.
-- ---------------------------------------------------------------------------
create or replace function public.genera_ricorrenti(
  p_officina uuid default null,
  p_mese     date default date_trunc('month', current_date)::date
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_officina uuid := coalesce(p_officina, public.officina_corrente());
  v_t        public.recurring%rowtype;
  v_data     date;
  v_creati   integer := 0;
begin
  for v_t in
    select * from public.recurring
    where officina_id = v_officina and attivo
  loop
    v_data := (date_trunc('month', p_mese) + (v_t.giorno_mese - 1) * interval '1 day')::date;

    if v_t.data_inizio is not null and v_data < v_t.data_inizio then continue; end if;
    if v_t.data_fine   is not null and v_data > v_t.data_fine   then continue; end if;

    begin
      insert into public.expenses
        (officina_id, data, categoria, descrizione, supplier_id, imponibile, aliquota_iva,
         tipo, stato, scadenza, recurring_id, note)
      values
        (v_officina, v_data, v_t.categoria, v_t.descrizione, v_t.supplier_id,
         v_t.imponibile, v_t.aliquota_iva, v_t.tipo, 'da_pagare', v_data + 15, v_t.id,
         'Generata da spesa ricorrente.');
      v_creati := v_creati + 1;
    exception when unique_violation then
      -- già generata per questo mese: è esattamente il comportamento voluto
      null;
    end;
  end loop;

  return v_creati;
end
$$;

grant execute on function public.genera_ricorrenti(uuid, date) to authenticated;

insert into public._migrazioni (nome) values ('03-ordini');
