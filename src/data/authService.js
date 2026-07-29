/**
 * Registrazione, accesso, profili e inviti.
 *
 * Il modello di sicurezza vive nel database, non qui. Questo file è la
 * facciata: chiama le funzioni lato server e traduce gli errori. Le tre
 * cose che il client NON può fare, per costruzione:
 *
 *  1. creare un profilo — si passa da `fonda_officina()` (chi si registra
 *     per primo apre la sua officina e ne diventa titolare) o da
 *     `riscatta_invito()` (chi arriva dopo entra in un'officina esistente);
 *  2. cambiare il proprio ruolo — un trigger rifiuta qualunque variazione di
 *     `ruolo` che non provenga dal titolare della stessa officina;
 *  3. leggere alcunché senza profilo — nessun profilo, nessuna riga: vale
 *     anche per una chiamata REST fatta a mano con il token in mano.
 *
 * In modalità demo l'autenticazione è simulata: si sceglie un utente fra
 * quelli generati e si guarda l'applicazione dai suoi occhi. Serve a provare
 * i ruoli, non a proteggere alcunché — e lo dice chiaramente all'utente.
 */

import { supabase, configurato, lunghezzaMinimaPassword, traduciErrore } from './supabaseClient.js'

export const RUOLI = {
  titolare: {
    id: 'titolare',
    nome: 'Titolare',
    descrizione: 'Accesso completo, compresi conti, spese, report e impostazioni.',
  },
  capofficina: {
    id: 'capofficina',
    nome: 'Capofficina / accettatore',
    descrizione:
      'Tutta l’operatività: clienti, veicoli, preventivi, schede, magazzino, fornitori, personale. Niente spese, fatturato complessivo, report economici o impostazioni.',
  },
  meccanico: {
    id: 'meccanico',
    nome: 'Meccanico',
    descrizione:
      'Le proprie schede assegnate, le proprie ore e i propri turni. Nessun dato economico, nessun dato personale dei colleghi.',
  },
}

/**
 * Mappa dei permessi usata dall'interfaccia per non mostrare porte chiuse.
 * NON è il controllo di sicurezza: quello sta nelle policy RLS, e resta in
 * piedi anche se qualcuno chiama l'API saltando questa applicazione.
 */
const PERMESSI = {
  titolare: ['*'],
  capofficina: [
    'dashboard',
    'clienti',
    'veicoli',
    'preventivi',
    'schede',
    'magazzino',
    'fornitori',
    'personale',
    'fatturazione:emissione',
  ],
  meccanico: ['dashboard:proprio', 'schede:proprie', 'personale:proprio', 'magazzino:lettura'],
}

export function puo(ruolo, permesso) {
  const lista = PERMESSI[ruolo] || []
  if (lista.includes('*')) return true
  if (lista.includes(permesso)) return true
  // "schede" copre "schede:qualcosa"
  return lista.some((p) => permesso.startsWith(`${p}:`) || p.startsWith(`${permesso}:`))
}

/** Moduli visibili nel menu, per ruolo. */
export function moduliVisibili(ruolo) {
  if (ruolo === 'titolare') {
    return ['dashboard', 'clienti', 'veicoli', 'preventivi', 'schede', 'magazzino', 'fornitori', 'fatturazione', 'spese', 'personale', 'report', 'impostazioni']
  }
  if (ruolo === 'capofficina') {
    return ['dashboard', 'clienti', 'veicoli', 'preventivi', 'schede', 'magazzino', 'fornitori', 'personale']
  }
  return ['dashboard', 'schede', 'personale']
}

/* ------------------------------------------------------------------ *
 * Sessione
 * ------------------------------------------------------------------ */

export async function sessione() {
  if (!configurato) return null
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(traduciErrore(error))
  return data?.session || null
}

export function onCambioSessione(callback) {
  if (!configurato) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_evento, sess) => callback(sess))
  return () => data?.subscription?.unsubscribe()
}

/** Profilo dell'utente autenticato. Senza profilo non si va da nessuna parte. */
export async function profiloCorrente() {
  if (!configurato) return null
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle()
  if (error) throw new Error(traduciErrore(error))
  if (!data) return null
  return {
    id: data.id,
    officinaId: data.officina_id,
    email: data.email,
    nome: data.nome,
    ruolo: data.ruolo,
    employeeId: data.employee_id,
    attivo: data.attivo,
  }
}

/* ------------------------------------------------------------------ *
 * Accesso e registrazione
 * ------------------------------------------------------------------ */

