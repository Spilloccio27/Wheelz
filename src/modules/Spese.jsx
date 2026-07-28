/**
 * Spese e spese ricorrenti.
 *
 * Le ricorrenti sono template, non righe: ogni mese si generano le spese
 * effettive con una funzione idempotente (chiave: template + mese). Si può
 * lanciare la generazione tutte le volte che si vuole senza duplicare nulla,
 * ed è quello che l'applicazione fa aprendo il modulo.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { RefreshCw, Paperclip, Repeat, Trash2, TrendingDown, Wallet } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import {
  Avviso,
  Badge,
  Button,
  Campo,
  Card,
  CardHeader,
  Checkbox,
  Conferma,
  DataTable,
  Dato,
  EsportaCsv,
  Filtri,
  Input,
  InputNumero,
  KPI,
  Modal,
  Nuovo,
  Select,
  StatoBadge,
  Tabs,
  Textarea,
  TestataModulo,
  Vuoto,
  filtraTesto,
} from '../components/ui.jsx'
import storageService from '../data/storageService.js'
import { assi, colore, fondoCard, serie } from '../utils/chartColors.js'
import { arrotonda } from '../utils/calc.js'
import {
  MESI,
  addGiorni,
  addMesi,
  data as fmtData,
  euro,
  giorniTra,
  meseDi,
  numero,
  oggiIso,
  rangeMese,
} from '../utils/format.js'

const CATEGORIE = [
  'Ricambi e materiali',
  'Affitto',
  'Utenze',
  'Attrezzatura',
  'Smaltimento oli e rifiuti',
  'Assicurazioni',
  'Consulenze',
  'Formazione',
  'Carburante',
  'Altro',
]

const METODI = ['Bonifico', 'Addebito SDD', 'Contanti', 'Carta', 'Assegno', 'RiBa']

const VUOTO_SPESA = {
  data: oggiIso(),
  categoria: 'Utenze',
  descrizione: '',
  supplierId: '',
  imponibile: 0,
  aliquotaIva: 22,
  tipo: 'variabile',
  stato: 'da_pagare',
  scadenza: addGiorni(oggiIso(), 30),
  metodoPagamento: 'Bonifico',
  allegatoPath: null,
  allegatoNome: '',
  recurringId: null,
  orderId: null,
  note: '',
}

const VUOTO_RICORRENTE = {
  descrizione: '',
  categoria: 'Utenze',
  supplierId: '',
  imponibile: 0,
  aliquotaIva: 22,
  tipo: 'fisso',
  giornoMese: 1,
  attivo: true,
  dataInizio: oggiIso(),
  dataFine: '',
}

export default function Spese() {
  const { db, periodo, dataService, toast } = useApp()
  const [tab, setTab] = useState('spese')
  const generato = useRef(null)

  const { da, a } = rangeMese(periodo)

  /**
   * Generazione delle ricorrenti del mese all'apertura del modulo.
   * È idempotente lato dataService: se le spese ci sono già, non fa nulla.
   */
  useEffect(() => {
    if (generato.current === periodo) return
    generato.current = periodo
    dataService
      .generateRecurring(periodo)
      .then((create) => {
        if (create.length) toast(`Generate ${create.length} spese ricorrenti di ${MESI[Number(periodo.slice(5, 7)) - 1]}.`)
      })
      .catch(() => {
        /* silenzioso: la generazione è un servizio, non un'operazione richiesta */
      })
  }, [periodo, dataService, toast])

  const delMese = useMemo(
    () => db.expenses.filter((s) => s.data >= da && s.data <= a),
    [db.expenses, da, a],
  )

  const totali = useMemo(() => {
    const somma = (f) => arrotonda(delMese.filter(f).reduce((t, s) => t + Number(s.imponibile || 0), 0))
    return {
      totale: somma(() => true),
      fisse: somma((s) => s.tipo === 'fisso'),
      variabili: somma((s) => s.tipo === 'variabile'),
      daPagare: arrotonda(
        db.expenses.filter((s) => s.stato === 'da_pagare').reduce((t, s) => t + Number(s.imponibile || 0), 0),
      ),
    }
  }, [delMese, db.expenses])

  return (
    <div>
      <TestataModulo
        titolo="Spese"
        descrizione={`${MESI[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)} — importi al netto dell’IVA`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KPI etichetta="Spese del mese" valore={totali.totale} formato={(v) => euro(v, { decimali: 0 })} icona={TrendingDown} dettaglio={`${delMese.length} documenti`} />
        <KPI etichetta="Costi fissi" valore={totali.fisse} formato={(v) => euro(v, { decimali: 0 })} icona={Repeat} />
        <KPI etichetta="Costi variabili" valore={totali.variabili} formato={(v) => euro(v, { decimali: 0 })} icona={Wallet} />
        <KPI etichetta="Da pagare" valore={totali.daPagare} formato={(v) => euro(v, { decimali: 0 })} icona={RefreshCw} dettaglio="tutte le scadenze aperte" />
      </div>

      <Tabs
        className="mb-4"
        valore={tab}
        onChange={setTab}
        voci={[
          { valore: 'spese', etichetta: 'Spese', conteggio: db.expenses.length },
          { valore: 'ricorrenti', etichetta: 'Ricorrenti', conteggio: db.recurring.length },
          { valore: 'analisi', etichetta: 'Analisi' },
        ]}
      />

      {tab === 'spese' && <ElencoSpese />}
      {tab === 'ricorrenti' && <Ricorrenti />}
      {tab === 'analisi' && <Analisi delMese={delMese} />}
    </div>
  )
}

