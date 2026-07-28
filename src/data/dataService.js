/**
 * ============================================================================
 * dataService — livello dati unico dell'applicazione
 * ============================================================================
 *
 * Nessun modulo dell'interfaccia parla con lo storage. Tutti passano da qui.
 * Il servizio tiene una copia in memoria dell'officina corrente (una sola
 * officina per utente: sono qualche migliaio di righe, non un data warehouse)
 * e la mantiene allineata scrivendo in write-through sul backend attivo.
 *
 * Due backend, stessa superficie pubblica:
 *  - `demo`     — dati generati da demoData.js, tutto in memoria, nessuna rete;
 *  - `supabase` — PostgreSQL con RLS, le stesse operazioni tradotte in query.
 *
 * Cambiare backend significa riscrivere solo le funzioni di questo file.
 * L'interfaccia non cambia di una riga.
 *
 * Conversione dei nomi: in JavaScript i campi sono camelCase, in PostgreSQL
 * snake_case. La traduzione è automatica e simmetrica (`prezzoMedio` ⇄
 * `prezzo_medio`), quindi aggiungere un campo non richiede toccare mappe.
 *
 * ----------------------------------------------------------------------------
 * MODELLO DATI
 * ----------------------------------------------------------------------------
 * Ogni riga di ogni tabella porta `id` (uuid) e `officinaId`: è la chiave su
 * cui si regge l'isolamento fra officine, verificata dalle policy RLS a ogni
 * lettura e a ogni scrittura.
 *
 * settings — riga unica per officina
 *   ragioneSociale, piva, codiceFiscale, rea, indirizzo, cap, citta, provincia,
 *   telefono, email, pec, iban, logoPath
 *   tariffe[]        {id, nome, prezzoOrario}  — tariffa oraria per lavorazione
 *   ricaricoRicambi  frazione (0.38 = 38%) applicata al prezzo medio ponderato
 *   aliquotaIvaDefault, aliquote[]
 *   numeroPonti, oreApertura, giorniLavorativi[]
 *   oneriContributivi          frazione, stima gestionale sul costo del lavoro
 *   giorniPagamentoDefault, giorniValiditaPreventivo
 *   giorniAlertScheda, giorniAlertScadenze
 *   obiettivi        {fatturatoMese, oreVenduteGiorno, marginalita,
 *                     incidenzaRicambi, produttivita}
 *
 * customers — clienti privati e aziende            ← vehicles, jobs, invoices
 *   tipo 'privato'|'azienda', nome, cognome, ragioneSociale, codiceFiscale,
 *   piva, sdi (codice destinatario), pec, telefono, cellulare, email,
 *   indirizzo, cap, citta, provincia, note, attivo
 *
 * vehicles — parco veicoli                                    → customers
 *   targa, vin, marca, modello, allestimento, anno, alimentazione, cilindrata,
 *   potenzaKw, km (aggiornati a ogni ingresso), kmAnnui, colore,
 *   tipoPneumatici, misuraPneumatici, codiceMotore, codiceChiave,
 *   scadenzaRevisione, scadenzaBollo, scadenzaAssicurazione,
 *   tagliandoData, tagliandoKm, prossimoTagliandoData, prossimoTagliandoKm,
 *   scadenzaDistribuzione, distribuzioneKm, note, attivo
 *
 * quotes — preventivi                              → customers, vehicles
 *   numero, data, validoAl, tipoIntervento, stato
 *     bozza → inviato → accettato | rifiutato | scaduto
 *   righe[] {id, tipo 'manodopera'|'ricambio', descrizione, codice, articleId,
 *            tariffaId, ore, tariffaOraria, quantita, prezzo, costoUnitario,
 *            sconto (0-100), aliquotaIva}
 *   scontoGlobale (0-100), note, jobId (valorizzato alla conversione)
 *
 * jobs — schede di lavoro (commesse)      → vehicles, customers, employees
 *   numero, kmIngresso, tipoIntervento, difetto, diagnosi, lavorazioni,
 *   stato: accettato → in_lavorazione → attesa_ricambi → pronto →
 *          consegnato → fatturato
 *   ponte, garanzia (bool), jobOrigineGaranzia, orePreviste,
 *   dataApertura, dataInizio, dataConsegnaPrevista, dataConsegna,
 *   employeeIds[], allegati[] {id, nome, tipo, path, data}, note,
 *   quoteId, invoiceId
 *
 * jobLines — righe della scheda                        → jobs, articles
 *   tipo 'manodopera'|'ricambio'|'esterno', descrizione, data
 *   manodopera: employeeId, tariffaId, ore, tariffaOraria, costoOrario
 *   ricambio:   articleId, codice, quantita, prezzo, costoUnitario
 *   comuni:     sconto (0-100), aliquotaIva
 *
 * articles — ricambi a magazzino                            → suppliers
 *   codice (interno), codiceOe (originale), descrizione, marca, categoria,
 *   applicabilita, unita, giacenza, scortaMinima, puntoRiordino, ubicazione,
 *   prezzoMedio (ponderato sui carichi), prezzoListino, ricarico,
 *   aliquotaIva, supplierId, attivo, note
 *
 * movements — movimenti di magazzino                → articles, jobs, orders
 *   tipo 'carico'|'scarico'|'reso'|'rettifica', quantita (con segno sulle
 *   rettifiche), prezzoUnitario, causale, data, jobId, orderId, supplierId
 *
 * priceHistory — prezzi d'acquisto storici       → articles, suppliers
 *   prezzo, quantita, data, orderId
 *
 * orders — ordini a fornitore                       → suppliers, articles
 *   numero, stato 'bozza'|'inviato'|'ricevuto'|'annullato',
 *   dataOrdine, dataPrevista, dataRicezione,
 *   righe[] {articleId, codice, descrizione, quantita, prezzo, aliquotaIva},
 *   expenseId (spesa generata alla ricezione), note
 *
 * suppliers — ricambisti, terzisti, servizi        ← articles, expenses
 *   ragioneSociale, tipo, piva, referente, telefono, email, indirizzo, citta,
 *   condizioniPagamento, scontoPraticato, tempiConsegnaGiorni, note, attivo
 *
 * invoices — fatture e incassi                          → jobs, customers
 *   numero ("12/2025"), progressivo, anno, data, scadenza, vehicleId,
 *   righe[] (stessa forma delle righe scheda), scontoGlobale,
 *   stato 'emessa'|'parziale'|'incassata'|'insoluta'|'annullata',
 *   pagamenti[] {id, data, importo, metodo, note}, allegatoPath, note
 *
 * expenses — spese                                → suppliers, recurring
 *   data, categoria, descrizione, imponibile, aliquotaIva,
 *   tipo 'fisso'|'variabile', stato 'da_pagare'|'pagata', scadenza,
 *   metodoPagamento, allegatoPath, recurringId, orderId, note
 *
 * recurring — template di spesa ricorrente mensile        ← expenses
 *   descrizione, categoria, supplierId, imponibile, aliquotaIva, tipo,
 *   giornoMese, attivo, dataInizio, dataFine
 *
 * employees — personale                   ← shifts, attendance, jobs
 *   nome, cognome, ruolo 'titolare'|'capofficina'|'meccanico', reparto,
 *   contratto, livello, pagaOraria, specializzazione, dataAssunzione,
 *   telefono, email, certificazioni[] {nome, scadenza}, colore, attivo,
 *   produttivo (può vendere ore su scheda: entra nel denominatore della
 *   produttività; chi è in accettazione no, ma resta nel costo del lavoro)
 *
 * shifts — turni pianificati                             → employees
 *   data, oraInizio, oraFine, postazione, note
 *
 * attendance — presenze                                  → employees
 *   data, tipo 'presenza'|'ferie'|'permesso'|'malattia'|'festivo',
 *   oreOrdinarie, oreStraordinario, ritardoMin, note
 *
 * profiles — utenti dell'applicazione
 *   email, nome, ruolo, employeeId, attivo
 *   Il ruolo NON è modificabile dal client: ci pensa un trigger lato database.
 *
 * invites — inviti a entrare in officina
 *   email, ruolo, codice, usato, scadenza
 * ============================================================================
 */

