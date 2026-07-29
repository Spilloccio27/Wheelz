/**
 * Guscio dell'applicazione.
 *
 * Due navigazioni per due posture diverse:
 *  - da scrivania, barra laterale di vetro sempre visibile;
 *  - da tablet o telefono in officina, barra in basso — dove arriva il
 *    pollice di chi tiene il dispositivo con una mano e una chiave inglese
 *    con l'altra. I moduli che non ci stanno finiscono in un foglio che sale
 *    dal basso, insieme al tema e al cambio utente.
 *
 * Nessun router esterno: i moduli sono dodici e vivono nella stessa pagina.
 */

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Car,
  ClipboardList,
  CreditCard,
  FileText,
  HardHat,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Moon,
  Package,
  Receipt,
  Settings as SettingsIcon,
  Sun,
  Truck,
  Users,
  Wrench,
} from 'lucide-react'
import { useApp } from './context/AppContext.jsx'
import {
  Avatar,
  Badge,
  Button,
  Caricamento,
  Foglio,
  Select,
  Toasts,
  cx,
  useIndicatore,
} from './components/ui.jsx'
import Login from './components/Login.jsx'
import { iniziali } from './utils/format.js'

const Dashboard = lazy(() => import('./modules/Dashboard.jsx'))
const Clienti = lazy(() => import('./modules/Clienti.jsx'))
const Veicoli = lazy(() => import('./modules/Veicoli.jsx'))
const Preventivi = lazy(() => import('./modules/Preventivi.jsx'))
const SchedeLavoro = lazy(() => import('./modules/SchedeLavoro.jsx'))
const Magazzino = lazy(() => import('./modules/Magazzino.jsx'))
const Fornitori = lazy(() => import('./modules/Fornitori.jsx'))
const Fatturazione = lazy(() => import('./modules/Fatturazione.jsx'))
const Spese = lazy(() => import('./modules/Spese.jsx'))
const Personale = lazy(() => import('./modules/Personale.jsx'))
const Report = lazy(() => import('./modules/Report.jsx'))
const Impostazioni = lazy(() => import('./modules/Impostazioni.jsx'))

const MODULI = [
  { id: 'dashboard', nome: 'Dashboard', breve: 'Oggi', icona: LayoutDashboard, componente: Dashboard },
  { id: 'clienti', nome: 'Clienti', breve: 'Clienti', icona: Users, componente: Clienti },
  { id: 'veicoli', nome: 'Veicoli', breve: 'Veicoli', icona: Car, componente: Veicoli },
  { id: 'preventivi', nome: 'Preventivi', breve: 'Preventivi', icona: FileText, componente: Preventivi },
  { id: 'schede', nome: 'Schede di lavoro', breve: 'Schede', icona: ClipboardList, componente: SchedeLavoro },
  { id: 'magazzino', nome: 'Magazzino', breve: 'Ricambi', icona: Package, componente: Magazzino },
  { id: 'fornitori', nome: 'Fornitori', breve: 'Fornitori', icona: Truck, componente: Fornitori },
  { id: 'fatturazione', nome: 'Fatturazione', breve: 'Fatture', icona: Receipt, componente: Fatturazione },
  { id: 'spese', nome: 'Spese', breve: 'Spese', icona: CreditCard, componente: Spese },
  { id: 'personale', nome: 'Personale', breve: 'Persone', icona: HardHat, componente: Personale },
  { id: 'report', nome: 'Report', breve: 'Report', icona: BarChart3, componente: Report },
  { id: 'impostazioni', nome: 'Impostazioni', breve: 'Impostazioni', icona: SettingsIcon, componente: Impostazioni },
]

/** Le quattro voci che meritano un posto nella barra in basso. */
const PREFERITI = ['dashboard', 'schede', 'clienti', 'magazzino']

