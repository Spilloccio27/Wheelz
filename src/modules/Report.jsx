/**
 * Report economici.
 *
 * Conto economico del periodo, marginalità separata fra manodopera e ricambi,
 * fatturato per intervento e per cliente, produttività per meccanico,
 * rotazione del magazzino, break-even, confronto fra due periodi.
 *
 * Tutti i numeri arrivano da `utils/calc.js`: qui si sceglie solo cosa
 * mostrare e come. Ogni tabella si esporta in CSV.
 */

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { Calculator, PieChart as PieIcon, Target, TrendingUp, Users } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { SelettoreMese } from './Dashboard.jsx'
import {
  Avviso,
  Badge,
  Barra,
  Card,
  CardHeader,
  DataTable,
  Dato,
  EsportaCsv,
  KPI,
  Sezione,
  Tabs,
  Vuoto,
  cx,
} from '../components/ui.jsx'
import { assi, colore, coppiaRicavo, fondoBarra, serie } from '../utils/chartColors.js'
import {
  QUADRANTI,
  arrotonda,
  breakEven,
  contoEconomico,
  costoRiga,
  matriceInterventi,
  produttivita,
  rotazioneMagazzino,
  totaliDocumento,
  valoreMedioScheda,
} from '../utils/calc.js'
import {
  MESI,
  addMesi,
  data as fmtData,
  euro,
  giorniTra,
  giornoSettimana,
  meseDi,
  nomeCliente,
  nomeDipendente,
  numero,
  oggiIso,
  ore as fmtOre,
  percento,
  rangeMese,
} from '../utils/format.js'

export default function Report() {
  const { db, settings, periodo, setPeriodo, scuro } = useApp()
  const [tab, setTab] = useState('economico')
  const [confronto, setConfronto] = useState(() => meseDi(addMesi(`${periodo}-01`, -1)))

  const { da, a, giorni } = rangeMese(periodo)

  const giorniAperti = useMemo(() => {
    let n = 0
    for (let g = 1; g <= giorni; g++) {
      if (giornoSettimana(`${periodo}-${String(g).padStart(2, '0')}`) !== 0) n++
    }
    return n
  }, [periodo, giorni])

  const ce = useMemo(
    () =>
      contoEconomico({
        invoices: db.invoices,
        expenses: db.expenses,
        attendance: db.attendance,
        employees: db.employees,
        da,
        a,
        oneri: settings.oneriContributivi,
      }),
    [db, da, a, settings.oneriContributivi],
  )

  const schedeChiuse = db.jobs.filter((j) => j.dataConsegna && j.dataConsegna >= da && j.dataConsegna <= a)
  const vms = valoreMedioScheda(ce.ricavi, schedeChiuse.length)

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Report</h1>
          <p className="text-xs text-[var(--ink-3)] mt-1">
            {MESI[Number(periodo.slice(5, 7)) - 1]} {periodo.slice(0, 4)} · {giorniAperti} giorni di apertura
          </p>
        </div>
        <SelettoreMese valore={periodo} onChange={setPeriodo} />
      </div>

      <Tabs
        className="mb-5"
        valore={tab}
        onChange={setTab}
        voci={[
          { valore: 'economico', etichetta: 'Conto economico' },
          { valore: 'marginalita', etichetta: 'Marginalità' },
          { valore: 'produttivita', etichetta: 'Produttività' },
          { valore: 'magazzino', etichetta: 'Magazzino' },
          { valore: 'confronto', etichetta: 'Confronto periodi' },
        ]}
      />

      {tab === 'economico' && (
        <ContoEconomico ce={ce} vms={vms} giorniAperti={giorniAperti} schedeChiuse={schedeChiuse.length} />
      )}
      {tab === 'marginalita' && <Marginalita da={da} a={a} ce={ce} />}
      {tab === 'produttivita' && <Produttivita da={da} a={a} giorniAperti={giorniAperti} />}
      {tab === 'magazzino' && <ReportMagazzino da={da} a={a} />}
      {tab === 'confronto' && (
        <Confronto periodo={periodo} confronto={confronto} onConfronto={setConfronto} scuro={scuro} />
      )}
    </div>
  )
}

/* ================================================================== *
 * Conto economico e break-even
 * ================================================================== */

