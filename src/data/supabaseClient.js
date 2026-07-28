/**
 * Client Supabase.
 *
 * Senza `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` questo modulo esporta
 * `null`: è il segnale che fa partire l'applicazione in modalità demo, con i
 * dati in memoria e nessuna chiamata di rete. Nient'altro nel codice deve
 * decidere "sono in demo?" guardando le variabili d'ambiente: si guarda qui.
 */

import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env?.VITE_SUPABASE_URL || '').trim()
const anonKey = (import.meta.env?.VITE_SUPABASE_ANON_KEY || '').trim()

/** Configurazione presente e formalmente valida? */
export const configurato = Boolean(url && anonKey && /^https?:\/\//.test(url))

export const supabase = configurato
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'mechflow.auth',
      },
      db: { schema: 'public' },
      global: { headers: { 'x-application-name': 'mechflow' } },
    })
  : null

/**
 * Lunghezza minima della password, allineata al valore impostato lato
 * Supabase. Se i due valori divergono, il client accetta una password che il
 * server poi rifiuta: da qui l'unica fonte di verità nel front-end.
 */
export const lunghezzaMinimaPassword = Number(import.meta.env?.VITE_MIN_PASSWORD_LENGTH || 10)

export const modalita = configurato ? 'supabase' : 'demo'

/** Messaggi di errore Supabase tradotti, per non mostrare inglese all'utente. */
export function traduciErrore(err) {
  if (!err) return null
  const m = String(err.message || err)
  const mappa = [
    [/invalid login credentials/i, 'Email o password non corretti.'],
    [/email not confirmed/i, 'Devi prima confermare l’indirizzo email.'],
    [/user already registered/i, 'Esiste già un account con questa email.'],
    [/password should be at least (\d+)/i, 'La password è troppo corta.'],
    [/rate limit|too many requests/i, 'Troppi tentativi: riprova tra qualche minuto.'],
    [/new row violates row-level security/i, 'Non hai i permessi per questa operazione.'],
    [/duplicate key value/i, 'Esiste già un record con questi dati.'],
    [/violates foreign key constraint/i, 'Il record è collegato ad altri dati e non può essere rimosso.'],
    [/jwt expired|invalid token/i, 'Sessione scaduta: accedi di nuovo.'],
    [/failed to fetch|network/i, 'Connessione non riuscita. Controlla la rete.'],
    [/captcha/i, 'Verifica di sicurezza non superata.'],
  ]
  for (const [re, testo] of mappa) if (re.test(m)) return testo
  return m
}