/* ================================================================== *
 * Elenco spese
 * ================================================================== */

function ElencoSpese() {
  const { db, azione, dataService, periodo } = useApp()
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState(null)
  const [soloMese, setSoloMese] = useState(true)
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(null)
  const [daEliminare, setDaEliminare] = useState(null)

  const { da, a } = rangeMese(periodo)

  const filtrate = useMemo(() => {
    let righe = db.expenses
    if (soloMese) righe = righe.filter((s) => s.data >= da && s.data <= a)
    if (filtro === 'da_pagare') righe = righe.filter((s) => s.stato === 'da_pagare')
    else if (filtro === 'scadute') {
      righe = righe.filter((s) => s.stato === 'da_pagare' && giorniTra(oggiIso(), s.scadenza) < 0)
    } else if (filtro === 'fisso' || filtro === 'variabile') righe = righe.filter((s) => s.tipo === filtro)
    else if (filtro) righe = righe.filter((s) => s.categoria === filtro)
    return filtraTesto(righe, cerca, [
      'descrizione',
      'categoria',
      (s) => db.suppliers.find((f) => f.id === s.supplierId)?.ragioneSociale || '',
    ])
  }, [db.expenses, db.suppliers, cerca, filtro, soloMese, da, a])

  const colonne = [
    { chiave: 'data', label: 'Data', render: (s) => fmtData(s.data) },
    {
      chiave: 'descrizione',
      label: 'Descrizione',
      render: (s) => (
        <div className="min-w-0">
          <p className="truncate flex items-center gap-1.5">
            {s.descrizione}
            {s.recurringId && <Repeat size={12} className="text-[var(--ink-3)] shrink-0" aria-hidden />}
            {s.allegatoPath && <Paperclip size={12} className="text-[var(--ink-3)] shrink-0" aria-hidden />}
          </p>
          <p className="text-[11px] text-[var(--ink-3)] truncate">
            {db.suppliers.find((f) => f.id === s.supplierId)?.ragioneSociale || '—'}
          </p>
        </div>
      ),
    },
    { chiave: 'categoria', label: 'Categoria', nascondiSuMobile: true },
    {
      chiave: 'tipo',
      label: 'Tipo',
      render: (s) => <Badge tono={s.tipo === 'fisso' ? 'accento' : 'neutro'}>{s.tipo === 'fisso' ? 'Fisso' : 'Variabile'}</Badge>,
    },
    { chiave: 'imponibile', label: 'Imponibile', allinea: 'destra', render: (s) => euro(s.imponibile) },
    {
      chiave: 'iva',
      label: 'IVA',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (s) => arrotonda((Number(s.imponibile || 0) * Number(s.aliquotaIva || 0)) / 100),
      render: (s) => euro((Number(s.imponibile || 0) * Number(s.aliquotaIva || 0)) / 100),
    },
    {
      chiave: 'totale',
      label: 'Totale',
      allinea: 'destra',
      valore: (s) => arrotonda(Number(s.imponibile || 0) * (1 + Number(s.aliquotaIva || 0) / 100)),
      render: (s) => euro(Number(s.imponibile || 0) * (1 + Number(s.aliquotaIva || 0) / 100)),
    },
    {
      chiave: 'scadenza',
      label: 'Scadenza',
      allinea: 'destra',
      nascondiSuMobile: true,
      render: (s) => {
        const g = giorniTra(oggiIso(), s.scadenza)
        const scaduta = s.stato === 'da_pagare' && g !== null && g < 0
        return <span style={scaduta ? { color: 'var(--color-neg)' } : undefined}>{fmtData(s.scadenza)}</span>
      },
    },
    { chiave: 'stato', label: 'Stato', render: (s) => <StatoBadge stato={s.stato} /> },
  ]

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <Filtri
          className="grow min-w-0"
          valore={filtro}
          onChange={setFiltro}
          opzioni={[
            { valore: null, etichetta: 'Tutte' },
            { valore: 'da_pagare', etichetta: 'Da pagare' },
            { valore: 'scadute', etichetta: 'Scadute' },
            { valore: 'fisso', etichetta: 'Fisse' },
            { valore: 'variabile', etichetta: 'Variabili' },
            ...CATEGORIE.filter((c) => db.expenses.some((s) => s.categoria === c)).map((c) => ({
              valore: c,
              etichetta: c,
            })),
          ]}
        />
        <div className="flex items-center gap-2">
          <EsportaCsv nomeFile="spese" colonne={colonne} righe={filtrate} />
          <Nuovo onClick={() => setModifica({ ...VUOTO_SPESA })}>Spesa</Nuovo>
        </div>
      </div>

      <Card padding={false}>
        <div className="p-3 border-b border-[var(--line)] flex flex-col sm:flex-row gap-3 sm:items-center">
          <Input
            value={cerca}
            onChange={(e) => setCerca(e.target.value)}
            placeholder="Descrizione, categoria o fornitore…"
            className="grow min-w-0"
          />
          <Checkbox
            checked={soloMese}
            onChange={(e) => setSoloMese(e.target.checked)}
            etichetta="Solo il mese selezionato"
            className="shrink-0"
          />
        </div>
        <DataTable
          colonne={colonne}
          righe={filtrate}
          onRiga={setDettaglio}
          rigaEvidenziata={(s) => s.stato === 'da_pagare' && giorniTra(oggiIso(), s.scadenza) < 0}
          vuoto="Nessuna spesa nel periodo."
        />
      </Card>

      {modifica && (
        <FormSpesa
          spesa={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const creazione = !valori.id
            await azione(
              () =>
                creazione
                  ? dataService.insert('expenses', valori)
                  : dataService.update('expenses', valori.id, valori),
              { successo: creazione ? 'Spesa registrata.' : 'Spesa aggiornata.' },
            )
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioSpesa
          spesa={db.expenses.find((s) => s.id === dettaglio.id) || dettaglio}
          onChiudi={() => setDettaglio(null)}
          onModifica={(s) => {
            setDettaglio(null)
            setModifica(s)
          }}
          onElimina={(s) => {
            setDettaglio(null)
            setDaEliminare(s)
          }}
          onPagata={async (s) =>
            azione(() => dataService.update('expenses', s.id, { stato: 'pagata' }), {
              successo: 'Spesa segnata come pagata.',
            })
          }
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare la spesa?"
        messaggio={daEliminare ? `"${daEliminare.descrizione}" verrà rimossa.` : ''}
        etichettaOk="Elimina"
        pericoloso
        onConferma={() => azione(() => dataService.remove('expenses', daEliminare.id), { successo: 'Spesa eliminata.' })}
      />
    </div>
  )
}

function FormSpesa({ spesa, onChiudi, onSalva }) {
  const { db, profilo, toast } = useApp()
  const [s, setS] = useState(spesa)
  const [inCorso, setInCorso] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const input = useRef(null)
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }))

  const carica = async (file) => {
    if (!file) return
    setCaricando(true)
    try {
      const esito = await storageService.carica(file, {
        officinaId: profilo?.officinaId || 'demo',
        cartella: 'spese',
      })
      setS((x) => ({ ...x, allegatoPath: esito.path, allegatoNome: esito.nome }))
      toast('Allegato caricato.')
    } catch (e) {
      toast(e?.message || 'Caricamento non riuscito.', 'errore')
    } finally {
      setCaricando(false)
    }
  }

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={s.id ? 'Modifica spesa' : 'Nuova spesa'}
      larghezza="md"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!s.descrizione.trim() || !s.imponibile}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva(s)
              } finally {
                setInCorso(false)
              }
            }}
          >
            Salva
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo etichetta="Descrizione" obbligatorio className="sm:col-span-2">
          {(id) => <Input id={id} value={s.descrizione} onChange={set('descrizione')} />}
        </Campo>
        <Campo etichetta="Categoria">
          {(id) => <Select id={id} value={s.categoria} onChange={set('categoria')} opzioni={CATEGORIE} />}
        </Campo>
        <Campo etichetta="Fornitore">
          {(id) => (
            <Select
              id={id}
              value={s.supplierId || ''}
              onChange={set('supplierId')}
              vuoto="— nessuno —"
              opzioni={db.suppliers.map((f) => ({ valore: f.id, etichetta: f.ragioneSociale }))}
            />
          )}
        </Campo>
        <Campo etichetta="Imponibile" obbligatorio>
          {(id) => <InputNumero id={id} valore={s.imponibile} onChange={(n) => setS((x) => ({ ...x, imponibile: n }))} suffisso="€" />}
        </Campo>
        <Campo etichetta="Aliquota IVA">
          {(id) => (
            <Select
              id={id}
              value={String(s.aliquotaIva)}
              onChange={(e) => setS((x) => ({ ...x, aliquotaIva: Number(e.target.value) }))}
              opzioni={[22, 10, 4, 0].map((v) => ({ valore: String(v), etichetta: `${v}%` }))}
            />
          )}
        </Campo>
        <Campo etichetta="Tipo" aiuto="I costi fissi ci sono anche a piazzale vuoto: pesano sul break-even.">
          {(id) => (
            <Select
              id={id}
              value={s.tipo}
              onChange={set('tipo')}
              opzioni={[
                { valore: 'fisso', etichetta: 'Fisso' },
                { valore: 'variabile', etichetta: 'Variabile' },
              ]}
            />
          )}
        </Campo>
        <Campo etichetta="Stato">
          {(id) => (
            <Select
              id={id}
              value={s.stato}
              onChange={set('stato')}
              opzioni={[
                { valore: 'da_pagare', etichetta: 'Da pagare' },
                { valore: 'pagata', etichetta: 'Pagata' },
              ]}
            />
          )}
        </Campo>
        <Campo etichetta="Data documento">{(id) => <Input id={id} type="date" value={s.data} onChange={set('data')} />}</Campo>
        <Campo etichetta="Scadenza">{(id) => <Input id={id} type="date" value={s.scadenza || ''} onChange={set('scadenza')} />}</Campo>
        <Campo etichetta="Metodo di pagamento">
          {(id) => <Select id={id} value={s.metodoPagamento || ''} onChange={set('metodoPagamento')} vuoto="—" opzioni={METODI} />}
        </Campo>

        <div className="sm:col-span-2">
          <span className="block text-xs font-medium mb-1.5 text-[var(--ink-2)]">Allegato</span>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => carica(e.target.files?.[0])}
          />
          <div className="flex items-center gap-2">
            <Button icona={Paperclip} caricamento={caricando} onClick={() => input.current?.click()}>
              {s.allegatoPath ? 'Sostituisci' : 'Carica fattura o ricevuta'}
            </Button>
            {s.allegatoNome && <span className="text-xs text-[var(--ink-3)] truncate">{s.allegatoNome}</span>}
          </div>
        </div>

        <Campo etichetta="Note" className="sm:col-span-2">
          {(id) => <Textarea id={id} value={s.note || ''} onChange={set('note')} righe={2} />}
        </Campo>
      </div>
    </Modal>
  )
}

