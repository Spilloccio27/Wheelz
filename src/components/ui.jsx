/**
 * Design system dell'applicazione.
 *
 * Monocromatico per scelta: nero, bianco e grigi. La gerarchia si costruisce
 * con il contrasto, il peso del carattere e la profondità delle superfici —
 * pannelli di vetro sfocato su un fondo con due aloni e una grana finissima.
 * L'accento non è una tinta ma l'inversione: bianco su nero nel tema scuro,
 * nero su bianco nel chiaro.
 *
 * Sugli stati economici la regola è una sola: quello che non va pesa di più.
 *
 * Pensato per un tablet appeso al muro dell'officina: aree toccabili da
 * almeno 44 px, tabelle che scorrono in orizzontale senza trascinarsi dietro
 * la pagina, modali che sul telefono salgono dal basso come fogli.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Download,
  Info,
  Loader2,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { chiaveRicerca, csv as costruisciCsv, euro, numero as fmtNumero } from '../utils/format.js'

/* ------------------------------------------------------------------ *
 * Fondamenta
 * ------------------------------------------------------------------ */

export const cx = (...classi) => classi.filter(Boolean).join(' ')

const TESTO_2 = 'text-[var(--ink-2)]'
const TESTO_3 = 'text-[var(--ink-3)]'

/** Il movimento si spegne se il sistema operativo lo chiede. */
export function useMotoRidotto() {
  const [ridotto, setRidotto] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    setRidotto(mq.matches)
    const su = (e) => setRidotto(e.matches)
    mq.addEventListener('change', su)
    return () => mq.removeEventListener('change', su)
  }, [])
  return ridotto
}

/**
 * Indicatore che segue la voce attiva (pillole dei filtri, linguette,
 * navigazione). Misura l'elemento con `data-attivo="true"` dentro il
 * contenitore e restituisce la sua geometria.
 *
 * ATTENZIONE ALL'ANCORA. `offsetLeft` e `offsetTop` partono dal riquadro
 * interno al bordo del contenitore, ed è la stessa origine di un figlio in
 * posizione assoluta **ancorato** con `left-0`/`top-0`: i due valori si
 * corrispondono senza correzioni. Ma se l'ancora manca, l'elemento assoluto
 * cade sulla sua posizione statica — l'inizio del contenuto, cioè dopo il
 * padding — e l'indicatore risulta spostato esattamente di quel padding.
 *
 * È il motivo per cui il difetto si vedeva solo su mobile: i filtri a nastro
 * hanno 16 px di padding sotto `lg` e zero sopra. Chi usa questo hook deve
 * quindi ancorare l'indicatore con `left-0` (o `top-0`), sempre.
 *
 * Rimisura quando cambia la voce attiva, quando il contenitore o le voci
 * cambiano dimensione, e quando i font finiscono di caricarsi: Inter arriva
 * dopo il primo disegno e cambia la larghezza delle etichette.
 */
export function useIndicatore(contenitore, chiave, { scorriVersoAttivo = false } = {}) {
  const [box, setBox] = useState(null)
  const ultimoAttivo = useRef(null)

  const misura = useCallback(() => {
    const c = contenitore.current
    if (!c) return
    const el = c.querySelector('[data-attivo="true"]')

    // Un contenitore nascosto (la barra laterale sotto `lg`) misura zero, e
    // quello zero resterebbe lì anche dopo. Meglio nessun indicatore che uno
    // sbagliato.
    if (!el || c.getClientRects().length === 0) {
      setBox(null)
      return
    }

    const nuovo = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }
    // Il confronto non è un'ottimizzazione: senza, la misura a ogni render
    // rientrerebbe in un ciclo infinito.
    setBox((prec) =>
      prec && prec.x === nuovo.x && prec.y === nuovo.y && prec.w === nuovo.w && prec.h === nuovo.h
        ? prec
        : nuovo,
    )

    // Se la voce scelta è mezza fuori dal nastro, la si porta dentro.
    if (scorriVersoAttivo && ultimoAttivo.current !== el) {
      ultimoAttivo.current = el
      el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
    }
  }, [contenitore, scorriVersoAttivo])

  // Dopo ogni render, prima del disegno. È la rete di sicurezza che non
  // dipende da niente: copre il contenitore che torna visibile, il testo che
  // cambia lunghezza, la voce che compare o sparisce.
  useLayoutEffect(misura)

  // E gli eventi che cambiano la geometria senza passare da un render.
  useEffect(() => {
    const c = contenitore.current
    if (!c) return undefined
    const ro = new ResizeObserver(misura)
    ro.observe(c)
    for (const figlio of c.children) ro.observe(figlio)
    window.addEventListener('resize', misura)
    window.addEventListener('orientationchange', misura)
    // Inter arriva dopo il primo disegno e cambia la larghezza delle etichette.
    document.fonts?.ready?.then(misura).catch(() => {})
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', misura)
      window.removeEventListener('orientationchange', misura)
    }
  }, [contenitore, chiave, misura])

  return box
}

/**
 * Conteggio animato.
 *
 * Un numero che sale dice quanto vale e da dove viene: cambiando mese, il
 * fatturato che scorre rende visibile la differenza prima ancora di leggerla.
 * L'interpolazione è cubica in uscita, così l'ultima parte rallenta e la
 * cifra finale si ferma leggibile.
 */
export function useValoreAnimato(valore, { durata = 620 } = {}) {
  const ridotto = useMotoRidotto()
  const [mostrato, setMostrato] = useState(() => Number(valore) || 0)
  const partenza = useRef(Number(valore) || 0)

  useEffect(() => {
    const fine = Number(valore)
    if (!Number.isFinite(fine)) return undefined
    const inizio = partenza.current
    if (ridotto || inizio === fine) {
      partenza.current = fine
      setMostrato(fine)
      return undefined
    }
    let raf
    const t0 = performance.now()
    const passo = (t) => {
      const p = Math.min(1, (t - t0) / durata)
      const e = 1 - (1 - p) ** 3
      setMostrato(inizio + (fine - inizio) * e)
      if (p < 1) raf = requestAnimationFrame(passo)
      else partenza.current = fine
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [valore, durata, ridotto])

  return mostrato
}

/* ------------------------------------------------------------------ *
 * Pulsanti
 * ------------------------------------------------------------------ */

const VARIANTI = {
  primario:
    'bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-strong)] border border-transparent shadow-[var(--ombra)]',
  secondario:
    'vetro text-[var(--ink)] hover:bg-[var(--surface-3)] hover:border-[var(--line-forte)]',
  fantasma: 'bg-transparent text-[var(--ink-2)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)] border border-transparent',
  contorno: 'bg-transparent text-[var(--ink)] border border-[var(--line-forte)] hover:bg-[var(--surface-3)]',
  // In monocromatico "pericoloso" non è rosso: è invertito. È il segnale più
  // forte che si può dare senza introdurre una tinta.
  pericolo:
    'bg-[var(--ink)] text-[var(--sfondo)] hover:opacity-90 border border-transparent shadow-[var(--ombra)]',
}

const MISURE = {
  sm: 'h-9 px-3 text-[13px] gap-1.5 rounded-lg',
  md: 'h-11 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-[15px] gap-2 rounded-xl',
  icona: 'h-11 w-11 justify-center rounded-xl',
  iconaSm: 'h-9 w-9 justify-center rounded-lg',
}

export function Button({
  variante = 'secondario',
  misura = 'md',
  icona: Icona,
  caricamento = false,
  className,
  children,
  ...props
}) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || caricamento}
      className={cx(
        'premi inline-flex items-center font-medium select-none',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANTI[variante],
        MISURE[misura],
        className,
      )}
    >
      {caricamento ? (
        <Loader2 size={16} className="animate-spin" aria-hidden />
      ) : (
        Icona && <Icona size={misura === 'sm' ? 15 : 17} aria-hidden />
      )}
      {children}
    </button>
  )
}