export default function App() {
  const {
    caricamento, errore, demo, profilo, ruolo, moduli, modulo, setModulo, tema, cambiaTema,
    toasts, chiudiToast, settings, alert, vaiA,
  } = useApp()

  const [altro, setAltro] = useState(false)

  useEffect(() => {
    setAltro(false)
  }, [modulo])

  if (caricamento) {
    return (
      <div className="min-h-screen grid place-items-center px-6">
        <div className="w-full max-w-sm text-center">
          <span className="inline-grid place-items-center h-14 w-14 rounded-2xl vetro mb-4 mf-pulsa">
            <Wrench size={24} aria-hidden />
          </span>
          <p className="text-sm text-[var(--ink-2)]">Apertura officina…</p>
        </div>
      </div>
    )
  }

  if (errore) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-md text-center vetro vetro-luce rounded-2xl p-8 mf-scala">
          <AlertTriangle size={26} className="mx-auto mb-3" aria-hidden />
          <h1 className="text-lg font-semibold mb-2 tracking-tight">
            Non è stato possibile aprire l’officina
          </h1>
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">{errore}</p>
          <Button className="mt-5" variante="primario" onClick={() => window.location.reload()}>
            Riprova
          </Button>
        </div>
      </div>
    )
  }

  if (!demo && !profilo) return <Login />

  // Al meccanico i moduli si chiamano come le cose che ci trova dentro: non
  // consulta "il personale", guarda le proprie ore.
  const ETICHETTE_MECCANICO = {
    schede: { nome: 'I miei lavori', breve: 'Lavori' },
    personale: { nome: 'Le mie ore', breve: 'Ore' },
    dashboard: { nome: 'La mia giornata', breve: 'Oggi' },
  }

  const visibili = MODULI.filter((m) => moduli.includes(m.id)).map((m) =>
    ruolo === 'meccanico' && ETICHETTE_MECCANICO[m.id] ? { ...m, ...ETICHETTE_MECCANICO[m.id] } : m,
  )
  const attivo = visibili.find((m) => m.id === modulo) || visibili[0]
  const Componente = attivo.componente
  const alertGravi = alert.filter((a) => a.gravita === 'alta').length

  // L'ordine è quello di PREFERITI, non quello del menu: in basso "Schede"
  // deve stare accanto al pollice, non dove capita.
  const principali = [
    ...PREFERITI.map((id) => visibili.find((m) => m.id === id)).filter(Boolean),
    ...visibili.filter((m) => !PREFERITI.includes(m.id)),
  ].slice(0, 4)
  const secondari = visibili.filter((m) => !principali.includes(m))

  return (
    <div className="min-h-screen flex">
      <Sidebar
        voci={visibili}
        attivo={attivo.id}
        onSceglie={setModulo}
        tema={tema}
        cambiaTema={cambiaTema}
        settings={settings}
        alertGravi={alertGravi}
      />

      <div className="grow min-w-0 flex flex-col">
        <Intestazione titolo={attivo.nome} onAlert={() => vaiA('dashboard')} />

        <main className="grow p-4 sm:p-6 max-w-[1600px] w-full mx-auto pad-basso lg:pb-8">
          {/* La chiave fa ripartire l'animazione a ogni cambio di modulo, ed
              è il modo più economico per dare continuità alla navigazione.
              Comprende il ruolo perché filtri e viste predefinite dipendono da
              chi guarda: cambiando utente il modulo riparte pulito. */}
          <div key={`${attivo.id}|${ruolo}`} className="mf-in">
            <Suspense fallback={<Caricamento />}>
              <Componente />
            </Suspense>
          </div>
        </main>
      </div>

      <BottomNav
        principali={principali}
        secondari={secondari}
        attivo={attivo.id}
        onSceglie={setModulo}
        onAltro={() => setAltro(true)}
        alertGravi={alertGravi}
      />

      <Foglio aperto={altro} onChiudi={() => setAltro(false)} titolo="Tutto il resto">
        <MenuAltro
          voci={secondari}
          attivo={attivo.id}
          onSceglie={setModulo}
          tema={tema}
          cambiaTema={cambiaTema}
        />
      </Foglio>

      <Toasts toasts={toasts} onChiudi={chiudiToast} />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Barra laterale (da lg in su)
 * ------------------------------------------------------------------ */

function Sidebar({ voci, attivo, onSceglie, tema, cambiaTema, settings, alertGravi }) {
  const { demo, profilo, db, cambiaUtenteDemo, disconnetti } = useApp()
  const nav = useRef(null)
  // L'indicatore scivola da una voce all'altra: la navigazione diventa un
  // movimento continuo invece di una serie di salti.
  const pillola = useIndicatore(nav, `${attivo}|${voci.length}`)

  return (
    // `self-start` è necessario: in un contenitore flex l'allineamento
    // predefinito allunga la colonna a tutta l'altezza del contenuto, e uno
    // `sticky` che riempie già tutto non ha spazio per restare fermo.
    <aside className="hidden lg:flex sticky top-0 self-start h-screen w-[248px] shrink-0 no-print flex-col vetro vetro-luce border-y-0 border-l-0 rounded-none">
      <div className="p-4 flex items-center gap-2.5 border-b border-[var(--line)]">
        <span className="h-9 w-9 rounded-xl bg-[var(--accent)] grid place-items-center shrink-0">
          <Wrench size={18} className="text-[var(--accent-ink)]" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight tracking-tight">Wheelz</p>
          <p className="text-[11px] text-[var(--ink-3)] truncate">
            {settings.ragioneSociale || 'Officina'}
          </p>
        </div>
      </div>

      <nav ref={nav} className="grow overflow-y-auto p-2 relative" aria-label="Moduli">
        {pillola && (
          <span
            aria-hidden
            className="absolute left-2 right-2 top-0 rounded-xl bg-[var(--surface-3)] border border-[var(--line)] transition-[transform,height] duration-300 ease-out pointer-events-none"
            style={{ transform: `translateY(${pillola.y}px)`, height: pillola.h }}
          />
        )}
        {voci.map((v) => {
          const Icona = v.icona
          const selezionato = attivo === v.id
          return (
            <button
              key={v.id}
              type="button"
              data-attivo={selezionato}
              onClick={() => onSceglie(v.id)}
              aria-current={selezionato ? 'page' : undefined}
              className={cx(
                'relative z-10 w-full flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-medium mb-0.5',
                'transition-colors duration-200',
                selezionato ? 'text-[var(--ink)]' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
              )}
            >
              <Icona
                size={17}
                aria-hidden
                className={cx('transition-transform duration-300', selezionato && 'scale-110')}
              />
              <span className="grow text-left truncate">{v.nome}</span>
              {v.id === 'dashboard' && alertGravi > 0 && <Badge tono="negativo">{alertGravi}</Badge>}
            </button>
          )
        })}
      </nav>

      <div className="p-3 border-t border-[var(--line)] space-y-3">
        {demo && (
          <div>
            <label className="text-[10.5px] uppercase tracking-[0.09em] text-[var(--ink-3)] block mb-1.5">
              Guarda l’officina come
            </label>
            <Select
              value={profilo?.id || ''}
              onChange={(e) => cambiaUtenteDemo(e.target.value)}
              className="h-10 text-[13px]"
              opzioni={db.profiles.map((p) => ({ valore: p.id, etichetta: `${p.nome} — ${p.ruolo}` }))}
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Avatar
            iniziali={iniziali(profilo?.nome?.split(' ')[0], profilo?.nome?.split(' ')[1])}
            misura={32}
          />
          <div className="min-w-0 grow">
            <p className="text-[13px] font-medium truncate leading-tight">{profilo?.nome || 'Ospite'}</p>
            <p className="text-[11px] text-[var(--ink-3)] capitalize">{profilo?.ruolo || '—'}</p>
          </div>
          <InterruttoreTema tema={tema} cambiaTema={cambiaTema} />
        </div>

        {!demo && (
          <Button misura="sm" variante="fantasma" icona={LogOut} className="w-full" onClick={disconnetti}>
            Esci
          </Button>
        )}

        {demo && (
          <p className="text-[11px] text-[var(--ink-3)] leading-snug">
            Modalità demo: dati di esempio in memoria, nessun salvataggio.
          </p>
        )}
      </div>
    </aside>
  )
}

/**
 * Interruttore del tema: le due icone ruotano l'una nell'altra invece di
 * sostituirsi di colpo.
 */
function InterruttoreTema({ tema, cambiaTema, className }) {
  const scuro = tema === 'scuro'
  return (
    <button
      type="button"
      onClick={cambiaTema}
      className={cx(
        'premi relative h-9 w-9 grid place-items-center rounded-lg hover:bg-[var(--surface-3)] text-[var(--ink-2)] overflow-hidden',
        className,
      )}
      aria-label={scuro ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
      title={scuro ? 'Tema chiaro' : 'Tema scuro'}
    >
      <Sun
        size={17}
        aria-hidden
        className={cx(
          'absolute transition-all duration-400 ease-out',
          scuro ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50',
        )}
      />
      <Moon
        size={17}
        aria-hidden
        className={cx(
          'absolute transition-all duration-400 ease-out',
          scuro ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100',
        )}
      />
    </button>
  )
}

/* ------------------------------------------------------------------ *
 * Intestazione
 * ------------------------------------------------------------------ */

function Intestazione({ titolo, onAlert }) {
  const { alert, demo, tema, cambiaTema } = useApp()
  const gravi = alert.filter((a) => a.gravita === 'alta').length

  return (
    <header className="sticky top-0 z-20 no-print vetro border-x-0 border-t-0 rounded-none">
      <div className="h-14 px-4 sm:px-6 flex items-center gap-3 max-w-[1600px] mx-auto">
        <span className="lg:hidden h-8 w-8 rounded-lg bg-[var(--accent)] grid place-items-center shrink-0">
          <Wrench size={16} className="text-[var(--accent-ink)]" aria-hidden />
        </span>
        <h1 className="font-semibold text-[15px] grow truncate tracking-tight">{titolo}</h1>
        {demo && (
          <Badge tono="neutro" className="hidden sm:inline-flex">
            Demo
          </Badge>
        )}
        {gravi > 0 && (
          <button
            type="button"
            onClick={onAlert}
            className="premi inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg hover:bg-[var(--surface-3)] text-sm"
            title="Vai agli avvisi"
          >
            <AlertTriangle size={16} aria-hidden />
            <span className="tabnum font-semibold">{gravi}</span>
          </button>
        )}
        <InterruttoreTema tema={tema} cambiaTema={cambiaTema} className="lg:hidden" />
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ *
 * Barra di navigazione in basso (sotto lg)
 * ------------------------------------------------------------------ */

function BottomNav({ principali, secondari, attivo, onSceglie, onAltro, alertGravi }) {
  const nav = useRef(null)

  const indiceAttivo = useMemo(
    () => principali.findIndex((m) => m.id === attivo),
    [principali, attivo],
  )

  const pillola = useIndicatore(nav, `${attivo}|${principali.length}|${secondari.length}`)
  const inAltro = indiceAttivo < 0

  return (
    // Galleggia staccata dal bordo: è una lastra sopra il contenuto, non un
    // bordo dello schermo. Su desktop non esiste.
    <nav
      className="lg:hidden fixed left-3 right-3 sotto-barra z-40 no-print vetro-liquido rounded-[26px]"
      aria-label="Navigazione principale"
    >
      <div ref={nav} className="relative flex items-stretch p-1.5">
        {pillola && (
          <span
            aria-hidden
            className="lente absolute left-0 top-1.5 bottom-1.5 rounded-[20px] pointer-events-none transition-[transform,width] duration-[420ms] [transition-timing-function:cubic-bezier(.34,1.3,.5,1)]"
            style={{ transform: `translateX(${pillola.x}px)`, width: pillola.w }}
          />
        )}

        {principali.map((m) => {
          const Icona = m.icona
          const selezionato = attivo === m.id
          return (
            <button
              key={m.id}
              type="button"
              data-attivo={selezionato}
              onClick={() => onSceglie(m.id)}
              aria-current={selezionato ? 'page' : undefined}
              className={cx(
                'premi relative z-10 flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-[20px]',
                'text-[10.5px] font-medium transition-colors duration-200',
                selezionato ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]',
              )}
            >
              <span className="relative">
                <Icona
                  size={20}
                  aria-hidden
                  className={cx(
                    'transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(.34,1.3,.5,1)]',
                    selezionato ? '-translate-y-[3px] scale-[1.18]' : 'scale-100',
                  )}
                />
                {m.id === 'dashboard' && alertGravi > 0 && (
                  <span className="absolute -top-1 -right-2 min-w-[15px] h-[15px] px-1 rounded-full bg-[var(--ink)] text-[var(--sfondo)] text-[9px] font-bold grid place-items-center tabnum">
                    {alertGravi > 9 ? '9+' : alertGravi}
                  </span>
                )}
              </span>
              {m.breve}
            </button>
          )
        })}

        {secondari.length > 0 && (
          <button
            type="button"
            onClick={onAltro}
            className={cx(
              'premi relative z-10 flex-1 flex flex-col items-center justify-center gap-1 h-14 rounded-[20px]',
              'text-[10.5px] font-medium transition-colors duration-200',
              inAltro ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]',
            )}
          >
            <MoreHorizontal
              size={20}
              aria-hidden
              className={cx(
                'transition-transform duration-[420ms] [transition-timing-function:cubic-bezier(.34,1.3,.5,1)]',
                inAltro && '-translate-y-[3px] scale-[1.18]',
              )}
            />
            Altro
          </button>
        )}
      </div>
    </nav>
  )
}

/** Contenuto del foglio "Altro": moduli restanti, tema e cambio utente. */
function MenuAltro({ voci, attivo, onSceglie, tema, cambiaTema }) {
  const { demo, profilo, db, cambiaUtenteDemo, disconnetti } = useApp()

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-1.5 mf-scaglione">
        {voci.map((v, i) => {
          const Icona = v.icona
          const selezionato = attivo === v.id
          return (
            <button
              key={v.id}
              type="button"
              style={{ '--i': i }}
              onClick={() => onSceglie(v.id)}
              className={cx(
                'premi flex items-center gap-2.5 h-14 px-3.5 rounded-xl border text-sm font-medium text-left',
                selezionato
                  ? 'bg-[var(--accent)] text-[var(--accent-ink)] border-transparent'
                  : 'bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink-2)]',
              )}
            >
              <Icona size={18} aria-hidden className="shrink-0" />
              <span className="truncate">{v.nome}</span>
            </button>
          )
        })}
      </div>

      <div className="pt-3 mt-2 border-t border-[var(--line)] space-y-3 px-1">
        {demo && (
          <div>
            <label className="text-[10.5px] uppercase tracking-[0.09em] text-[var(--ink-3)] block mb-1.5">
              Guarda l’officina come
            </label>
            <Select
              value={profilo?.id || ''}
              onChange={(e) => cambiaUtenteDemo(e.target.value)}
              opzioni={db.profiles.map((p) => ({ valore: p.id, etichetta: `${p.nome} — ${p.ruolo}` }))}
            />
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <Avatar
            iniziali={iniziali(profilo?.nome?.split(' ')[0], profilo?.nome?.split(' ')[1])}
            misura={34}
          />
          <div className="min-w-0 grow">
            <p className="text-sm font-medium truncate leading-tight">{profilo?.nome || 'Ospite'}</p>
            <p className="text-[11px] text-[var(--ink-3)] capitalize">{profilo?.ruolo || '—'}</p>
          </div>
          <InterruttoreTema tema={tema} cambiaTema={cambiaTema} />
        </div>

        {!demo && (
          <Button variante="contorno" icona={LogOut} className="w-full" onClick={disconnetti}>
            Esci
          </Button>
        )}
      </div>
    </div>
  )
}