function DettaglioSpesa({ spesa: s, onChiudi, onModifica, onElimina, onPagata }) {
  const { db } = useApp()
  const fornitore = db.suppliers.find((f) => f.id === s.supplierId)
  const ordine = db.orders.find((o) => o.id === s.orderId)
  const template = db.recurring.find((r) => r.id === s.recurringId)

  const apri = async () => {
    const url = await storageService.urlDi(s.allegatoPath)
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={s.descrizione}
      sottotitolo={`${s.categoria} · ${fmtData(s.data)}`}
      larghezza="md"
      piede={
        <>
          <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(s)}>
            Elimina
          </Button>
          <div className="grow" />
          {s.stato === 'da_pagare' && (
            <Button variante="contorno" onClick={() => onPagata(s)}>
              Segna come pagata
            </Button>
          )}
          <Button variante="primario" onClick={() => onModifica(s)}>
            Modifica
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatoBadge stato={s.stato} />
          <Badge tono={s.tipo === 'fisso' ? 'accento' : 'neutro'}>{s.tipo === 'fisso' ? 'Costo fisso' : 'Costo variabile'}</Badge>
          {template && <Badge tono="accento">Da ricorrente</Badge>}
          {ordine && <Badge tono="accento">Da ordine {ordine.numero}</Badge>}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Imponibile" valore={euro(s.imponibile)} />
          <Dato etichetta="IVA" valore={`${s.aliquotaIva}% — ${euro((s.imponibile * s.aliquotaIva) / 100)}`} />
          <Dato etichetta="Totale" valore={euro(s.imponibile * (1 + s.aliquotaIva / 100))} />
          <Dato etichetta="Scadenza" valore={fmtData(s.scadenza)} />
          <Dato etichetta="Fornitore" valore={fornitore?.ragioneSociale} />
          <Dato etichetta="Metodo" valore={s.metodoPagamento} />
        </dl>

        {s.allegatoPath && (
          <Button variante="contorno" icona={Paperclip} onClick={apri}>
            Apri allegato {s.allegatoNome ? `— ${s.allegatoNome}` : ''}
          </Button>
        )}

        {s.note && <Avviso tipo="info" titolo="Note">{s.note}</Avviso>}
      </div>
    </Modal>
  )
}

