/**
 * Il flusso di una scheda di lavoro, in un posto solo.
 *
 * Gli stati (accettato, in lavorazione, attesa ricambi, pronto, consegnato,
 * fatturato) dicono *dov'è* la scheda. Un meccanico con le mani sporche che
 * guarda un tablet appeso al muro ha bisogno di sapere *cosa deve fare*, ed è
 * un'altra cosa. Qui lo stato viene tradotto in una o due azioni con un verbo
 * all'imperativo, e la stessa traduzione la usano la dashboard, l'elenco
 * schede e il dettaglio: se cambia il flusso, cambia in un file solo.
 */

import {
  CheckCircle2,
  Clock,
  PackageSearch,
  Play,
  Receipt,
  Truck,
  Wrench,
} from 'lucide-react'
import { Badge, Button, StatoBadge, cx } from './ui.jsx'
import { data as fmtData, giorniTra, km as fmtKm, oggiIso, ore as fmtOre, targa as fmtTarga } from '../utils/format.js'

/* ------------------------------------------------------------------ *
 * Le fasi
 * ------------------------------------------------------------------ */

export const FASI = [
  { id: 'accettato', nome: 'Accettata', aiuto: 'Il veicolo è in officina, il lavoro non è ancora cominciato.' },
  { id: 'in_lavorazione', nome: 'In lavorazione', aiuto: 'Ci si sta lavorando adesso.' },
  { id: 'attesa_ricambi', nome: 'Attesa ricambi', aiuto: 'Ferma: manca un pezzo.' },
  { id: 'pronto', nome: 'Pronta', aiuto: 'Lavoro finito, il cliente può venire a ritirare.' },
  { id: 'consegnato', nome: 'Consegnata', aiuto: 'Il veicolo è uscito dall’officina.' },
  { id: 'fatturato', nome: 'Fatturata', aiuto: 'Fattura emessa: la scheda è chiusa.' },
]

const INDICE_FASE = Object.fromEntries(FASI.map((f, i) => [f.id, i]))

/**
 * Le azioni possibili adesso, in ordine di importanza.
 *
 * La prima è quella che nove volte su dieci si vuole fare, e nell'interfaccia
 * diventa il pulsante pieno. `patch` restituisce cosa scrivere sulla scheda:
 * chi chiama non deve sapere niente del flusso.
 */
export function prossimeAzioni(job, { ruolo = 'titolare' } = {}) {
  if (!job) return []
  const oggi = oggiIso()
  const azioni = []

  switch (job.stato) {
    case 'accettato':
      azioni.push({
        id: 'inizia',
        etichetta: 'Inizia il lavoro',
        icona: Play,
        primaria: true,
        patch: (j) => ({ stato: 'in_lavorazione', dataInizio: j.dataInizio || oggi }),
      })
      break

    case 'in_lavorazione':
      azioni.push({
        id: 'pronto',
        etichetta: 'Ho finito',
        icona: CheckCircle2,
        primaria: true,
        patch: () => ({ stato: 'pronto' }),
      })
      azioni.push({
        id: 'attesa',
        etichetta: 'Manca un pezzo',
        icona: PackageSearch,
        patch: () => ({ stato: 'attesa_ricambi' }),
      })
      break

    case 'attesa_ricambi':
      azioni.push({
        id: 'riprendi',
        etichetta: 'Il pezzo è arrivato',
        icona: Play,
        primaria: true,
        patch: (j) => ({ stato: 'in_lavorazione', dataInizio: j.dataInizio || oggi }),
      })
      break

    case 'pronto':
      azioni.push({
        id: 'consegna',
        etichetta: 'Consegnata al cliente',
        icona: Truck,
        primaria: true,
        patch: () => ({ stato: 'consegnato', dataConsegna: oggi }),
      })
      break

    default:
      break
  }

  // La fatturazione non è un cambio di stato ma un'operazione di dominio:
  // chi la usa apre la scheda. Al meccanico non compare proprio.
  if (ruolo !== 'meccanico' && !job.invoiceId && ['pronto', 'consegnato'].includes(job.stato)) {
    azioni.push({
      id: 'fattura',
      etichetta: job.garanzia ? 'Chiudi in garanzia' : 'Chiudi e fattura',
      icona: Receipt,
      apreScheda: true,
    })
  }

  return azioni
}

/** Una frase sola che dice a chi guarda cosa ci si aspetta da lui. */
export function cosaFare(job) {
  if (!job) return ''
  switch (job.stato) {
    case 'accettato':
      return 'Da iniziare'
    case 'in_lavorazione':
      return 'In corso'
    case 'attesa_ricambi':
      return 'Ferma: manca un pezzo'
    case 'pronto':
      return 'Avvisa il cliente'
    case 'consegnato':
      return 'Da fatturare'
    default:
      return 'Chiusa'
  }
}

/* ------------------------------------------------------------------ *
 * Percorso
 * ------------------------------------------------------------------ */

/**
 * Il percorso della scheda, con la fase attuale in evidenza.
 *
 * Serve a rispondere a colpo d'occhio a due domande che altrimenti
 * richiedono di conoscere il gestionale: a che punto siamo, e cosa viene dopo.
 */
