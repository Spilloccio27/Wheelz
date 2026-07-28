/**
 * Magazzino ricambi: articoli, movimenti, ordini a fornitore.
 *
 * I ricambi sono valorizzati a prezzo medio ponderato: a ogni carico il costo
 * medio si aggiorna, e da lì discendono margine e prezzo di listino. Nessuna
 * schermata scrive direttamente la giacenza — si passa sempre da un movimento,
 * altrimenti il magazzino smette di tornare.
 */

import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Package,
  PackagePlus,
  RotateCcw,
  ShoppingCart,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useApp } from '../context/AppContext.jsx'
import {
  Avviso,
  Badge,
  Button,
  Campo,
  Card,
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
import { assi, serie } from '../utils/chartColors.js'
import { arrotonda, margineRicambio, prezzoVenditaConsigliato, rotazioneMagazzino } from '../utils/calc.js'
import {
  addGiorni,
  data as fmtData,
  euro,
  numero,
  oggiIso,
  percento,
} from '../utils/format.js'

const CATEGORIE = [
  'Filtri',
  'Lubrificanti',
  'Freni',
  'Motore',
  'Trasmissione',
  'Elettrico',
  'Sospensioni',
  'Scarico',
  'Pneumatici',
  'Clima',
  'Consumabili',
  'Altro',
]

const VUOTO_ARTICOLO = {
  codice: '',
  codiceOe: '',
  descrizione: '',
  marca: '',
  categoria: 'Filtri',
  applicabilita: '',
  unita: 'pz',
  giacenza: 0,
  scortaMinima: 2,
  puntoRiordino: 4,
  ubicazione: '',
  prezzoMedio: 0,
  prezzoListino: 0,
  ricarico: 0.38,
  aliquotaIva: 22,
  supplierId: '',
  attivo: true,
  note: '',
}

export default function Magazzino() {
  const { db, ruolo, focus } = useApp()
  const [tab, setTab] = useState('articoli')

  const valore = useMemo(
    () => arrotonda(db.articles.reduce((s, a) => s + Number(a.giacenza || 0) * Number(a.prezzoMedio || 0), 0)),
    [db.articles],
  )

  const sottoScorta = db.articles.filter(
    (a) => a.attivo !== false && Number(a.giacenza) <= Number(a.puntoRiordino || a.scortaMinima || 0),
  )

  const rotazione = useMemo(() => {
    const da = addGiorni(oggiIso(), -90)
    const costoVenduto = db.movements
      .filter((m) => m.tipo === 'scarico' && m.data >= da)
      .reduce((s, m) => s + Number(m.quantita || 0) * Number(m.prezzoUnitario || 0), 0)
    return rotazioneMagazzino(costoVenduto, valore, 90)
  }, [db.movements, valore])

  return (
    <div>
      <TestataModulo
        titolo="Magazzino"
        descrizione="Ricambi valorizzati a prezzo medio ponderato"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KPI etichetta="Articoli a catalogo" valore={db.articles.length} formato={(v) => numero(v, 0)} icona={Package} />
        <KPI etichetta="Valore di magazzino" valore={valore} formato={(v) => euro(v, { decimali: 0 })} icona={PackagePlus} />
        <KPI
          etichetta="Sotto scorta"
          valore={sottoScorta.length}
          formato={(v) => numero(v, 0)}
          icona={ArrowDownToLine}
          dettaglio={sottoScorta.length ? 'da riordinare' : 'tutto coperto'}
        />
        <KPI
          etichetta="Rotazione annua"
          valore={rotazione.indiceAnnuo}
          formato={(v) => `${numero(v, 1)}×`}
          icona={TrendingUp}
          dettaglio={rotazione.giorniCopertura ? `${rotazione.giorniCopertura} giorni di copertura` : '—'}
        />
      </div>

      <Tabs
        className="mb-4"
        valore={tab}
        onChange={setTab}
        voci={[
          { valore: 'articoli', etichetta: 'Articoli', conteggio: db.articles.length },
          { valore: 'movimenti', etichetta: 'Movimenti', conteggio: db.movements.length },
          { valore: 'ordini', etichetta: 'Ordini fornitore', conteggio: db.orders.length },
        ]}
      />

      {tab === 'articoli' && <Articoli soloLettura={ruolo === 'meccanico'} focus={focus} />}
      {tab === 'movimenti' && <Movimenti />}
      {tab === 'ordini' && <Ordini />}
    </div>
  )
}

/* ================================================================== *
 * Articoli
 * ================================================================== */

function Articoli({ soloLettura, focus }) {
  const { db, settings, azione, dataService } = useApp()
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState(null)
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(focus ? db.articles.find((a) => a.id === focus) : null)
  const [movimento, setMovimento] = useState(null)
  const [daEliminare, setDaEliminare] = useState(null)

  const filtrati = useMemo(() => {
    let righe = db.articles
    if (filtro === 'scorta') {
      righe = righe.filter((a) => Number(a.giacenza) <= Number(a.puntoRiordino || a.scortaMinima || 0))
    } else if (filtro === 'esauriti') {
      righe = righe.filter((a) => Number(a.giacenza) <= 0)
    } else if (filtro) {
      righe = righe.filter((a) => a.categoria === filtro)
    }
    return filtraTesto(righe, cerca, ['descrizione', 'codice', 'codiceOe', 'marca', 'ubicazione', 'categoria'])
  }, [db.articles, cerca, filtro])

  const colonne = [
    {
      chiave: 'codice',
      label: 'Codice',
      render: (a) => (
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium">{a.codice}</p>
          <p className="font-mono text-[11px] text-[var(--ink-3)]">OE {a.codiceOe}</p>
        </div>
      ),
    },
    {
      chiave: 'descrizione',
      label: 'Ricambio',
      render: (a) => (
        <div className="min-w-0">
          <p className="truncate">{a.descrizione}</p>
          <p className="text-[11px] text-[var(--ink-3)]">{a.marca} · {a.categoria}</p>
        </div>
      ),
    },
    { chiave: 'ubicazione', label: 'Ubicazione', nascondiSuMobile: true },
    {
      chiave: 'giacenza',
      label: 'Giacenza',
      allinea: 'destra',
      render: (a) => {
        const critica = Number(a.giacenza) <= Number(a.puntoRiordino || a.scortaMinima || 0)
        return (
          <span style={critica ? { color: 'var(--color-neg)', fontWeight: 500 } : undefined}>
            {numero(a.giacenza, 0)} {a.unita}
          </span>
        )
      },
    },
    { chiave: 'scortaMinima', label: 'Minimo', allinea: 'destra', nascondiSuMobile: true, render: (a) => numero(a.scortaMinima, 0) },
    { chiave: 'prezzoMedio', label: 'Costo medio', allinea: 'destra', render: (a) => euro(a.prezzoMedio) },
    { chiave: 'prezzoListino', label: 'Listino', allinea: 'destra', render: (a) => euro(a.prezzoListino) },
    {
      chiave: 'margine',
      label: 'Margine',
      allinea: 'destra',
      valore: (a) => margineRicambio(a.prezzoListino, a.prezzoMedio),
      render: (a) => {
        const m = margineRicambio(a.prezzoListino, a.prezzoMedio)
        return <Badge tono={m >= 0.3 ? 'positivo' : m >= 0.15 ? 'attenzione' : 'negativo'}>{percento(m, 0)}</Badge>
      },
      csv: (a) => margineRicambio(a.prezzoListino, a.prezzoMedio),
    },
    {
      chiave: 'valore',
      label: 'Valore',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (a) => arrotonda(Number(a.giacenza || 0) * Number(a.prezzoMedio || 0)),
      render: (a) => euro(Number(a.giacenza || 0) * Number(a.prezzoMedio || 0), { decimali: 0 }),
    },
  ]

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        {/* `min-w-0`: senza, questo contenitore si allarga alla larghezza
            naturale dei filtri (che sono molti) e spinge fuori la riga. */}
        <div className="grow min-w-0">
          <Filtri
            valore={filtro}
            onChange={setFiltro}
            opzioni={[
              { valore: null, etichetta: 'Tutti', conteggio: db.articles.length },
              {
                valore: 'scorta',
                etichetta: 'Sotto scorta',
                conteggio: db.articles.filter((a) => Number(a.giacenza) <= Number(a.puntoRiordino || a.scortaMinima || 0)).length,
              },
              { valore: 'esauriti', etichetta: 'Esauriti', conteggio: db.articles.filter((a) => Number(a.giacenza) <= 0).length },
              ...CATEGORIE.filter((c) => db.articles.some((a) => a.categoria === c)).map((c) => ({
                valore: c,
                etichetta: c,
              })),
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <EsportaCsv nomeFile="magazzino" colonne={colonne} righe={filtrati} />
          {!soloLettura && <Nuovo onClick={() => setModifica({ ...VUOTO_ARTICOLO, ricarico: settings.ricaricoRicambi })}>Articolo</Nuovo>}
        </div>
      </div>

      <Card padding={false} className="mb-4">
        <div className="p-3 border-b border-[var(--line)]">
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per codice, codice OE, descrizione o ubicazione…" />
        </div>
        <DataTable
          colonne={colonne}
          righe={filtrati}
          onRiga={setDettaglio}
          rigaEvidenziata={(a) => Number(a.giacenza) <= Number(a.puntoRiordino || a.scortaMinima || 0)}
          vuoto={cerca ? 'Nessun articolo trovato.' : 'Magazzino ancora vuoto.'}
        />
      </Card>

      {modifica && (
        <FormArticolo
          articolo={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const creazione = !valori.id
            const giacenzaIniziale = creazione ? Number(valori.giacenza || 0) : 0
            const costoIniziale = Number(valori.prezzoMedio || 0)
            const esito = await azione(
              () =>
                creazione
                  ? dataService.insert('articles', { ...valori, giacenza: 0, prezzoMedio: 0 })
                  : dataService.update('articles', valori.id, valori),
              { successo: creazione ? 'Articolo creato.' : 'Articolo aggiornato.' },
            )
            // Anche la giacenza iniziale è un carico: così il magazzino nasce
            // già con il suo primo movimento, e il costo medio ha un'origine.
            if (creazione && esito.ok && giacenzaIniziale > 0) {
              await azione(() =>
                dataService.registerMovement({
                  articleId: esito.esito.id,
                  tipo: 'carico',
                  quantita: giacenzaIniziale,
                  prezzoUnitario: costoIniziale,
                  causale: 'Giacenza iniziale d’inventario',
                }),
              )
            }
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioArticolo
          articolo={db.articles.find((a) => a.id === dettaglio.id) || dettaglio}
          onChiudi={() => setDettaglio(null)}
          onModifica={(a) => {
            setDettaglio(null)
            setModifica(a)
          }}
          onMovimento={(a, tipo) => {
            setDettaglio(null)
            setMovimento({ articolo: a, tipo })
          }}
          onElimina={(a) => {
            setDettaglio(null)
            setDaEliminare(a)
          }}
          soloLettura={soloLettura}
        />
      )}

      {movimento && (
        <FormMovimento
          articolo={movimento.articolo}
          tipoIniziale={movimento.tipo}
          onChiudi={() => setMovimento(null)}
          onSalva={async (valori) => {
            const esito = await azione(() => dataService.registerMovement(valori), {
              successo: 'Movimento registrato.',
            })
            if (esito.ok) setMovimento(null)
          }}
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare l’articolo?"
        messaggio={
          daEliminare
            ? dataService.bloccoCancellazione('articles', daEliminare.id) ||
              `${daEliminare.descrizione} verrà rimosso dal catalogo.`
            : ''
        }
        etichettaOk="Elimina"
        pericoloso
        onConferma={async () => {
          const blocco = dataService.bloccoCancellazione('articles', daEliminare.id)
          if (blocco) throw new Error(blocco)
          await azione(() => dataService.remove('articles', daEliminare.id), { successo: 'Articolo eliminato.' })
        }}
      />
    </div>
  )
}

function FormArticolo({ articolo, onChiudi, onSalva }) {
  const { db, settings } = useApp()
  const [a, setA] = useState(articolo)
  const [inCorso, setInCorso] = useState(false)
  const set = (k) => (e) => setA((x) => ({ ...x, [k]: e.target.value }))
  const setNum = (k) => (n) => setA((x) => ({ ...x, [k]: n }))

  const consigliato = prezzoVenditaConsigliato(a.prezzoMedio, a.ricarico, a.aliquotaIva)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={a.id ? 'Modifica articolo' : 'Nuovo articolo'}
      larghezza="lg"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!a.descrizione.trim() || !a.codice.trim()}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva({ ...a, prezzoListino: a.prezzoListino || consigliato.netto })
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
        <Campo etichetta="Codice interno" obbligatorio>
          {(id) => <Input id={id} value={a.codice} onChange={set('codice')} className="font-mono" />}
        </Campo>
        <Campo etichetta="Codice OE / originale">
          {(id) => <Input id={id} value={a.codiceOe} onChange={set('codiceOe')} className="font-mono" />}
        </Campo>
        <Campo etichetta="Descrizione" obbligatorio className="sm:col-span-2">
          {(id) => <Input id={id} value={a.descrizione} onChange={set('descrizione')} />}
        </Campo>
        <Campo etichetta="Marca ricambio">{(id) => <Input id={id} value={a.marca} onChange={set('marca')} />}</Campo>
        <Campo etichetta="Categoria">
          {(id) => <Select id={id} value={a.categoria} onChange={set('categoria')} opzioni={CATEGORIE} />}
        </Campo>
        <Campo etichetta="Applicabilità" className="sm:col-span-2" aiuto="Modelli e motorizzazioni su cui monta.">
          {(id) => <Textarea id={id} value={a.applicabilita} onChange={set('applicabilita')} righe={2} />}
        </Campo>

        <Campo etichetta="Fornitore abituale">
          {(id) => (
            <Select
              id={id}
              value={a.supplierId || ''}
              onChange={set('supplierId')}
              vuoto="— nessuno —"
              opzioni={db.suppliers.map((s) => ({ valore: s.id, etichetta: s.ragioneSociale }))}
            />
          )}
        </Campo>
        <Campo etichetta="Ubicazione" aiuto="Scaffale e cassetto: chi cerca il pezzo lo legge da qui.">
          {(id) => <Input id={id} value={a.ubicazione} onChange={set('ubicazione')} placeholder="Scaffale C — cassetto 3" />}
        </Campo>

        <Campo etichetta="Unità">
          {(id) => <Select id={id} value={a.unita} onChange={set('unita')} opzioni={['pz', 'lt', 'kg', 'mt', 'set']} />}
        </Campo>
        <Campo etichetta={a.id ? 'Giacenza (si cambia con un movimento)' : 'Giacenza iniziale'}>
          {(id) => <InputNumero id={id} valore={a.giacenza} onChange={setNum('giacenza')} decimali={0} disabled={Boolean(a.id)} />}
        </Campo>
        <Campo etichetta="Scorta minima">
          {(id) => <InputNumero id={id} valore={a.scortaMinima} onChange={setNum('scortaMinima')} decimali={0} />}
        </Campo>
        <Campo etichetta="Punto di riordino" aiuto="Sotto questa soglia scatta l’avviso.">
          {(id) => <InputNumero id={id} valore={a.puntoRiordino} onChange={setNum('puntoRiordino')} decimali={0} />}
        </Campo>

        <Campo etichetta={a.id ? 'Costo medio ponderato' : 'Costo d’acquisto iniziale'}>
          {(id) => <InputNumero id={id} valore={a.prezzoMedio} onChange={setNum('prezzoMedio')} disabled={Boolean(a.id)} suffisso="€" />}
        </Campo>
        <Campo etichetta="Ricarico" aiuto={`Predefinito d’officina: ${percento(settings.ricaricoRicambi, 0)}`}>
          {(id) => <InputNumero id={id} valore={a.ricarico * 100} onChange={(n) => setNum('ricarico')(n / 100)} decimali={0} suffisso="%" />}
        </Campo>
        <Campo etichetta="Prezzo di listino (netto)">
          {(id) => <InputNumero id={id} valore={a.prezzoListino} onChange={setNum('prezzoListino')} suffisso="€" />}
        </Campo>
        <Campo etichetta="Aliquota IVA">
          {(id) => (
            <Select
              id={id}
              value={String(a.aliquotaIva)}
              onChange={(e) => setNum('aliquotaIva')(Number(e.target.value))}
              opzioni={(settings.aliquote || [22, 10, 4, 0]).map((x) => ({ valore: String(x), etichetta: `${x}%` }))}
            />
          )}
        </Campo>

        <div className="sm:col-span-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm flex flex-wrap gap-x-6 gap-y-2 justify-between">
          <span className="text-[var(--ink-2)]">
            Prezzo consigliato: <strong className="tabnum">{euro(consigliato.netto)}</strong> netto ·{' '}
            <strong className="tabnum">{euro(consigliato.lordo)}</strong> IVA inclusa
          </span>
          <span className="text-[var(--ink-3)]">
            Margine al listino attuale: {percento(margineRicambio(a.prezzoListino, a.prezzoMedio), 1)}
          </span>
        </div>
      </div>
    </Modal>
  )
}

function DettaglioArticolo({ articolo: a, onChiudi, onModifica, onMovimento, onElimina, soloLettura }) {
  const { db, scuro } = useApp()
  const tema = assi(scuro)

  const movimenti = db.movements
    .filter((m) => m.articleId === a.id)
    .sort((x, y) => (y.data || '').localeCompare(x.data || ''))

  const storico = db.priceHistory
    .filter((p) => p.articleId === a.id)
    .sort((x, y) => (x.data || '').localeCompare(y.data || ''))
    .map((p) => ({ data: fmtData(p.data), prezzo: p.prezzo }))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={a.descrizione}
      sottotitolo={`${a.codice} · OE ${a.codiceOe} · ${a.marca}`}
      larghezza="xl"
      piede={
        <>
          {!soloLettura && (
            <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(a)}>
              Elimina
            </Button>
          )}
          <div className="grow" />
          {!soloLettura && (
            <>
              <Button variante="contorno" icona={ArrowUpFromLine} onClick={() => onMovimento(a, 'scarico')}>
                Scarico
              </Button>
              <Button variante="contorno" icona={RotateCcw} onClick={() => onMovimento(a, 'rettifica')}>
                Rettifica
              </Button>
              <Button variante="primario" icona={ArrowDownToLine} onClick={() => onMovimento(a, 'carico')}>
                Carico
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Giacenza" valore={`${numero(a.giacenza, 0)} ${a.unita}`} />
          <Dato etichetta="Scorta minima" valore={numero(a.scortaMinima, 0)} />
          <Dato etichetta="Punto di riordino" valore={numero(a.puntoRiordino, 0)} />
          <Dato etichetta="Ubicazione" valore={a.ubicazione} />
          <Dato etichetta="Costo medio ponderato" valore={euro(a.prezzoMedio)} />
          <Dato etichetta="Prezzo di listino" valore={euro(a.prezzoListino)} />
          <Dato etichetta="Ricarico" valore={percento(a.ricarico, 0)} />
          <Dato etichetta="Margine" valore={percento(margineRicambio(a.prezzoListino, a.prezzoMedio), 1)} />
          <Dato etichetta="Valore a magazzino" valore={euro(Number(a.giacenza || 0) * Number(a.prezzoMedio || 0))} />
          <Dato etichetta="Fornitore" valore={db.suppliers.find((s) => s.id === a.supplierId)?.ragioneSociale} />
          <Dato etichetta="Aliquota IVA" valore={`${a.aliquotaIva}%`} />
          <Dato etichetta="Categoria" valore={a.categoria} />
        </dl>

        {a.applicabilita && <Avviso tipo="info" titolo="Applicabilità">{a.applicabilita}</Avviso>}

        {storico.length > 1 && (
          <div>
            <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
              <History size={15} className="text-accent-500" aria-hidden /> Storico prezzi d’acquisto
            </h4>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={storico} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
                  <XAxis dataKey="data" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tema.tooltip} formatter={(v) => [euro(v), 'Prezzo']} />
                  <Line type="stepAfter" dataKey="prezzo" stroke={serie(scuro)[0]} strokeWidth={2.2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold mb-2.5">Movimenti</h4>
          <DataTable
            denso
            massimo={20}
            colonne={COLONNE_MOVIMENTO(db)}
            righe={movimenti}
            vuoto="Nessun movimento registrato."
          />
        </div>

        {!soloLettura && (
          <div className="flex justify-end">
            <Button variante="contorno" onClick={() => onModifica(a)}>
              Modifica anagrafica
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

function FormMovimento({ articolo, tipoIniziale, onChiudi, onSalva }) {
  const { db } = useApp()
  const [v, setV] = useState({
    tipo: tipoIniziale || 'carico',
    quantita: 1,
    prezzoUnitario: articolo.prezzoMedio,
    causale: '',
    data: oggiIso(),
    supplierId: articolo.supplierId || '',
  })
  const [inCorso, setInCorso] = useState(false)

  const nuovoMedio =
    v.tipo === 'carico'
      ? arrotonda(
          (Number(articolo.giacenza || 0) * Number(articolo.prezzoMedio || 0) +
            Number(v.quantita || 0) * Number(v.prezzoUnitario || 0)) /
            Math.max(Number(articolo.giacenza || 0) + Number(v.quantita || 0), 1),
          4,
        )
      : articolo.prezzoMedio

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo="Movimento di magazzino"
      sottotitolo={`${articolo.descrizione} — giacenza attuale ${numero(articolo.giacenza, 0)} ${articolo.unita}`}
      larghezza="sm"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            caricamento={inCorso}
            disabled={!v.quantita}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva({ ...v, articleId: articolo.id })
              } finally {
                setInCorso(false)
              }
            }}
          >
            Registra
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Filtri
          valore={v.tipo}
          onChange={(t) => setV((x) => ({ ...x, tipo: t }))}
          opzioni={[
            { valore: 'carico', etichetta: 'Carico' },
            { valore: 'scarico', etichetta: 'Scarico' },
            { valore: 'reso', etichetta: 'Reso' },
            { valore: 'rettifica', etichetta: 'Rettifica' },
          ]}
        />

        <Campo
          etichetta="Quantità"
          obbligatorio
          aiuto={v.tipo === 'rettifica' ? 'Usa il segno meno per una differenza a scalare.' : undefined}
        >
          {(id) => (
            <InputNumero id={id} valore={v.quantita} onChange={(n) => setV((x) => ({ ...x, quantita: n }))} suffisso={articolo.unita} />
          )}
        </Campo>

        {v.tipo === 'carico' && (
          <>
            <Campo etichetta="Prezzo d’acquisto unitario" obbligatorio>
              {(id) => (
                <InputNumero id={id} valore={v.prezzoUnitario} onChange={(n) => setV((x) => ({ ...x, prezzoUnitario: n }))} suffisso="€" />
              )}
            </Campo>
            <Campo etichetta="Fornitore">
              {(id) => (
                <Select
                  id={id}
                  value={v.supplierId}
                  onChange={(e) => setV((x) => ({ ...x, supplierId: e.target.value }))}
                  vuoto="— nessuno —"
                  opzioni={db.suppliers.map((s) => ({ valore: s.id, etichetta: s.ragioneSociale }))}
                />
              )}
            </Campo>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm flex items-center justify-between">
              <span className="text-[var(--ink-2)]">Nuovo costo medio ponderato</span>
              <span className="tabnum font-medium">{euro(nuovoMedio)}</span>
            </div>
          </>
        )}

        <Campo etichetta="Causale">
          {(id) => <Input id={id} value={v.causale} onChange={(e) => setV((x) => ({ ...x, causale: e.target.value }))} placeholder="Riassortimento, inventario…" />}
        </Campo>
        <Campo etichetta="Data">
          {(id) => <Input id={id} type="date" value={v.data} onChange={(e) => setV((x) => ({ ...x, data: e.target.value }))} />}
        </Campo>
      </div>
    </Modal>
  )
}

/* ================================================================== *
 * Movimenti
 * ================================================================== */

const TIPI_MOVIMENTO = {
  carico: { etichetta: 'Carico', tono: 'positivo' },
  scarico: { etichetta: 'Scarico', tono: 'accento' },
  reso: { etichetta: 'Reso', tono: 'attenzione' },
  rettifica: { etichetta: 'Rettifica', tono: 'neutro' },
}

function COLONNE_MOVIMENTO(db) {
  return [
    { chiave: 'data', label: 'Data', render: (m) => fmtData(m.data) },
    {
      chiave: 'tipo',
      label: 'Tipo',
      render: (m) => <Badge tono={TIPI_MOVIMENTO[m.tipo]?.tono}>{TIPI_MOVIMENTO[m.tipo]?.etichetta || m.tipo}</Badge>,
    },
    {
      chiave: 'quantita',
      label: 'Q.tà',
      allinea: 'destra',
      render: (m) => {
        const segno = m.tipo === 'carico' ? '+' : m.tipo === 'rettifica' ? '' : '−'
        return (
          <span style={{ color: m.tipo === 'carico' ? 'var(--color-pos)' : m.tipo === 'rettifica' ? undefined : 'var(--color-neg)' }}>
            {segno}
            {numero(Math.abs(m.quantita), 0)}
          </span>
        )
      },
    },
    { chiave: 'prezzoUnitario', label: 'Prezzo', allinea: 'destra', render: (m) => euro(m.prezzoUnitario) },
    { chiave: 'causale', label: 'Causale' },
    {
      chiave: 'fornitore',
      label: 'Fornitore',
      nascondiSuMobile: true,
      valore: (m) => db.suppliers.find((s) => s.id === m.supplierId)?.ragioneSociale || '',
    },
  ]
}

function Movimenti() {
  const { db } = useApp()
  const [cerca, setCerca] = useState('')
  const [tipo, setTipo] = useState(null)

  const articoloDi = useMemo(() => new Map(db.articles.map((a) => [a.id, a])), [db.articles])

  const filtrati = useMemo(() => {
    let righe = db.movements
    if (tipo) righe = righe.filter((m) => m.tipo === tipo)
    return filtraTesto(righe, cerca, [
      'causale',
      (m) => articoloDi.get(m.articleId)?.descrizione || '',
      (m) => articoloDi.get(m.articleId)?.codice || '',
    ])
  }, [db.movements, cerca, tipo, articoloDi])

  const colonne = [
    { chiave: 'data', label: 'Data', render: (m) => fmtData(m.data) },
    {
      chiave: 'articolo',
      label: 'Articolo',
      valore: (m) => articoloDi.get(m.articleId)?.descrizione || '',
      render: (m) => {
        const a = articoloDi.get(m.articleId)
        return (
          <div className="min-w-0">
            <p className="truncate">{a?.descrizione || '—'}</p>
            <p className="font-mono text-[11px] text-[var(--ink-3)]">{a?.codice}</p>
          </div>
        )
      },
    },
    ...COLONNE_MOVIMENTO(db).slice(1),
    {
      chiave: 'valore',
      label: 'Valore',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (m) => arrotonda(Math.abs(Number(m.quantita || 0)) * Number(m.prezzoUnitario || 0)),
      render: (m) => euro(Math.abs(Number(m.quantita || 0)) * Number(m.prezzoUnitario || 0)),
    },
  ]

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <Filtri
          className="grow min-w-0"
          valore={tipo}
          onChange={setTipo}
          opzioni={[
            { valore: null, etichetta: 'Tutti', conteggio: db.movements.length },
            ...Object.entries(TIPI_MOVIMENTO).map(([k, v]) => ({
              valore: k,
              etichetta: v.etichetta,
              conteggio: db.movements.filter((m) => m.tipo === k).length,
            })),
          ]}
        />
        <EsportaCsv nomeFile="movimenti-magazzino" colonne={colonne} righe={filtrati} />
      </div>

      <Card padding={false}>
        <div className="p-3 border-b border-[var(--line)]">
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Cerca per articolo o causale…" />
        </div>
        <DataTable colonne={colonne} righe={filtrati} massimo={200} vuoto="Nessun movimento." />
      </Card>
    </div>
  )
}

/* ================================================================== *
 * Ordini a fornitore
 * ================================================================== */

function Ordini() {
  const { db, azione, dataService, ruolo } = useApp()
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(null)
  const [daRicevere, setDaRicevere] = useState(null)

  const totaleOrdine = (o) =>
    arrotonda((o.righe || []).reduce((s, r) => s + Number(r.quantita || 0) * Number(r.prezzo || 0), 0))

  const colonne = [
    { chiave: 'numero', label: 'Ordine', render: (o) => <span className="font-medium">{o.numero}</span> },
    { chiave: 'dataOrdine', label: 'Data', render: (o) => fmtData(o.dataOrdine) },
    {
      chiave: 'fornitore',
      label: 'Fornitore',
      valore: (o) => db.suppliers.find((s) => s.id === o.supplierId)?.ragioneSociale || '',
    },
    { chiave: 'righe', label: 'Righe', allinea: 'centro', valore: (o) => (o.righe || []).length },
    { chiave: 'dataPrevista', label: 'Consegna prevista', allinea: 'destra', nascondiSuMobile: true, render: (o) => fmtData(o.dataPrevista) },
    { chiave: 'stato', label: 'Stato', render: (o) => <StatoBadge stato={o.stato} /> },
    { chiave: 'totale', label: 'Imponibile', allinea: 'destra', valore: totaleOrdine, render: (o) => euro(totaleOrdine(o)) },
  ]

  const sottoScorta = db.articles.filter(
    (a) => a.attivo !== false && Number(a.giacenza) <= Number(a.puntoRiordino || a.scortaMinima || 0),
  )

  return (
    <div>
      {sottoScorta.length > 0 && (
        <Avviso
          tipo="attenzione"
          titolo={`${sottoScorta.length} articoli sotto il punto di riordino`}
          className="mb-4"
          azioni={
            ruolo !== 'meccanico' && (
              <Button misura="sm" variante="contorno" onClick={() => setModifica(proponiOrdine(db, sottoScorta, dataService))}>
                Proponi ordine
              </Button>
            )
          }
        >
          {sottoScorta.slice(0, 6).map((a) => a.descrizione).join(' · ')}
          {sottoScorta.length > 6 && ` e altri ${sottoScorta.length - 6}`}
        </Avviso>
      )}

      <div className="flex justify-between items-center gap-2 mb-4">
        <EsportaCsv nomeFile="ordini-fornitore" colonne={colonne} righe={db.orders} />
        {ruolo !== 'meccanico' && (
          <Nuovo onClick={() => setModifica(ordineVuoto(dataService))}>Ordine</Nuovo>
        )}
      </div>

      <Card padding={false}>
        <DataTable colonne={colonne} righe={db.orders} onRiga={setDettaglio} vuoto="Nessun ordine registrato." />
      </Card>

      {modifica && (
        <FormOrdine
          ordine={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const creazione = !valori.id
            await azione(
              () =>
                creazione
                  ? dataService.insert('orders', valori)
                  : dataService.update('orders', valori.id, valori),
              { successo: creazione ? 'Ordine creato.' : 'Ordine aggiornato.' },
            )
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioOrdine
          ordine={db.orders.find((o) => o.id === dettaglio.id) || dettaglio}
          onChiudi={() => setDettaglio(null)}
          onModifica={(o) => {
            setDettaglio(null)
            setModifica(o)
          }}
          onRicevi={(o) => {
            setDettaglio(null)
            setDaRicevere(o)
          }}
        />
      )}

      <Conferma
        aperto={Boolean(daRicevere)}
        onChiudi={() => setDaRicevere(null)}
        titolo="Registrare la ricezione?"
        messaggio={
          daRicevere
            ? `Ogni riga verrà caricata a magazzino con ricalcolo del prezzo medio ponderato, e verrà generata la spesa corrispondente per ${euro(totaleOrdine(daRicevere))}.`
            : ''
        }
        etichettaOk="Ricevi e carica"
        onConferma={() =>
          azione(() => dataService.riceviOrdine(daRicevere.id), {
            successo: 'Ordine ricevuto: magazzino caricato e spesa generata.',
          })
        }
      />
    </div>
  )
}

function ordineVuoto(dataService) {
  return {
    numero: dataService.prossimoNumero('orders').numero,
    supplierId: '',
    stato: 'bozza',
    dataOrdine: oggiIso(),
    dataPrevista: addGiorni(oggiIso(), 2),
    dataRicezione: null,
    righe: [],
    note: '',
    expenseId: null,
  }
}

/** Ordine precompilato con gli articoli sotto scorta di un fornitore. */
function proponiOrdine(db, sottoScorta, dataService) {
  const perFornitore = new Map()
  for (const a of sottoScorta) {
    const k = a.supplierId || db.suppliers[0]?.id || ''
    if (!perFornitore.has(k)) perFornitore.set(k, [])
    perFornitore.get(k).push(a)
  }
  const [supplierId, articoli] = [...perFornitore.entries()][0] || ['', []]
  return {
    ...ordineVuoto(dataService),
    supplierId,
    stato: 'bozza',
    righe: articoli.map((a) => ({
      articleId: a.id,
      codice: a.codice,
      descrizione: a.descrizione,
      quantita: Math.max(1, Number(a.puntoRiordino || 0) * 2 - Number(a.giacenza || 0)),
      prezzo: a.prezzoMedio,
      aliquotaIva: a.aliquotaIva,
    })),
  }
}

function FormOrdine({ ordine, onChiudi, onSalva }) {
  const { db } = useApp()
  const [o, setO] = useState(ordine)
  const [cerca, setCerca] = useState('')
  const [inCorso, setInCorso] = useState(false)

  const suggerimenti = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    if (q.length < 2) return []
    return db.articles
      .filter((a) => `${a.descrizione} ${a.codice} ${a.codiceOe}`.toLowerCase().includes(q))
      .slice(0, 8)
  }, [cerca, db.articles])

  const aggiungi = (a) => {
    if ((o.righe || []).some((r) => r.articleId === a.id)) return
    setO((x) => ({
      ...x,
      righe: [
        ...(x.righe || []),
        {
          articleId: a.id,
          codice: a.codice,
          descrizione: a.descrizione,
          quantita: Math.max(1, Number(a.puntoRiordino || 1)),
          prezzo: a.prezzoMedio,
          aliquotaIva: a.aliquotaIva,
        },
      ],
    }))
    setCerca('')
  }

  const totale = arrotonda((o.righe || []).reduce((s, r) => s + Number(r.quantita || 0) * Number(r.prezzo || 0), 0))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={o.id ? `Ordine ${o.numero}` : 'Nuovo ordine a fornitore'}
      larghezza="lg"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!o.supplierId || !(o.righe || []).length}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva(o)
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
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Campo etichetta="Numero">{(id) => <Input id={id} value={o.numero} onChange={(e) => setO((x) => ({ ...x, numero: e.target.value }))} />}</Campo>
          <Campo etichetta="Fornitore" obbligatorio>
            {(id) => (
              <Select
                id={id}
                value={o.supplierId}
                onChange={(e) => setO((x) => ({ ...x, supplierId: e.target.value }))}
                vuoto="— seleziona —"
                opzioni={db.suppliers.map((s) => ({ valore: s.id, etichetta: s.ragioneSociale }))}
              />
            )}
          </Campo>
          <Campo etichetta="Data ordine">
            {(id) => <Input id={id} type="date" value={o.dataOrdine} onChange={(e) => setO((x) => ({ ...x, dataOrdine: e.target.value }))} />}
          </Campo>
          <Campo etichetta="Consegna prevista">
            {(id) => <Input id={id} type="date" value={o.dataPrevista || ''} onChange={(e) => setO((x) => ({ ...x, dataPrevista: e.target.value }))} />}
          </Campo>
        </div>

        <div className="relative">
          <Campo etichetta="Aggiungi articolo">
            {(id) => <Input id={id} value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Codice o descrizione…" />}
          </Campo>
          {suggerimenti.length > 0 && (
            <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl overflow-hidden max-h-64 overflow-y-auto">
              {suggerimenti.map((a) => (
                <li key={a.id}>
                  <button type="button" onClick={() => aggiungi(a)} className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-2)] flex justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm truncate">{a.descrizione}</span>
                      <span className="block text-[11px] font-mono text-[var(--ink-3)]">{a.codice}</span>
                    </span>
                    <span className="text-xs tabnum text-[var(--ink-3)] shrink-0">giac. {numero(a.giacenza, 0)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {(o.righe || []).length ? (
          <div className="space-y-2">
            {o.righe.map((r, i) => (
              <div key={r.articleId || i} className="rounded-xl border border-[var(--line)] p-3 flex items-center gap-3">
                <div className="min-w-0 grow">
                  <p className="text-sm truncate">{r.descrizione}</p>
                  <p className="text-[11px] font-mono text-[var(--ink-3)]">{r.codice}</p>
                </div>
                <div className="w-20 shrink-0">
                  <InputNumero
                    valore={r.quantita}
                    onChange={(n) => setO((x) => ({ ...x, righe: x.righe.map((y, k) => (k === i ? { ...y, quantita: n } : y)) }))}
                    decimali={0}
                    className="h-9"
                  />
                </div>
                <div className="w-24 shrink-0">
                  <InputNumero
                    valore={r.prezzo}
                    onChange={(n) => setO((x) => ({ ...x, righe: x.righe.map((y, k) => (k === i ? { ...y, prezzo: n } : y)) }))}
                    className="h-9"
                  />
                </div>
                <span className="w-24 text-right tabnum text-sm shrink-0">{euro(r.quantita * r.prezzo)}</span>
                <button
                  type="button"
                  onClick={() => setO((x) => ({ ...x, righe: x.righe.filter((_, k) => k !== i) }))}
                  aria-label="Togli riga"
                  className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)] shrink-0"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
            <div className="flex justify-end pt-2 text-sm">
              <span className="text-[var(--ink-2)] mr-3">Imponibile ordine</span>
              <span className="font-semibold tabnum">{euro(totale)}</span>
            </div>
          </div>
        ) : (
          <Vuoto messaggio="Nessuna riga nell’ordine." icona={ShoppingCart} />
        )}

        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etichetta="Stato">
            {(id) => (
              <Select
                id={id}
                value={o.stato}
                onChange={(e) => setO((x) => ({ ...x, stato: e.target.value }))}
                opzioni={[
                  { valore: 'bozza', etichetta: 'Bozza' },
                  { valore: 'inviato', etichetta: 'Inviato' },
                  { valore: 'annullato', etichetta: 'Annullato' },
                ]}
              />
            )}
          </Campo>
          <Campo etichetta="Note">
            {(id) => <Input id={id} value={o.note || ''} onChange={(e) => setO((x) => ({ ...x, note: e.target.value }))} />}
          </Campo>
        </div>
      </div>
    </Modal>
  )
}

function DettaglioOrdine({ ordine: o, onChiudi, onModifica, onRicevi }) {
  const { db, scuro } = useApp()
  const tema = assi(scuro)
  const fornitore = db.suppliers.find((s) => s.id === o.supplierId)
  const totale = arrotonda((o.righe || []).reduce((s, r) => s + Number(r.quantita || 0) * Number(r.prezzo || 0), 0))
  const spesa = db.expenses.find((e) => e.id === o.expenseId)

  const dati = (o.righe || []).map((r) => ({
    nome: r.descrizione.slice(0, 18),
    valore: arrotonda(Number(r.quantita || 0) * Number(r.prezzo || 0)),
  }))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={`Ordine ${o.numero}`}
      sottotitolo={fornitore?.ragioneSociale}
      larghezza="lg"
      piede={
        <>
          <div className="grow" />
          {o.stato !== 'ricevuto' && (
            <>
              <Button variante="contorno" onClick={() => onModifica(o)}>
                Modifica
              </Button>
              <Button variante="primario" icona={ArrowDownToLine} onClick={() => onRicevi(o)}>
                Registra ricezione
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <StatoBadge stato={o.stato} />
          {spesa && <Badge tono="accento">Spesa generata</Badge>}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Data ordine" valore={fmtData(o.dataOrdine)} />
          <Dato etichetta="Consegna prevista" valore={fmtData(o.dataPrevista)} />
          <Dato etichetta="Ricevuto il" valore={fmtData(o.dataRicezione)} />
          <Dato etichetta="Imponibile" valore={euro(totale)} />
          <Dato etichetta="Condizioni" valore={fornitore?.condizioniPagamento} />
          <Dato etichetta="Sconto praticato" valore={fornitore ? `${fornitore.scontoPraticato}%` : '—'} />
          <Dato etichetta="Tempi di consegna" valore={fornitore ? `${fornitore.tempiConsegnaGiorni} gg` : '—'} />
          <Dato etichetta="Righe" valore={(o.righe || []).length} />
        </dl>

        {dati.length > 1 && (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dati} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 10, fill: tema.testo }} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={44} />
                <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tema.tooltip} formatter={(v) => [euro(v), 'Valore']} cursor={{ fill: tema.cursore }} />
                <Bar dataKey="valore" fill={serie(scuro)[0]} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <DataTable
          denso
          colonne={[
            { chiave: 'codice', label: 'Codice', render: (r) => <span className="font-mono text-xs">{r.codice}</span> },
            { chiave: 'descrizione', label: 'Articolo' },
            { chiave: 'quantita', label: 'Q.tà', allinea: 'destra', render: (r) => numero(r.quantita, 0) },
            { chiave: 'prezzo', label: 'Prezzo', allinea: 'destra', render: (r) => euro(r.prezzo) },
            {
              chiave: 'totale',
              label: 'Totale',
              allinea: 'destra',
              valore: (r) => arrotonda(r.quantita * r.prezzo),
              render: (r) => euro(r.quantita * r.prezzo),
            },
          ]}
          righe={o.righe || []}
          chiaveRiga={(r) => r.articleId || r.codice}
          vuoto="Ordine senza righe."
        />
      </div>
    </Modal>
  )
}