import { supabase, configurato, modalita } from './supabaseClient.js'
import { generaDemo, settingsDefault } from './demoData.js'
import { arrotonda, prezzoMedioPonderato, totaliDocumento } from '../utils/calc.js'
import { addGiorni, meseDi, oggiIso } from '../utils/format.js'

/* ------------------------------------------------------------------ *
 * Tabelle
 * ------------------------------------------------------------------ */

/** chiave JS → nome della tabella su PostgreSQL */
export const TABELLE = {
  customers: 'customers',
  vehicles: 'vehicles',
  quotes: 'quotes',
  jobs: 'jobs',
  jobLines: 'job_lines',
  articles: 'articles',
  movements: 'movements',
  priceHistory: 'price_history',
  orders: 'orders',
  suppliers: 'suppliers',
  invoices: 'invoices',
  expenses: 'expenses',
  recurring: 'recurring',
  employees: 'employees',
  shifts: 'shifts',
  attendance: 'attendance',
  profiles: 'profiles',
  invites: 'invites',
}

const CHIAVI = Object.keys(TABELLE)

/** Ordinamento predefinito di ogni tabella, applicato dopo ogni scrittura. */
const ORDINE = {
  customers: (a, b) => etichettaCliente(a).localeCompare(etichettaCliente(b), 'it'),
  vehicles: (a, b) => (a.targa || '').localeCompare(b.targa || ''),
  quotes: (a, b) => (b.data || '').localeCompare(a.data || ''),
  jobs: (a, b) => (b.dataApertura || '').localeCompare(a.dataApertura || ''),
  jobLines: (a, b) => (a.data || '').localeCompare(b.data || ''),
  articles: (a, b) => (a.descrizione || '').localeCompare(b.descrizione || '', 'it'),
  movements: (a, b) => (b.data || '').localeCompare(a.data || ''),
  priceHistory: (a, b) => (b.data || '').localeCompare(a.data || ''),
  orders: (a, b) => (b.dataOrdine || '').localeCompare(a.dataOrdine || ''),
  suppliers: (a, b) => (a.ragioneSociale || '').localeCompare(b.ragioneSociale || '', 'it'),
  invoices: (a, b) => (b.progressivo || 0) - (a.progressivo || 0),
  expenses: (a, b) => (b.data || '').localeCompare(a.data || ''),
  recurring: (a, b) => (a.giornoMese || 0) - (b.giornoMese || 0),
  employees: (a, b) => (a.cognome || '').localeCompare(b.cognome || '', 'it'),
  shifts: (a, b) => (a.data || '').localeCompare(b.data || '') || (a.oraInizio || '').localeCompare(b.oraInizio || ''),
  attendance: (a, b) => (b.data || '').localeCompare(a.data || ''),
  profiles: (a, b) => (a.nome || '').localeCompare(b.nome || '', 'it'),
  invites: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''),
}