export function Percorso({ stato, className }) {
  const attuale = INDICE_FASE[stato] ?? 0
  // "Attesa ricambi" è una deviazione, non un passo avanti: nel percorso
  // lineare occupa il posto della lavorazione.
  const fasi = FASI.filter((f) => f.id !== 'attesa_ricambi' || stato === 'attesa_ricambi')

  return (
    <ol className={cx('flex items-center gap-1', className)} aria-label="Avanzamento della scheda">
      {fasi.map((f) => {
        const i = INDICE_FASE[f.id]
        const fatta = i < attuale
        const corrente = f.id === stato
        return (
          <li key={f.id} className="flex-1 min-w-0" title={f.aiuto}>
            <span
              className={cx(
                'block h-1 rounded-full transition-colors duration-300',
                corrente
                  ? 'bg-[var(--ink)]'
                  : fatta
                    ? 'bg-[var(--ink-3)]'
                    : 'bg-[var(--surface-3)]',
              )}
            />
            <span
              className={cx(
                'block text-[10px] mt-1.5 truncate transition-colors',
                corrente ? 'text-[var(--ink)] font-semibold' : 'text-[var(--ink-3)]',
              )}
            >
              {f.nome}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/* ------------------------------------------------------------------ *
 * Card della scheda
 * ------------------------------------------------------------------ */

/**
 * Scheda di lavoro come card.
 *
 * Sostituisce la riga di tabella dove chi legge ha i guanti: targa grande e
 * monospaziata perché è la chiave con cui si riconosce l'auto, il difetto per
 * esteso, e in fondo il pulsante con l'azione da fare adesso — senza dover
 * aprire niente.
 */
export function CardScheda({
  job,
  veicolo,
  cliente,
  ruolo = 'titolare',
  giorniAlert = 5,
  evidenzia = false,
  onApri,
  onAzione,
  className,
}) {
  const azioni = prossimeAzioni(job, { ruolo })
  const primaria = azioni.find((a) => a.primaria)
  const secondarie = azioni.filter((a) => !a.primaria)
  const fermaDa = -giorniTra(oggiIso(), job.dataInizio || job.dataApertura)
  const inRitardo = fermaDa > giorniAlert && !['consegnato', 'fatturato'].includes(job.stato)

  return (
    <div
      className={cx(
        'vetro vetro-luce rounded-2xl p-4 flex flex-col gap-3 min-w-0',
        evidenzia && 'border-[var(--line-forte)]',
        className,
      )}
    >
      <button type="button" onClick={() => onApri?.(job)} className="text-left min-w-0 group">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block font-mono text-lg font-semibold tracking-tight group-hover:underline underline-offset-4">
              {fmtTarga(veicolo?.targa)}
            </span>
            <span className="block text-xs text-[var(--ink-2)] mt-0.5 truncate">
              {veicolo?.marca} {veicolo?.modello}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1 shrink-0">
            <StatoBadge stato={job.stato} />
            {job.garanzia && <Badge tono="attenzione">Garanzia</Badge>}
          </span>
        </span>

        <span className="block text-sm mt-2.5 line-clamp-2 text-[var(--ink)]">
          {job.difetto || job.tipoIntervento || '—'}
        </span>

        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-[var(--ink-3)]">
          <span>Scheda {job.numero}</span>
          {job.ponte && <span>· Ponte {job.ponte}</span>}
          {veicolo?.km ? <span>· {fmtKm(job.kmIngresso || veicolo.km)}</span> : null}
          {job.orePreviste ? <span>· {fmtOre(job.orePreviste, 1)} previste</span> : null}
          <span
            className={cx('ml-auto', inRitardo && 'font-semibold')}
            style={inRitardo ? { color: 'var(--segno-neg)' } : undefined}
          >
            {['consegnato', 'fatturato'].includes(job.stato)
              ? fmtData(job.dataConsegna)
              : `in officina da ${fermaDa} gg`}
          </span>
        </span>
      </button>

      <Percorso stato={job.stato} />

      {/* Le azioni sono alte 44 px: si toccano con i guanti, che è la
          condizione normale di chi le usa. */}
      {(primaria || secondarie.length > 0) && (
        <div className="flex flex-wrap gap-2 pt-1">
          {primaria && (
            <Button
              variante="primario"
              misura="md"
              icona={primaria.icona}
              onClick={() => (primaria.apreScheda ? onApri?.(job) : onAzione?.(job, primaria))}
              className="grow sm:grow-0"
            >
              {primaria.etichetta}
            </Button>
          )}
          {secondarie.map((a) => (
            <Button
              key={a.id}
              variante="contorno"
              misura="md"
              icona={a.icona}
              onClick={() => (a.apreScheda ? onApri?.(job) : onAzione?.(job, a))}
              className="grow sm:grow-0"
            >
              {a.etichetta}
            </Button>
          ))}
          <Button variante="fantasma" misura="md" icona={Wrench} onClick={() => onApri?.(job)}>
            Apri
          </Button>
        </div>
      )}

      {cliente && (
        <p className="text-[11px] text-[var(--ink-3)] truncate flex items-center gap-1.5">
          <Clock size={11} aria-hidden /> {cliente}
        </p>
      )}
    </div>
  )
}