/* ================================================================== *
 * Spese ricorrenti
 * ================================================================== */

function Ricorrenti() {
  const { db, azione, dataService, periodo, toast } = useApp()
  const [modifica, setModifica] = useState(null)
  const [daEliminare, setDaEliminare] = useState(null)

  const totaleMensile = arrotonda(
    db.recurring.filter((r) => r.attivo).reduce((s, r) => s + Number(r.imponibile || 0), 0),
  )

  const colonne = [
    { chiave: 'descrizione', label: 'Descrizione' },
    { chiave: 'categoria', label: 'Categoria', nascondiSuMobile: true },
    {
      chiave: 'tipo',
      label: 'Tipo',
      render: (r) => <Badge tono={r.tipo === 'fisso' ? 'accento' : 'neutro'}>{r.tipo === 'fisso' ? 'Fisso' : 'Variabile'}</Badge>,
    },
    { chiave: 'giornoMese', label: 'Giorno', allinea: 'centro', render: (r) => `il ${r.giornoMese}` },
    { chiave: 'imponibile', label: 'Imponibile', allinea: 'destra', render: (r) => euro(r.imponibile) },
    {
      chiave: 'attivo',
      label: 'Attivo',
      allinea: 'centro',
      render: (r) => <Badge tono={r.attivo ? 'positivo' : 'neutro'}>{r.attivo ? 'Sì' : 'No'}</Badge>,
    },
    {
      chiave: 'generata',
      label: `Generata per ${periodo}`,
      allinea: 'centro',
      valore: (r) => (db.expenses.some((s) => s.recurringId === r.id && meseDi(s.data) === periodo) ? 1 : 0),
      render: (r) =>
        db.expenses.some((s) => s.recurringId === r.id && meseDi(s.data) === periodo) ? (
          <Badge tono="positivo">Sì</Badge>
        ) : (
          <Badge tono="attenzione">No</Badge>
        ),
    },
  ]

  return (
    <div>
      <Avviso tipo="info" className="mb-4">
        Le ricorrenti sono <strong>template</strong>: ogni mese generano una spesa vera, una volta
        sola. La chiave è la coppia template + mese, quindi rilanciare la generazione non duplica
        nulla. Totale mensile dei template attivi: <strong>{euro(totaleMensile)}</strong>.
      </Avviso>

      <div className="flex justify-between items-center gap-2 mb-4">
        <Button
          variante="contorno"
          icona={RefreshCw}
          onClick={async () => {
            const esito = await azione(() => dataService.generateRecurring(periodo))
            if (esito.ok) {
              toast(
                esito.esito.length
                  ? `Generate ${esito.esito.length} spese.`
                  : 'Nessuna spesa da generare: il mese è già coperto.',
              )
            }
          }}
        >
          Genera le spese di {MESI[Number(periodo.slice(5, 7)) - 1]}
        </Button>
        <Nuovo onClick={() => setModifica({ ...VUOTO_RICORRENTE })}>Ricorrente</Nuovo>
      </div>

      <Card padding={false}>
        <DataTable colonne={colonne} righe={db.recurring} onRiga={setModifica} vuoto="Nessun template ricorrente." />
      </Card>

      {modifica && (
        <FormRicorrente
          template={modifica}
          onChiudi={() => setModifica(null)}
          onElimina={(r) => {
            setModifica(null)
            setDaEliminare(r)
          }}
          onSalva={async (valori) => {
            const creazione = !valori.id
            await azione(
              () =>
                creazione
                  ? dataService.insert('recurring', valori)
                  : dataService.update('recurring', valori.id, valori),
              { successo: creazione ? 'Template creato.' : 'Template aggiornato.' },
            )
            setModifica(null)
          }}
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare il template?"
        messaggio={
          daEliminare
            ? `"${daEliminare.descrizione}" non genererà più spese. Le spese già generate restano dove sono.`
            : ''
        }
        etichettaOk="Elimina"
        pericoloso
        onConferma={() => azione(() => dataService.remove('recurring', daEliminare.id), { successo: 'Template eliminato.' })}
      />
    </div>
  )
}

function FormRicorrente({ template, onChiudi, onSalva, onElimina }) {
  const { db } = useApp()
  const [r, setR] = useState(template)
  const [inCorso, setInCorso] = useState(false)
  const set = (k) => (e) => setR((x) => ({ ...x, [k]: e.target.value }))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={r.id ? 'Modifica ricorrente' : 'Nuova spesa ricorrente'}
      larghezza="md"
      piede={
        <>
          {r.id && (
            <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(r)}>
              Elimina
            </Button>
          )}
          <div className="grow" />
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!r.descrizione.trim() || !r.imponibile}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva(r)
              } finally {
                setInCorso(false)
              }
            }}
          >
            Salva
          </Button>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo etichetta="Descrizione" obbligatorio className="sm:col-span-2">
          {(id) => <Input id={id} value={r.descrizione} onChange={set('descrizione')} />}
        </Campo>
        <Campo etichetta="Categoria">
          {(id) => <Select id={id} value={r.categoria} onChange={set('categoria')} opzioni={CATEGORIE} />}
        </Campo>
        <Campo etichetta="Fornitore">
          {(id) => (
            <Select
              id={id}
              value={r.supplierId || ''}
              onChange={set('supplierId')}
              vuoto="— nessuno —"
              opzioni={db.suppliers.map((f) => ({ valore: f.id, etichetta: f.ragioneSociale }))}
            />
          )}
        </Campo>
        <Campo etichetta="Imponibile mensile" obbligatorio>
          {(id) => <InputNumero id={id} valore={r.imponibile} onChange={(n) => setR((x) => ({ ...x, imponibile: n }))} suffisso="€" />}
        </Campo>
        <Campo etichetta="Aliquota IVA">
          {(id) => (
            <Select
              id={id}
              value={String(r.aliquotaIva)}
              onChange={(e) => setR((x) => ({ ...x, aliquotaIva: Number(e.target.value) }))}
              opzioni={[22, 10, 4, 0].map((v) => ({ valore: String(v), etichetta: `${v}%` }))}
            />
          )}
        </Campo>
        <Campo etichetta="Tipo">
          {(id) => (
            <Select
              id={id}
              value={r.tipo}
              onChange={set('tipo')}
              opzioni={[
                { valore: 'fisso', etichetta: 'Fisso' },
                { valore: 'variabile', etichetta: 'Variabile' },
              ]}
            />
          )}
        </Campo>
        <Campo etichetta="Giorno del mese" aiuto="Massimo 28, così esiste in ogni mese.">
          {(id) => (
            <InputNumero
              id={id}
              valore={r.giornoMese}
              onChange={(n) => setR((x) => ({ ...x, giornoMese: Math.min(28, Math.max(1, n)) }))}
              decimali={0}
            />
          )}
        </Campo>
        <Campo etichetta="Attivo dal">{(id) => <Input id={id} type="date" value={r.dataInizio || ''} onChange={set('dataInizio')} />}</Campo>
        <Campo etichetta="Fino al" aiuto="Vuoto = senza scadenza.">
          {(id) => <Input id={id} type="date" value={r.dataFine || ''} onChange={set('dataFine')} />}
        </Campo>
        <div className="sm:col-span-2">
          <Checkbox
            checked={Boolean(r.attivo)}
            onChange={(e) => setR((x) => ({ ...x, attivo: e.target.checked }))}
            etichetta="Template attivo"
            descrizione="Se disattivato smette di generare spese, senza toccare quelle già create."
          />
        </div>
      </div>
    </Modal>
  )
}

