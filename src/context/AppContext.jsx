/**
 * Stato globale dell'applicazione: dati, utente attivo, tema, notifiche.
 *
 * Volutamente senza librerie di state management. Il dataset di un'officina
 * sta in memoria per intero, il dataService notifica le variazioni, e un
 * `useSyncExternalStore` basta a tenere allineati i componenti.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import dataService from '../data/dataService.js'
import authService from '../data/authService.js'
import { configurato, modalita } from '../data/supabaseClient.js'
import { generaAlert, kpiMese } from '../utils/calc.js'
import { meseDi, oggiIso } from '../utils/format.js'

const AppContext = createContext(null)

const CHIAVE_TEMA = 'wheelz.tema'
const CHIAVE_UTENTE_DEMO = 'wheelz.utenteDemo'

/* ------------------------------------------------------------------ *
 * Tema
 * ------------------------------------------------------------------ */

function temaIniziale() {
  try {
    const salvato = localStorage.getItem(CHIAVE_TEMA)
    if (salvato === 'chiaro' || salvato === 'scuro') return salvato
  } catch {
    // localStorage non disponibile (navigazione privata o iframe): pazienza.
  }
  return 'scuro' // scuro predefinito, come da specifica
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export function AppProvider({ children }) {
  const [tema, setTema] = useState(temaIniziale)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState(null)
  const [profilo, setProfilo] = useState(null)
  const [sessione, setSessione] = useState(null)
  const [toasts, setToasts] = useState([])
  const [modulo, setModulo] = useState('dashboard')
  const [focus, setFocus] = useState(null) // entità da aprire arrivando da un alert
  const [periodo, setPeriodo] = useState(() => meseDi(oggiIso()))
  const contatore = useRef(0)

  /* --- Dati ---------------------------------------------------- */

  const db = useSyncExternalStore(dataService.subscribe, dataService.snapshot, dataService.snapshot)

  /* --- Tema ---------------------------------------------------- */

  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', tema === 'scuro')
    root.style.colorScheme = tema === 'scuro' ? 'dark' : 'light'
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      tema === 'scuro' ? '#0d1117' : '#ffffff',
    )
    try {
      localStorage.setItem(CHIAVE_TEMA, tema)
    } catch {
      // niente da fare, il tema resta valido per la sessione
    }
  }, [tema])

  const cambiaTema = useCallback(() => setTema((t) => (t === 'scuro' ? 'chiaro' : 'scuro')), [])

  /* --- Notifiche ------------------------------------------------ */

  const toast = useCallback((messaggio, tipo = 'ok') => {
    const id = ++contatore.current
    setToasts((t) => [...t, { id, messaggio, tipo }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'errore' ? 7000 : 4000)
  }, [])

  const chiudiToast = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  /**
   * Esegue un'operazione mostrando l'esito. Tutte le scritture dei moduli
   * passano da qui, così i messaggi di errore sono uniformi e non c'è un
   * try/catch copiato in venti punti.
   */
  const azione = useCallback(
    async (fn, { successo, errore: msgErrore } = {}) => {
      try {
        const esito = await fn()
        if (successo) toast(successo, 'ok')
        return { ok: true, esito }
      } catch (e) {
        toast(msgErrore || e?.message || 'Operazione non riuscita.', 'errore')
        return { ok: false, errore: e }
      }
    },
    [toast],
  )

  /* --- Avvio ---------------------------------------------------- */

  const avviaDemo = useCallback(async () => {
    await dataService.init({ officinaId: 'demo', demo: true })
    let utente = null
    try {
      const salvato = localStorage.getItem(CHIAVE_UTENTE_DEMO)
      if (salvato) utente = JSON.parse(salvato)
    } catch {
      utente = null
    }
    const profili = dataService.list('profiles')
    const scelto = profili.find((p) => p.id === utente?.id) || profili.find((p) => p.ruolo === 'titolare') || profili[0]
    setProfilo(scelto || null)
    setSessione(null)
  }, [])

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        if (!configurato) {
          await avviaDemo()
        } else {
          const sess = await authService.sessione()
          if (!vivo) return
          setSessione(sess)
          if (sess) {
            const p = await authService.completaRegistrazione()
            if (!vivo) return
            setProfilo(p)
            if (p) await dataService.init({ officinaId: p.officinaId, demo: false })
          }
        }
      } catch (e) {
        if (vivo) setErrore(e?.message || String(e))
      } finally {
        if (vivo) setCaricamento(false)
      }
    })()
    return () => {
      vivo = false
    }
  }, [avviaDemo])

  // Cambi di sessione (accesso, uscita, refresh del token).
  useEffect(() => {
    if (!configurato) return undefined
    return authService.onCambioSessione(async (sess) => {
      setSessione(sess)
      if (!sess) {
        setProfilo(null)
        return
      }
      try {
        const p = await authService.completaRegistrazione()
        setProfilo(p)
        if (p) await dataService.init({ officinaId: p.officinaId, demo: false })
      } catch (e) {
        setErrore(e?.message || String(e))
      }
    })
  }, [])

  /* --- Utente demo ---------------------------------------------- */

  const cambiaUtenteDemo = useCallback(
    (profileId) => {
      const p = dataService.list('profiles').find((x) => x.id === profileId)
      if (!p) return
      setProfilo(p)
      try {
        localStorage.setItem(CHIAVE_UTENTE_DEMO, JSON.stringify({ id: p.id }))
      } catch {
        // preferenza non persistita: non è un problema
      }
      const visibili = authService.moduliVisibili(p.ruolo)
      setModulo((m) => (visibili.includes(m) ? m : 'dashboard'))
      toast(`Ora stai guardando l’officina come ${p.nome} (${p.ruolo}).`)
    },
    [toast],
  )

  const disconnetti = useCallback(async () => {
    if (configurato) {
      await authService.esci()
      setProfilo(null)
    } else {
      toast('In modalità demo non c’è una vera sessione da chiudere.', 'info')
    }
  }, [toast])

  /* --- Derivati -------------------------------------------------- */

  const ruolo = profilo?.ruolo || 'titolare'
  const settings = db.settings

  const dipendenteCorrente = useMemo(
    () => (profilo?.employeeId ? db.employees.find((e) => e.id === profilo.employeeId) : null),
    [profilo, db.employees],
  )

  /**
   * Avvisi filtrati per ruolo.
   *
   * Il meccanico vede soltanto le proprie schede ferme: insoluti, scadenze
   * dei clienti e sotto scorta non lo riguardano, e mostrargliene il conteggio
   * nella barra laterale sarebbe già un'informazione economica di troppo.
   */
  const alert = useMemo(() => {
    const tutti = generaAlert(db, settings)
    if (ruolo !== 'meccanico') return tutti
    const mie = new Set(
      db.jobs.filter((j) => (j.employeeIds || []).includes(dipendenteCorrente?.id)).map((j) => j.id),
    )
    return tutti.filter((a) => a.modulo === 'schede' && mie.has(a.entita))
  }, [db, settings, ruolo, dipendenteCorrente])

  const kpi = useMemo(() => kpiMese(db, periodo, settings), [db, periodo, settings])

  const puo = useCallback((permesso) => authService.puo(ruolo, permesso), [ruolo])

  const moduli = useMemo(() => authService.moduliVisibili(ruolo), [ruolo])

  const vaiA = useCallback(
    (nomeModulo, entita = null) => {
      setModulo(nomeModulo)
      setFocus(entita)
    },
    [],
  )

  const scuro = tema === 'scuro'

  const valore = useMemo(
    () => ({
      db,
      settings,
      caricamento,
      errore,
      backend: modalita,
      demo: !configurato,
      sessione,
      profilo,
      ruolo,
      dipendenteCorrente,
      puo,
      moduli,
      modulo,
      setModulo,
      focus,
      setFocus,
      vaiA,
      periodo,
      setPeriodo,
      tema,
      scuro,
      cambiaTema,
      toast,
      toasts,
      chiudiToast,
      azione,
      alert,
      kpi,
      cambiaUtenteDemo,
      disconnetti,
      avviaDemo,
      dataService,
    }),
    [
      db, settings, caricamento, errore, sessione, profilo, ruolo, dipendenteCorrente, puo, moduli,
      modulo, focus, vaiA, periodo, tema, scuro, cambiaTema, toast, toasts, chiudiToast, azione,
      alert, kpi, cambiaUtenteDemo, disconnetti, avviaDemo,
    ],
  )

  return <AppContext.Provider value={valore}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp va usato dentro <AppProvider>.')
  return ctx
}

export default AppContext