function ContoEconomico({ ce, vms, giorniAperti, schedeChiuse }) {
  const { settings, scuro } = useApp()
  const tema = assi(scuro)

  const tariffaMedia = useMemo(() => {
    const t = settings.tariffe || []
    return t.length ? arrotonda(t.reduce((s, x) => s + Number(x.prezzoOrario || 0), 0) / t.length) : 45
  }, [settings.tariffe])

  const be = breakEven({
    costiFissi: ce.costiFissi,
    margineContribuzione: ce.margineContribuzionePerc,
    valoreMedioScheda: vms,
    giorniLavorativi: giorniAperti,
    tariffaMedia,
    quotaManodopera: ce.ricavi ? ce.ricaviManodopera / ce.ricavi : 0.6,
  })

  const righe = [
    { voce: 'Ricavi manodopera', importo: ce.ricaviManodopera, tipo: 'ricavo' },
    { voce: 'Ricavi ricambi e forniture', importo: ce.ricaviRicambi, tipo: 'ricavo' },
    { voce: 'Totale ricavi', importo: ce.ricavi, tipo: 'totale' },
    { voce: 'Costo dei ricambi impiegati', importo: -ce.costoRicambi, tipo: 'costo' },
    { voce: 'Altri costi variabili', importo: -ce.speseVariabili, tipo: 'costo' },
    { voce: 'Margine di contribuzione', importo: ce.margineContribuzione, tipo: 'totale' },
    { voce: 'Costo del lavoro (oneri inclusi)', importo: -ce.costoLavoro, tipo: 'costo' },
    { voce: 'Costi fissi di struttura', importo: -ce.speseFisse, tipo: 'costo' },
    { voce: 'Risultato del periodo', importo: ce.risultato, tipo: 'risultato' },
  ]

  const cascata = [
    { nome: 'Ricavi', valore: ce.ricavi },
    { nome: 'Costi variabili', valore: -ce.costiVariabili },
    { nome: 'Costo lavoro', valore: -ce.costoLavoro },
    { nome: 'Costi fissi', valore: -ce.speseFisse },
    { nome: 'Risultato', valore: ce.risultato },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI etichetta="Ricavi" valore={ce.ricavi} formato={(v) => euro(v, { decimali: 0 })} icona={TrendingUp} dettaglio={`${schedeChiuse} schede chiuse`} />
        <KPI
          etichetta="Margine di contribuzione"
          valore={ce.margineContribuzionePerc}
          formato={(v) => percento(v, 1)}
          icona={PieIcon}
          dettaglio={euro(ce.margineContribuzione, { decimali: 0 })}
        />
        <KPI etichetta="Risultato" valore={ce.risultato} formato={(v) => euro(v, { decimali: 0 })} icona={Calculator} dettaglio={percento(ce.risultatoPerc, 1)} />
        <KPI etichetta="Valore medio scheda" valore={vms} formato={(v) => euro(v, { decimali: 0 })} icona={Target} />
      </div>

      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            titolo="Conto economico del periodo"
            sottotitolo="Importi al netto dell’IVA"
            azioni={
              <EsportaCsv
                nomeFile="conto-economico"
                colonne={[
                  { label: 'Voce', value: (r) => r.voce },
                  { label: 'Importo', value: (r) => r.importo },
                ]}
                righe={righe}
              />
            }
          />
          <table className="w-full text-sm">
            <tbody>
              {righe.map((r) => (
                <tr
                  key={r.voce}
                  className={cx(
                    'border-b border-[var(--line)] last:border-0',
                    (r.tipo === 'totale' || r.tipo === 'risultato') && 'font-semibold',
                  )}
                >
                  <td className={cx('py-2.5', r.tipo === 'costo' && 'pl-4 text-[var(--ink-2)]')}>{r.voce}</td>
                  <td
                    className="py-2.5 text-right tabnum"
                    style={
                      r.tipo === 'risultato'
                        ? { color: r.importo >= 0 ? 'var(--color-pos)' : 'var(--color-neg)' }
                        : undefined
                    }
                  >
                    {euro(r.importo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader titolo="Dai ricavi al risultato" sottotitolo="Dove finiscono i soldi del periodo" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cascata} margin={{ top: 4, right: 4, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                <Tooltip contentStyle={tema.tooltip} formatter={(v) => [euro(v), 'Importo']} cursor={{ fill: tema.cursore }} />
                <Bar dataKey="valore" radius={[3, 3, 0, 0]}>
                  {cascata.map((c, i) => (
                    <Cell
                      key={i}
                      fill={
                        c.nome === 'Risultato'
                          ? c.valore >= 0
                            ? 'var(--segno-pos)'
                            : 'var(--segno-neg)'
                          : c.valore >= 0
                            ? serie(scuro)[0]
                            : serie(scuro)[1]
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader
          titolo="Break-even"
          sottotitolo="Quanto deve fatturare l’officina per coprire i costi fissi, personale compreso"
          icona={Target}
        />
        {be.raggiungibile ? (
          <>
            <div className="grid sm:grid-cols-3 gap-4 mb-4">
              <Dato etichetta="Fatturato di pareggio" valore={euro(be.fatturato, { decimali: 0 })} />
              <Dato etichetta="Schede al giorno" valore={be.schedeGiorno !== null ? numero(be.schedeGiorno, 2) : '—'} />
              <Dato etichetta="Ore vendute al giorno" valore={be.oreVenduteGiorno !== null ? fmtOre(be.oreVenduteGiorno, 1) : '—'} />
            </div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[var(--ink-2)]">Copertura raggiunta</span>
              <span className="tabnum">
                {euro(ce.ricavi, { decimali: 0 })} su {euro(be.fatturato, { decimali: 0 })}
              </span>
            </div>
            <Barra
              quota={be.fatturato ? ce.ricavi / be.fatturato : 0}
              altezza={10}
              colore={ce.ricavi >= be.fatturato ? 'var(--color-pos)' : 'var(--color-warn)'}
            />
            <p className="text-xs text-[var(--ink-3)] mt-3">
              Costi fissi del periodo {euro(ce.costiFissi, { decimali: 0 })} (di cui{' '}
              {euro(ce.costoLavoro, { decimali: 0 })} di personale), margine di contribuzione{' '}
              {percento(ce.margineContribuzionePerc, 1)}. Le ore al giorno sono calcolate sulla
              tariffa media e sulla quota di manodopera del periodo.
            </p>
          </>
        ) : (
          <Avviso tipo="attenzione" titolo="Break-even non calcolabile">
            Con un margine di contribuzione nullo o negativo non esiste un fatturato che copra i
            costi fissi: prima va rivista la marginalità.
          </Avviso>
        )}
      </Card>
    </div>
  )
}

/* ================================================================== *
 * Marginalità
 * ================================================================== */

function Marginalita({ da, a, ce }) {
  const { db, scuro } = useApp()
  const tema = assi(scuro)
  const tinte = coppiaRicavo(scuro)

  const fatture = useMemo(
    () => db.invoices.filter((f) => f.data >= da && f.data <= a && f.stato !== 'annullata'),
    [db.invoices, da, a],
  )

  /** Fatturato e margine per tipo di intervento, dalla scheda collegata. */
  const perIntervento = useMemo(() => {
    const m = new Map()
    for (const f of fatture) {
      const job = db.jobs.find((j) => j.id === f.jobId)
      const tipo = job?.tipoIntervento || 'Altro'
      const t = totaliDocumento(f.righe || [], f.scontoGlobale || 0)
      const costo = (f.righe || []).reduce((s, r) => s + costoRiga(r), 0)
      const v = m.get(tipo) || { tipo, fatturato: 0, costo: 0, schede: 0, ore: 0 }
      v.fatturato = arrotonda(v.fatturato + t.imponibile)
      v.costo = arrotonda(v.costo + costo)
      v.ore = arrotonda(v.ore + t.ore, 2)
      v.schede += 1
      m.set(tipo, v)
    }
    return [...m.values()]
      .map((v) => ({
        ...v,
        margine: arrotonda(v.fatturato - v.costo),
        marginePerc: v.fatturato ? arrotonda((v.fatturato - v.costo) / v.fatturato, 4) : 0,
        medio: v.schede ? arrotonda(v.fatturato / v.schede) : 0,
      }))
      .sort((x, y) => y.fatturato - x.fatturato)
  }, [fatture, db.jobs])

  const perCliente = useMemo(() => {
    const m = new Map()
    for (const f of fatture) {
      const t = totaliDocumento(f.righe || [], f.scontoGlobale || 0)
      const costo = (f.righe || []).reduce((s, r) => s + costoRiga(r), 0)
      const v = m.get(f.customerId) || { customerId: f.customerId, fatturato: 0, costo: 0, fattureN: 0 }
      v.fatturato = arrotonda(v.fatturato + t.imponibile)
      v.costo = arrotonda(v.costo + costo)
      v.fattureN += 1
      m.set(f.customerId, v)
    }
    return [...m.values()]
      .map((v) => ({ ...v, margine: arrotonda(v.fatturato - v.costo) }))
      .sort((x, y) => y.fatturato - x.fatturato)
  }, [fatture])

  const matrice = useMemo(
    () =>
      matriceInterventi(
        perIntervento.map((v) => ({
          tipo: v.tipo,
          frequenza: v.schede,
          margine: v.marginePerc,
          fatturato: v.fatturato,
        })),
      ),
    [perIntervento],
  )

  const colonneIntervento = [
    { chiave: 'tipo', label: 'Intervento' },
    { chiave: 'schede', label: 'Schede', allinea: 'destra' },
    { chiave: 'ore', label: 'Ore', allinea: 'destra', render: (r) => numero(r.ore, 1) },
    { chiave: 'fatturato', label: 'Fatturato', allinea: 'destra', render: (r) => euro(r.fatturato, { decimali: 0 }) },
    { chiave: 'medio', label: 'Valore medio', allinea: 'destra', nascondiSuMobile: true, render: (r) => euro(r.medio, { decimali: 0 }) },
    { chiave: 'margine', label: 'Margine', allinea: 'destra', render: (r) => euro(r.margine, { decimali: 0 }) },
    {
      chiave: 'marginePerc',
      label: '%',
      allinea: 'destra',
      render: (r) => (
        <Badge tono={r.marginePerc >= 0.45 ? 'positivo' : r.marginePerc >= 0.3 ? 'attenzione' : 'negativo'}>
          {percento(r.marginePerc, 0)}
        </Badge>
      ),
      csv: (r) => r.marginePerc,
    },
  ]

  const colonneCliente = [
    {
      chiave: 'cliente',
      label: 'Cliente',
      valore: (r) => nomeCliente(db.customers.find((c) => c.id === r.customerId)),
    },
    { chiave: 'fattureN', label: 'Fatture', allinea: 'destra' },
    { chiave: 'fatturato', label: 'Fatturato', allinea: 'destra', render: (r) => euro(r.fatturato, { decimali: 0 }) },
    { chiave: 'margine', label: 'Margine', allinea: 'destra', render: (r) => euro(r.margine, { decimali: 0 }) },
    {
      chiave: 'quota',
      label: 'Quota',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (r) => (ce.ricavi ? r.fatturato / ce.ricavi : 0),
      render: (r) => (
        <div className="flex items-center gap-2 justify-end">
          <Barra quota={ce.ricavi ? r.fatturato / ce.ricavi : 0} className="w-16" />
          <span className="tabnum w-10">{percento(ce.ricavi ? r.fatturato / ce.ricavi : 0, 0)}</span>
        </div>
      ),
      csv: (r) => (ce.ricavi ? r.fatturato / ce.ricavi : 0),
    },
  ]

  if (!fatture.length) {
    return (
      <Card>
        <Vuoto messaggio="Nessuna fattura nel periodo." descrizione="Scegli un altro mese dal selettore in alto." />
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid lg:grid-cols-3 gap-3">
        <Card>
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-3)] mb-2">Manodopera</p>
          <p className="text-2xl font-semibold tabnum">{euro(ce.ricaviManodopera, { decimali: 0 })}</p>
          <p className="text-xs text-[var(--ink-2)] mt-1">
            costo del lavoro {euro(ce.costoLavoro, { decimali: 0 })} · margine{' '}
            {euro(ce.margineManodopera, { decimali: 0 })}
          </p>
          <Barra
            className="mt-3"
            quota={ce.ricaviManodopera ? Math.max(0, ce.margineManodopera / ce.ricaviManodopera) : 0}
            colore={tinte.manodopera}
          />
        </Card>
        <Card>
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-3)] mb-2">Ricambi</p>
          <p className="text-2xl font-semibold tabnum">{euro(ce.ricaviRicambi, { decimali: 0 })}</p>
          <p className="text-xs text-[var(--ink-2)] mt-1">
            costo {euro(ce.costoRicambi, { decimali: 0 })} · margine {percento(ce.margineRicambiPerc, 1)}
          </p>
          <Barra className="mt-3" quota={Math.max(0, ce.margineRicambiPerc)} colore={tinte.ricambi} />
        </Card>
        <Card>
          <p className="text-[11px] uppercase tracking-wide text-[var(--ink-3)] mb-2">Mix dei ricavi</p>
          <p className="text-2xl font-semibold tabnum">
            {percento(ce.ricavi ? ce.ricaviManodopera / ce.ricavi : 0, 0)}
          </p>
          <p className="text-xs text-[var(--ink-2)] mt-1">quota di manodopera sul fatturato</p>
          <div className="flex h-2.5 rounded-full overflow-hidden mt-3">
            <div style={{ width: `${(ce.ricavi ? ce.ricaviManodopera / ce.ricavi : 0) * 100}%`, background: tinte.manodopera }} />
            <div style={{ width: `${(ce.ricavi ? ce.ricaviRicambi / ce.ricavi : 0) * 100}%`, background: tinte.ricambi }} />
          </div>
        </Card>
      </div>

      <Sezione
        titolo="Fatturato per tipo di intervento"
        azioni={<EsportaCsv nomeFile="fatturato-per-intervento" colonne={colonneIntervento} righe={perIntervento} />}
      >
        <Card padding={false}>
          <DataTable colonne={colonneIntervento} righe={perIntervento} ordineIniziale={{ chiave: 'fatturato', direzione: 'desc' }} />
        </Card>
      </Sezione>

      <Card>
        <CardHeader
          titolo="Matrice interventi"
          sottotitolo="Frequenza rispetto alla mediana, margine rispetto alla media: quattro quadranti per capire su cosa spingere"
        />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} />
              <XAxis
                type="number"
                dataKey="frequenza"
                name="Schede"
                tick={{ fontSize: 11, fill: tema.testo }}
                tickLine={false}
                axisLine={false}
                label={{ value: 'Numero di schede', position: 'insideBottom', offset: -4, fill: tema.testo, fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="margine"
                name="Margine"
                tick={{ fontSize: 11, fill: tema.testo }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
              />
              <ZAxis type="number" dataKey="fatturato" range={[60, 400]} />
              <Tooltip
                contentStyle={tema.tooltip}
                cursor={{ strokeDasharray: '3 3' }}
                formatter={(v, n) => (n === 'Margine' ? [percento(v, 1), 'Margine'] : [numero(v, 0), n])}
                labelFormatter={() => ''}
                content={({ payload }) => {
                  const p = payload?.[0]?.payload
                  if (!p) return null
                  return (
                    <div style={tema.tooltip}>
                      <p className="font-medium">{p.tipo}</p>
                      <p>{p.frequenza} schede · margine {percento(p.margine, 1)}</p>
                      <p className="opacity-70">{QUADRANTI[p.quadrante].label}</p>
                    </div>
                  )
                }}
              />
              <Scatter data={matrice.voci} fill={serie(scuro)[0]}>
                {matrice.voci.map((v, i) => (
                  <Cell key={i} fill={colore(['traino', 'volume', 'nicchia', 'marginale'].indexOf(v.quadrante), scuro)} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-3">
          {Object.entries(QUADRANTI).map(([k, q], i) => {
            const voci = matrice.voci.filter((v) => v.quadrante === k)
            return (
              <div key={k} className="rounded-xl border border-[var(--line)] p-3">
                <p className="text-xs font-medium flex items-center gap-1.5 mb-1">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colore(i, scuro) }} />
                  {q.label}
                </p>
                <p className="text-[11px] text-[var(--ink-3)] leading-snug mb-1.5">{q.desc}</p>
                <p className="text-xs text-[var(--ink-2)]">{voci.map((v) => v.tipo).join(', ') || '—'}</p>
              </div>
            )
          })}
        </div>
      </Card>

      <Sezione
        titolo="Fatturato per cliente"
        azioni={<EsportaCsv nomeFile="fatturato-per-cliente" colonne={colonneCliente} righe={perCliente} />}
      >
        <Card padding={false}>
          <DataTable
            colonne={colonneCliente}
            righe={perCliente}
            chiaveRiga={(r) => r.customerId}
            ordineIniziale={{ chiave: 'fatturato', direzione: 'desc' }}
            massimo={25}
          />
        </Card>
      </Sezione>
    </div>
  )
}

/* ================================================================== *
 * Produttività
 * ================================================================== */

function Produttivita({ da, a, giorniAperti }) {
  const { db, settings, scuro } = useApp()
  const tema = assi(scuro)

  const righe = useMemo(() => {
    return db.employees
      .filter((e) => e.produttivo !== false)
      .map((e) => {
        const vendute = db.jobLines
          .filter((l) => l.tipo === 'manodopera' && l.employeeId === e.id && l.data >= da && l.data <= a)
          .reduce((s, l) => s + Number(l.ore || 0), 0)
        const ricavo = db.jobLines
          .filter((l) => l.tipo === 'manodopera' && l.employeeId === e.id && l.data >= da && l.data <= a)
          .reduce((s, l) => s + Number(l.ore || 0) * Number(l.tariffaOraria || 0), 0)
        const presenze = db.attendance.filter((p) => p.employeeId === e.id && p.data >= da && p.data <= a)
        const presenza = presenze.reduce(
          (s, p) => s + Number(p.oreOrdinarie || 0) + Number(p.oreStraordinario || 0),
          0,
        )
        return {
          id: e.id,
          nome: nomeDipendente(e),
          breve: e.nome,
          reparto: e.reparto,
          vendute: arrotonda(vendute, 2),
          presenza: arrotonda(presenza, 2),
          ricavo: arrotonda(ricavo),
          produttivita: produttivita(vendute, presenza),
          ricavoOra: presenza ? arrotonda(ricavo / presenza) : 0,
        }
      })
      .filter((r) => r.presenza > 0 || r.vendute > 0)
      .sort((x, y) => y.produttivita - x.produttivita)
  }, [db.employees, db.jobLines, db.attendance, da, a])

  const capacita = arrotonda(
    (settings.numeroPonti || 3) * (settings.oreApertura || 8) * giorniAperti,
    0,
  )
  const oreTotali = arrotonda(righe.reduce((s, r) => s + r.vendute, 0), 2)

  const colonne = [
    { chiave: 'nome', label: 'Dipendente' },
    { chiave: 'reparto', label: 'Reparto', nascondiSuMobile: true },
    { chiave: 'presenza', label: 'Ore presenza', allinea: 'destra', render: (r) => numero(r.presenza, 1) },
    { chiave: 'vendute', label: 'Ore vendute', allinea: 'destra', render: (r) => numero(r.vendute, 1) },
    {
      chiave: 'produttivita',
      label: 'Produttività',
      allinea: 'destra',
      render: (r) => (
        <div className="flex items-center gap-2 justify-end">
          <Barra quota={r.produttivita} className="w-16" />
          <span className="tabnum w-11">{percento(r.produttivita, 0)}</span>
        </div>
      ),
      csv: (r) => r.produttivita,
    },
    { chiave: 'ricavo', label: 'Ricavo manodopera', allinea: 'destra', render: (r) => euro(r.ricavo, { decimali: 0 }) },
    { chiave: 'ricavoOra', label: 'Ricavo per ora di presenza', allinea: 'destra', nascondiSuMobile: true, render: (r) => euro(r.ricavoOra) },
  ]

  if (!righe.length) {
    return (
      <Card>
        <Vuoto messaggio="Nessuna ora registrata nel periodo." />
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI etichetta="Ore vendute" valore={oreTotali} formato={(v) => fmtOre(v, 0)} icona={TrendingUp} />
        <KPI etichetta="Capacità teorica" valore={capacita} formato={(v) => fmtOre(v, 0)} icona={Target} dettaglio={`${settings.numeroPonti} ponti × ${settings.oreApertura} h × ${giorniAperti} gg`} />
        <KPI
          etichetta="Occupazione ponti"
          valore={capacita ? oreTotali / capacita : 0}
          formato={(v) => percento(v, 0)}
          icona={PieIcon}
        />
        <KPI
          etichetta="Produttività media"
          valore={produttivita(
            righe.reduce((s, r) => s + r.vendute, 0),
            righe.reduce((s, r) => s + r.presenza, 0),
          )}
          formato={(v) => percento(v, 0)}
          icona={Users}
        />
      </div>

      <Card>
        <CardHeader
          titolo="Ore e produttività per meccanico"
          sottotitolo="Le barre sono le ore, la linea è la percentuale di ore vendute sulla presenza"
        />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={righe} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
              <XAxis dataKey="breve" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="ore" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="perc"
                orientation="right"
                domain={[0, 1.2]}
                tick={{ fontSize: 11, fill: tema.testo }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${Math.round(v * 100)}%`}
              />
              <Tooltip
                contentStyle={tema.tooltip}
                formatter={(v, n) =>
                  n === 'produttivita' ? [percento(v, 0), 'Produttività'] : [fmtOre(v, 1), n === 'vendute' ? 'Ore vendute' : 'Ore presenza']
                }
                cursor={{ fill: tema.cursore }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: tema.testo }}
                formatter={(v) => (v === 'vendute' ? 'Ore vendute' : v === 'presenza' ? 'Ore presenza' : 'Produttività')}
              />
              <Bar yAxisId="ore" dataKey="presenza" fill={fondoBarra(scuro)} radius={[3, 3, 0, 0]} />
              <Bar yAxisId="ore" dataKey="vendute" fill={serie(scuro)[0]} radius={[3, 3, 0, 0]} />
              <Line yAxisId="perc" type="monotone" dataKey="produttivita" stroke={serie(scuro)[1]} strokeWidth={2.4} dot={{ r: 3 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Sezione titolo="Dettaglio" azioni={<EsportaCsv nomeFile="produttivita" colonne={colonne} righe={righe} />}>
        <Card padding={false}>
          <DataTable colonne={colonne} righe={righe} ordineIniziale={{ chiave: 'produttivita', direzione: 'desc' }} />
        </Card>
      </Sezione>
    </div>
  )
}

/* ================================================================== *
 * Magazzino
 * ================================================================== */

function ReportMagazzino({ da, a }) {
  const { db } = useApp()

  const valore = arrotonda(
    db.articles.reduce((s, x) => s + Number(x.giacenza || 0) * Number(x.prezzoMedio || 0), 0),
  )

  const scarichi = db.movements.filter((m) => m.tipo === 'scarico' && m.data >= da && m.data <= a)
  const costoVenduto = arrotonda(
    scarichi.reduce((s, m) => s + Number(m.quantita || 0) * Number(m.prezzoUnitario || 0), 0),
  )
  const giorniPeriodo = Math.max(1, (giorniTra(da, a) || 0) + 1)
  const rot = rotazioneMagazzino(costoVenduto, valore, giorniPeriodo)

  const righe = useMemo(() => {
    const consumo = new Map()
    for (const m of scarichi) {
      const v = consumo.get(m.articleId) || { qta: 0, valore: 0 }
      v.qta = arrotonda(v.qta + Number(m.quantita || 0), 2)
      v.valore = arrotonda(v.valore + Number(m.quantita || 0) * Number(m.prezzoUnitario || 0))
      consumo.set(m.articleId, v)
    }
    return db.articles
      .map((art) => {
        const c = consumo.get(art.id) || { qta: 0, valore: 0 }
        const giacenzaValore = arrotonda(Number(art.giacenza || 0) * Number(art.prezzoMedio || 0))
        return {
          id: art.id,
          codice: art.codice,
          descrizione: art.descrizione,
          categoria: art.categoria,
          giacenza: art.giacenza,
          giacenzaValore,
          consumoQta: c.qta,
          consumoValore: c.valore,
          indice: giacenzaValore ? arrotonda(c.valore / giacenzaValore, 2) : 0,
          copertura: c.qta ? arrotonda((Number(art.giacenza || 0) / c.qta) * giorniPeriodo, 0) : null,
        }
      })
      .sort((x, y) => y.consumoValore - x.consumoValore)
  }, [db.articles, scarichi, giorniPeriodo])

  const fermi = righe.filter((r) => r.consumoQta === 0 && r.giacenzaValore > 0)

  const colonne = [
    { chiave: 'codice', label: 'Codice', render: (r) => <span className="font-mono text-xs">{r.codice}</span> },
    { chiave: 'descrizione', label: 'Articolo' },
    { chiave: 'categoria', label: 'Categoria', nascondiSuMobile: true },
    { chiave: 'giacenza', label: 'Giacenza', allinea: 'destra', render: (r) => numero(r.giacenza, 0) },
    { chiave: 'giacenzaValore', label: 'Valore', allinea: 'destra', render: (r) => euro(r.giacenzaValore, { decimali: 0 }) },
    { chiave: 'consumoQta', label: 'Consumo', allinea: 'destra', render: (r) => numero(r.consumoQta, 0) },
    { chiave: 'consumoValore', label: 'Costo venduto', allinea: 'destra', render: (r) => euro(r.consumoValore, { decimali: 0 }) },
    {
      chiave: 'copertura',
      label: 'Copertura',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (r) => r.copertura ?? 99999,
      render: (r) => (r.copertura === null ? <span className="text-[var(--ink-3)]">fermo</span> : `${numero(r.copertura, 0)} gg`),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI etichetta="Valore di magazzino" valore={valore} formato={(v) => euro(v, { decimali: 0 })} icona={PieIcon} />
        <KPI etichetta="Costo del venduto" valore={costoVenduto} formato={(v) => euro(v, { decimali: 0 })} icona={TrendingUp} dettaglio={`${giorniPeriodo} giorni`} />
        <KPI etichetta="Rotazione annua" valore={rot.indiceAnnuo} formato={(v) => `${numero(v, 2)}×`} icona={Calculator} />
        <KPI
          etichetta="Giorni di copertura"
          valore={rot.giorniCopertura ?? 0}
          formato={(v) => (v ? `${numero(v, 0)} gg` : '—')}
          icona={Target}
          dettaglio={`${fermi.length} articoli fermi`}
        />
      </div>

      {fermi.length > 0 && (
        <Avviso tipo="attenzione" titolo={`${fermi.length} articoli fermi nel periodo`}>
          Immobilizzano {euro(arrotonda(fermi.reduce((s, r) => s + r.giacenzaValore, 0)), { decimali: 0 })} di
          magazzino senza essere usciti. Vale la pena chiedersi se servono davvero a scaffale.
        </Avviso>
      )}

      <Sezione titolo="Rotazione per articolo" azioni={<EsportaCsv nomeFile="rotazione-magazzino" colonne={colonne} righe={righe} />}>
        <Card padding={false}>
          <DataTable colonne={colonne} righe={righe} ordineIniziale={{ chiave: 'consumoValore', direzione: 'desc' }} massimo={50} />
        </Card>
      </Sezione>
    </div>
  )
}

/* ================================================================== *
 * Confronto fra periodi
 * ================================================================== */

function Confronto({ periodo, confronto, onConfronto, scuro }) {
  const { db, settings } = useApp()
  const tema = assi(scuro)

  const calcola = (ym) => {
    const { da, a } = rangeMese(ym)
    const ce = contoEconomico({
      invoices: db.invoices,
      expenses: db.expenses,
      attendance: db.attendance,
      employees: db.employees,
      da,
      a,
      oneri: settings.oneriContributivi,
    })
    const schede = db.jobs.filter((j) => j.dataConsegna && j.dataConsegna >= da && j.dataConsegna <= a).length
    const ore = db.jobLines
      .filter((l) => l.tipo === 'manodopera' && l.data >= da && l.data <= a)
      .reduce((s, l) => s + Number(l.ore || 0), 0)
    return { ce, schede, ore: arrotonda(ore, 2), vms: valoreMedioScheda(ce.ricavi, schede) }
  }

  const A = useMemo(() => calcola(periodo), [periodo, db, settings])   // eslint-disable-line react-hooks/exhaustive-deps
  const B = useMemo(() => calcola(confronto), [confronto, db, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  const voci = [
    { voce: 'Fatturato', a: A.ce.ricavi, b: B.ce.ricavi, formato: (v) => euro(v, { decimali: 0 }) },
    { voce: 'Ricavi manodopera', a: A.ce.ricaviManodopera, b: B.ce.ricaviManodopera, formato: (v) => euro(v, { decimali: 0 }) },
    { voce: 'Ricavi ricambi', a: A.ce.ricaviRicambi, b: B.ce.ricaviRicambi, formato: (v) => euro(v, { decimali: 0 }) },
    { voce: 'Costo ricambi', a: A.ce.costoRicambi, b: B.ce.costoRicambi, formato: (v) => euro(v, { decimali: 0 }), inverso: true },
    { voce: 'Costo del lavoro', a: A.ce.costoLavoro, b: B.ce.costoLavoro, formato: (v) => euro(v, { decimali: 0 }), inverso: true },
    { voce: 'Margine di contribuzione', a: A.ce.margineContribuzione, b: B.ce.margineContribuzione, formato: (v) => euro(v, { decimali: 0 }) },
    { voce: 'Risultato', a: A.ce.risultato, b: B.ce.risultato, formato: (v) => euro(v, { decimali: 0 }) },
    { voce: 'Schede chiuse', a: A.schede, b: B.schede, formato: (v) => numero(v, 0) },
    { voce: 'Valore medio scheda', a: A.vms, b: B.vms, formato: (v) => euro(v, { decimali: 0 }) },
    { voce: 'Ore vendute', a: A.ore, b: B.ore, formato: (v) => fmtOre(v, 1) },
    { voce: 'Ore di presenza', a: A.ce.orePresenza, b: B.ce.orePresenza, formato: (v) => fmtOre(v, 1) },
    {
      voce: 'Produttività',
      a: produttivita(A.ore, A.ce.orePresenza),
      b: produttivita(B.ore, B.ce.orePresenza),
      formato: (v) => percento(v, 1),
    },
  ]

  const etichetta = (ym) => `${MESI[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

  const grafico = voci.slice(0, 7).map((v) => ({ nome: v.voce, corrente: v.a, precedente: v.b }))

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--ink-2)]">Confronta {etichetta(periodo)} con</span>
          <SelettoreMese valore={confronto} onChange={onConfronto} />
          <span className="text-xs text-[var(--ink-3)] ml-auto">
            Il periodo principale si cambia dal selettore in alto.
          </span>
        </div>
      </Card>

      {/* Cinque colonne di numeri non stanno in 375 px e non si possono
          impilare senza perdere il confronto: qui la tabella scorre. */}
      <Card padding={false} className="overflow-x-auto">
        <table className="w-full min-w-[580px] text-sm">
          <thead>
            <tr className="bg-[var(--surface-2)] text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
              <th className="text-left font-medium px-4 py-2.5 border-b border-[var(--line)]">Voce</th>
              <th className="text-right font-medium px-4 py-2.5 border-b border-[var(--line)]">{etichetta(periodo)}</th>
              <th className="text-right font-medium px-4 py-2.5 border-b border-[var(--line)]">{etichetta(confronto)}</th>
              <th className="text-right font-medium px-4 py-2.5 border-b border-[var(--line)]">Differenza</th>
              <th className="text-right font-medium px-4 py-2.5 border-b border-[var(--line)] w-24">%</th>
            </tr>
          </thead>
          <tbody>
            {voci.map((v) => {
              const diff = arrotonda(v.a - v.b, 4)
              const perc = v.b ? arrotonda(diff / Math.abs(v.b), 4) : null
              const buono = v.inverso ? diff <= 0 : diff >= 0
              const tinta = diff === 0 ? undefined : buono ? 'var(--color-pos)' : 'var(--color-neg)'
              return (
                <tr key={v.voce} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-4 py-2.5">{v.voce}</td>
                  <td className="px-4 py-2.5 text-right tabnum font-medium">{v.formato(v.a)}</td>
                  <td className="px-4 py-2.5 text-right tabnum text-[var(--ink-2)]">{v.formato(v.b)}</td>
                  <td className="px-4 py-2.5 text-right tabnum" style={{ color: tinta }}>
                    {v.formato(diff)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabnum" style={{ color: tinta }}>
                    {perc === null ? '—' : `${perc > 0 ? '+' : ''}${numero(perc * 100, 1)}%`}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader titolo="Confronto grafico" sottotitolo="Principali voci economiche" />
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={grafico} margin={{ top: 4, right: 4, left: -14, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
              <XAxis dataKey="nome" tick={{ fontSize: 10, fill: tema.testo }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip
                contentStyle={tema.tooltip}
                formatter={(v, n) => [euro(v), n === 'corrente' ? etichetta(periodo) : etichetta(confronto)]}
                cursor={{ fill: tema.cursore }}
              />
              <Bar dataKey="precedente" fill={fondoBarra(scuro)} radius={[3, 3, 0, 0]} />
              <Bar dataKey="corrente" fill={serie(scuro)[0]} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="flex justify-end">
        <EsportaCsv
          nomeFile={`confronto-${periodo}-${confronto}`}
          colonne={[
            { label: 'Voce', value: (v) => v.voce },
            { label: etichetta(periodo), value: (v) => v.a },
            { label: etichetta(confronto), value: (v) => v.b },
            { label: 'Differenza', value: (v) => arrotonda(v.a - v.b, 4) },
          ]}
          righe={voci}
          etichetta="Esporta confronto"
        />
      </div>

      <p className="text-xs text-[var(--ink-3)]">
        Ultimo aggiornamento dei dati: {fmtData(oggiIso())}.
      </p>
    </div>
  )
}
