/**
 * Dashboard — la fotografia del mese e le cose che chiedono attenzione oggi.
 *
 * Il meccanico vede una versione ridotta: le sue schede, le sue ore, i suoi
 * turni. Nessun dato economico, come previsto dal suo ruolo.
 */

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AlertTriangle,
  Car,
  ClipboardList,
  Clock,
  Euro,
  Package,
  Percent,
  Settings as SettingsIcon,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { CardScheda } from '../components/flusso.jsx'
import {
  Avviso,
  Badge,
  Barra,
  Button,
  Card,
  CardHeader,
  DataTable,
  KPI,
  Modal,
  Sezione,
  StatoBadge,
  Vuoto,
  cx,
} from '../components/ui.jsx'
import { assi, colore, coppiaRicavo, fondoCard, serie, tratto } from '../utils/chartColors.js'
import {
  arrotonda,
  contoEconomico,
  kpiMese,
  produttivita,
  totaliDocumento,
} from '../utils/calc.js'
import {
  MESI,
  addMesi,
  data as fmtData,
  dataBreve,
  euro,
  giorniTra,
  meseDi,
  nomeCliente,
  numero,
  oggiIso,
  ore as fmtOre,
  percento,
  rangeMese,
  targa as fmtTarga,
} from '../utils/format.js'

export default function Dashboard() {
  const { ruolo } = useApp()
  return ruolo === 'meccanico' ? <DashboardMeccanico /> : <DashboardOfficina />
}

/* ================================================================== *
 * Vista completa (titolare e capofficina)
 * ================================================================== */