/* ================================================================== *
 * Analisi
 * ================================================================== */

function Analisi({ delMese }) {
  const { db, scuro, periodo } = useApp()
  const tema = assi(scuro)

  const perCategoria = useMemo(() => {
    const m = new Map()
    for (const s of delMese) {
      m.set(s.categoria, arrotonda((m.get(s.categoria) || 0) + Number(s.imponibile || 0)))
    }
    return [...m.entries()]
      .map(([nome, valore]) => ({ nome, valore }))
      .sort((a, b) => b.valore - a.valore)
  }, [delMese])

  const andamento = useMemo(() => {
    const out = []
    for (let i = 5; i >= 0; i--) {
      const ym = meseDi(addMesi(`${periodo}-01`, -i))
      const { da, a } = rangeMese(ym)
      const nel = db.expenses.filter((s) => s.data >= da && s.data <= a)
      out.push({
        mese: `${MESI[Number(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(2, 4)}`,
        fisse: arrotonda(nel.filter((s) => s.tipo === 'fisso').reduce((t, s) => t + Number(s.imponibile || 0), 0)),
        variabili: arrotonda(nel.filter((s) => s.tipo === 'variabile').reduce((t, s) => t + Number(s.imponibile || 0), 0)),
      })
    }
    return out
  }, [db.expenses, periodo])

  if (!delMese.length) {
    return (
      <Card>
        <Vuoto messaggio="Nessuna spesa nel mese selezionato." />
      </Card>
    )
  }

  return (
    <div className="grid xl:grid-cols-2 gap-4">
      <Card>
        <CardHeader titolo="Spese per categoria" sottotitolo="Mese selezionato, al netto dell’IVA" />
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={perCategoria}
                dataKey="valore"
                nameKey="nome"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                stroke={fondoCard(scuro)}
                strokeWidth={2}
                animationDuration={700}
              >
                {perCategoria.map((_, i) => (
                  <Cell key={i} fill={colore(i, scuro)} />
                ))}
              </Pie>
              <Tooltip contentStyle={tema.tooltip} formatter={(v, n) => [euro(v), n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="space-y-1.5 mt-3">
          {perCategoria.map((c, i) => (
            <li key={c.nome} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colore(i, scuro) }} />
              <span className="grow truncate text-[var(--ink-2)]">{c.nome}</span>
              <span className="tabnum font-medium">{euro(c.valore, { decimali: 0 })}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader titolo="Fissi e variabili" sottotitolo="Ultimi sei mesi" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={andamento} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
              <XAxis dataKey="mese" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} tickFormatter={(v) => (v ? `${v / 1000}k` : '0')} />
              <Tooltip
                contentStyle={tema.tooltip}
                formatter={(v, n) => [euro(v), n === 'fisse' ? 'Costi fissi' : 'Costi variabili']}
                cursor={{ fill: tema.cursore }}
              />
              <Bar dataKey="fisse" stackId="a" fill={serie(scuro)[0]} animationDuration={700} />
              <Bar
                dataKey="variabili"
                stackId="a"
                fill={serie(scuro)[3]}
                radius={[3, 3, 0, 0]}
                animationDuration={700}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-[var(--ink-3)] mt-3">
          I costi fissi sono quelli che l’officina sostiene comunque: entrano nel calcolo del
          break-even insieme al costo del personale. Numero di documenti nel mese: {numero(delMese.length, 0)}.
        </p>
      </Card>
    </div>
  )
}