export function validaPassword(password) {
  const p = String(password || '')
  if (p.length < lunghezzaMinimaPassword) {
    return `La password deve avere almeno ${lunghezzaMinimaPassword} caratteri.`
  }
  if (!/[a-zA-Z]/.test(p) || !/[0-9]/.test(p)) {
    return 'La password deve contenere almeno una lettera e un numero.'
  }
  return null
}

export async function accedi(email, password) {
  if (!configurato) throw new Error('Modalità demo: l’accesso reale richiede Supabase configurato.')
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || '').trim().toLowerCase(),
    password,
  })
  if (error) throw new Error(traduciErrore(error))
  return data.session
}

export async function esci() {
  if (!configurato) return
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(traduciErrore(error))
}

export async function reimpostaPassword(email) {
  if (!configurato) throw new Error('Modalità demo: nessuna email viene inviata.')
  const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/`,
  })
  if (error) throw new Error(traduciErrore(error))
}

export async function cambiaPassword(nuova) {
  const errore = validaPassword(nuova)
  if (errore) throw new Error(errore)
  const { error } = await supabase.auth.updateUser({ password: nuova })
  if (error) throw new Error(traduciErrore(error))
}

/**
 * Registrazione. Due strade, entrambe con la creazione del profilo lato
 * database: il client non scrive mai in `profiles`.
 *
 * - senza codice invito → `fonda_officina()`: nasce una nuova officina e chi
 *   si è registrato ne è il titolare;
 * - con codice invito   → `riscatta_invito()`: si entra in un'officina che
 *   esiste già, con il ruolo scritto nell'invito. La funzione è atomica: un
 *   invito vale una volta sola, anche se due persone lo usano nello stesso
 *   istante.
 */
export async function registra({ email, password, nome, ragioneSociale, codiceInvito }) {
  if (!configurato) throw new Error('Modalità demo: la registrazione richiede Supabase configurato.')
  const erroreP = validaPassword(password)
  if (erroreP) throw new Error(erroreP)

  const mail = String(email || '').trim().toLowerCase()
  const { data, error } = await supabase.auth.signUp({
    email: mail,
    password,
    options: {
      // Questi dati devono sopravvivere al giro della conferma via email: il
      // profilo si crea al primo accesso, che può avvenire ore dopo e da un
      // altro dispositivo, dove il modulo di registrazione non esiste più.
      // Restano nei metadati dell'utente, cioè su Supabase, non nel browser.
      data: {
        nome: nome || '',
        ragione_sociale: ragioneSociale || '',
        codice_invito: codiceInvito ? String(codiceInvito).trim().toUpperCase() : '',
      },
      emailRedirectTo: `${window.location.origin}/`,
    },
  })
  if (error) throw new Error(traduciErrore(error))

  // Con la conferma email attiva non c'è ancora sessione: il profilo si
  // creerà al primo accesso, chiamando `completaRegistrazione`.
  if (!data.session) {
    return { confermaRichiesta: true, invito: Boolean(codiceInvito) }
  }

  await completaRegistrazione({ nome, ragioneSociale, codiceInvito })
  return { confermaRichiesta: false }
}

/**
 * Crea il profilo se non esiste ancora. Va chiamata a ogni accesso: è
 * idempotente e risolve il caso "utente confermato via email".
 *
 * Quando arriva senza argomenti — ed è il caso normale, perché la chiama il
 * contesto dopo un accesso qualunque — recupera nome, ragione sociale e
 * codice invito dai metadati salvati al momento della registrazione. Senza
 * questo, chi conferma l'email si ritrova con l'indirizzo al posto del nome
 * e, se era stato invitato, fonda una seconda officina invece di entrare in
 * quella che lo aspettava.
 */
export async function completaRegistrazione({ nome, ragioneSociale, codiceInvito } = {}) {
  if (!configurato) return null
  const esistente = await profiloCorrente()
  if (esistente) return esistente

  const { data } = await supabase.auth.getUser()
  const meta = data?.user?.user_metadata || {}

  const nomeScelto = (nome || meta.nome || '').trim()
  const ragioneScelta = (ragioneSociale || meta.ragione_sociale || '').trim()
  const invitoScelto = (codiceInvito || meta.codice_invito || '').trim().toUpperCase()

  if (invitoScelto) {
    const { error } = await supabase.rpc('riscatta_invito', {
      p_codice: invitoScelto,
      p_nome: nomeScelto,
    })
    if (error) throw new Error(traduciErrore(error))
  } else {
    const { error } = await supabase.rpc('fonda_officina', {
      p_ragione_sociale: ragioneScelta || 'La mia officina',
      p_nome: nomeScelto,
    })
    if (error) throw new Error(traduciErrore(error))
  }
  return profiloCorrente()
}

/**
 * Cambio del proprio nome.
 *
 * Aggiorna il profilo e, se c'è, la scheda personale collegata: sono due
 * righe diverse ma per chi guarda sono la stessa persona. La policy consente
 * di modificare solo il proprio profilo, e il trigger sui ruoli resta a
 * guardia della colonna che conta.
 */
export async function aggiornaNomeProfilo(nomeCompleto) {
  if (!configurato) throw new Error('Modalità demo: il profilo reale si gestisce con Supabase.')
  const nome = String(nomeCompleto || '').trim()
  if (!nome) throw new Error('Il nome non può essere vuoto.')

  const profilo = await profiloCorrente()
  if (!profilo) throw new Error('Nessun profilo da aggiornare.')

  const { error } = await supabase.from('profiles').update({ nome }).eq('id', profilo.id)
  if (error) throw new Error(traduciErrore(error))

  if (profilo.employeeId) {
    const spazio = nome.indexOf(' ')
    const { error: errDip } = await supabase
      .from('employees')
      .update({
        nome: spazio > 0 ? nome.slice(0, spazio) : nome,
        cognome: spazio > 0 ? nome.slice(spazio + 1).trim() : '',
      })
      .eq('id', profilo.employeeId)
    if (errDip) throw new Error(traduciErrore(errDip))
  }

  return { ...profilo, nome }
}

/* ------------------------------------------------------------------ *
 * Inviti e gestione utenti (solo titolare)
 * ------------------------------------------------------------------ */

function codiceInvito() {
  const alfabeto = 'ACDEFGHJKLMNPQRTUVWXY34679' // niente caratteri ambigui
  let s = ''
  for (let i = 0; i < 8; i++) s += alfabeto[Math.floor(Math.random() * alfabeto.length)]
  return `WZ-${s.slice(0, 4)}-${s.slice(4)}`
}

export async function creaInvito({ email, ruolo, giorniValidita = 14 }) {
  if (!RUOLI[ruolo]) throw new Error('Ruolo non valido.')
  const codice = codiceInvito()
  if (!configurato) return { codice, email, ruolo, demo: true }

  const { data, error } = await supabase
    .from('invites')
    .insert({
      email: String(email || '').trim().toLowerCase(),
      ruolo,
      codice,
      scadenza: new Date(Date.now() + giorniValidita * 86400000).toISOString().slice(0, 10),
    })
    .select()
    .single()
  if (error) throw new Error(traduciErrore(error))
  return data
}

export async function revocaInvito(id) {
  if (!configurato) return
  const { error } = await supabase.from('invites').delete().eq('id', id)
  if (error) throw new Error(traduciErrore(error))
}

/**
 * Cambio di ruolo. Passa da una funzione lato database che verifica chi
 * chiama: se non è il titolare della stessa officina, il trigger la ferma.
 * Rifiuta anche la rimozione dell'ultimo titolare.
 */
export async function cambiaRuolo(profileId, ruolo) {
  if (!RUOLI[ruolo]) throw new Error('Ruolo non valido.')
  if (!configurato) throw new Error('Modalità demo: i ruoli reali si gestiscono con Supabase.')
  const { error } = await supabase.rpc('cambia_ruolo', { p_profilo: profileId, p_ruolo: ruolo })
  if (error) throw new Error(traduciErrore(error))
}

export async function disattivaUtente(profileId, attivo = false) {
  if (!configurato) throw new Error('Modalità demo: gli utenti reali si gestiscono con Supabase.')
  const { error } = await supabase.rpc('imposta_attivo', { p_profilo: profileId, p_attivo: attivo })
  if (error) throw new Error(traduciErrore(error))
}

const authService = {
  RUOLI,
  puo,
  moduliVisibili,
  sessione,
  onCambioSessione,
  profiloCorrente,
  validaPassword,
  accedi,
  esci,
  reimpostaPassword,
  cambiaPassword,
  registra,
  completaRegistrazione,
  aggiornaNomeProfilo,
  creaInvito,
  revocaInvito,
  cambiaRuolo,
  disattivaUtente,
}

export default authService