function etichettaCliente(c) {
  return c?.tipo === 'azienda' ? c.ragioneSociale || '' : `${c?.cognome || ''} ${c?.nome || ''}`.trim()
}

/* ------------------------------------------------------------------ *
 * Stato interno
 * ------------------------------------------------------------------ */

function vuoto() {
  const d = {}
  for (const k of CHIAVI) d[k] = []
  d.settings = settingsDefault('')
  return d
}

let db = vuoto()
let officinaCorrente = null
let backend = modalita
let pronto = false
const ascoltatori = new Set()

/**
 * Istantanea memoizzata.
 *
 * `useSyncExternalStore` confronta per identità il valore restituito da
 * getSnapshot: se costruissimo un oggetto nuovo a ogni chiamata, React
 * concluderebbe che lo stato cambia di continuo e ridisegnerebbe in loop.
 * L'oggetto viene quindi ricostruito una volta sola per ogni scrittura.
 */
let istantanea = null

function invalida() {
  istantanea = null
}

function notifica() {
  invalida()
  const corrente = snapshot()
  for (const fn of ascoltatori) fn(corrente)
}

/** Iscrizione alle variazioni: restituisce la funzione di disiscrizione. */
export function subscribe(fn) {
  ascoltatori.add(fn)
  return () => ascoltatori.delete(fn)
}

/**
 * Copia superficiale delle collezioni: il riferimento cambia a ogni
 * scrittura, così React sa che deve ridisegnare, ma gli oggetti non vengono
 * duplicati.
 */
export function snapshot() {
  if (istantanea) return istantanea
  const s = { settings: db.settings }
  for (const k of CHIAVI) s[k] = db[k]
  istantanea = s
  return s
}

export const stato = () => ({ backend, pronto, officinaId: officinaCorrente })

/* ------------------------------------------------------------------ *
 * camelCase ⇄ snake_case
 * ------------------------------------------------------------------ */

const aSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const aCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())

function versoDb(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj
  const out = {}
  for (const [k, v] of Object.entries(obj)) out[aSnake(k)] = v
  return out
}

function daDb(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const [k, v] of Object.entries(row)) out[aCamel(k)] = v
  return out
}

/* ------------------------------------------------------------------ *
 * Identificativi
 * ------------------------------------------------------------------ */

export function nuovoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Ripiego per ambienti senza WebCrypto (vecchi browser, alcuni runtime).
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/* ------------------------------------------------------------------ *
 * Avvio
 * ------------------------------------------------------------------ */

/**
 * Carica l'officina.
 *
 * In modalità demo genera il dataset (seed fisso) e lo tiene in memoria.
 * In modalità Supabase legge le tabelle dell'officina dell'utente: se non
 * esistono righe, si parte da un gestionale vuoto — è voluto, i dati demo
 * non finiscono mai in un database reale se non li si chiede.
 */
export async function init({ officinaId = 'demo', demo = !configurato, seed } = {}) {
  pronto = false
  backend = demo ? 'demo' : 'supabase'
  officinaCorrente = officinaId

  if (backend === 'demo') {
    const generato = generaDemo(seed ? { seed } : undefined)
    db = { ...vuoto(), ...generato }
  } else {
    db = vuoto()
    const letture = await Promise.all(
      CHIAVI.map(async (k) => {
        const { data, error } = await supabase.from(TABELLE[k]).select('*')
        if (error) throw error
        return [k, (data || []).map(daDb)]
      }),
    )
    for (const [k, righe] of letture) {
      db[k] = righe.sort(ORDINE[k] || (() => 0))
    }
    const { data: s, error: errS } = await supabase.from('settings').select('*').maybeSingle()
    if (errS) throw errS
    db.settings = s ? { ...settingsDefault(officinaId), ...daDb(s) } : settingsDefault(officinaId)
  }

  pronto = true
  notifica()
  return snapshot()
}