function DashboardOfficina() {
  const { db, settings, kpi, alert, periodo, setPeriodo, scuro, vaiA, puo } = useApp()
  const tema = assi(scuro)
  const tinte = coppiaRicavo(scuro)
  const oggi = oggiIso()

  const kpiPrecedente = useMemo(
    () => kpiMese(db, meseDi(addMesi(`${periodo}-01`, -1)), settings),
    [db, periodo, settings],
  )

  const variazione = (a, b) => (b ? arrotonda((a - b) / Math.abs(b), 4) : null)

  /* --- Fatturato per giorno --------------------------------------- */

  const perGiorno = useMemo(() => {
    const { da, giorni } = rangeMese(periodo)
    const mappa = new Map()
    for (let g = 1; g <= giorni; g++) {
      mappa.set(g, { giorno: g, manodopera: 0, ricambi: 0 })
    }
    for (const f of db.invoices) {
      if (f.stato === 'annullata' || f.data < da || f.data > `${periodo}-31`) continue
      const g = Number(f.data.slice(8, 10))
      const t = totaliDocumento(f.righe || [], f.scontoGlobale || 0)
      const riga = mappa.get(g)
      if (!riga) continue
      riga.manodopera = arrotonda(riga.manodopera + t.manodopera)
      riga.ricambi = arrotonda(riga.ricambi + t.ricambi)
    }
    return [...mappa.values()]
  }, [db.invoices, periodo])

  /* --- Mix interventi --------------------------------------------- */

  const mix = useMemo(() => {
    const { da, a } = rangeMese(periodo)
    const conteggi = new Map()
    for (const j of db.jobs) {
      const rif = j.dataConsegna || j.dataApertura
      if (rif < da || rif > a) continue
      const tipo = j.tipoIntervento || 'Altro'
      conteggi.set(tipo, (conteggi.get(tipo) || 0) + 1)
    }
    return [...conteggi.entries()]
      .map(([nome, valore]) => ({ nome, valore }))
      .sort((x, y) => y.valore - x.valore)
      .slice(0, 7)
  }, [db.jobs, periodo])

  /* --- Marginalità sugli ultimi sei mesi --------------------------- */

  const andamento = useMemo(() => {
    const mesi = []
    for (let i = 5; i >= 0; i--) {
      const ym = meseDi(addMesi(`${periodo}-01`, -i))
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
      mesi.push({
        mese: `${MESI[Number(ym.slice(5, 7)) - 1].slice(0, 3)} ${ym.slice(2, 4)}`,
        margine: arrotonda(ce.margineContribuzionePerc * 100, 1),
        ricambi: arrotonda((ce.ricavi ? ce.costoRicambi / ce.ricavi : 0) * 100, 1),
        fatturato: ce.ricavi,
      })
    }
    return mesi
  }, [db, periodo, settings])

  /* --- Ponti occupati oggi ---------------------------------------- */

  const pontiOggi = useMemo(() => {
    const occupati = new Set(
      db.jobs
        .filter((j) => ['in_lavorazione', 'attesa_ricambi'].includes(j.stato) && j.ponte)
        .map((j) => j.ponte),
    )
    return { occupati: occupati.size, totale: settings.numeroPonti || 3 }
  }, [db.jobs, settings.numeroPonti])

  const schedeAperte = useMemo(
    () =>
      db.jobs
        .filter((j) => !['consegnato', 'fatturato', 'annullato'].includes(j.stato))
        .slice(0, 8),
    [db.jobs],
  )

  const obiettivi = settings.obiettivi || {}

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {MESI[Number(periodo.slice(5, 7)) - 1]} {periodo.slice(0, 4)}
          </h1>
          <p className="text-xs text-[var(--ink-3)] mt-1">
            Aggiornato al {fmtData(oggi)} · {pontiOggi.occupati} di {pontiOggi.totale} ponti occupati
          </p>
        </div>
        <SelettoreMese valore={periodo} onChange={setPeriodo} />
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        <KPI
          etichetta="Fatturato"
          valore={kpi.fatturato}
          formato={(v) => euro(v, { decimali: 0 })}
          icona={Euro}
          variazione={variazione(kpi.fatturato, kpiPrecedente.fatturato)}
          dettaglio={`${kpi.numeroFatture} fatture`}
          obiettivo={
            obiettivi.fatturatoMese
              ? { valore: kpi.fatturato, target: obiettivi.fatturatoMese, testo: euro(obiettivi.fatturatoMese, { decimali: 0 }) }
              : null
          }
          onClick={puo('fatturazione') ? () => vaiA('fatturazione') : undefined}
        />
        <KPI
          etichetta="Ore vendute"
          valore={kpi.oreVendute}
          formato={(v) => fmtOre(v, 0)}
          icona={Clock}
          dettaglio={`su ${fmtOre(kpi.orePresenza, 0)} di presenza`}
          variazione={variazione(kpi.oreVendute, kpiPrecedente.oreVendute)}
        />
        <KPI
          etichetta="Produttività"
          valore={kpi.produttivita}
          formato={(v) => percento(v, 0)}
          icona={TrendingUp}
          dettaglio="ore vendute / presenza"
          obiettivo={
            obiettivi.produttivita
              ? { valore: kpi.produttivita, target: obiettivi.produttivita, testo: percento(obiettivi.produttivita, 0) }
              : null
          }
        />
        <KPI
          etichetta="Incidenza ricambi"
          valore={kpi.incidenzaRicambi}
          formato={(v) => percento(v, 1)}
          icona={Package}
          dettaglio="costo ricambi / fatturato"
          variazione={-variazione(kpi.incidenzaRicambi, kpiPrecedente.incidenzaRicambi)}
        />
        <KPI
          etichetta="Margine medio scheda"
          valore={kpi.margineMedioScheda}
          formato={(v) => percento(v, 1)}
          icona={Percent}
          dettaglio={`valore medio ${euro(kpi.valoreMedioScheda, { decimali: 0 })}`}
        />
        <KPI
          etichetta="Schede aperte"
          valore={kpi.schedeAperte}
          formato={(v) => numero(v, 0)}
          icona={ClipboardList}
          dettaglio={`${kpi.schedeChiuse} chiuse nel mese`}
          onClick={() => vaiA('schede')}
        />
      </div>

      {/* Grafici */}
      <div className="grid xl:grid-cols-3 gap-4 mb-6">
        <Card className="xl:col-span-2">
          <CardHeader
            titolo="Fatturato per giorno"
            sottotitolo="Manodopera e ricambi, al netto dell’IVA"
            azioni={
              <div className="flex items-center gap-3 text-[11px] text-[var(--ink-3)]">
                <Legenda colore={tinte.manodopera} testo="Manodopera" />
                <Legenda colore={tinte.ricambi} testo="Ricambi" />
              </div>
            }
          />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perGiorno} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
                <XAxis dataKey="giorno" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} interval={2} />
                <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} tickFormatter={(v) => (v ? `${v / 1000}k` : '0')} />
                <Tooltip
                  contentStyle={tema.tooltip}
                  formatter={(v, n) => [euro(v), n === 'manodopera' ? 'Manodopera' : 'Ricambi']}
                  labelFormatter={(g) => `Giorno ${g}`}
                  cursor={{ fill: tema.cursore }}
                />
                <Bar dataKey="manodopera" stackId="a" fill={tinte.manodopera} radius={[0, 0, 0, 0]} />
                <Bar dataKey="ricambi" stackId="a" fill={tinte.ricambi} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader titolo="Mix interventi" sottotitolo="Schede del mese per tipo" />
          {mix.length ? (
            <>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    {/* Il filo del colore della card fra una fetta e l'altra è
                        quello che rende leggibile un donut monocromatico. */}
                    <Pie
                      data={mix}
                      dataKey="valore"
                      nameKey="nome"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={2}
                      stroke={fondoCard(scuro)}
                      strokeWidth={2}
                      animationDuration={700}
                    >
                      {mix.map((_, i) => (
                        <Cell key={i} fill={colore(i, scuro)} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tema.tooltip} formatter={(v, n) => [`${v} schede`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-1.5 mt-2">
                {mix.map((m, i) => (
                  <li key={m.nome} className="flex items-center gap-2 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: colore(i, scuro) }} />
                    <span className="grow truncate text-[var(--ink-2)]">{m.nome}</span>
                    <span className="tabnum font-medium">{m.valore}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Vuoto messaggio="Nessuna scheda nel periodo." />
          )}
        </Card>
      </div>

      <div className="grid xl:grid-cols-3 gap-4 mb-6">
        <Card className="xl:col-span-2">
          <CardHeader
            titolo="Andamento della marginalità"
            sottotitolo="Margine di contribuzione e incidenza ricambi, ultimi sei mesi"
          />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={andamento} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
                <XAxis dataKey="mese" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={tema.tooltip}
                  formatter={(v, n) => [`${numero(v, 1)}%`, n === 'margine' ? 'Margine di contribuzione' : 'Incidenza ricambi']}
                />
                {/* Due linee dello stesso grigio si confondono: il tratto le
                    tiene separate anche stampate in bianco e nero. */}
                <Line
                  type="monotone"
                  dataKey="margine"
                  stroke={serie(scuro)[0]}
                  strokeWidth={2.2}
                  strokeDasharray={tratto(0)}
                  dot={{ r: 3 }}
                  animationDuration={800}
                />
                <Line
                  type="monotone"
                  dataKey="ricambi"
                  stroke={serie(scuro)[2]}
                  strokeWidth={2.2}
                  strokeDasharray={tratto(1)}
                  dot={{ r: 3 }}
                  animationDuration={800}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Ponti kpi={kpi} />
      </div>

      {/* Alert e schede aperte */}
      <div className="grid xl:grid-cols-2 gap-4">
        <BloccoAlert alert={alert} onApri={vaiA} />

        <Card>
          <CardHeader
            titolo="Schede aperte"
            sottotitolo="In lavorazione, in attesa o pronte alla consegna"
            azioni={
              <Button misura="sm" variante="contorno" onClick={() => vaiA('schede')}>
                Vedi tutte
              </Button>
            }
          />
          {schedeAperte.length ? (
            <DataTable
              denso
              colonne={[
                { chiave: 'numero', label: 'Scheda', render: (j) => <span className="font-medium">{j.numero}</span> },
                {
                  chiave: 'targa',
                  label: 'Veicolo',
                  valore: (j) => db.vehicles.find((v) => v.id === j.vehicleId)?.targa,
                  render: (j) => {
                    const v = db.vehicles.find((x) => x.id === j.vehicleId)
                    return (
                      <div className="min-w-0">
                        <p className="font-mono text-xs">{fmtTarga(v?.targa)}</p>
                        <p className="text-[11px] text-[var(--ink-3)] truncate">{v?.marca} {v?.modello}</p>
                      </div>
                    )
                  },
                },
                { chiave: 'stato', label: 'Stato', render: (j) => <StatoBadge stato={j.stato} /> },
                {
                  chiave: 'giorni',
                  label: 'Ferma da',
                  allinea: 'destra',
                  valore: (j) => -giorniTra(oggi, j.dataInizio || j.dataApertura),
                  render: (j) => {
                    const g = -giorniTra(oggi, j.dataInizio || j.dataApertura)
                    return (
                      <span style={g > (settings.giorniAlertScheda || 5) ? { color: 'var(--color-neg)' } : undefined}>
                        {g} gg
                      </span>
                    )
                  },
                },
              ]}
              righe={schedeAperte}
              onRiga={(j) => vaiA('schede', j.id)}
            />
          ) : (
            <Vuoto messaggio="Nessuna scheda aperta." descrizione="Piazzale vuoto: o è tutto consegnato, o è agosto." />
          )}
        </Card>
      </div>
    </div>
  )
}

/* ================================================================== *
 * Vista del meccanico
 * ================================================================== */

/**
 * La giornata del meccanico.
 *
 * Non è una dashboard di numeri: è un elenco di cose da fare. In cima c'è
 * quella su cui sta lavorando adesso, grande, con il pulsante dell'azione
 * successiva; sotto, in coda, le altre. I numeri (ore, produttività) stanno in
 * fondo, perché servono a lui a fine mese, non alle otto del mattino.
 *
 * L'ordine non è per data ma per urgenza: prima quello che è fermo, poi
 * quello che è pronto e aspetta il cliente, poi il resto.
 */
function DashboardMeccanico() {
  const { db, dipendenteCorrente, vaiA, periodo, settings, azione, dataService } = useApp()
  const oggi = oggiIso()
  const emp = dipendenteCorrente

  const PRIORITA = { in_lavorazione: 0, attesa_ricambi: 1, accettato: 2, pronto: 3 }

  const mie = useMemo(
    () =>
      db.jobs
        .filter(
          (j) =>
            (j.employeeIds || []).includes(emp?.id) &&
            !['consegnato', 'fatturato', 'annullato'].includes(j.stato),
        )
        .sort(
          (x, y) =>
            (PRIORITA[x.stato] ?? 9) - (PRIORITA[y.stato] ?? 9) ||
            (x.dataApertura || '').localeCompare(y.dataApertura || ''),
        ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [db.jobs, emp],
  )

  const inCorso = mie.find((j) => j.stato === 'in_lavorazione')
  const altre = mie.filter((j) => j.id !== inCorso?.id)

  const avanza = (job, azioneScheda) =>
    azione(() => dataService.update('jobs', job.id, azioneScheda.patch(job)), {
      successo: `Scheda ${job.numero}: ${azioneScheda.etichetta.toLowerCase()}.`,
    })

  const datiCard = (j) => ({
    job: j,
    veicolo: db.vehicles.find((v) => v.id === j.vehicleId),
    cliente: nomeCliente(db.customers.find((c) => c.id === j.customerId)),
  })

  const { da, a } = rangeMese(periodo)

  const mieOre = useMemo(() => {
    const vendute = db.jobLines
      .filter((l) => l.employeeId === emp?.id && l.tipo === 'manodopera' && l.data >= da && l.data <= a)
      .reduce((s, l) => s + Number(l.ore || 0), 0)
    const presenza = db.attendance
      .filter((p) => p.employeeId === emp?.id && p.data >= da && p.data <= a)
      .reduce((s, p) => s + Number(p.oreOrdinarie || 0) + Number(p.oreStraordinario || 0), 0)
    return { vendute: arrotonda(vendute, 2), presenza: arrotonda(presenza, 2) }
  }, [db, emp, da, a])

  const turnoOggi = db.shifts.find((t) => t.employeeId === emp?.id && t.data === oggi)
  const turni = useMemo(
    () => db.shifts.filter((t) => t.employeeId === emp?.id && t.data > oggi).slice(0, 4),
    [db.shifts, emp, oggi],
  )

  if (!emp) {
    return (
      <Avviso tipo="attenzione" titolo="Nessun dipendente collegato">
        Il tuo utente non è ancora associato a una scheda del personale. Chiedi al titolare di
        collegarlo dal modulo Personale.
      </Avviso>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ciao {emp.nome}</h1>
        <p className="text-sm text-[var(--ink-2)] mt-1">
          {fmtData(oggi)}
          {turnoOggi && ` · turno ${turnoOggi.oraInizio}–${turnoOggi.oraFine} · ${turnoOggi.postazione}`}
        </p>
      </div>

      {/* Quello che sta facendo adesso */}
      {inCorso ? (
        <Sezione
          titolo="Stai lavorando su"
          descrizione="Quando hai finito, o se ti manca un pezzo, dillo da qui."
        >
          <CardScheda
            {...datiCard(inCorso)}
            ruolo="meccanico"
            giorniAlert={settings.giorniAlertScheda}
            evidenzia
            onApri={(j) => vaiA('schede', j.id)}
            onAzione={avanza}
          />
        </Sezione>
      ) : (
        mie.length > 0 && (
          <Avviso tipo="info" titolo="Non stai lavorando su nessuna scheda">
            Scegli la prossima dalla lista qui sotto e tocca <strong>Inizia il lavoro</strong>.
          </Avviso>
        )
      )}

      {/* La coda */}
      <Sezione
        titolo={inCorso ? 'Poi tocca a queste' : 'Le tue schede'}
        descrizione={
          altre.length
            ? 'In ordine di urgenza: prima quelle ferme, poi quelle che aspettano il cliente.'
            : undefined
        }
      >
        {altre.length ? (
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3 wz-scaglione">
            {altre.map((j, i) => (
              <div key={j.id} style={{ '--i': Math.min(i, 12) }}>
                <CardScheda
                  {...datiCard(j)}
                  ruolo="meccanico"
                  giorniAlert={settings.giorniAlertScheda}
                  onApri={(x) => vaiA('schede', x.id)}
                  onAzione={avanza}
                />
              </div>
            ))}
          </div>
        ) : (
          <Card>
            <Vuoto
              messaggio={inCorso ? 'Nessun’altra scheda in coda.' : 'Nessuna scheda assegnata.'}
              descrizione={
                inCorso
                  ? 'Finita questa, hai il piazzale libero.'
                  : 'Quando il capofficina ti assegna un lavoro, lo trovi qui.'
              }
              icona={ClipboardList}
            />
          </Card>
        )}
      </Sezione>

      {/* I numeri, in fondo: servono a fine mese, non alle otto del mattino */}
      <Sezione titolo="Il tuo mese">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI etichetta="Schede aperte" valore={mie.length} icona={ClipboardList} formato={(v) => numero(v, 0)} />
          <KPI etichetta="Ore lavorate" valore={mieOre.vendute} icona={Clock} formato={(v) => fmtOre(v, 0)} />
          <KPI etichetta="Ore di presenza" valore={mieOre.presenza} icona={Wrench} formato={(v) => fmtOre(v, 0)} />
          <KPI
            etichetta="Resa"
            valore={produttivita(mieOre.vendute, mieOre.presenza)}
            icona={TrendingUp}
            formato={(v) => percento(v, 0)}
            dettaglio="ore su scheda / presenza"
          />
        </div>
      </Sezione>

      {turni.length > 0 && (
        <Sezione titolo="I prossimi turni">
          <Card>
            <ul className="divide-y divide-[var(--line)]">
              {turni.map((t) => (
                <li key={t.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="w-28 shrink-0 text-[var(--ink-2)]">{dataBreve(t.data)}</span>
                  <span className="tabnum font-medium">
                    {t.oraInizio}–{t.oraFine}
                  </span>
                  <Badge className="ml-auto">{t.postazione}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </Sezione>
      )}
    </div>
  )
}

/* ================================================================== *
 * Componenti di supporto
 * ================================================================== */

function BloccoAlert({ alert, onApri }) {
  const gravita = { alta: 'negativo', media: 'attenzione', bassa: 'neutro' }
  return (
    <Card>
      <CardHeader
        titolo="Da tenere d’occhio"
        sottotitolo={alert.length ? `${alert.length} segnalazioni` : 'Tutto in ordine'}
        icona={AlertTriangle}
      />
      {alert.length ? (
        <ul className="space-y-1.5 max-h-[420px] overflow-y-auto -mr-2 pr-2">
          {alert.slice(0, 25).map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onApri(a.modulo, a.entita)}
                className="w-full text-left rounded-xl px-3 py-2.5 hover:bg-[var(--surface-2)] transition-colors flex items-start gap-3"
              >
                <span className="mt-1.5 w-2 h-2 rounded-full shrink-0" style={{ background: coloreGravita(a.gravita) }} />
                <span className="min-w-0 grow">
                  <span className="block text-sm font-medium truncate">{a.titolo}</span>
                  <span className="block text-xs text-[var(--ink-3)] truncate">{a.dettaglio}</span>
                </span>
                <Badge tono={gravita[a.gravita]}>{a.gravita}</Badge>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Vuoto messaggio="Nessuna segnalazione aperta." descrizione="Nessuna scheda ferma, nessun ricambio sotto scorta, nessuna scadenza alle porte." />
      )}
    </Card>
  )
}

function coloreGravita(g) {
  if (g === 'alta') return 'var(--segno-neg)'
  if (g === 'media') return 'var(--segno-warn)'
  return 'var(--ink-3)'
}

/* ------------------------------------------------------------------ *
 * Occupazione ponti
 * ------------------------------------------------------------------ */

/** Una scheda occupa il ponte finché non esce dall'officina. */
const STATI_SU_PONTE = ['in_lavorazione', 'attesa_ricambi', 'pronto']

/** Una scheda senza ponte è in coda: aspetta che se ne liberi uno. */
const STATI_IN_CODA = ['accettato', 'in_lavorazione', 'attesa_ricambi']

/**
 * Occupazione ponti.
 *
 * La percentuale è un consuntivo del mese (ore vendute sulla capacità), i tre
 * riquadri sono la situazione di adesso. Il ponte non si "aggiorna" a mano da
 * nessuna parte: è un campo della scheda di lavoro, e questa card è la
 * scorciatoia per cambiarlo senza passare dal modulo Schede — che è il gesto
 * che in accettazione si fa dieci volte al giorno.
 */
function Ponti({ kpi }) {
  const { db, settings, azione, dataService, vaiA, puo } = useApp()
  const [ponteAperto, setPonteAperto] = useState(null)

  const numeroPonti = settings.numeroPonti || 3
  const ponti = useMemo(
    () => Array.from({ length: numeroPonti }, (_, i) => i + 1),
    [numeroPonti],
  )

  const occupante = (p) => db.jobs.find((j) => j.ponte === p && STATI_SU_PONTE.includes(j.stato))
  const veicoloDi = (j) => db.vehicles.find((v) => v.id === j?.vehicleId)

  const inCoda = useMemo(
    () => db.jobs.filter((j) => !j.ponte && STATI_IN_CODA.includes(j.stato)),
    [db.jobs],
  )

  /** Chi altro sta occupando questo ponte: sul ponte ci sta una macchina sola. */
  const occupantiDi = (ponte, esclusa) =>
    db.jobs.filter((x) => x.ponte === ponte && x.id !== esclusa && STATI_SU_PONTE.includes(x.stato))

  const assegna = async (job, ponte) => {
    await azione(
      async () => {
        // Il ponte è esclusivo: chi c'era prima torna in coda. Senza questa
        // regola due schede aperte possono portarsi dietro lo stesso numero,
        // e il riquadro mostra la prima che capita.
        for (const altro of occupantiDi(ponte, job.id)) {
          await dataService.update('jobs', altro.id, { ponte: null })
        }
        return dataService.update('jobs', job.id, {
          ponte,
          // Una macchina messa sul ponte è una macchina su cui si sta
          // lavorando: lo stato si allinea da solo.
          stato: job.stato === 'accettato' ? 'in_lavorazione' : job.stato,
          dataInizio: job.dataInizio || oggiIso(),
        })
      },
      { successo: `Scheda ${job.numero} assegnata al ponte ${ponte}.` },
    )
    setPonteAperto(null)
  }

  const libera = async (ponte) => {
    await azione(
      async () => {
        for (const j of occupantiDi(ponte, null)) {
          await dataService.update('jobs', j.id, { ponte: null })
        }
      },
      { successo: `Ponte ${ponte} liberato.` },
    )
    setPonteAperto(null)
  }

  const scheda = ponteAperto ? occupante(ponteAperto) : null

  return (
    <>
      <Card>
        <CardHeader
          titolo="Occupazione ponti"
          sottotitolo={`${numeroPonti} postazioni · ${settings.oreApertura} h al giorno`}
          azioni={
            puo('impostazioni') ? (
              <Button
                misura="sm"
                variante="fantasma"
                icona={SettingsIcon}
                onClick={() => vaiA('impostazioni')}
                title="Cambia il numero di ponti e le ore di apertura"
              >
                Configura
              </Button>
            ) : null
          }
        />
        <div className="text-3xl font-semibold tabnum mb-1">{percento(kpi.occupazionePonti, 0)}</div>
        <p className="text-xs text-[var(--ink-3)] mb-4">ore vendute sulla capacità del mese</p>
        <Barra quota={kpi.occupazionePonti} altezza={8} />

        <div className="grid grid-cols-3 gap-2 mt-5">
          {ponti.map((p) => {
            const j = occupante(p)
            const v = veicoloDi(j)
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPonteAperto(p)}
                title={j ? `Scheda ${j.numero} — tocca per spostare o liberare` : 'Ponte libero — tocca per assegnare una scheda'}
                className={cx(
                  'premi rounded-xl border p-2.5 text-center transition-colors',
                  j
                    ? 'border-[var(--line-forte)] bg-[var(--surface-3)]'
                    : 'border-dashed border-[var(--line)] hover:border-[var(--line-forte)]',
                )}
              >
                <span className="block text-[10.5px] text-[var(--ink-3)] uppercase tracking-[0.08em]">
                  Ponte {p}
                </span>
                <span className="block text-xs font-medium mt-1 truncate font-mono">
                  {j ? fmtTarga(v?.targa) : '—'}
                </span>
                <span className="block text-[10.5px] text-[var(--ink-3)] mt-0.5 truncate">
                  {j ? j.tipoIntervento || 'in lavorazione' : 'libero'}
                </span>
              </button>
            )
          })}
        </div>

        {inCoda.length > 0 && (
          <p className="text-xs text-[var(--ink-3)] mt-3">
            {inCoda.length} {inCoda.length === 1 ? 'scheda aspetta' : 'schede aspettano'} un ponte.
          </p>
        )}
      </Card>

      <Modal
        aperto={ponteAperto !== null}
        onChiudi={() => setPonteAperto(null)}
        titolo={`Ponte ${ponteAperto ?? ''}`}
        sottotitolo={scheda ? 'Occupato — scegli cosa farne' : 'Libero — scegli quale scheda mettere sul ponte'}
        larghezza="md"
      >
        <div className="space-y-5">
          {scheda && (
            <div className="rounded-xl border border-[var(--line-forte)] bg-[var(--surface-3)] p-3.5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-mono font-semibold">{fmtTarga(veicoloDi(scheda)?.targa)}</p>
                  <p className="text-xs text-[var(--ink-2)] mt-0.5 truncate">
                    Scheda {scheda.numero} · {scheda.tipoIntervento || 'intervento'} ·{' '}
                    {nomeCliente(db.customers.find((c) => c.id === scheda.customerId))}
                  </p>
                </div>
                <StatoBadge stato={scheda.stato} />
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button misura="sm" variante="primario" onClick={() => vaiA('schede', scheda.id)}>
                  Apri la scheda
                </Button>
                <Button misura="sm" variante="contorno" onClick={() => libera(ponteAperto)}>
                  Libera il ponte
                </Button>
              </div>
            </div>
          )}

          <div>
            <h4 className="text-sm font-semibold mb-2.5">
              {scheda ? 'Oppure mettici un’altra scheda' : 'Schede in attesa di un ponte'}
            </h4>
            {inCoda.length ? (
              <ul className="space-y-1.5 max-h-72 overflow-y-auto -mr-1 pr-1">
                {inCoda.map((j) => {
                  const v = veicoloDi(j)
                  return (
                    <li key={j.id}>
                      <button
                        type="button"
                        onClick={() => assegna(j, ponteAperto)}
                        className="premi w-full text-left rounded-xl border border-[var(--line)] p-3 hover:border-[var(--line-forte)] hover:bg-[var(--surface-3)] flex items-center gap-3"
                      >
                        <span className="min-w-0 grow">
                          <span className="block font-mono text-sm font-medium">{fmtTarga(v?.targa)}</span>
                          <span className="block text-[11px] text-[var(--ink-3)] truncate">
                            {v?.marca} {v?.modello} · scheda {j.numero} · {j.tipoIntervento || '—'}
                          </span>
                        </span>
                        <StatoBadge stato={j.stato} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <Vuoto
                messaggio="Nessuna scheda in attesa."
                descrizione="Tutte le schede aperte hanno già un ponte assegnato."
              />
            )}
          </div>

          <Avviso tipo="info">
            Il ponte è un campo della scheda di lavoro: da qui lo cambi al volo, ma lo trovi anche
            nella scheda stessa. Il numero di postazioni e le ore di apertura — che determinano la
            percentuale qui sopra — si impostano in <strong>Impostazioni → Officina</strong>.
          </Avviso>
        </div>
      </Modal>
    </>
  )
}

function Legenda({ colore: c, testo }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
      {testo}
    </span>
  )
}

export function SelettoreMese({ valore, onChange }) {
  const opzioni = useMemo(() => {
    const out = []
    for (let i = 0; i < 18; i++) {
      const ym = meseDi(addMesi(oggiIso(), -i))
      out.push({ valore: ym, etichetta: `${MESI[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` })
    }
    return out
  }, [])

  // Fondo pieno e non semitrasparente: la lista della tendina la disegna il
  // sistema con i colori dell'elemento, e su uno sfondo trasparente la
  // compone su bianco — nel tema scuro diventa illeggibile.
  return (
    <select
      value={valore}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Periodo"
      className="h-10 px-3 pr-8 rounded-xl bg-[var(--tendina-fondo)] border border-[var(--line)] text-sm cursor-pointer outline-none focus:border-[var(--ink-3)]"
    >
      {opzioni.map((o) => (
        <option key={o.valore} value={o.valore}>
          {o.etichetta}
        </option>
      ))}
    </select>
  )
}
