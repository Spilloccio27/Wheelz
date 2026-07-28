/**
 * File binari: loghi, foto dei danni, foto dei pezzi sostituiti, DDT,
 * allegati delle fatture.
 *
 * Regola: nel database finisce **solo il percorso** del file, mai il file.
 * Due bucket con regole diverse:
 *  - `loghi`     pubblico, URL stabile, serve nelle stampe;
 *  - `documenti` privato, si accede solo con link firmato a scadenza (1 ora).
 *
 * In modalità demo non c'è nessun bucket: i file vengono tenuti in memoria
 * come data URL, così le anteprime funzionano e nulla lascia il browser.
 */

import { supabase, configurato } from './supabaseClient.js'
import { aDataUrl, estensione, ridimensiona } from '../utils/image.js'

export const BUCKET_LOGHI = 'loghi'
export const BUCKET_DOCUMENTI = 'documenti'

const SCADENZA_LINK = 60 * 60 // un'ora
const MAX_BYTE = 12 * 1024 * 1024

/** Archivio in memoria della modalità demo: percorso → data URL. */
const memoria = new Map()

const casuale = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10)

/** Nome di file prevedibile e privo di sorprese (niente accenti né spazi). */
function pulisciNome(nome) {
  return String(nome || 'file')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-60)
}

/**
 * Percorso di destinazione. Il primo segmento è sempre l'officina: le policy
 * di storage confrontano quel segmento con l'officina dell'utente, quindi la
 * struttura del percorso è parte del modello di sicurezza, non un vezzo.
 */
export function percorso(officinaId, cartella, nomeFile) {
  return `${officinaId}/${cartella}/${Date.now()}-${casuale()}-${pulisciNome(nomeFile)}`
}

/* ------------------------------------------------------------------ *
 * Caricamento
 * ------------------------------------------------------------------ */

/**
 * Carica un file. Le immagini vengono ridimensionate prima di partire:
 * una foto da telefono passa da 6 MB a poche centinaia di kB.
 *
 * @returns {{path: string, bucket: string, nome: string, dimensione: number}}
 */
export async function carica(
  file,
  { officinaId, cartella = 'allegati', bucket = BUCKET_DOCUMENTI, latoMax = 1600 } = {},
) {
  if (!file) throw new Error('Nessun file selezionato.')
  if (file.size > MAX_BYTE) throw new Error('Il file supera i 12 MB.')

  let daInviare = file
  let nome = file.name

  if (file.type?.startsWith('image/')) {
    const { blob, mime } = await ridimensiona(file, { latoMax })
    daInviare = blob
    nome = `${pulisciNome(file.name).replace(/\.[^.]+$/, '')}.${estensione(mime || blob.type)}`
  }

  const path = percorso(officinaId, cartella, nome)

  if (!configurato) {
    memoria.set(path, await aDataUrl(daInviare))
    return { path, bucket, nome, dimensione: daInviare.size, demo: true }
  }

  const { error } = await supabase.storage.from(bucket).upload(path, daInviare, {
    cacheControl: '3600',
    upsert: false,
    contentType: daInviare.type || file.type,
  })
  if (error) throw error

  return { path, bucket, nome, dimensione: daInviare.size, demo: false }
}

/** Logo dell'officina: bucket pubblico, lato massimo contenuto. */
export async function caricaLogo(file, officinaId) {
  return carica(file, { officinaId, cartella: 'logo', bucket: BUCKET_LOGHI, latoMax: 512 })
}

/* ------------------------------------------------------------------ *
 * Lettura
 * ------------------------------------------------------------------ */

/**
 * URL utilizzabile per mostrare o scaricare il file.
 * Sul bucket pubblico è un URL stabile, su quello privato un link firmato
 * che scade dopo un'ora: non va salvato da nessuna parte.
 */
export async function urlDi(path, bucket = BUCKET_DOCUMENTI) {
  if (!path) return null
  if (!configurato) return memoria.get(path) || null

  if (bucket === BUCKET_LOGHI) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)
    return data?.publicUrl || null
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SCADENZA_LINK)
  if (error) throw error
  return data?.signedUrl || null
}

/** Link firmati in blocco, per le gallerie di allegati. */
export async function urlMultipli(paths = [], bucket = BUCKET_DOCUMENTI) {
  const validi = paths.filter(Boolean)
  if (!validi.length) return {}
  if (!configurato) {
    return Object.fromEntries(validi.map((p) => [p, memoria.get(p) || null]))
  }
  if (bucket === BUCKET_LOGHI) {
    return Object.fromEntries(
      validi.map((p) => [p, supabase.storage.from(bucket).getPublicUrl(p).data?.publicUrl || null]),
    )
  }
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(validi, SCADENZA_LINK)
  if (error) throw error
  return Object.fromEntries((data || []).map((d) => [d.path, d.signedUrl]))
}

/* ------------------------------------------------------------------ *
 * Cancellazione
 * ------------------------------------------------------------------ */

export async function elimina(path, bucket = BUCKET_DOCUMENTI) {
  if (!path) return
  if (!configurato) {
    memoria.delete(path)
    return
  }
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) throw error
}

const storageService = {
  BUCKET_LOGHI,
  BUCKET_DOCUMENTI,
  percorso,
  carica,
  caricaLogo,
  urlDi,
  urlMultipli,
  elimina,
}

export default storageService