/** Rigenera i dati demo (pulsante "ricarica dati demo"). */
export async function ricaricaDemo(seed) {
  if (backend !== 'demo') throw new Error('I dati demo si ricaricano solo in modalità demo.')
  return init({ officinaId: 'demo', demo: true, seed })
}

/* ------------------------------------------------------------------ *
 * CRUD generico
 * ------------------------------------------------------------------ */

function verificaTabella(tabella) {
  if (!CHIAVI.includes(tabella)) throw new Error(`Tabella sconosciuta: ${tabella}`)
}

/** Lettura dalla cache. `filtro` è una funzione, non una query. */
export function list(tabella, filtro) {
  verificaTabella(tabella)
  const righe = db[tabella]
  return filtro ? righe.filter(filtro) : righe
}

export function get(tabella, id) {
  verificaTabella(tabella)
  return db[tabella].find((r) => r.id === id) || null
}

function riordina(tabella) {
  const cmp = ORDINE[tabella]
  db[tabella] = cmp ? [...db[tabella]].sort(cmp) : [...db[tabella]]
}

export async function insert(tabella, valori, { silenzioso = false } = {}) {
  verificaTabella(tabella)
  const riga = {
    id: valori.id || nuovoId(),
    officinaId: officinaCorrente,
    createdAt: valori.createdAt || oggiIso(),
    ...valori,
  }
  riga.officinaId = officinaCorrente

  if (backend === 'supabase') {
    const { data, error } = await supabase
      .from(TABELLE[tabella])
      .insert(versoDb(riga))
      .select()
      .single()
    if (error) throw error
    Object.assign(riga, daDb(data))
  }

  db[tabella] = [...db[tabella], riga]
  riordina(tabella)
  invalida()
  if (!silenzioso) notifica()
  return riga
}

export async function update(tabella, id, patch, { silenzioso = false } = {}) {
  verificaTabella(tabella)
  const i = db[tabella].findIndex((r) => r.id === id)
  if (i < 0) throw new Error('Record non trovato.')
  const aggiornato = { ...db[tabella][i], ...patch, id }

  if (backend === 'supabase') {
    const { officinaId: _o, id: _i, createdAt: _c, ...modifiche } = patch
    const { data, error } = await supabase
      .from(TABELLE[tabella])
      .update(versoDb(modifiche))
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    Object.assign(aggiornato, daDb(data))
  }

  const copia = [...db[tabella]]
  copia[i] = aggiornato
  db[tabella] = copia
  riordina(tabella)
  invalida()
  if (!silenzioso) notifica()
  return aggiornato
}

export async function remove(tabella, id, { silenzioso = false } = {}) {
  verificaTabella(tabella)
  if (backend === 'supabase') {
    const { error } = await supabase.from(TABELLE[tabella]).delete().eq('id', id)
    if (error) throw error
  }
  db[tabella] = db[tabella].filter((r) => r.id !== id)
  invalida()
  if (!silenzioso) notifica()
}

/** Aggiornamento delle impostazioni: riga unica, sempre presente. */
export async function updateSettings(patch) {
  const aggiornate = { ...db.settings, ...patch }
  if (backend === 'supabase') {
    const { officinaId: _o, ...modifiche } = patch
    const { data, error } = await supabase
      .from('settings')
      .update(versoDb(modifiche))
      .eq('officina_id', officinaCorrente)
      .select()
      .single()
    if (error) throw error
    Object.assign(aggiornate, daDb(data))
  }
  db.settings = aggiornate
  invalida()
  notifica()
  return aggiornate
}

/* ------------------------------------------------------------------ *
 * Numerazione progressiva
 * ------------------------------------------------------------------ */

/**
 * Numerazione per anno, calcolata dai dati e non da un contatore separato:
 * un contatore che si disallinea produce numeri doppi in fattura, e una
 * fattura con numero doppio è un problema serio.
 */
export function prossimoNumero(tipo, anno = Number(oggiIso().slice(0, 4))) {
  const aa = String(anno).slice(2)
  if (tipo === 'invoices') {
    const max = db.invoices
      .filter((f) => f.anno === anno)
      .reduce((m, f) => Math.max(m, Number(f.progressivo || 0)), 0)
    return { progressivo: max + 1, numero: `${max + 1}/${anno}`, anno }
  }
  const prefisso = tipo === 'quotes' ? 'P' : tipo === 'orders' ? 'ORD ' : ''
  const campo = tipo === 'orders' ? 'dataOrdine' : tipo === 'quotes' ? 'data' : 'dataApertura'
  const righe = db[tipo].filter((r) => String(r[campo] || '').startsWith(String(anno)))
  const max = righe.reduce((m, r) => {
    const n = Number(String(r.numero || '').split('/')[1] || 0)
    return Math.max(m, n)
  }, 0)
  const cifre = tipo === 'orders' ? 3 : 4
  return { progressivo: max + 1, numero: `${prefisso}${aa}/${String(max + 1).padStart(cifre, '0')}`, anno }
}

/* ------------------------------------------------------------------ *
 * Magazzino
 * ------------------------------------------------------------------ */