export function IconButton({ etichetta, icona: Icona, misura = 'icona', ...props }) {
  return (
    <Button misura={misura} variante="fantasma" aria-label={etichetta} title={etichetta} {...props}>
      <Icona size={18} aria-hidden />
    </Button>
  )
}

/* ------------------------------------------------------------------ *
 * Contenitori
 * ------------------------------------------------------------------ */

export function Card({ className, padding = true, animata = true, children, ...props }) {
  return (
    <div
      {...props}
      className={cx(
        // `min-w-0` non è un dettaglio: dentro una griglia un figlio non
        // scende sotto la larghezza minima del suo contenuto, e una tabella
        // con `min-w-[640px]` allargava la card a 658 px su uno schermo da
        // 375. La tabella scorre già per conto suo, la card no.
        'vetro vetro-luce rounded-2xl min-w-0',
        animata && 'wz-in',
        padding && 'p-4 sm:p-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({ titolo, sottotitolo, azioni, icona: Icona, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-3 mb-4', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold flex items-center gap-2 leading-tight tracking-tight">
          {Icona && <Icona size={16} className="text-[var(--ink-3)] shrink-0" aria-hidden />}
          <span className="truncate">{titolo}</span>
        </h3>
        {sottotitolo && <p className={cx('text-xs mt-1 leading-relaxed', TESTO_3)}>{sottotitolo}</p>}
      </div>
      {azioni && <div className="flex items-center gap-2 shrink-0">{azioni}</div>}
    </div>
  )
}

export function Sezione({ titolo, descrizione, azioni, children, className }) {
  return (
    <section className={cx('mb-6', className)}>
      {(titolo || azioni) && (
        <div className="flex items-end justify-between gap-3 mb-3">
          <div>
            {titolo && <h2 className="text-lg font-semibold tracking-tight">{titolo}</h2>}
            {descrizione && <p className={cx('text-xs mt-0.5', TESTO_3)}>{descrizione}</p>}
          </div>
          {azioni && <div className="flex items-center gap-2">{azioni}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

/* ------------------------------------------------------------------ *
 * KPI
 * ------------------------------------------------------------------ */

export function KPI({
  etichetta,
  valore,
  dettaglio,
  variazione,
  icona: Icona,
  obiettivo,
  formato = (v) => v,
  onClick,
}) {
  const numerico = Number.isFinite(Number(valore))
  const animato = useValoreAnimato(numerico ? Number(valore) : 0)
  const mostrato = numerico ? animato : valore

  const haVariazione = Number.isFinite(Number(variazione))
  const su = Number(variazione) >= 0
  const quota = obiettivo
    ? Math.min(1, Math.max(0, Number(obiettivo.valore) / Number(obiettivo.target || 1)))
    : null

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined}
      className={cx(
        'vetro vetro-luce rounded-2xl p-4 flex flex-col gap-2 wz-in premi',
        onClick && 'cursor-pointer hover:border-[var(--line-forte)]',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cx('text-[10.5px] uppercase tracking-[0.09em] font-medium', TESTO_3)}>
          {etichetta}
        </span>
        {Icona && <Icona size={14} className={TESTO_3} aria-hidden />}
      </div>
      <div className="text-2xl font-semibold tabnum leading-none tracking-tight">
        {formato(mostrato)}
      </div>
      <div className="flex items-center justify-between gap-2 min-h-[18px]">
        {dettaglio && <span className={cx('text-xs truncate', TESTO_2)}>{dettaglio}</span>}
        {haVariazione && (
          <span
            className="text-xs font-semibold tabnum inline-flex items-center gap-0.5 shrink-0"
            style={{ color: su ? 'var(--segno-pos)' : 'var(--segno-neg)' }}
            title={su ? 'In crescita sul periodo precedente' : 'In calo sul periodo precedente'}
          >
            {su ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />}
            {fmtNumero(Math.abs(Number(variazione)) * 100, 1)}%
          </span>
        )}
      </div>
      {quota !== null && (
        <div
          className="h-[3px] rounded-full bg-[var(--surface-3)] overflow-hidden"
          title={`Obiettivo: ${obiettivo.testo}`}
        >
          <div
            className="h-full rounded-full bg-[var(--ink)] transition-[width] duration-700 ease-out"
            style={{ width: `${quota * 100}%`, opacity: quota >= 0.95 ? 1 : 0.55 }}
          />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Badge e stati
 * ------------------------------------------------------------------ */

/**
 * Toni dei badge.
 *
 * L'interfaccia è in grigi, ma uno stato che chiede un intervento merita il
 * colore: è l'unica cosa che si legge attraversando l'officina con il tablet
 * in mano. Al colore si affianca sempre il testo dell'etichetta, così chi non
 * distingue verde e rosso non perde niente.
 */
const TONI = {
  neutro: 'bg-[var(--surface-3)] text-[var(--ink-2)] border-[var(--line)]',
  accento: 'bg-[var(--surface-3)] text-[var(--ink)] border-[var(--line-forte)]',
  positivo: 'bg-[var(--segno-pos-velo)] text-[var(--segno-pos)] border-[color-mix(in_oklab,var(--segno-pos)_32%,transparent)]',
  negativo:
    'bg-[var(--segno-neg-velo)] text-[var(--segno-neg)] border-[color-mix(in_oklab,var(--segno-neg)_38%,transparent)] font-semibold',
  attenzione:
    'bg-[var(--segno-warn-velo)] text-[var(--segno-warn)] border-[color-mix(in_oklab,var(--segno-warn)_34%,transparent)]',
}

export function Badge({ tono = 'neutro', className, children, ...props }) {
  return (
    <span
      {...props}
      className={cx(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border whitespace-nowrap',
        TONI[tono] || TONI.neutro,
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Etichette leggibili degli stati, condivise da tutti i moduli. */
export const ETICHETTE_STATO = {
  accettato: 'Accettato',
  in_lavorazione: 'In lavorazione',
  attesa_ricambi: 'Attesa ricambi',
  pronto: 'Pronto',
  consegnato: 'Consegnato',
  fatturato: 'Fatturato',
  bozza: 'Bozza',
  inviato: 'Inviato',
  rifiutato: 'Rifiutato',
  scaduto: 'Scaduto',
  emessa: 'Emessa',
  parziale: 'Acconto',
  incassata: 'Incassata',
  insoluta: 'Insoluta',
  annullata: 'Annullata',
  annullato: 'Annullato',
  da_pagare: 'Da pagare',
  pagata: 'Pagata',
  ricevuto: 'Ricevuto',
  presenza: 'Presenza',
  ferie: 'Ferie',
  permesso: 'Permesso',
  malattia: 'Malattia',
  festivo: 'Festivo',
}

const TONO_STATO = {
  accettato: 'neutro',
  in_lavorazione: 'accento',
  attesa_ricambi: 'attenzione',
  pronto: 'positivo',
  consegnato: 'neutro',
  fatturato: 'positivo',
  bozza: 'neutro',
  inviato: 'accento',
  rifiutato: 'negativo',
  scaduto: 'attenzione',
  emessa: 'accento',
  parziale: 'attenzione',
  incassata: 'positivo',
  insoluta: 'negativo',
  annullata: 'neutro',
  annullato: 'neutro',
  da_pagare: 'attenzione',
  pagata: 'positivo',
  ricevuto: 'positivo',
  presenza: 'positivo',
  ferie: 'accento',
  permesso: 'attenzione',
  malattia: 'negativo',
  festivo: 'neutro',
}

export function StatoBadge({ stato, className }) {
  if (!stato) return null
  return (
    <Badge tono={TONO_STATO[stato] || 'neutro'} className={className}>
      {ETICHETTE_STATO[stato] || String(stato).replace(/_/g, ' ')}
    </Badge>
  )
}

/** Importo con segno: il colore raddoppia un'informazione che c'è già (il +/−). */
export function Importo({ valore, segno = false, decimali = 2, className, neutro = false }) {
  const n = Number(valore || 0)
  const stile =
    neutro || n === 0
      ? undefined
      : { color: n > 0 ? 'var(--segno-pos)' : 'var(--segno-neg)', fontWeight: 600 }
  return (
    <span className={cx('tabnum', className)} style={segno ? stile : undefined}>
      {euro(n, { decimali, segno })}
    </span>
  )
}

/* ------------------------------------------------------------------ *
 * Campi di modulo
 * ------------------------------------------------------------------ */

/**
 * Campi.
 *
 * Su mobile 48 px di altezza e testo a 16 px. La misura del testo non è un
 * gusto: sotto i 16 px iOS ingrandisce la pagina appena il campo prende il
 * fuoco, e l'utente si ritrova il modulo sformato con lo zoom da annullare a
 * mano. Da `lg` in su tutto torna com'era.
 *
 * IL PADDING ORIZZONTALE NON STA QUI. Chi ha un'icona dentro il campo — la
 * lente della ricerca, la freccia della tendina, il suffisso di un numero —
 * deve poterlo allargare da quel lato, e non può farlo se la base porta un
 * `lg:px-3`: una classe con variante batte una senza, quindi `pl-9` verrebbe
 * annullato proprio da `lg` in su, che è dove il campo è più stretto. Il
 * risultato era il testo che passava sotto l'icona su desktop.
 */
const CAMPO_BASE =
  'w-full h-12 lg:h-11 rounded-xl border border-[var(--line)] text-[16px] lg:text-sm ' +
  'placeholder:text-[var(--ink-3)] transition-[border-color,background-color,box-shadow] duration-200 ' +
  'focus:border-[var(--ink-3)] outline-none ' +
  'disabled:opacity-50 disabled:cursor-not-allowed'

/** Padding orizzontale predefinito, da comporre a mano dove serve diverso. */
const CAMPO_PAD = 'px-3.5 lg:px-3'
const CAMPO_SFONDO = 'bg-[var(--surface-2)] focus:bg-[var(--surface-3)]'

const CLASSI_CAMPO = `${CAMPO_BASE} ${CAMPO_PAD} ${CAMPO_SFONDO}`

/**
 * Le tendine hanno il fondo pieno, non semitrasparente come gli altri campi.
 *
 * La lista di un `<select>` la disegna il sistema operativo usando i colori
 * dell'elemento: con uno sfondo semitrasparente la compone su bianco, e nel
 * tema scuro il testo chiaro finisce su fondo chiaro. La tinta scelta è
 * quella che il campo composito ha già a schermo, quindi a occhio non cambia
 * niente — cambia che è opaca. Per lo stesso motivo qui non c'è il cambio di
 * sfondo al focus: quando la lista è aperta il campo è a fuoco.
 */
const CLASSI_SELECT = `${CAMPO_BASE} pl-3.5 lg:pl-3 pr-9 bg-[var(--tendina-fondo)]`

export function Campo({ etichetta, aiuto, errore, obbligatorio, className, children, id }) {
  const generato = useId()
  const idCampo = id || generato
  return (
    <label className={cx('block', className)} htmlFor={idCampo}>
      {etichetta && (
        <span className={cx('block text-xs font-medium mb-1.5', TESTO_2)}>
          {etichetta}
          {obbligatorio && <span className="text-[var(--ink)] ml-0.5">*</span>}
        </span>
      )}
      {typeof children === 'function' ? children(idCampo) : children}
      {errore ? (
        <span className="block text-xs mt-1 font-medium text-[var(--ink)]">{errore}</span>
      ) : (
        aiuto && <span className={cx('block text-xs mt-1 leading-relaxed', TESTO_3)}>{aiuto}</span>
      )}
    </label>
  )
}

export function Input({ className, ...props }) {
  return <input {...props} className={cx(CLASSI_CAMPO, className)} />
}

export function Textarea({ className, righe = 3, ...props }) {
  return (
    <textarea
      rows={righe}
      {...props}
      className={cx(CLASSI_CAMPO, 'h-auto py-2.5 leading-relaxed resize-y', className)}
    />
  )
}

export function Select({ className, opzioni = [], vuoto, children, ...props }) {
  return (
    <div className="relative">
      <select {...props} className={cx(CLASSI_SELECT, 'appearance-none cursor-pointer', className)}>
        {vuoto !== undefined && <option value="">{vuoto}</option>}
        {opzioni.map((o) => (
          <option key={o.valore ?? o} value={o.valore ?? o}>
            {o.etichetta ?? o}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown
        size={16}
        className={cx('absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none', TESTO_3)}
        aria-hidden
      />
    </div>
  )
}

/** Campo numerico che accetta sia la virgola sia il punto. */
export function InputNumero({ valore, onChange, decimali = 2, suffisso, className, ...props }) {
  const [testo, setTesto] = useState(() => formattaLocale(valore, decimali))
  const attivo = useRef(false)

  useEffect(() => {
    if (!attivo.current) setTesto(formattaLocale(valore, decimali))
  }, [valore, decimali])

  return (
    <div className="relative">
      <input
        {...props}
        inputMode="decimal"
        value={testo}
        onFocus={(e) => {
          attivo.current = true
          e.target.select()
        }}
        onChange={(e) => {
          const t = e.target.value
          setTesto(t)
          const n = Number(t.replace(/\./g, '').replace(',', '.'))
          onChange(t === '' ? 0 : Number.isFinite(n) ? n : 0)
        }}
        onBlur={() => {
          attivo.current = false
          setTesto(formattaLocale(valore, decimali))
        }}
        className={cx(
          CAMPO_BASE,
          CAMPO_SFONDO,
          'tabnum text-right',
          // Il suffisso ("€", "h", "km") occupa il bordo destro: il numero
          // deve fermarsi prima, o gli finisce sotto.
          suffisso ? 'pl-3.5 lg:pl-3 pr-10' : CAMPO_PAD,
          className,
        )}
      />
      {suffisso && (
        <span className={cx('absolute right-3 top-1/2 -translate-y-1/2 text-xs', TESTO_3)}>
          {suffisso}
        </span>
      )}
    </div>
  )
}

function formattaLocale(v, decimali) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: decimali })
}

export function Checkbox({ etichetta, descrizione, className, ...props }) {
  return (
    <label className={cx('flex items-start gap-3 cursor-pointer select-none py-1', className)}>
      <input
        type="checkbox"
        {...props}
        className="mt-0.5 h-5 w-5 rounded-md border border-[var(--line-forte)] bg-[var(--surface-2)] accent-[var(--accent)] cursor-pointer shrink-0"
      />
      <span className="min-w-0">
        <span className="text-sm block leading-snug">{etichetta}</span>
        {descrizione && <span className={cx('text-xs block mt-0.5 leading-relaxed', TESTO_3)}>{descrizione}</span>}
      </span>
    </label>
  )
}

export function Switch({ attivo, onChange, etichetta, className }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={attivo}
      onClick={() => onChange(!attivo)}
      className={cx('inline-flex items-center gap-2.5 select-none premi', className)}
    >
      <span
        className={cx(
          'w-10 h-6 rounded-full p-0.5 transition-colors duration-200 shrink-0 border',
          attivo ? 'bg-[var(--accent)] border-transparent' : 'bg-[var(--surface-3)] border-[var(--line)]',
        )}
      >
        <span
          className={cx(
            'block w-5 h-5 rounded-full transition-transform duration-200 ease-out',
            attivo ? 'translate-x-4 bg-[var(--accent-ink)]' : 'bg-[var(--ink-3)]',
          )}
        />
      </span>
      {etichetta && <span className="text-sm">{etichetta}</span>}
    </button>
  )
}

export function Ricerca({ valore, onChange, segnaposto = 'Cerca…', className, autoFocus }) {
  return (
    <div className={cx('relative', className)}>
      <Search
        size={16}
        className={cx('absolute left-3.5 lg:left-3 top-1/2 -translate-y-1/2 pointer-events-none', TESTO_3)}
        aria-hidden
      />
      <input
        type="search"
        value={valore}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={segnaposto}
        aria-label={segnaposto}
        className={cx(
          CAMPO_BASE,
          CAMPO_SFONDO,
          // La lente sta a sinistra dentro il campo, la crocetta a destra
          // quando c'è del testo: il padding deve lasciare posto a entrambe.
          'pl-11 lg:pl-9',
          valore ? 'pr-11 lg:pr-9' : 'pr-3.5 lg:pr-3',
        )}
      />
      {valore && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Azzera la ricerca"
          className={cx(
            'absolute right-2.5 lg:right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg hover:bg-[var(--surface-3)] wz-sfuma',
            TESTO_3,
          )}
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  )
}

/**
 * Gruppo di filtri a pillola, con l'indicatore che scivola da una voce
 * all'altra invece di saltare. Su schermo touch è più veloce di una tendina.
 */
export function Filtri({ valore, onChange, opzioni, className }) {
  const contenitore = useRef(null)
  const pillola = useIndicatore(contenitore, `${valore}|${opzioni.length}`, {
    scorriVersoAttivo: true,
  })

  return (
    <div
      ref={contenitore}
      className={cx(
        // Su mobile i filtri scorrono a filo schermo come un nastro, senza
        // barra di scorrimento e con l'aggancio sulle pillole.
        'relative flex items-center gap-1.5 overflow-x-auto pb-0.5 nastro',
        '-mx-4 px-4 lg:mx-0 lg:px-0',
        className,
      )}
    >
      {pillola && (
        // `left-0 top-0` non è ridondante: ancora l'origine al riquadro
        // interno al padding invece di lasciarla alla posizione statica.
        <span
          aria-hidden
          className="absolute left-0 top-0 rounded-lg bg-[var(--accent)] transition-[transform,width] duration-300 ease-out pointer-events-none"
          style={{ transform: `translateX(${pillola.x}px)`, width: pillola.w, height: pillola.h }}
        />
      )}
      {opzioni.map((o) => {
        const attivo = valore === o.valore
        return (
          <button
            key={o.valore ?? 'tutti'}
            type="button"
            data-attivo={attivo}
            onClick={() => onChange(o.valore)}
            className={cx(
              'relative z-10 h-10 lg:h-9 px-3.5 lg:px-3 rounded-lg text-[13px] font-medium whitespace-nowrap border transition-colors duration-200',
              attivo
                ? 'text-[var(--accent-ink)] border-transparent'
                : 'text-[var(--ink-2)] border-[var(--line)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]',
            )}
          >
            {o.etichetta}
            {o.conteggio !== undefined && (
              <span className={cx('ml-1.5 tabnum', attivo ? 'opacity-70' : 'opacity-55')}>
                {o.conteggio}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Tabella
 * ------------------------------------------------------------------ */

/**
 * Tabella dati.
 *
 * @param colonne  [{chiave, label, render?, valore?, allinea?, larghezza?,
 *                   ordinabile?, csv?, nascondiSuMobile?}]
 */
export function DataTable({
  colonne,
  righe,
  onRiga,
  chiaveRiga = (r) => r.id,
  ordineIniziale,
  vuoto = 'Nessun dato da mostrare.',
  denso = false,
  massimo,
  className,
  rigaEvidenziata,
  piedi,
}) {
  const [ordine, setOrdine] = useState(ordineIniziale || null)
  // Su mobile le righe diventano card, e duecentocinquanta card sono
  // duecentocinquanta nodi: si caricano a scaglioni.
  const PASSO_MOBILE = 30
  const [limiteMobile, setLimiteMobile] = useState(PASSO_MOBILE)

  const ordinate = useMemo(() => {
    if (!ordine) return righe
    const col = colonne.find((c) => c.chiave === ordine.chiave)
    if (!col) return righe
    const estrai = col.valore || ((r) => r[col.chiave])
    const dir = ordine.direzione === 'asc' ? 1 : -1
    return [...righe].sort((a, b) => {
      const va = estrai(a)
      const vb = estrai(b)
      if (va === vb) return 0
      if (va === null || va === undefined) return 1
      if (vb === null || vb === undefined) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      return String(va).localeCompare(String(vb), 'it', { numeric: true }) * dir
    })
  }, [righe, ordine, colonne])

  const visibili = massimo ? ordinate.slice(0, massimo) : ordinate

  const cambiaOrdine = useCallback((chiave) => {
    setOrdine((o) =>
      o?.chiave === chiave
        ? { chiave, direzione: o.direzione === 'asc' ? 'desc' : 'asc' }
        : { chiave, direzione: 'asc' },
    )
  }, [])

  // Cambiando filtro o ricerca si riparte dall'inizio: restare al centro di
  // un elenco che non c'è più è disorientante.
  useEffect(() => {
    setLimiteMobile(PASSO_MOBILE)
  }, [righe])

  /**
   * Colonne da mostrare nella versione mobile.
   *
   * Fuori restano quelle già marcate `nascondiSuMobile` e quelle senza
   * etichetta, che nei moduli sono le colonne di azioni: un pulsantino di
   * cestino dentro una card non ha senso, la card si apre e basta.
   */
  const colonneMobile = colonne.filter((c) => !c.nascondiSuMobile && c.label)
  const [titolo, ...dettagli] = colonneMobile
  const ordinabili = colonne.filter((c) => c.ordinabile !== false && c.label)

  const contenuto = (c, r) => (c.render ? c.render(r) : (c.valore ? c.valore(r) : r[c.chiave]) ?? '—')

  // Alcune tabelle mostrano righe aggregate (fatturato per cliente, righe di
  // un ordine) che non hanno un `id`: senza ripiego sull'indice la chiave
  // sarebbe `undefined` per tutte.
  const chiave = (r, i) => chiaveRiga(r) ?? i

  if (!righe.length) return <Vuoto messaggio={vuoto} />

  return (
    <>
      {/* ---------------------------- mobile ----------------------------
          Le righe sono voci di un pannello, non card dentro una card: quasi
          tutti i moduli mettono la tabella dentro una `Card padding={false}`,
          e due cornici a contatto sono rumore che su 375 px costa anche
          trenta pixel di larghezza. Il margine sta quindi nel contenuto — che
          è poi il motivo per cui la prima voce non risulta più incollata al
          bordo — e le righe si separano con un filo. */}
      <div className="lg:hidden">
        {ordinabili.length > 1 && (
          <div className="flex items-center gap-2 px-3.5 py-3 border-b border-[var(--line)]">
            <span className="text-[11px] text-[var(--ink-3)] shrink-0">Ordina per</span>
            <select
              value={ordine?.chiave || ''}
              onChange={(e) =>
                setOrdine(e.target.value ? { chiave: e.target.value, direzione: 'asc' } : null)
              }
              aria-label="Ordina l’elenco"
              className="h-9 grow min-w-0 px-2.5 rounded-lg bg-[var(--tendina-fondo)] border border-[var(--line)] text-[13px] outline-none focus:border-[var(--ink-3)]"
            >
              <option value="">Ordine predefinito</option>
              {ordinabili.map((c) => (
                <option key={c.chiave} value={c.chiave}>
                  {c.label}
                </option>
              ))}
            </select>
            {ordine && (
              <button
                type="button"
                onClick={() => cambiaOrdine(ordine.chiave)}
                aria-label={ordine.direzione === 'asc' ? 'Ordine crescente' : 'Ordine decrescente'}
                className="premi h-9 w-9 grid place-items-center rounded-lg border border-[var(--line)] text-[var(--ink-2)] shrink-0"
              >
                {ordine.direzione === 'asc' ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
              </button>
            )}
          </div>
        )}

        <ul className="wz-scaglione divide-y divide-[var(--line)]">
          {visibili.slice(0, limiteMobile).map((r, i) => (
            <li key={chiave(r, i)} style={{ '--i': Math.min(i, 14) }}>
              <div
                onClick={onRiga ? () => onRiga(r) : undefined}
                role={onRiga ? 'button' : undefined}
                tabIndex={onRiga ? 0 : undefined}
                onKeyDown={
                  onRiga ? (e) => (e.key === 'Enter' || e.key === ' ') && onRiga(r) : undefined
                }
                className={cx(
                  'px-3.5 py-3.5',
                  onRiga && 'cursor-pointer active:bg-[var(--surface-3)] transition-colors',
                  rigaEvidenziata?.(r) && 'bg-[var(--surface-3)]',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 text-[15px] font-medium">{titolo && contenuto(titolo, r)}</div>
                  {dettagli.length > 1 && (
                    <div className="shrink-0 text-right text-sm tabnum">
                      {contenuto(dettagli[dettagli.length - 1], r)}
                    </div>
                  )}
                </div>

                {dettagli.length > 1 && (
                  <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-2">
                    {dettagli.slice(0, -1).map((c) => (
                      <div key={c.chiave} className="min-w-0">
                        <dt className="text-[10.5px] uppercase tracking-[0.07em] text-[var(--ink-3)]">
                          {c.label}
                        </dt>
                        <dd className="text-[13px] mt-0.5 tabnum">{contenuto(c, r)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            </li>
          ))}
        </ul>

        {visibili.length > limiteMobile && (
          <div className="px-3.5 py-3.5 border-t border-[var(--line)] flex flex-col items-center gap-1.5">
            <Button variante="contorno" onClick={() => setLimiteMobile((n) => n + PASSO_MOBILE)}>
              Mostra altri {Math.min(PASSO_MOBILE, visibili.length - limiteMobile)}
            </Button>
            <span className={cx('text-xs', TESTO_3)}>
              {limiteMobile} di {visibili.length}
            </span>
          </div>
        )}
      </div>

      {/* --------------------------- da lg in su -------------------------- */}
    <div
      className={cx(
        'hidden lg:block overflow-x-auto -mx-4 sm:mx-0 sm:rounded-xl sm:border sm:border-[var(--line)]',
        className,
      )}
    >
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="bg-[var(--surface-2)] backdrop-blur">
            {colonne.map((c) => (
              <th
                key={c.chiave}
                scope="col"
                style={c.larghezza ? { width: c.larghezza } : undefined}
                className={cx(
                  'text-left font-medium text-[10.5px] uppercase tracking-[0.08em] px-3 py-2.5',
                  'border-b border-[var(--line)] whitespace-nowrap',
                  TESTO_3,
                  c.allinea === 'destra' && 'text-right',
                  c.allinea === 'centro' && 'text-center',
                  c.nascondiSuMobile && 'hidden lg:table-cell',
                )}
              >
                {c.ordinabile === false ? (
                  c.label
                ) : (
                  <button
                    type="button"
                    onClick={() => cambiaOrdine(c.chiave)}
                    className="inline-flex items-center gap-1 hover:text-[var(--ink)] transition-colors"
                  >
                    {c.label}
                    {ordine?.chiave === c.chiave &&
                      (ordine.direzione === 'asc' ? (
                        <ArrowUp size={11} className="wz-sfuma" aria-hidden />
                      ) : (
                        <ArrowDown size={11} className="wz-sfuma" aria-hidden />
                      ))}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="wz-scaglione">
          {visibili.map((r, i) => (
            <tr
              key={chiave(r, i)}
              style={{ '--i': Math.min(i, 16) }}
              onClick={onRiga ? () => onRiga(r) : undefined}
              className={cx(
                'border-b border-[var(--line)] last:border-0 transition-colors duration-150',
                onRiga && 'cursor-pointer hover:bg-[var(--surface-3)]',
                rigaEvidenziata?.(r) && 'bg-[var(--surface-3)]',
              )}
            >
              {colonne.map((c) => (
                <td
                  key={c.chiave}
                  className={cx(
                    'px-3 align-middle',
                    denso ? 'py-2' : 'py-3',
                    c.allinea === 'destra' && 'text-right tabnum',
                    c.allinea === 'centro' && 'text-center',
                    c.nascondiSuMobile && 'hidden lg:table-cell',
                    c.className,
                  )}
                >
                  {c.render ? c.render(r) : (c.valore ? c.valore(r) : r[c.chiave]) ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {piedi && <tfoot className="bg-[var(--surface-2)] font-medium">{piedi}</tfoot>}
      </table>
      {massimo && ordinate.length > massimo && (
        <p className={cx('text-xs px-3 py-2 border-t border-[var(--line)]', TESTO_3)}>
          Mostrate {massimo} righe su {ordinate.length}.
        </p>
      )}
    </div>
    </>
  )
}

/** Esporta in CSV le stesse righe che l'utente sta guardando. */
export function EsportaCsv({ nomeFile, colonne, righe, misura = 'sm', etichetta = 'CSV' }) {
  const scarica = () => {
    const cols = colonne
      .filter((c) => c.csv !== false)
      .map((c) => ({ label: c.label, value: c.csv || c.valore || ((r) => r[c.chiave]) }))
    const contenuto = costruisciCsv(cols, righe)
    const blob = new Blob([contenuto], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${nomeFile}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <Button misura={misura} variante="contorno" icona={Download} onClick={scarica} disabled={!righe.length}>
      {etichetta}
    </Button>
  )
}

/* ------------------------------------------------------------------ *
 * Stati vuoti e caricamento
 * ------------------------------------------------------------------ */

export function Vuoto({ messaggio = 'Nessun dato.', descrizione, azione, icona: Icona }) {
  return (
    <div className="text-center py-12 px-4 wz-in">
      {Icona && (
        <span className="inline-grid place-items-center h-11 w-11 rounded-2xl bg-[var(--surface-3)] mb-3">
          <Icona size={20} className={TESTO_3} aria-hidden />
        </span>
      )}
      <p className={cx('text-sm font-medium', TESTO_2)}>{messaggio}</p>
      {descrizione && (
        <p className={cx('text-xs mt-1.5 max-w-sm mx-auto leading-relaxed', TESTO_3)}>{descrizione}</p>
      )}
      {azione && <div className="mt-4">{azione}</div>}
    </div>
  )
}

/** Rettangolo che luccica: dice "sta arrivando" meglio di uno spinner. */
export function Scheletro({ className, radius = 'rounded-xl' }) {
  return <div className={cx('wz-luccichio bg-[var(--surface-2)]', radius, className)} />
}

export function Caricamento({ testo = 'Caricamento…' }) {
  return (
    <div className="py-2 wz-sfuma" role="status" aria-label={testo}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <Scheletro key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <Scheletro className="h-64 rounded-2xl" />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Modale
 * ------------------------------------------------------------------ */

const LARGHEZZE = { sm: 'max-w-md', md: 'max-w-2xl', lg: 'max-w-4xl', xl: 'max-w-6xl' }

/**
 * Blocco dello scorrimento mentre un pannello è aperto.
 *
 * Va messo su `html` e non su `body`: da quando lo scorrimento sta sulla
 * pagina, l'elemento che scorre è `document.documentElement`, e bloccare il
 * body non fermava più niente. La compensazione della barra di scorrimento
 * evita che il contenuto salti di lato nel momento in cui sparisce.
 */
function useBloccoScorrimento(attivo) {
  useEffect(() => {
    if (!attivo) return undefined
    const doc = document.documentElement
    const larghezzaBarra = window.innerWidth - doc.clientWidth
    const overflowPrec = doc.style.overflow
    const padPrec = doc.style.paddingRight
    doc.style.overflow = 'hidden'
    if (larghezzaBarra > 0) doc.style.paddingRight = `${larghezzaBarra}px`
    return () => {
      doc.style.overflow = overflowPrec
      doc.style.paddingRight = padPrec
    }
  }, [attivo])
}

/**
 * Chiusura con Esc.
 */
function useChiudiConEsc(attivo, onChiudi) {
  useEffect(() => {
    if (!attivo) return undefined
    const su = (e) => e.key === 'Escape' && onChiudi()
    document.addEventListener('keydown', su)
    return () => document.removeEventListener('keydown', su)
  }, [attivo, onChiudi])
}

/**
 * Gli overlay vengono montati in fondo a `document.body`, non dove sono
 * scritti nel JSX.
 *
 * `position: fixed` non si riferisce al viewport se un antenato ha un
 * `transform`, un `filter`, un `backdrop-filter` o un `will-change`: quello
 * diventa il suo contenitore. In questa interfaccia succede ovunque — ogni
 * card di vetro ha un `backdrop-filter`, ogni modulo entra con una piccola
 * traslazione — e il risultato era una modale piazzata a settemila pixel dalla
 * cima della pagina invece che davanti agli occhi. Fuori dall'albero il
 * problema non si pone, oggi né domani.
 */
function Portale({ children }) {
  const [pronto, setPronto] = useState(false)
  useEffect(() => setPronto(true), [])
  if (!pronto || typeof document === 'undefined') return null
  return createPortal(children, document.body)
}

export function Modal({ aperto, onChiudi, titolo, sottotitolo, larghezza = 'md', piede, children }) {
  useChiudiConEsc(aperto, onChiudi)
  useBloccoScorrimento(aperto)

  if (!aperto) return null

  return (
    <Portale>
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[6px] wz-sfuma"
        onClick={onChiudi}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        className={cx(
          'relative w-full vetro-forte wz-modale',
          // `dvh` e non `vh`: su mobile la barra del browser compare e sparisce
          // mentre si scorre, e con `vh` il foglio finisce sotto la barra.
          'rounded-t-3xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[88vh] flex flex-col',
          LARGHEZZE[larghezza],
        )}
      >
        {/* Maniglia: sul telefono dice che il foglio si può trascinare via. */}
        <div className="sm:hidden pt-2.5 pb-1 flex justify-center shrink-0">
          <span className="h-1 w-9 rounded-full bg-[var(--line-forte)]" />
        </div>

        <div className="flex items-start justify-between gap-3 px-4 pb-4 pt-3 sm:p-5 border-b border-[var(--line)] shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate tracking-tight">{titolo}</h2>
            {sottotitolo && <p className={cx('text-xs mt-0.5', TESTO_3)}>{sottotitolo}</p>}
          </div>
          <IconButton etichetta="Chiudi" icona={X} misura="iconaSm" onClick={onChiudi} />
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto grow">{children}</div>

        {/* Su mobile i pulsanti si impilano a tutta larghezza, in ordine
            inverso: l'azione principale — che nel JSX è l'ultima — finisce in
            cima, dove arriva il pollice. Da sm in su tornano in riga. */}
        {piede && (
          <div
            className={cx(
              'p-4 sm:px-5 border-t border-[var(--line)] shrink-0 bg-[var(--surface-2)] rounded-b-2xl safe-basso',
              'flex flex-col-reverse gap-2',
              'sm:flex-row sm:flex-wrap sm:items-center sm:justify-end',
              '[&>button]:w-full sm:[&>button]:w-auto',
            )}
          >
            {piede}
          </div>
        )}
      </div>
    </div>
    </Portale>
  )
}

export function Conferma({
  aperto,
  onChiudi,
  onConferma,
  titolo,
  messaggio,
  etichettaOk = 'Conferma',
  pericoloso,
}) {
  const [inCorso, setInCorso] = useState(false)
  return (
    <Modal
      aperto={aperto}
      onChiudi={onChiudi}
      titolo={titolo}
      larghezza="sm"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante={pericoloso ? 'pericolo' : 'primario'}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onConferma()
                onChiudi()
              } finally {
                setInCorso(false)
              }
            }}
          >
            {etichettaOk}
          </Button>
        </>
      }
    >
      <p className={cx('text-sm leading-relaxed', TESTO_2)}>{messaggio}</p>
    </Modal>
  )
}

/**
 * Foglio che sale dal basso. Sul telefono sostituisce i menu a tendina, che
 * con un dito grosso e un guanto da officina sono impraticabili.
 */
export function Foglio({ aperto, onChiudi, titolo, children }) {
  useChiudiConEsc(aperto, onChiudi)
  useBloccoScorrimento(aperto)

  if (!aperto) return null

  return (
    <Portale>
    <div className="fixed inset-0 z-50 flex items-end justify-center no-print">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[6px] wz-sfuma" onClick={onChiudi} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={titolo}
        className="relative w-full vetro-forte rounded-t-3xl wz-foglio max-h-[80vh] overflow-y-auto safe-basso"
      >
        <div className="pt-2.5 pb-1 flex justify-center sticky top-0">
          <span className="h-1 w-9 rounded-full bg-[var(--line-forte)]" />
        </div>
        {titolo && (
          <p className={cx('px-5 pt-1 pb-3 text-[11px] uppercase tracking-[0.09em] font-medium', TESTO_3)}>
            {titolo}
          </p>
        )}
        <div className="px-3 pb-4">{children}</div>
      </div>
    </div>
    </Portale>
  )
}

/* ------------------------------------------------------------------ *
 * Schede a linguette
 * ------------------------------------------------------------------ */

export function Tabs({ valore, onChange, voci, className }) {
  const contenitore = useRef(null)
  const barra = useIndicatore(contenitore, `${valore}|${voci.length}`, {
    scorriVersoAttivo: true,
  })

  return (
    <div
      ref={contenitore}
      className={cx('relative flex gap-1 border-b border-[var(--line)] overflow-x-auto', className)}
      role="tablist"
    >
      {barra && (
        <span
          aria-hidden
          className="absolute left-0 bottom-0 h-[2px] bg-[var(--ink)] transition-[transform,width] duration-300 ease-out"
          style={{ transform: `translateX(${barra.x}px)`, width: barra.w }}
        />
      )}
      {voci.map((v) => {
        const attivo = valore === v.valore
        return (
          <button
            key={v.valore}
            role="tab"
            data-attivo={attivo}
            aria-selected={attivo}
            type="button"
            onClick={() => onChange(v.valore)}
            className={cx(
              'px-3.5 h-11 text-sm font-medium whitespace-nowrap transition-colors duration-200',
              attivo ? 'text-[var(--ink)]' : 'text-[var(--ink-3)] hover:text-[var(--ink-2)]',
            )}
          >
            {v.etichetta}
            {v.conteggio !== undefined && (
              <span className="ml-1.5 text-xs tabnum opacity-60">{v.conteggio}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Elementi minori
 * ------------------------------------------------------------------ */

/** Riga etichetta/valore, il mattone delle schede di dettaglio. */
export function Dato({ etichetta, valore, className, mono }) {
  return (
    <div className={cx('min-w-0', className)}>
      <dt className={cx('text-[10.5px] uppercase tracking-[0.08em] mb-0.5', TESTO_3)}>{etichetta}</dt>
      <dd className={cx('text-sm truncate', mono && 'font-mono')}>{valore ?? '—'}</dd>
    </div>
  )
}

/**
 * Avatar.
 *
 * Le persone sono l'unico posto dell'interfaccia in cui il colore serve solo
 * a distinguere: gli stessi sei toni dei grafici, così un meccanico ha la
 * stessa tinta nell'elenco, nel calendario dei turni e sulla scheda.
 */
const TINTE_AVATAR = ['#7aa2f7', '#e8a33d', '#56c4b5', '#cc79a7', '#b9a3f0', '#8fb573']

export function Avatar({ iniziali, colore = 0, misura = 36, className, titolo }) {
  const tinta = TINTE_AVATAR[colore % TINTE_AVATAR.length]
  return (
    <span
      title={titolo}
      className={cx(
        'inline-flex items-center justify-center rounded-full font-semibold shrink-0',
        className,
      )}
      style={{
        width: misura,
        height: misura,
        fontSize: misura * 0.36,
        background: `color-mix(in oklab, ${tinta} 22%, transparent)`,
        color: tinta,
        border: `1px solid color-mix(in oklab, ${tinta} 40%, transparent)`,
      }}
    >
      {iniziali}
    </span>
  )
}

export function Barra({ quota, colore = 'var(--ink)', altezza = 6, className, titolo }) {
  return (
    <div
      title={titolo}
      className={cx('rounded-full bg-[var(--surface-3)] overflow-hidden w-full', className)}
      style={{ height: altezza }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{
          width: `${Math.min(100, Math.max(0, Number(quota || 0) * 100))}%`,
          background: colore,
        }}
      />
    </div>
  )
}

const ICONE_AVVISO = { info: Info, attenzione: AlertTriangle, errore: AlertTriangle, ok: Check }

const STILE_AVVISO = {
  info: 'bg-[var(--surface-3)] border-[var(--line)] text-[var(--ink-2)]',
  ok: 'bg-[var(--segno-pos-velo)] border-[color-mix(in_oklab,var(--segno-pos)_30%,transparent)] text-[var(--ink)]',
  attenzione:
    'bg-[var(--segno-warn-velo)] border-[color-mix(in_oklab,var(--segno-warn)_32%,transparent)] text-[var(--ink)]',
  errore:
    'bg-[var(--segno-neg-velo)] border-[color-mix(in_oklab,var(--segno-neg)_36%,transparent)] text-[var(--ink)]',
}

const COLORE_ICONA_AVVISO = {
  info: 'var(--ink-3)',
  ok: 'var(--segno-pos)',
  attenzione: 'var(--segno-warn)',
  errore: 'var(--segno-neg)',
}

export function Avviso({ tipo = 'info', titolo, children, azioni, className }) {
  const Icona = ICONE_AVVISO[tipo] || Info
  return (
    <div
      className={cx(
        'rounded-xl border p-3.5 flex gap-3 text-sm wz-in',
        STILE_AVVISO[tipo] || STILE_AVVISO.info,
        className,
      )}
      style={{ '--icona': COLORE_ICONA_AVVISO[tipo] }}
    >
      <Icona size={17} className="shrink-0 mt-0.5" style={{ color: 'var(--icona)' }} aria-hidden />
      <div className="min-w-0 grow">
        {titolo && <p className="font-semibold mb-0.5">{titolo}</p>}
        <div className="leading-relaxed text-[var(--ink-2)]">{children}</div>
      </div>
      {azioni && <div className="shrink-0 flex items-center gap-2">{azioni}</div>}
    </div>
  )
}

/** Intestazione di modulo: titolo, conteggio, ricerca e azione principale. */
export function TestataModulo({ titolo, conteggio, descrizione, cerca, onCerca, azioni, segnaposto }) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-5 wz-in">
      <div className="min-w-0 grow">
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2.5">
          {titolo}
          {conteggio !== undefined && (
            <span className={cx('text-sm font-normal tabnum', TESTO_3)}>{conteggio}</span>
          )}
        </h1>
        {descrizione && <p className={cx('text-xs mt-1', TESTO_3)}>{descrizione}</p>}
      </div>
      {/* Su schermo stretto la ricerca si prende la riga e i pulsanti vanno
          sotto: schiacciarli tutti insieme li rendeva impossibili da toccare. */}
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:shrink-0">
        {onCerca && (
          <Ricerca
            valore={cerca}
            onChange={onCerca}
            segnaposto={segnaposto || 'Cerca…'}
            className="w-full lg:w-72 order-first lg:order-none"
          />
        )}
        {azioni}
      </div>
    </div>
  )
}

/** Pulsante "Nuovo…" ripetuto in ogni modulo. */
export function Nuovo({ children = 'Nuovo', ...props }) {
  return (
    <Button variante="primario" icona={Plus} {...props}>
      {children}
    </Button>
  )
}

/* ------------------------------------------------------------------ *
 * Notifiche a comparsa
 * ------------------------------------------------------------------ */

export function Toasts({ toasts, onChiudi }) {
  if (!toasts.length) return null
  return (
    <Portale>
    <div className="fixed sopra-barra lg:bottom-4 right-3 left-3 sm:left-auto z-[60] flex flex-col gap-2 items-stretch sm:items-end no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            'wz-scorri rounded-xl px-4 py-3 text-sm flex items-start gap-2.5 sm:max-w-md vetro-forte',
            t.tipo === 'errore' &&
              'border-[color-mix(in_oklab,var(--segno-neg)_45%,transparent)]',
            t.tipo === 'ok' && 'border-[color-mix(in_oklab,var(--segno-pos)_40%,transparent)]',
          )}
        >
          <span
            className="mt-0.5 shrink-0"
            style={{
              color:
                t.tipo === 'errore'
                  ? 'var(--segno-neg)'
                  : t.tipo === 'info'
                    ? 'var(--ink-3)'
                    : 'var(--segno-pos)',
            }}
          >
            {t.tipo === 'errore' ? (
              <AlertTriangle size={16} />
            ) : t.tipo === 'info' ? (
              <Info size={16} />
            ) : (
              <Check size={16} />
            )}
          </span>
          <span className="grow leading-snug">{t.messaggio}</span>
          <button
            type="button"
            onClick={() => onChiudi(t.id)}
            aria-label="Chiudi"
            className={cx('shrink-0 p-0.5 rounded hover:bg-[var(--surface-3)]', TESTO_3)}
          >
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
    </Portale>
  )
}

/* ------------------------------------------------------------------ *
 * Aiuti per la ricerca testuale
 * ------------------------------------------------------------------ */

/** Filtro su più campi, insensibile ad accenti e maiuscole. */
export function filtraTesto(righe, query, campi) {
  const q = chiaveRicerca(query).trim()
  if (!q) return righe
  const parole = q.split(/\s+/)
  return righe.filter((r) => {
    const testo = chiaveRicerca(campi.map((f) => (typeof f === 'function' ? f(r) : r[f])).join(' '))
    return parole.every((p) => testo.includes(p))
  })
}
