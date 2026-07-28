/**
 * Personale: anagrafica, certificazioni, turni, presenze.
 *
 * Il numero che conta davvero è il rapporto fra ore vendute (quelle finite su
 * una scheda, quindi fatturabili) e ore di presenza. È la produttività, e
 * misura quanto della giornata pagata si trasforma in ricavo.
 *
 * Il meccanico vede soltanto i propri dati: nessun collega, nessuna paga.
 */

import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Award, CalendarDays, Clock, HardHat, Trash2, TrendingUp } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import {
  Avviso,
  Avatar,
  Badge,
  Barra,
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
import { assi, coppiaRicavo, fondoBarra } from '../utils/chartColors.js'
import { arrotonda, costoOrarioMeccanico, costoPresenza, produttivita } from '../utils/calc.js'
import {
  GIORNI_BREVI,
  MESI,
  addGiorni,
  data as fmtData,
  euro,
  giorniTra,
  giornoSettimana,
  iniziali,
  nomeDipendente,
  numero,
  oggiIso,
  ore as fmtOre,
  percento,
  rangeMese,
} from '../utils/format.js'

const RUOLI = [
  { valore: 'titolare', etichetta: 'Titolare' },
  { valore: 'capofficina', etichetta: 'Capofficina' },
  { valore: 'meccanico', etichetta: 'Meccanico' },
]

const TIPI_PRESENZA = [
  { valore: 'presenza', etichetta: 'Presenza' },
  { valore: 'ferie', etichetta: 'Ferie' },
  { valore: 'permesso', etichetta: 'Permesso' },
  { valore: 'malattia', etichetta: 'Malattia' },
  { valore: 'festivo', etichetta: 'Festivo' },
]

const VUOTO = {
  nome: '',
  cognome: '',
  ruolo: 'meccanico',
  reparto: 'Meccanica',
  contratto: 'Tempo indeterminato',
  livello: '3° livello',
  pagaOraria: 12,
  specializzazione: '',
  dataAssunzione: oggiIso(),
  telefono: '',
  email: '',
  certificazioni: [],
  colore: 0,
  attivo: true,
  produttivo: true,
}

export default function Personale() {
  const { db, settings, ruolo, dipendenteCorrente, periodo } = useApp()
  const [tab, setTab] = useState('persone')

  const soloProprio = ruolo === 'meccanico'
  const { da, a } = rangeMese(periodo)

  /** Ore vendute, ore di presenza e costo del lavoro per addetto nel mese. */
  const statistiche = useMemo(() => {
    const m = new Map()
    for (const e of db.employees) {
      m.set(e.id, { vendute: 0, presenza: 0, straordinario: 0, costo: 0, giorni: 0, assenze: 0 })
    }
    for (const l of db.jobLines) {
      if (l.tipo !== 'manodopera' || !l.employeeId || l.data < da || l.data > a) continue
      const s = m.get(l.employeeId)
      if (s) s.vendute = arrotonda(s.vendute + Number(l.ore || 0), 2)
    }
    for (const p of db.attendance) {
      if (p.data < da || p.data > a) continue
      const s = m.get(p.employeeId)
      if (!s) continue
      const emp = db.employees.find((e) => e.id === p.employeeId)
      s.presenza = arrotonda(s.presenza + Number(p.oreOrdinarie || 0) + Number(p.oreStraordinario || 0), 2)
      s.straordinario = arrotonda(s.straordinario + Number(p.oreStraordinario || 0), 2)
      s.costo = arrotonda(s.costo + costoPresenza(p, emp?.pagaOraria || 0, settings.oneriContributivi))
      if (p.tipo === 'presenza') s.giorni += 1
      else s.assenze += 1
    }
    return m
  }, [db.employees, db.jobLines, db.attendance, da, a, settings.oneriContributivi])

  const visibili = soloProprio
    ? db.employees.filter((e) => e.id === dipendenteCorrente?.id)
    : db.employees

  // La produttività complessiva si calcola solo su chi vende ore: il costo
  // del lavoro invece li comprende tutti, accettazione inclusa.
  const totali = useMemo(() => {
    let vendute = 0
    let presenza = 0
    let presenzaProduttiva = 0
    let costo = 0
    for (const e of visibili) {
      const s = statistiche.get(e.id)
      if (!s) continue
      vendute += s.vendute
      presenza += s.presenza
      costo += s.costo
      if (e.produttivo !== false) presenzaProduttiva += s.presenza
    }
    return {
      vendute: arrotonda(vendute, 2),
      presenza: arrotonda(presenza, 2),
      costo: arrotonda(costo),
      produttivita: produttivita(vendute, presenzaProduttiva),
    }
  }, [visibili, statistiche])

  if (soloProprio && !dipendenteCorrente) {
    return (
      <Avviso tipo="attenzione" titolo="Nessuna scheda personale collegata">
        Il tuo utente non è ancora associato a un dipendente. Chiedi al titolare di collegarlo.
      </Avviso>
    )
  }

  return (
    <div>
      <TestataModulo
        titolo={soloProprio ? 'I miei dati' : 'Personale'}
        descrizione={`${MESI[Number(periodo.slice(5, 7)) - 1]} ${periodo.slice(0, 4)}`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KPI etichetta="Ore vendute" valore={totali.vendute} formato={(v) => fmtOre(v, 0)} icona={Clock} />
        <KPI etichetta="Ore di presenza" valore={totali.presenza} formato={(v) => fmtOre(v, 0)} icona={HardHat} />
        <KPI
          etichetta="Produttività"
          valore={totali.produttivita}
          formato={(v) => percento(v, 0)}
          icona={TrendingUp}
          obiettivo={
            settings.obiettivi?.produttivita
              ? {
                  valore: totali.produttivita,
                  target: settings.obiettivi.produttivita,
                  testo: percento(settings.obiettivi.produttivita, 0),
                }
              : null
          }
        />
        {!soloProprio && (
          <KPI
            etichetta="Costo del lavoro"
            valore={totali.costo}
            formato={(v) => euro(v, { decimali: 0 })}
            icona={Award}
            dettaglio={`oneri ${percento(settings.oneriContributivi, 0)}`}
          />
        )}
      </div>

      <Tabs
        className="mb-4"
        valore={tab}
        onChange={setTab}
        voci={[
          { valore: 'persone', etichetta: soloProprio ? 'Scheda' : 'Anagrafica', conteggio: visibili.length },
          { valore: 'presenze', etichetta: 'Presenze' },
          { valore: 'turni', etichetta: 'Turni' },
        ]}
      />

      {tab === 'persone' && <Anagrafica dipendenti={visibili} statistiche={statistiche} soloProprio={soloProprio} />}
      {tab === 'presenze' && <Presenze dipendenti={visibili} statistiche={statistiche} soloProprio={soloProprio} />}
      {tab === 'turni' && <Turni dipendenti={visibili} soloProprio={soloProprio} />}
    </div>
  )
}

/* ================================================================== *
 * Anagrafica
 * ================================================================== */

function Anagrafica({ dipendenti, statistiche, soloProprio }) {
  const { db, settings, azione, dataService, scuro } = useApp()
  const [cerca, setCerca] = useState('')
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(null)
  const [daEliminare, setDaEliminare] = useState(null)
  const tema = assi(scuro)
  const tinte = coppiaRicavo(scuro)

  const filtrati = useMemo(
    () => filtraTesto(dipendenti, cerca, ['nome', 'cognome', 'reparto', 'specializzazione']),
    [dipendenti, cerca],
  )

  const grafico = useMemo(
    () =>
      dipendenti
        .map((e) => {
          const s = statistiche.get(e.id) || { vendute: 0, presenza: 0 }
          return { nome: e.nome, vendute: s.vendute, presenza: arrotonda(s.presenza - s.vendute, 2) }
        })
        .filter((x) => x.vendute > 0 || x.presenza > 0),
    [dipendenti, statistiche],
  )

  const colonne = [
    {
      chiave: 'nome',
      label: 'Dipendente',
      valore: (e) => `${e.cognome} ${e.nome}`,
      render: (e) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar iniziali={iniziali(e.nome, e.cognome)} colore={e.colore || 0} misura={32} />
          <div className="min-w-0">
            <p className="font-medium truncate">{nomeDipendente(e)}</p>
            <p className="text-[11px] text-[var(--ink-3)] truncate">{e.reparto}</p>
          </div>
        </div>
      ),
      csv: (e) => nomeDipendente(e),
    },
    { chiave: 'ruolo', label: 'Ruolo', render: (e) => <Badge>{RUOLI.find((r) => r.valore === e.ruolo)?.etichetta || e.ruolo}</Badge> },
    { chiave: 'specializzazione', label: 'Specializzazione', nascondiSuMobile: true },
    ...(soloProprio
      ? []
      : [
          { chiave: 'contratto', label: 'Contratto', nascondiSuMobile: true },
          { chiave: 'pagaOraria', label: 'Paga oraria', allinea: 'destra', render: (e) => euro(e.pagaOraria) },
          {
            chiave: 'costoOrario',
            label: 'Costo orario',
            allinea: 'destra',
            nascondiSuMobile: true,
            valore: (e) => costoOrarioMeccanico(e.pagaOraria, settings.oneriContributivi),
            render: (e) => euro(costoOrarioMeccanico(e.pagaOraria, settings.oneriContributivi)),
          },
        ]),
    {
      chiave: 'vendute',
      label: 'Ore vendute',
      allinea: 'destra',
      valore: (e) => statistiche.get(e.id)?.vendute || 0,
      render: (e) => fmtOre(statistiche.get(e.id)?.vendute || 0, 1),
    },
    {
      chiave: 'produttivita',
      label: 'Produttività',
      allinea: 'destra',
      valore: (e) => {
        const s = statistiche.get(e.id)
        return produttivita(s?.vendute || 0, s?.presenza || 0)
      },
      render: (e) => {
        const s = statistiche.get(e.id)
        const p = produttivita(s?.vendute || 0, s?.presenza || 0)
        if (!s?.presenza) return <span className="text-[var(--ink-3)]">—</span>
        return (
          <div className="flex items-center gap-2 justify-end">
            <Barra quota={p} className="w-14" />
            <span className="tabnum w-11">{percento(p, 0)}</span>
          </div>
        )
      },
      csv: (e) => {
        const s = statistiche.get(e.id)
        return produttivita(s?.vendute || 0, s?.presenza || 0)
      },
    },
  ]

  return (
    <div>
      {!soloProprio && (
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Nome, reparto o specializzazione…" className="grow" />
          <div className="flex items-center gap-2">
            <EsportaCsv nomeFile="personale" colonne={colonne} righe={filtrati} />
            <Nuovo onClick={() => setModifica({ ...VUOTO, colore: db.employees.length })}>Dipendente</Nuovo>
          </div>
        </div>
      )}

      <Card padding={false} className="mb-4">
        <DataTable colonne={colonne} righe={filtrati} onRiga={setDettaglio} vuoto="Nessun dipendente." />
      </Card>

      {grafico.length > 0 && (
        <Card>
          <CardHeader
            titolo="Ore vendute e ore non vendute"
            sottotitolo="La parte scura è presenza che non è finita su una scheda: attrezzatura, pulizia, attese, formazione."
          />
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={grafico} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tema.griglia} vertical={false} />
                <XAxis dataKey="nome" tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: tema.testo }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={tema.tooltip}
                  formatter={(v, n) => [fmtOre(v, 1), n === 'vendute' ? 'Ore vendute' : 'Ore non vendute']}
                  cursor={{ fill: tema.cursore }}
                />
                <Bar dataKey="vendute" stackId="a" fill={tinte.manodopera} animationDuration={700} />
                <Bar
                  dataKey="presenza"
                  stackId="a"
                  fill={fondoBarra(scuro)}
                  radius={[3, 3, 0, 0]}
                  animationDuration={700}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {modifica && (
        <FormDipendente
          dipendente={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const creazione = !valori.id
            await azione(
              () =>
                creazione
                  ? dataService.insert('employees', valori)
                  : dataService.update('employees', valori.id, valori),
              { successo: creazione ? 'Dipendente aggiunto.' : 'Anagrafica aggiornata.' },
            )
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioDipendente
          dipendente={db.employees.find((e) => e.id === dettaglio.id) || dettaglio}
          statistiche={statistiche.get(dettaglio.id)}
          soloProprio={soloProprio}
          onChiudi={() => setDettaglio(null)}
          onModifica={(e) => {
            setDettaglio(null)
            setModifica(e)
          }}
          onElimina={(e) => {
            setDettaglio(null)
            setDaEliminare(e)
          }}
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare il dipendente?"
        messaggio={
          daEliminare
            ? dataService.bloccoCancellazione('employees', daEliminare.id) ||
              `${nomeDipendente(daEliminare)} verrà rimosso.`
            : ''
        }
        etichettaOk="Elimina"
        pericoloso
        onConferma={async () => {
          const blocco = dataService.bloccoCancellazione('employees', daEliminare.id)
          if (blocco) throw new Error(blocco)
          await azione(() => dataService.remove('employees', daEliminare.id), { successo: 'Dipendente eliminato.' })
        }}
      />
    </div>
  )
}

function FormDipendente({ dipendente, onChiudi, onSalva }) {
  const [e, setE] = useState(dipendente)
  const [inCorso, setInCorso] = useState(false)
  const set = (k) => (ev) => setE((x) => ({ ...x, [k]: ev.target.value }))

  const aggiungiCert = () =>
    setE((x) => ({ ...x, certificazioni: [...(x.certificazioni || []), { nome: '', scadenza: '' }] }))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={e.id ? 'Modifica dipendente' : 'Nuovo dipendente'}
      larghezza="lg"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!e.cognome.trim() && !e.nome.trim()}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva(e)
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
      <div className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etichetta="Nome" obbligatorio>{(id) => <Input id={id} value={e.nome} onChange={set('nome')} />}</Campo>
          <Campo etichetta="Cognome" obbligatorio>{(id) => <Input id={id} value={e.cognome} onChange={set('cognome')} />}</Campo>
          <Campo etichetta="Ruolo">
            {(id) => <Select id={id} value={e.ruolo} onChange={set('ruolo')} opzioni={RUOLI} />}
          </Campo>
          <Campo etichetta="Reparto">
            {(id) => (
              <Select
                id={id}
                value={e.reparto}
                onChange={set('reparto')}
                opzioni={['Meccanica', 'Elettrauto', 'Meccanica e gommista', 'Carrozzeria', 'Accettazione e amministrazione', 'Direzione']}
              />
            )}
          </Campo>
          <Campo etichetta="Contratto">
            {(id) => (
              <Select
                id={id}
                value={e.contratto}
                onChange={set('contratto')}
                opzioni={['Tempo indeterminato', 'Tempo determinato', 'Apprendistato', 'Part-time 30h', 'Part-time 20h', 'Socio', 'Collaborazione']}
              />
            )}
          </Campo>
          <Campo etichetta="Livello">
            {(id) => <Input id={id} value={e.livello} onChange={set('livello')} placeholder="3° livello" />}
          </Campo>
          <Campo etichetta="Paga oraria lorda">
            {(id) => <InputNumero id={id} valore={e.pagaOraria} onChange={(n) => setE((x) => ({ ...x, pagaOraria: n }))} suffisso="€/h" />}
          </Campo>
          <Campo etichetta="Data di assunzione">
            {(id) => <Input id={id} type="date" value={e.dataAssunzione || ''} onChange={set('dataAssunzione')} />}
          </Campo>
          <Campo etichetta="Specializzazione" className="sm:col-span-2">
            {(id) => <Input id={id} value={e.specializzazione} onChange={set('specializzazione')} placeholder="Diagnosi, climatizzazione, gommista…" />}
          </Campo>
          <Campo etichetta="Telefono">{(id) => <Input id={id} type="tel" value={e.telefono} onChange={set('telefono')} />}</Campo>
          <Campo etichetta="Email">{(id) => <Input id={id} type="email" value={e.email} onChange={set('email')} />}</Campo>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2.5">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Award size={15} className="text-accent-500" aria-hidden /> Patenti e certificazioni
            </h4>
            <Button misura="sm" variante="contorno" onClick={aggiungiCert}>
              Aggiungi
            </Button>
          </div>
          {(e.certificazioni || []).length ? (
            <div className="space-y-2">
              {e.certificazioni.map((c, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    value={c.nome}
                    onChange={(ev) =>
                      setE((x) => ({
                        ...x,
                        certificazioni: x.certificazioni.map((y, k) => (k === i ? { ...y, nome: ev.target.value } : y)),
                      }))
                    }
                    placeholder="Patentino F-Gas"
                    className="grow min-w-0"
                  />
                  <Input
                    type="date"
                    value={c.scadenza || ''}
                    onChange={(ev) =>
                      setE((x) => ({
                        ...x,
                        certificazioni: x.certificazioni.map((y, k) => (k === i ? { ...y, scadenza: ev.target.value } : y)),
                      }))
                    }
                    className="w-44"
                  />
                  <button
                    type="button"
                    onClick={() => setE((x) => ({ ...x, certificazioni: x.certificazioni.filter((_, k) => k !== i) }))}
                    aria-label="Rimuovi certificazione"
                    className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)]"
                  >
                    <Trash2 size={15} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-3)]">
              Nessuna certificazione. Quelle con scadenza finiscono negli avvisi due mesi prima.
            </p>
          )}
        </div>

        <div className="space-y-1">
          <Checkbox
            checked={e.attivo !== false}
            onChange={(ev) => setE((x) => ({ ...x, attivo: ev.target.checked }))}
            etichetta="In forza"
            descrizione="Chi non è più in forza resta nello storico ma non compare nelle assegnazioni."
          />
          <Checkbox
            checked={e.produttivo !== false}
            onChange={(ev) => setE((x) => ({ ...x, produttivo: ev.target.checked }))}
            etichetta="Vende ore su scheda"
            descrizione="Chi sta in accettazione o in amministrazione non entra nel calcolo della produttività: le sue ore non sono mai state fatturabili. Restano però nel costo del lavoro."
          />
        </div>
      </div>
    </Modal>
  )
}

function DettaglioDipendente({ dipendente: e, statistiche, soloProprio, onChiudi, onModifica, onElimina }) {
  const { db, settings, periodo } = useApp()
  const oggi = oggiIso()
  const { da, a } = rangeMese(periodo)

  const schede = db.jobs.filter((j) => (j.employeeIds || []).includes(e.id)).slice(0, 10)
  const presenze = db.attendance
    .filter((p) => p.employeeId === e.id && p.data >= da && p.data <= a)
    .sort((x, y) => (y.data || '').localeCompare(x.data || ''))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={nomeDipendente(e)}
      sottotitolo={`${e.reparto} · ${e.specializzazione || '—'}`}
      larghezza="lg"
      piede={
        <>
          {!soloProprio && (
            <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(e)}>
              Elimina
            </Button>
          )}
          <div className="grow" />
          <Button variante="fantasma" onClick={onChiudi}>
            Chiudi
          </Button>
          {!soloProprio && (
            <Button variante="primario" onClick={() => onModifica(e)}>
              Modifica
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Ore vendute" valore={fmtOre(statistiche?.vendute || 0, 1)} />
          <Dato etichetta="Ore presenza" valore={fmtOre(statistiche?.presenza || 0, 1)} />
          <Dato etichetta="Produttività" valore={percento(produttivita(statistiche?.vendute || 0, statistiche?.presenza || 0), 0)} />
          <Dato etichetta="Straordinari" valore={fmtOre(statistiche?.straordinario || 0, 1)} />
          {!soloProprio && (
            <>
              <Dato etichetta="Paga oraria" valore={euro(e.pagaOraria)} />
              <Dato etichetta="Costo orario" valore={euro(costoOrarioMeccanico(e.pagaOraria, settings.oneriContributivi))} />
              <Dato etichetta="Costo del mese" valore={euro(statistiche?.costo || 0, { decimali: 0 })} />
              <Dato etichetta="Contratto" valore={`${e.contratto} · ${e.livello}`} />
            </>
          )}
          <Dato etichetta="In officina dal" valore={fmtData(e.dataAssunzione)} />
          <Dato etichetta="Giorni di presenza" valore={statistiche?.giorni ?? 0} />
          <Dato etichetta="Assenze nel mese" valore={statistiche?.assenze ?? 0} />
          <Dato etichetta="Telefono" valore={e.telefono} />
        </dl>

        {(e.certificazioni || []).length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
              <Award size={15} className="text-accent-500" aria-hidden /> Certificazioni
            </h4>
            <div className="grid sm:grid-cols-2 gap-2">
              {e.certificazioni.map((c, i) => {
                const g = giorniTra(oggi, c.scadenza)
                return (
                  <div key={i} className="rounded-xl border border-[var(--line)] p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{c.nome}</p>
                      <p className="text-[11px] text-[var(--ink-3)]">
                        {c.scadenza ? `scade il ${fmtData(c.scadenza)}` : 'senza scadenza'}
                      </p>
                    </div>
                    {g !== null && (
                      <Badge tono={g < 0 ? 'negativo' : g <= 60 ? 'attenzione' : 'positivo'}>
                        {g < 0 ? 'scaduta' : `${g} gg`}
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <div>
          <h4 className="text-sm font-semibold mb-2.5">Presenze del mese</h4>
          <DataTable
            denso
            massimo={12}
            colonne={[
              { chiave: 'data', label: 'Data', render: (p) => `${GIORNI_BREVI[giornoSettimana(p.data)]} ${fmtData(p.data)}` },
              { chiave: 'tipo', label: 'Tipo', render: (p) => <StatoBadge stato={p.tipo} /> },
              { chiave: 'oreOrdinarie', label: 'Ordinarie', allinea: 'destra', render: (p) => numero(p.oreOrdinarie, 2) },
              { chiave: 'oreStraordinario', label: 'Straordinario', allinea: 'destra', render: (p) => numero(p.oreStraordinario, 2) },
              { chiave: 'ritardoMin', label: 'Ritardo', allinea: 'destra', render: (p) => (p.ritardoMin ? `${p.ritardoMin}′` : '—') },
            ]}
            righe={presenze}
            vuoto="Nessuna presenza registrata nel mese."
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2.5">Ultime schede</h4>
          {schede.length ? (
            <DataTable
              denso
              colonne={[
                { chiave: 'numero', label: 'Scheda' },
                { chiave: 'dataApertura', label: 'Data', render: (j) => fmtData(j.dataApertura) },
                { chiave: 'tipoIntervento', label: 'Intervento' },
                { chiave: 'stato', label: 'Stato', render: (j) => <StatoBadge stato={j.stato} /> },
              ]}
              righe={schede}
            />
          ) : (
            <Vuoto messaggio="Nessuna scheda assegnata." />
          )}
        </div>
      </div>
    </Modal>
  )
}

/* ================================================================== *
 * Presenze
 * ================================================================== */

function Presenze({ dipendenti, statistiche, soloProprio }) {
  const { db, azione, dataService, periodo, settings } = useApp()
  const [modifica, setModifica] = useState(null)
  const [filtro, setFiltro] = useState(null)

  const { da, a, giorni } = rangeMese(periodo)

  const righe = useMemo(() => {
    const idVisibili = new Set(dipendenti.map((e) => e.id))
    let out = db.attendance.filter((p) => idVisibili.has(p.employeeId) && p.data >= da && p.data <= a)
    if (filtro) out = out.filter((p) => p.tipo === filtro)
    return out.sort((x, y) => (y.data || '').localeCompare(x.data || ''))
  }, [db.attendance, dipendenti, da, a, filtro])

  const colonne = [
    {
      chiave: 'data',
      label: 'Data',
      render: (p) => (
        <span>
          <span className="text-[var(--ink-3)] mr-1.5">{GIORNI_BREVI[giornoSettimana(p.data)]}</span>
          {fmtData(p.data)}
        </span>
      ),
    },
    {
      chiave: 'dipendente',
      label: 'Dipendente',
      valore: (p) => nomeDipendente(db.employees.find((e) => e.id === p.employeeId)),
    },
    { chiave: 'tipo', label: 'Tipo', render: (p) => <StatoBadge stato={p.tipo} /> },
    { chiave: 'oreOrdinarie', label: 'Ordinarie', allinea: 'destra', render: (p) => numero(p.oreOrdinarie, 2) },
    { chiave: 'oreStraordinario', label: 'Straordinario', allinea: 'destra', render: (p) => numero(p.oreStraordinario, 2) },
    { chiave: 'ritardoMin', label: 'Ritardo', allinea: 'destra', nascondiSuMobile: true, render: (p) => (p.ritardoMin ? `${p.ritardoMin}′` : '—') },
    ...(soloProprio
      ? []
      : [
          {
            chiave: 'costo',
            label: 'Costo',
            allinea: 'destra',
            nascondiSuMobile: true,
            valore: (p) =>
              costoPresenza(p, db.employees.find((e) => e.id === p.employeeId)?.pagaOraria || 0, settings.oneriContributivi),
            render: (p) =>
              euro(costoPresenza(p, db.employees.find((e) => e.id === p.employeeId)?.pagaOraria || 0, settings.oneriContributivi)),
          },
        ]),
    { chiave: 'note', label: 'Note', nascondiSuMobile: true },
  ]

  return (
    <div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {dipendenti.map((e) => {
          const s = statistiche.get(e.id) || {}
          const p = produttivita(s.vendute || 0, s.presenza || 0)
          return (
            <div key={e.id} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
              <div className="flex items-center gap-2.5 mb-3">
                <Avatar iniziali={iniziali(e.nome, e.cognome)} colore={e.colore || 0} misura={30} />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{nomeDipendente(e)}</p>
                  <p className="text-[11px] text-[var(--ink-3)] truncate">{e.reparto}</p>
                </div>
              </div>
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="text-xs text-[var(--ink-3)]">vendute / presenza</span>
                <span className="text-sm tabnum">
                  {numero(s.vendute || 0, 1)} / {numero(s.presenza || 0, 1)} h
                </span>
              </div>
              <Barra quota={p} altezza={6} />
              <p className="text-xs text-[var(--ink-2)] mt-1.5 tabnum">{percento(p, 0)} di produttività</p>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <Filtri
          className="grow min-w-0"
          valore={filtro}
          onChange={setFiltro}
          opzioni={[
            { valore: null, etichetta: 'Tutte', conteggio: righe.length },
            ...TIPI_PRESENZA.map((t) => ({
              ...t,
              conteggio: db.attendance.filter((p) => p.tipo === t.valore && p.data >= da && p.data <= a).length,
            })),
          ]}
        />
        <div className="flex items-center gap-2">
          <EsportaCsv nomeFile={`presenze-${periodo}`} colonne={colonne} righe={righe} />
          {!soloProprio && (
            <Nuovo
              onClick={() =>
                setModifica({
                  employeeId: dipendenti[0]?.id || '',
                  data: oggiIso(),
                  tipo: 'presenza',
                  oreOrdinarie: 8,
                  oreStraordinario: 0,
                  ritardoMin: 0,
                  note: '',
                })
              }
            >
              Presenza
            </Nuovo>
          )}
        </div>
      </div>

      <Card padding={false}>
        <DataTable
          colonne={colonne}
          righe={righe}
          onRiga={soloProprio ? undefined : setModifica}
          massimo={120}
          vuoto={`Nessuna presenza registrata in questo mese (${giorni} giorni).`}
        />
      </Card>

      {modifica && (
        <FormPresenza
          presenza={modifica}
          dipendenti={dipendenti}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            await azione(
              () =>
                valori.id
                  ? dataService.update('attendance', valori.id, valori)
                  : dataService.registraPresenza(valori.employeeId, valori.data, valori),
              { successo: 'Presenza registrata.' },
            )
            setModifica(null)
          }}
          onElimina={async (p) => {
            await azione(() => dataService.remove('attendance', p.id), { successo: 'Presenza eliminata.' })
            setModifica(null)
          }}
        />
      )}
    </div>
  )
}

function FormPresenza({ presenza, dipendenti, onChiudi, onSalva, onElimina }) {
  const [p, setP] = useState(presenza)
  const [inCorso, setInCorso] = useState(false)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={p.id ? 'Modifica presenza' : 'Registra presenza'}
      larghezza="sm"
      piede={
        <>
          {p.id && (
            <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(p)}>
              Elimina
            </Button>
          )}
          <div className="grow" />
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            caricamento={inCorso}
            disabled={!p.employeeId}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva(p)
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
      <div className="space-y-3">
        <Campo etichetta="Dipendente" obbligatorio>
          {(id) => (
            <Select
              id={id}
              value={p.employeeId}
              onChange={(e) => setP((x) => ({ ...x, employeeId: e.target.value }))}
              opzioni={dipendenti.map((e) => ({ valore: e.id, etichetta: nomeDipendente(e) }))}
            />
          )}
        </Campo>
        <Campo etichetta="Data">
          {(id) => <Input id={id} type="date" value={p.data} onChange={(e) => setP((x) => ({ ...x, data: e.target.value }))} />}
        </Campo>
        <Campo etichetta="Tipo">
          {(id) => (
            <Select
              id={id}
              value={p.tipo}
              onChange={(e) => {
                const tipo = e.target.value
                setP((x) => ({ ...x, tipo, oreOrdinarie: tipo === 'presenza' ? x.oreOrdinarie || 8 : 0, oreStraordinario: 0 }))
              }}
              opzioni={TIPI_PRESENZA}
            />
          )}
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etichetta="Ore ordinarie">
            {(id) => (
              <InputNumero id={id} valore={p.oreOrdinarie} onChange={(n) => setP((x) => ({ ...x, oreOrdinarie: n }))} suffisso="h" disabled={p.tipo !== 'presenza'} />
            )}
          </Campo>
          <Campo etichetta="Straordinario" aiuto="Maggiorato del 15%.">
            {(id) => (
              <InputNumero id={id} valore={p.oreStraordinario} onChange={(n) => setP((x) => ({ ...x, oreStraordinario: n }))} suffisso="h" disabled={p.tipo !== 'presenza'} />
            )}
          </Campo>
        </div>
        <Campo etichetta="Ritardo">
          {(id) => <InputNumero id={id} valore={p.ritardoMin} onChange={(n) => setP((x) => ({ ...x, ritardoMin: n }))} decimali={0} suffisso="min" />}
        </Campo>
        <Campo etichetta="Note">
          {(id) => <Textarea id={id} value={p.note || ''} onChange={(e) => setP((x) => ({ ...x, note: e.target.value }))} righe={2} />}
        </Campo>
      </div>
    </Modal>
  )
}

/* ================================================================== *
 * Turni
 * ================================================================== */

function Turni({ dipendenti, soloProprio }) {
  const { db, settings, azione, dataService } = useApp()
  const oggi = oggiIso()
  const [inizio, setInizio] = useState(() => addGiorni(oggi, -((giornoSettimana(oggi) + 6) % 7)))
  const [modifica, setModifica] = useState(null)

  const giorni = useMemo(() => Array.from({ length: 7 }, (_, i) => addGiorni(inizio, i)), [inizio])

  const turniDi = (employeeId, data) =>
    db.shifts.filter((t) => t.employeeId === employeeId && t.data === data)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Button misura="sm" variante="contorno" onClick={() => setInizio(addGiorni(inizio, -7))}>
            ← Settimana
          </Button>
          <Button misura="sm" variante="contorno" onClick={() => setInizio(addGiorni(oggi, -((giornoSettimana(oggi) + 6) % 7)))}>
            Oggi
          </Button>
          <Button misura="sm" variante="contorno" onClick={() => setInizio(addGiorni(inizio, 7))}>
            Settimana →
          </Button>
        </div>
        <span className="text-sm text-[var(--ink-2)] tabnum">
          {fmtData(inizio)} – {fmtData(addGiorni(inizio, 6))}
        </span>
      </div>

      <Card padding={false} className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm border-collapse">
          <thead>
            <tr className="bg-[var(--surface-2)]">
              <th className="text-left text-[11px] uppercase tracking-wide font-medium px-3 py-2.5 border-b border-[var(--line)] text-[var(--ink-3)] w-52">
                Dipendente
              </th>
              {giorni.map((g) => {
                const domenica = giornoSettimana(g) === 0
                return (
                  <th
                    key={g}
                    className="text-center text-[11px] uppercase tracking-wide font-medium px-2 py-2.5 border-b border-[var(--line)] text-[var(--ink-3)]"
                  >
                    <span className={g === oggi ? 'text-accent-400' : undefined}>
                      {GIORNI_BREVI[giornoSettimana(g)]} {g.slice(8, 10)}
                    </span>
                    {domenica && <span className="block text-[10px] normal-case opacity-70">chiuso</span>}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {dipendenti.map((e) => (
              <tr key={e.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar iniziali={iniziali(e.nome, e.cognome)} colore={e.colore || 0} misura={28} />
                    <div className="min-w-0">
                      <p className="truncate">{nomeDipendente(e)}</p>
                      <p className="text-[11px] text-[var(--ink-3)] truncate">{e.reparto}</p>
                    </div>
                  </div>
                </td>
                {giorni.map((g) => {
                  const turni = turniDi(e.id, g)
                  const domenica = giornoSettimana(g) === 0
                  return (
                    <td key={g} className={`px-1.5 py-2 text-center ${domenica ? 'bg-[var(--surface-2)]' : ''}`}>
                      {turni.length ? (
                        turni.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => !soloProprio && setModifica(t)}
                            className="w-full rounded-lg bg-accent-500/12 text-accent-400 px-1.5 py-1.5 text-[11px] leading-tight mb-1 hover:bg-accent-500/20 transition-colors"
                          >
                            <span className="block tabnum font-medium">
                              {t.oraInizio}–{t.oraFine}
                            </span>
                            <span className="block opacity-80 truncate">{t.postazione}</span>
                          </button>
                        ))
                      ) : soloProprio || domenica ? (
                        <span className="text-[var(--ink-3)] text-xs">—</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setModifica({
                              employeeId: e.id,
                              data: g,
                              oraInizio: '08:00',
                              oraFine: '18:00',
                              postazione: `Ponte 1`,
                              note: '',
                            })
                          }
                          className="w-full rounded-lg border border-dashed border-[var(--line)] py-2 text-[var(--ink-3)] hover:border-accent-500/50 hover:text-accent-400 text-xs"
                        >
                          +
                        </button>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {modifica && (
        <Modal
          aperto
          onChiudi={() => setModifica(null)}
          titolo={modifica.id ? 'Modifica turno' : 'Nuovo turno'}
          sottotitolo={fmtData(modifica.data)}
          larghezza="sm"
          piede={
            <>
              {modifica.id && (
                <Button
                  variante="pericolo"
                  icona={Trash2}
                  misura="sm"
                  onClick={async () => {
                    await azione(() => dataService.remove('shifts', modifica.id), { successo: 'Turno eliminato.' })
                    setModifica(null)
                  }}
                >
                  Elimina
                </Button>
              )}
              <div className="grow" />
              <Button variante="fantasma" onClick={() => setModifica(null)}>
                Annulla
              </Button>
              <Button
                variante="primario"
                onClick={async () => {
                  await azione(
                    () =>
                      modifica.id
                        ? dataService.update('shifts', modifica.id, modifica)
                        : dataService.insert('shifts', modifica),
                    { successo: 'Turno salvato.' },
                  )
                  setModifica(null)
                }}
              >
                Salva
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Campo etichetta="Dipendente">
              {(id) => (
                <Select
                  id={id}
                  value={modifica.employeeId}
                  onChange={(e) => setModifica((x) => ({ ...x, employeeId: e.target.value }))}
                  opzioni={db.employees.map((e) => ({ valore: e.id, etichetta: nomeDipendente(e) }))}
                />
              )}
            </Campo>
            <Campo etichetta="Data">
              {(id) => <Input id={id} type="date" value={modifica.data} onChange={(e) => setModifica((x) => ({ ...x, data: e.target.value }))} />}
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo etichetta="Dalle">
                {(id) => <Input id={id} type="time" value={modifica.oraInizio} onChange={(e) => setModifica((x) => ({ ...x, oraInizio: e.target.value }))} />}
              </Campo>
              <Campo etichetta="Alle">
                {(id) => <Input id={id} type="time" value={modifica.oraFine} onChange={(e) => setModifica((x) => ({ ...x, oraFine: e.target.value }))} />}
              </Campo>
            </div>
            <Campo etichetta="Postazione">
              {(id) => (
                <Select
                  id={id}
                  value={modifica.postazione}
                  onChange={(e) => setModifica((x) => ({ ...x, postazione: e.target.value }))}
                  opzioni={[
                    ...Array.from({ length: settings.numeroPonti || 3 }, (_, i) => `Ponte ${i + 1}`),
                    'Accettazione',
                    'Officina esterna',
                  ]}
                />
              )}
            </Campo>
            <Campo etichetta="Note">
              {(id) => <Input id={id} value={modifica.note || ''} onChange={(e) => setModifica((x) => ({ ...x, note: e.target.value }))} />}
            </Campo>
          </div>
        </Modal>
      )}

      <p className="text-xs text-[var(--ink-3)] mt-3 flex items-center gap-1.5">
        <CalendarDays size={13} aria-hidden /> La domenica l’officina è chiusa: la colonna resta a
        sfondo pieno e senza pulsante di inserimento.
      </p>
    </div>
  )
}
