#!/usr/bin/env node
/**
 * npm run seed — carica i dati dimostrativi su un progetto Supabase.
 *
 * Serve a provare l'applicazione con persistenza vera, o a preparare una demo
 * condivisibile. NON viene eseguito in automatico da nessuna parte: un
 * database di produzione non deve mai riempirsi di "Autofficina Rossi & Figli"
 * senza che qualcuno l'abbia chiesto esplicitamente.
 *
 * Variabili d'ambiente (in .env, oppure già nell'ambiente):
 *   SUPABASE_URL               URL del progetto
 *   SUPABASE_SERVICE_ROLE_KEY  chiave service_role — scavalca le policy RLS,
 *                              per questo vive solo qui e mai nel browser
 *
 * Uso:
 *   npm run seed                       crea una nuova officina demo
 *   npm run seed -- --officina <uuid>  riempie un'officina esistente
 *   npm run seed -- --seed 42          usa un altro seed per l'RNG
 *   npm run seed -- --svuota           svuota l'officina prima di riempirla
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { generaDemo } from '../src/data/demoData.js'

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ *
 * .env — lettura minima, senza dipendenze
 * ------------------------------------------------------------------ */

function caricaEnv() {
  const percorso = resolve(radice, '.env')
  if (!existsSync(percorso)) return
  for (const riga of readFileSync(percorso, 'utf8').split('\n')) {
    const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const valore = m[2].replace(/^["']|["']$/g, '')
    if (!process.env[m[1]]) process.env[m[1]] = valore
  }
}

caricaEnv()

const URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const CHIAVE = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!URL || !CHIAVE) {
  console.error(`
Mancano le variabili d'ambiente.

  SUPABASE_URL=https://xxxxxxxx.supabase.co
  SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...

Le trovi in Supabase → Project Settings → API.
La chiave service_role scavalca le policy RLS: tienila fuori dal browser e
fuori dal controllo di versione (.env è già in .gitignore).
`)
  process.exit(1)
}

/* ------------------------------------------------------------------ *
 * Argomenti
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2)
const arg = (nome) => {
  const i = argv.indexOf(`--${nome}`)
  return i >= 0 ? argv[i + 1] : null
}
const flag = (nome) => argv.includes(`--${nome}`)

const officinaArg = arg('officina')
const seedArg = Number(arg('seed')) || undefined
const svuota = flag('svuota')

const supabase = createClient(URL, CHIAVE, { auth: { persistSession: false } })

/* ------------------------------------------------------------------ *
 * camelCase → snake_case
 * ------------------------------------------------------------------ */

const aSnake = (s) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

function versoDb(riga, officinaId) {
  const out = {}
  for (const [k, v] of Object.entries(riga)) out[aSnake(k)] = v
  out.officina_id = officinaId
  return out
}

/* ------------------------------------------------------------------ *
 * Rimappatura degli id
 *
 * demoData genera id leggibili ("cus_0001"). Il database vuole uuid, e le
 * chiavi esterne devono restare coerenti: si costruisce una mappa
 * id-demo → uuid e la si applica a ogni campo che finisce per Id o Ids.
 * ------------------------------------------------------------------ */

const mappa = new Map()
const uuid = (idDemo) => {
  if (!idDemo) return null
  if (!mappa.has(idDemo)) mappa.set(idDemo, crypto.randomUUID())
  return mappa.get(idDemo)
}

const CAMPI_ID = new Set([
  'id', 'customerId', 'vehicleId', 'jobId', 'quoteId', 'invoiceId', 'articleId',
  'supplierId', 'employeeId', 'orderId', 'recurringId', 'expenseId',
  'jobOrigineGaranzia',
])

function rimappa(riga) {
  const out = {}
  for (const [k, v] of Object.entries(riga)) {
    if (CAMPI_ID.has(k)) out[k] = uuid(v)
    else if (k === 'employeeIds' && Array.isArray(v)) out[k] = v.map(uuid)
    else if (k === 'righe' && Array.isArray(v)) {
      out[k] = v.map((r) => {
        const rr = { ...r }
        if (rr.articleId) rr.articleId = uuid(rr.articleId)
        delete rr.id
        return rr
      })
    } else out[k] = v
  }
  return out
}

/* ------------------------------------------------------------------ *
 * Caricamento
 * ------------------------------------------------------------------ */

// L'ordine rispetta le chiavi esterne: prima le anagrafiche, poi i documenti.
const ORDINE = [
  ['suppliers', 'suppliers'],
  ['customers', 'customers'],
  ['vehicles', 'vehicles'],
  ['employees', 'employees'],
  ['articles', 'articles'],
  ['recurring', 'recurring'],
  ['orders', 'orders'],
  ['quotes', 'quotes'],
  ['jobs', 'jobs'],
  ['jobLines', 'job_lines'],
  ['invoices', 'invoices'],
  ['movements', 'movements'],
  ['priceHistory', 'price_history'],
  ['expenses', 'expenses'],
  ['shifts', 'shifts'],
  ['attendance', 'attendance'],
]

const CAMPI_DA_SCARTARE = new Set(['officinaId'])

async function inserisci(tabella, righe, officinaId) {
  if (!righe.length) return 0
  const lotti = []
  for (let i = 0; i < righe.length; i += 400) lotti.push(righe.slice(i, i + 400))

  let totale = 0
  for (const lotto of lotti) {
    const payload = lotto.map((r) => {
      const pulita = { ...r }
      for (const c of CAMPI_DA_SCARTARE) delete pulita[c]
      return versoDb(rimappa(pulita), officinaId)
    })
    const { error } = await supabase.from(tabella).insert(payload)
    if (error) throw new Error(`${tabella}: ${error.message}`)
    totale += payload.length
  }
  return totale
}

async function main() {
  console.log('Generazione dei dati demo…')
  const dati = generaDemo(seedArg ? { seed: seedArg } : undefined)

  let officinaId = officinaArg

  if (!officinaId) {
    const { data, error } = await supabase
      .from('officine')
      .insert({ ragione_sociale: dati.settings.ragioneSociale })
      .select()
      .single()
    if (error) throw new Error(`officine: ${error.message}`)
    officinaId = data.id
    console.log(`Creata l'officina ${officinaId}.`)
  } else {
    const { data, error } = await supabase.from('officine').select('id').eq('id', officinaId).maybeSingle()
    if (error) throw new Error(`officine: ${error.message}`)
    if (!data) throw new Error(`Nessuna officina con id ${officinaId}.`)
    console.log(`Uso l'officina esistente ${officinaId}.`)
  }

  if (svuota) {
    console.log('Svuotamento dei dati operativi…')
    await supabase.from('jobs').update({ invoice_id: null }).eq('officina_id', officinaId)
    await supabase.from('quotes').update({ job_id: null }).eq('officina_id', officinaId)
    await supabase.from('orders').update({ expense_id: null }).eq('officina_id', officinaId)
    for (const t of [
      'job_lines', 'movements', 'price_history', 'invoices', 'jobs', 'quotes',
      'expenses', 'recurring', 'orders', 'articles', 'vehicles', 'customers',
      'suppliers', 'attendance', 'shifts', 'employees',
    ]) {
      const { error } = await supabase.from(t).delete().eq('officina_id', officinaId)
      if (error) throw new Error(`svuotamento ${t}: ${error.message}`)
    }
  }

  // Impostazioni: una riga per officina, quindi upsert e non insert.
  const { officinaId: _o, id: _i, ...settings } = dati.settings
  const { error: errS } = await supabase
    .from('settings')
    .upsert(versoDb(settings, officinaId), { onConflict: 'officina_id' })
  if (errS) throw new Error(`settings: ${errS.message}`)
  console.log('  settings           ✓')

  for (const [chiave, tabella] of ORDINE) {
    const n = await inserisci(tabella, dati[chiave] || [], officinaId)
    console.log(`  ${tabella.padEnd(18)} ${String(n).padStart(5)} righe`)
  }

  console.log(`
Fatto. Officina: ${officinaId}

I profili utente NON sono stati creati: si creano registrandosi
dall'applicazione. Il primo che si registra senza codice invito fonda una
nuova officina — se vuoi collegarti a questa, crea un invito con:

  insert into public.invites (officina_id, email, ruolo, codice)
  values ('${officinaId}', 'tua@email.it', 'titolare', 'WZ-SEED-0001');
`)
}

main().catch((e) => {
  console.error('\nCaricamento non riuscito:', e.message)
  process.exit(1)
})