/**
 * Registra un movimento e aggiorna l'articolo di conseguenza.
 *
 * È l'unico punto in cui la giacenza cambia: qualunque altra strada porta
 * prima o poi a un magazzino che non torna. Sul carico ricalcola il prezzo
 * medio ponderato e alimenta lo storico prezzi.
 *
 * @param {'carico'|'scarico'|'reso'|'rettifica'} tipo
 * @param {number} quantita  sempre positiva, tranne sulle rettifiche dove
 *                           il segno indica il verso della differenza
 */
export async function registerMovement({
  articleId,
  tipo,
  quantita,
  prezzoUnitario,
  causale = '',
  data = oggiIso(),
  jobId = null,
  orderId = null,
  supplierId = null,
}) {
  const art = get('articles', articleId)
  if (!art) throw new Error('Articolo non trovato.')

  const q = Number(quantita || 0)
  if (!q) throw new Error('La quantità del movimento non può essere zero.')
  if (tipo !== 'rettifica' && q < 0) throw new Error('La quantità deve essere positiva.')

  let giacenza = Number(art.giacenza || 0)
  let prezzoMedio = Number(art.prezzoMedio || 0)
  let prezzo = Number(prezzoUnitario ?? prezzoMedio)

  if (tipo === 'carico') {
    prezzoMedio = prezzoMedioPonderato(giacenza, prezzoMedio, q, prezzo)
    giacenza += q
  } else if (tipo === 'scarico' || tipo === 'reso') {
    if (q > giacenza) {
      throw new Error(
        `Giacenza insufficiente per ${art.descrizione}: disponibili ${giacenza} ${art.unita || 'pz'}.`,
      )
    }
    giacenza -= q
    // Scarichi e resi escono al costo medio: è il valore con cui il pezzo è
    // entrato, ed è quello che va confrontato col prezzo di vendita.
    prezzo = prezzoMedio
  } else if (tipo === 'rettifica') {
    if (giacenza + q < 0) throw new Error('La rettifica porterebbe la giacenza sotto zero.')
    giacenza += q
  } else {
    throw new Error(`Tipo di movimento non valido: ${tipo}`)
  }

  const movimento = await insert(
    'movements',
    { articleId, tipo, quantita: q, prezzoUnitario: arrotonda(prezzo, 4), causale, data, jobId, orderId, supplierId },
    { silenzioso: true },
  )

  await update(
    'articles',
    articleId,
    {
      giacenza: arrotonda(giacenza, 3),
      prezzoMedio: arrotonda(prezzoMedio, 4),
      prezzoListino: arrotonda(prezzoMedio * (1 + Number(art.ricarico || 0))),
    },
    { silenzioso: true },
  )

  if (tipo === 'carico') {
    await insert(
      'priceHistory',
      { articleId, supplierId: supplierId || art.supplierId, prezzo: arrotonda(prezzo, 4), quantita: q, data, orderId },
      { silenzioso: true },
    )
  }

  notifica()
  return movimento
}

/**
 * Scarica i ricambi impiegati su una scheda: un movimento e una riga scheda
 * per articolo, in un colpo solo. Se un articolo non ha giacenza sufficiente
 * l'operazione si ferma prima di scrivere qualsiasi cosa.
 */
export async function scaricaRicambiScheda(jobId, righe = []) {
  const job = get('jobs', jobId)
  if (!job) throw new Error('Scheda non trovata.')

  // Controllo preventivo su tutte le righe: meglio un errore prima che un
  // magazzino scaricato a metà.
  for (const rg of righe) {
    if (!rg.articleId) continue
    const art = get('articles', rg.articleId)
    if (!art) throw new Error('Articolo non trovato.')
    const richiesta = righe
      .filter((x) => x.articleId === rg.articleId)
      .reduce((s, x) => s + Number(x.quantita || 0), 0)
    if (richiesta > Number(art.giacenza || 0)) {
      throw new Error(
        `Giacenza insufficiente per ${art.descrizione}: richiesti ${richiesta}, disponibili ${art.giacenza}.`,
      )
    }
  }

  const create = []
  for (const rg of righe) {
    const art = rg.articleId ? get('articles', rg.articleId) : null
    const data = rg.data || oggiIso()

    if (art) {
      await registerMovement({
        articleId: art.id,
        tipo: 'scarico',
        quantita: Number(rg.quantita || 0),
        causale: `Impiego su scheda ${job.numero}`,
        data,
        jobId,
      })
    }

    const riga = await insert(
      'jobLines',
      {
        jobId,
        tipo: 'ricambio',
        descrizione: rg.descrizione || art?.descrizione || 'Ricambio',
        codice: rg.codice || art?.codice || '',
        articleId: art?.id || null,
        quantita: Number(rg.quantita || 0),
        prezzo: arrotonda(
          rg.prezzo ?? (art ? art.prezzoMedio * (1 + Number(art.ricarico || 0)) : 0),
        ),
        costoUnitario: arrotonda(rg.costoUnitario ?? art?.prezzoMedio ?? 0, 4),
        sconto: Number(rg.sconto || 0),
        aliquotaIva: Number(rg.aliquotaIva ?? art?.aliquotaIva ?? db.settings.aliquotaIvaDefault),
        employeeId: rg.employeeId || null,
        data,
      },
      { silenzioso: true },
    )
    create.push(riga)
  }

  notifica()
  return create
}

/* ------------------------------------------------------------------ *
 * Preventivo → scheda
 * ------------------------------------------------------------------ */

/**
 * Trasforma un preventivo accettato in scheda di lavoro, portandosi dietro
 * tutte le righe. I ricambi NON vengono scaricati qui: un preventivo dice
 * cosa serve, lo scarico avviene quando il pezzo si monta davvero.
 */
export async function preventivoInScheda(quoteId, { data = oggiIso(), kmIngresso, ponte = null, note = '' } = {}) {
  const q = get('quotes', quoteId)
  if (!q) throw new Error('Preventivo non trovato.')
  if (q.jobId) throw new Error('Questo preventivo è già stato convertito in scheda.')

  const veicolo = get('vehicles', q.vehicleId)
  const { numero } = prossimoNumero('jobs', Number(data.slice(0, 4)))
  const orePreviste = arrotonda(
    (q.righe || []).filter((r) => r.tipo === 'manodopera').reduce((s, r) => s + Number(r.ore || 0), 0),
    2,
  )

  const job = await insert(
    'jobs',
    {
      numero,
      customerId: q.customerId,
      vehicleId: q.vehicleId,
      kmIngresso: Number(kmIngresso ?? veicolo?.km ?? 0),
      tipoIntervento: q.tipoIntervento || 'Intervento da preventivo',
      difetto: q.note || `Da preventivo ${q.numero}`,
      diagnosi: '',
      lavorazioni: '',
      stato: 'accettato',
      ponte,
      garanzia: false,
      jobOrigineGaranzia: null,
      orePreviste,
      dataApertura: data,
      dataInizio: null,
      dataConsegnaPrevista: addGiorni(data, orePreviste > 4 ? 2 : 1),
      dataConsegna: null,
      employeeIds: [],
      allegati: [],
      note,
      quoteId,
      invoiceId: null,
    },
    { silenzioso: true },
  )

  for (const r of q.righe || []) {
    await insert(
      'jobLines',
      {
        jobId: job.id,
        tipo: r.tipo,
        descrizione: r.descrizione,
        codice: r.codice || '',
        articleId: r.articleId || null,
        tariffaId: r.tariffaId || null,
        ore: r.ore ?? null,
        tariffaOraria: r.tariffaOraria ?? null,
        costoOrario: r.costoOrario ?? null,
        quantita: r.quantita ?? null,
        prezzo: r.prezzo ?? null,
        costoUnitario: r.costoUnitario ?? null,
        sconto: Number(r.sconto || 0),
        aliquotaIva: Number(r.aliquotaIva ?? db.settings.aliquotaIvaDefault),
        employeeId: null,
        data,
      },
      { silenzioso: true },
    )
  }

  if (kmIngresso && veicolo && Number(kmIngresso) > Number(veicolo.km || 0)) {
    await update('vehicles', veicolo.id, { km: Number(kmIngresso) }, { silenzioso: true })
  }

  await update('quotes', quoteId, { stato: 'accettato', jobId: job.id }, { silenzioso: true })
  notifica()
  return job
}

/* ------------------------------------------------------------------ *
 * Scheda → fattura
 * ------------------------------------------------------------------ */

/**
 * Chiude la scheda e ne emette la fattura.
 *
 * Le rilavorazioni in garanzia si chiudono ma non si fatturano: restano
 * tracciate come costo, ed è giusto che pesino sui margini del periodo.
 */
export async function chiudiSchedaEFattura(
  jobId,
  { data = oggiIso(), giorniPagamento, scontoGlobale = 0, metodoPagamento = null, note = '' } = {},
) {
  const job = get('jobs', jobId)
  if (!job) throw new Error('Scheda non trovata.')
  if (job.invoiceId) throw new Error('Questa scheda è già stata fatturata.')

  const righe = list('jobLines', (l) => l.jobId === jobId)
  const cliente = get('customers', job.customerId)
  const veicolo = get('vehicles', job.vehicleId)

  await update(
    'jobs',
    jobId,
    {
      stato: job.garanzia ? 'consegnato' : job.stato,
      dataConsegna: job.dataConsegna || data,
    },
    { silenzioso: true },
  )

  if (veicolo && Number(job.kmIngresso || 0) > Number(veicolo.km || 0)) {
    await update('vehicles', veicolo.id, { km: Number(job.kmIngresso) }, { silenzioso: true })
  }

  if (job.garanzia) {
    notifica()
    return null
  }
  if (!righe.length) throw new Error('La scheda non ha righe: non c’è nulla da fatturare.')

  const anno = Number(data.slice(0, 4))
  const { numero, progressivo } = prossimoNumero('invoices', anno)
  const gg = giorniPagamento ?? (cliente?.tipo === 'azienda' ? db.settings.giorniPagamentoDefault : 0)

  const fattura = await insert(
    'invoices',
    {
      numero,
      progressivo,
      anno,
      data,
      customerId: job.customerId,
      vehicleId: job.vehicleId,
      jobId,
      righe: righe.map((l) => ({
        id: l.id,
        tipo: l.tipo,
        descrizione: l.descrizione,
        codice: l.codice || '',
        ore: l.ore,
        tariffaOraria: l.tariffaOraria,
        costoOrario: l.costoOrario,
        quantita: l.quantita,
        prezzo: l.prezzo,
        costoUnitario: l.costoUnitario,
        sconto: l.sconto || 0,
        aliquotaIva: l.aliquotaIva,
      })),
      scontoGlobale: Number(scontoGlobale || 0),
      stato: 'emessa',
      scadenza: addGiorni(data, gg),
      pagamenti: [],
      metodoPagamento,
      allegatoPath: null,
      note,
    },
    { silenzioso: true },
  )

  await update(
    'jobs',
    jobId,
    { stato: 'fatturato', invoiceId: fattura.id, dataConsegna: job.dataConsegna || data },
    { silenzioso: true },
  )

  notifica()
  return fattura
}

/** Registra un incasso e riallinea lo stato della fattura. */
export async function registraIncasso(invoiceId, { importo, data = oggiIso(), metodo = 'Bonifico', note = '' }) {
  const f = get('invoices', invoiceId)
  if (!f) throw new Error('Fattura non trovata.')
  const imp = arrotonda(Number(importo || 0))
  if (imp <= 0) throw new Error('L’importo dell’incasso deve essere positivo.')

  const pagamenti = [...(f.pagamenti || []), { id: nuovoId(), data, importo: imp, metodo, note }]
  const totale = totaliDocumento(f.righe || [], f.scontoGlobale || 0).totale
  const incassato = pagamenti.reduce((s, p) => s + Number(p.importo || 0), 0)
  const residuo = arrotonda(totale - incassato)

  const stato = residuo <= 0.01 ? 'incassata' : f.scadenza < oggiIso() ? 'insoluta' : 'parziale'
  return update('invoices', invoiceId, { pagamenti, stato })
}

/* ------------------------------------------------------------------ *
 * Ordini a fornitore
 * ------------------------------------------------------------------ */

/**
 * Ricezione di un ordine: carico a magazzino di ogni riga (con ricalcolo del
 * prezzo medio) e spesa generata in automatico. Idempotente: un ordine già
 * ricevuto non si carica due volte.
 */
export async function riceviOrdine(orderId, { data = oggiIso() } = {}) {
  const o = get('orders', orderId)
  if (!o) throw new Error('Ordine non trovato.')
  if (o.stato === 'ricevuto') return o

  let imponibile = 0
  for (const rg of o.righe || []) {
    if (!rg.articleId) continue
    await registerMovement({
      articleId: rg.articleId,
      tipo: 'carico',
      quantita: Number(rg.quantita || 0),
      prezzoUnitario: Number(rg.prezzo || 0),
      causale: `Ricezione ordine ${o.numero}`,
      data,
      orderId,
      supplierId: o.supplierId,
    })
    imponibile += Number(rg.quantita || 0) * Number(rg.prezzo || 0)
  }

  const spesa = await insert(
    'expenses',
    {
      data,
      categoria: 'Ricambi e materiali',
      descrizione: `Fornitura ricambi — ordine ${o.numero}`,
      supplierId: o.supplierId,
      imponibile: arrotonda(imponibile),
      aliquotaIva: db.settings.aliquotaIvaDefault,
      tipo: 'variabile',
      stato: 'da_pagare',
      scadenza: addGiorni(data, 30),
      metodoPagamento: 'Bonifico',
      allegatoPath: null,
      recurringId: null,
      orderId,
      note: '',
    },
    { silenzioso: true },
  )

  const aggiornato = await update(
    'orders',
    orderId,
    { stato: 'ricevuto', dataRicezione: data, expenseId: spesa.id },
    { silenzioso: true },
  )
  notifica()
  return aggiornato
}

/* ------------------------------------------------------------------ *
 * Spese ricorrenti
 * ------------------------------------------------------------------ */

/**
 * Genera le spese del mese dai template ricorrenti.
 *
 * Idempotente per costruzione: la coppia (recurringId, mese) è la chiave. Si
 * può lanciare ogni volta che si apre il modulo Spese senza duplicare nulla,
 * ed è esattamente quello che fa l'applicazione.
 *
 * @returns {Array} le spese effettivamente create (vuoto se già tutte lì)
 */
export async function generateRecurring(ym = meseDi(oggiIso())) {
  const create = []
  const esistenti = new Set(
    db.expenses.filter((s) => s.recurringId).map((s) => `${s.recurringId}|${meseDi(s.data)}`),
  )

  for (const t of db.recurring) {
    if (!t.attivo) continue
    const giorno = Math.min(Math.max(Number(t.giornoMese || 1), 1), 28)
    const data = `${ym}-${String(giorno).padStart(2, '0')}`
    if (t.dataInizio && data < t.dataInizio) continue
    if (t.dataFine && data > t.dataFine) continue
    if (esistenti.has(`${t.id}|${ym}`)) continue

    const spesa = await insert(
      'expenses',
      {
        data,
        categoria: t.categoria,
        descrizione: t.descrizione,
        supplierId: t.supplierId || null,
        imponibile: Number(t.imponibile || 0),
        aliquotaIva: Number(t.aliquotaIva ?? db.settings.aliquotaIvaDefault),
        tipo: t.tipo || 'fisso',
        stato: 'da_pagare',
        scadenza: addGiorni(data, 15),
        metodoPagamento: '',
        allegatoPath: null,
        recurringId: t.id,
        orderId: null,
        note: 'Generata da spesa ricorrente.',
      },
      { silenzioso: true },
    )
    create.push(spesa)
  }

  if (create.length) notifica()
  return create
}

/* ------------------------------------------------------------------ *
 * Presenze
 * ------------------------------------------------------------------ */

/** Registra o sostituisce la presenza di un dipendente in un giorno. */
export async function registraPresenza(employeeId, data, valori) {
  const esistente = db.attendance.find((p) => p.employeeId === employeeId && p.data === data)
  if (esistente) return update('attendance', esistente.id, valori)
  return insert('attendance', { employeeId, data, ...valori })
}

/* ------------------------------------------------------------------ *
 * Cancellazioni con verifica dei collegamenti
 * ------------------------------------------------------------------ */

/**
 * Vincoli applicativi prima della cancellazione. Il database ha i suoi
 * (foreign key, policy), ma un messaggio in italiano è più utile di un
 * errore di constraint.
 */
export function bloccoCancellazione(tabella, id) {
  const conta = (t, f) => db[t].filter(f).length
  switch (tabella) {
    case 'customers': {
      const v = conta('vehicles', (x) => x.customerId === id)
      const j = conta('jobs', (x) => x.customerId === id)
      if (v || j) return `Il cliente ha ${v} veicoli e ${j} schede collegate.`
      return null
    }
    case 'vehicles': {
      const j = conta('jobs', (x) => x.vehicleId === id)
      if (j) return `Il veicolo ha ${j} schede di lavoro collegate.`
      return null
    }
    case 'articles': {
      const m = conta('movements', (x) => x.articleId === id)
      if (m) return `L’articolo ha ${m} movimenti di magazzino: disattivalo invece di eliminarlo.`
      return null
    }
    case 'suppliers': {
      const a = conta('articles', (x) => x.supplierId === id)
      const o = conta('orders', (x) => x.supplierId === id)
      if (a || o) return `Il fornitore ha ${a} articoli e ${o} ordini collegati.`
      return null
    }
    case 'employees': {
      const p = conta('attendance', (x) => x.employeeId === id)
      if (p) return `Il dipendente ha ${p} presenze registrate: disattivalo invece di eliminarlo.`
      return null
    }
    case 'jobs': {
      const j = get('jobs', id)
      if (j?.invoiceId) return 'La scheda è già stata fatturata.'
      return null
    }
    case 'invoices': {
      const f = get('invoices', id)
      if ((f?.pagamenti || []).length) return 'La fattura ha incassi registrati: annullala invece di eliminarla.'
      return null
    }
    default:
      return null
  }
}

/** Cancellazione a cascata delle righe scheda quando si elimina una scheda. */
export async function eliminaScheda(jobId) {
  const blocco = bloccoCancellazione('jobs', jobId)
  if (blocco) throw new Error(blocco)
  for (const l of list('jobLines', (x) => x.jobId === jobId)) {
    await remove('jobLines', l.id, { silenzioso: true })
  }
  // I movimenti restano: il magazzino è già stato scaricato davvero.
  for (const m of list('movements', (x) => x.jobId === jobId)) {
    await update('movements', m.id, { jobId: null, causale: `${m.causale} (scheda eliminata)` }, { silenzioso: true })
  }
  await remove('jobs', jobId, { silenzioso: true })
  notifica()
}

/* ------------------------------------------------------------------ *
 * Esportazione dell'intero archivio (backup manuale)
 * ------------------------------------------------------------------ */

export function esportaArchivio() {
  return JSON.stringify(
    { versione: 1, esportatoIl: new Date().toISOString(), backend, dati: snapshot() },
    null,
    2,
  )
}

const dataService = {
  init,
  ricaricaDemo,
  subscribe,
  snapshot,
  stato,
  list,
  get,
  insert,
  update,
  remove,
  updateSettings,
  nuovoId,
  prossimoNumero,
  registerMovement,
  scaricaRicambiScheda,
  preventivoInScheda,
  chiudiSchedaEFattura,
  registraIncasso,
  riceviOrdine,
  generateRecurring,
  registraPresenza,
  bloccoCancellazione,
  eliminaScheda,
  esportaArchivio,
  TABELLE,
}

export default dataService
