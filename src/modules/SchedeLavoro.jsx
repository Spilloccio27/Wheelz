/**
 * Schede di lavoro (commesse) — il cuore dell'applicazione.
 *
 * Qui dentro passa tutto: il veicolo entra, si registrano difetto e diagnosi,
 * si aggiungono le ore dei meccanici e i ricambi (che scaricano davvero il
 * magazzino), si segue lo stato fino alla consegna e alla fattura.
 *
 * Stati: accettato → in lavorazione → attesa ricambi → pronto → consegnato →
 * fatturato. Le rilavorazioni in garanzia seguono lo stesso percorso ma non
 * producono fattura: restano tracciate come costo.
 */

import { useMemo, useRef, useState } from 'react'
import {
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  LayoutGrid,
  Package,
  Paperclip,
  Receipt,
  Rows3,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import { CardScheda, Percorso, cosaFare } from '../components/flusso.jsx'
import {
  Avviso,
  Badge,
  Button,
  Campo,
  Card,
  Checkbox,
  Conferma,
  DataTable,
  Dato,
  EsportaCsv,
  Filtri,
  Input,
  InputNumero,
  Modal,
  Nuovo,
  Select,
  StatoBadge,
  Tabs,
  Textarea,
  TestataModulo,
  Vuoto,
  cx,
  filtraTesto,
} from '../components/ui.jsx'
import storageService from '../data/storageService.js'
import { arrotonda, costoOrarioMeccanico, totaliDocumento } from '../utils/calc.js'
import {
  addGiorni,
  data as fmtData,
  euro,
  giorniTra,
  km as fmtKm,
  nomeCliente,
  nomeDipendente,
  numero,
  oggiIso,
  ore as fmtOre,
  targa as fmtTarga,
} from '../utils/format.js'

const STATI = ['accettato', 'in_lavorazione', 'attesa_ricambi', 'pronto', 'consegnato', 'fatturato']

export default function SchedeLavoro() {
  const { db, settings, azione, dataService, ruolo, dipendenteCorrente, focus, setFocus, vaiA } = useApp()
  const [cerca, setCerca] = useState('')
  const [stato, setStato] = useState(null)
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(focus ? db.jobs.find((j) => j.id === focus) : null)
  const [daEliminare, setDaEliminare] = useState(null)

  const oggi = oggiIso()
  const soloMie = ruolo === 'meccanico'
  // Il meccanico apre sulle card: gli servono targa grande e il pulsante
  // dell'azione da fare, non dodici colonne da leggere con i guanti.
  const [vista, setVista] = useState(soloMie ? 'card' : 'tabella')

  const visibili = useMemo(() => {
    let righe = db.jobs
    if (soloMie) righe = righe.filter((j) => (j.employeeIds || []).includes(dipendenteCorrente?.id))
    return righe
  }, [db.jobs, soloMie, dipendenteCorrente])

  const filtrate = useMemo(() => {
    let righe = visibili
    if (stato === 'aperte') righe = righe.filter((j) => !['consegnato', 'fatturato'].includes(j.stato))
    else if (stato) righe = righe.filter((j) => j.stato === stato)
    return filtraTesto(righe, cerca, [
      'numero',
      'difetto',
      'tipoIntervento',
      (j) => nomeCliente(db.customers.find((c) => c.id === j.customerId)),
      (j) => db.vehicles.find((v) => v.id === j.vehicleId)?.targa || '',
    ])
  }, [visibili, cerca, stato, db.customers, db.vehicles])

  const conta = (s) => visibili.filter((j) => j.stato === s).length

  const totaleScheda = (j) =>
    totaliDocumento(db.jobLines.filter((l) => l.jobId === j.id)).imponibile

  const colonne = [
    { chiave: 'numero', label: 'Scheda', render: (j) => <span className="font-medium">{j.numero}</span> },
    { chiave: 'dataApertura', label: 'Aperta il', render: (j) => fmtData(j.dataApertura) },
    {
      chiave: 'veicolo',
      label: 'Veicolo',
      valore: (j) => db.vehicles.find((v) => v.id === j.vehicleId)?.targa || '',
      render: (j) => {
        const v = db.vehicles.find((x) => x.id === j.vehicleId)
        return (
          <div className="min-w-0">
            <p className="font-mono text-xs font-medium">{fmtTarga(v?.targa)}</p>
            <p className="text-[11px] text-[var(--ink-3)] truncate">
              {v?.marca} {v?.modello}
            </p>
          </div>
        )
      },
    },
    {
      chiave: 'cliente',
      label: 'Cliente',
      nascondiSuMobile: true,
      valore: (j) => nomeCliente(db.customers.find((c) => c.id === j.customerId)),
    },
    { chiave: 'tipoIntervento', label: 'Intervento', nascondiSuMobile: true },
    {
      chiave: 'stato',
      label: 'Stato',
      render: (j) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <StatoBadge stato={j.stato} />
            {j.garanzia && <Badge tono="attenzione">Garanzia</Badge>}
          </div>
          {/* Lo stato dice dov'è la scheda, questa riga dice cosa ci si
              aspetta: sono due informazioni diverse. */}
          <p className="text-[11px] text-[var(--ink-3)] mt-1">{cosaFare(j)}</p>
        </div>
      ),
    },
    { chiave: 'ponte', label: 'Ponte', allinea: 'centro', render: (j) => j.ponte || '—' },
    {
      chiave: 'giorni',
      label: 'Da',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (j) => -giorniTra(oggi, j.dataInizio || j.dataApertura),
      render: (j) => {
        if (['consegnato', 'fatturato'].includes(j.stato)) return '—'
        const g = -giorniTra(oggi, j.dataInizio || j.dataApertura)
        return (
          <span style={g > (settings.giorniAlertScheda || 5) ? { color: 'var(--color-neg)' } : undefined}>
            {g} gg
          </span>
        )
      },
    },
    // Il meccanico non vede il valore della scheda: è un dato economico, e il
    // suo ruolo non ne prevede nessuno. Lo stesso vale per l'esportazione.
    ...(soloMie
      ? []
      : [
          {
            chiave: 'totale',
            label: 'Valore',
            allinea: 'destra',
            valore: totaleScheda,
            render: (j) =>
              j.garanzia ? <span className="text-[var(--ink-3)]">garanzia</span> : euro(totaleScheda(j)),
          },
        ]),
  ]

  const nuova = () => ({
    numero: dataService.prossimoNumero('jobs').numero,
    customerId: '',
    vehicleId: '',
    kmIngresso: 0,
    tipoIntervento: '',
    difetto: '',
    diagnosi: '',
    lavorazioni: '',
    stato: 'accettato',
    ponte: null,
    garanzia: false,
    jobOrigineGaranzia: null,
    orePreviste: 1,
    dataApertura: oggi,
    dataInizio: null,
    dataConsegnaPrevista: addGiorni(oggi, 1),
    dataConsegna: null,
    employeeIds: [],
    allegati: [],
    note: '',
    quoteId: null,
    invoiceId: null,
  })

  return (
    <div>
      <TestataModulo
        titolo={soloMie ? 'Le mie schede' : 'Schede di lavoro'}
        conteggio={filtrate.length}
        cerca={cerca}
        onCerca={setCerca}
        segnaposto="Numero, targa, cliente o difetto…"
        azioni={
          <>
            <SelettoreVista valore={vista} onChange={setVista} />
            {!soloMie && (
              <>
                <EsportaCsv nomeFile="schede-lavoro" colonne={colonne} righe={filtrate} />
                <Nuovo onClick={() => setModifica(nuova())}>Scheda</Nuovo>
              </>
            )}
          </>
        }
      />

      <Filtri
        className="mb-4"
        valore={stato}
        onChange={setStato}
        opzioni={[
          { valore: null, etichetta: 'Tutte', conteggio: visibili.length },
          {
            valore: 'aperte',
            etichetta: 'Aperte',
            conteggio: visibili.filter((j) => !['consegnato', 'fatturato'].includes(j.stato)).length,
          },
          ...STATI.map((s) => ({
            valore: s,
            etichetta: s === 'in_lavorazione' ? 'In lavorazione' : s === 'attesa_ricambi' ? 'Attesa ricambi' : s[0].toUpperCase() + s.slice(1),
            conteggio: conta(s),
          })),
        ]}
      />

      {vista === 'card' ? (
        <GrigliaSchede
          schede={filtrate}
          ruolo={ruolo}
          onApri={setDettaglio}
          vuoto={cerca ? 'Nessuna scheda trovata.' : 'Ancora nessuna scheda di lavoro.'}
        />
      ) : (
        <Card padding={false}>
          <DataTable
            colonne={colonne}
            righe={filtrate}
            onRiga={setDettaglio}
            rigaEvidenziata={(j) =>
              !['consegnato', 'fatturato'].includes(j.stato) &&
              -giorniTra(oggi, j.dataInizio || j.dataApertura) > (settings.giorniAlertScheda || 5)
            }
            vuoto={cerca ? 'Nessuna scheda trovata.' : 'Ancora nessuna scheda di lavoro.'}
          />
        </Card>
      )}

      {modifica && (
        <FormScheda
          scheda={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const creazione = !valori.id
            const esito = await azione(
              () =>
                creazione
                  ? dataService.insert('jobs', valori)
                  : dataService.update('jobs', valori.id, valori),
              { successo: creazione ? 'Scheda aperta.' : 'Scheda aggiornata.' },
            )
            setModifica(null)
            if (creazione && esito.ok) setDettaglio(esito.esito)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioScheda
          scheda={db.jobs.find((j) => j.id === dettaglio.id) || dettaglio}
          onChiudi={() => {
            setDettaglio(null)
            setFocus(null)
          }}
          onModifica={(j) => {
            setDettaglio(null)
            setModifica(j)
          }}
          onElimina={(j) => {
            setDettaglio(null)
            setDaEliminare(j)
          }}
          vaiA={vaiA}
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare la scheda?"
        messaggio={
          daEliminare
            ? `La scheda ${daEliminare.numero} e le sue righe verranno rimosse. I movimenti di magazzino già registrati restano: il pezzo è uscito davvero.`
            : ''
        }
        etichettaOk="Elimina"
        pericoloso
        onConferma={() => azione(() => dataService.eliminaScheda(daEliminare.id), { successo: 'Scheda eliminata.' })}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Vista a card
 * ------------------------------------------------------------------ */

function SelettoreVista({ valore, onChange }) {
  const voci = [
    { id: 'card', icona: LayoutGrid, etichetta: 'Card con le azioni' },
    { id: 'tabella', icona: Rows3, etichetta: 'Elenco' },
  ]
  return (
    <div className="flex items-center gap-0.5 p-0.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] shrink-0">
      {voci.map((v) => {
        const Icona = v.icona
        const attivo = valore === v.id
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-label={v.etichetta}
            aria-pressed={attivo}
            title={v.etichetta}
            className={cx(
              'premi h-9 w-9 grid place-items-center rounded-[10px] transition-colors',
              attivo ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
            )}
          >
            <Icona size={16} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

function GrigliaSchede({ schede, ruolo, onApri, vuoto }) {
  const { db, settings, azione, dataService } = useApp()

  const avanza = (job, a) =>
    azione(() => dataService.update('jobs', job.id, a.patch(job)), {
      successo: `Scheda ${job.numero}: ${a.etichetta.toLowerCase()}.`,
    })

  if (!schede.length) {
    return (
      <Card>
        <Vuoto messaggio={vuoto} icona={ClipboardList} />
      </Card>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 mf-scaglione">
      {schede.slice(0, 48).map((j, i) => (
        <div key={j.id} style={{ '--i': Math.min(i, 14) }}>
          <CardScheda
            job={j}
            veicolo={db.vehicles.find((v) => v.id === j.vehicleId)}
            cliente={nomeCliente(db.customers.find((c) => c.id === j.customerId))}
            ruolo={ruolo}
            giorniAlert={settings.giorniAlertScheda}
            onApri={onApri}
            onAzione={avanza}
          />
        </div>
      ))}
      {schede.length > 48 && (
        <p className="sm:col-span-2 xl:col-span-3 text-xs text-[var(--ink-3)] text-center py-3">
          Mostrate 48 schede su {schede.length}. Restringi con i filtri o passa all’elenco.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Apertura / modifica scheda
 * ------------------------------------------------------------------ */

function FormScheda({ scheda, onChiudi, onSalva }) {
  const { db, settings } = useApp()
  const [j, setJ] = useState(scheda)
  const [inCorso, setInCorso] = useState(false)
  const set = (k) => (e) => setJ((x) => ({ ...x, [k]: e.target.value }))

  const veicoliCliente = db.vehicles.filter((v) => !j.customerId || v.customerId === j.customerId)
  const valido = j.customerId && j.vehicleId && j.difetto.trim()

  const scegliVeicolo = (vehicleId) => {
    const v = db.vehicles.find((x) => x.id === vehicleId)
    setJ((x) => ({
      ...x,
      vehicleId,
      customerId: v?.customerId || x.customerId,
      kmIngresso: x.kmIngresso || v?.km || 0,
    }))
  }

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={j.id ? `Scheda ${j.numero}` : 'Nuova scheda di lavoro'}
      larghezza="lg"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!valido}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva(j)
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
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Campo etichetta="Numero">{(id) => <Input id={id} value={j.numero} onChange={set('numero')} />}</Campo>
          <Campo etichetta="Data di apertura">
            {(id) => <Input id={id} type="date" value={j.dataApertura} onChange={set('dataApertura')} />}
          </Campo>
          <Campo etichetta="Consegna prevista">
            {(id) => <Input id={id} type="date" value={j.dataConsegnaPrevista || ''} onChange={set('dataConsegnaPrevista')} />}
          </Campo>

          <Campo etichetta="Cliente" obbligatorio>
            {(id) => (
              <Select
                id={id}
                value={j.customerId}
                onChange={(e) => setJ((x) => ({ ...x, customerId: e.target.value, vehicleId: '' }))}
                vuoto="— seleziona —"
                opzioni={db.customers.map((c) => ({ valore: c.id, etichetta: nomeCliente(c) }))}
              />
            )}
          </Campo>
          <Campo etichetta="Veicolo" obbligatorio>
            {(id) => (
              <Select
                id={id}
                value={j.vehicleId}
                onChange={(e) => scegliVeicolo(e.target.value)}
                vuoto="— seleziona —"
                opzioni={veicoliCliente.map((v) => ({
                  valore: v.id,
                  etichetta: `${fmtTarga(v.targa)} — ${v.marca} ${v.modello}`,
                }))}
              />
            )}
          </Campo>
          <Campo etichetta="Km all’ingresso">
            {(id) => (
              <InputNumero
                id={id}
                valore={j.kmIngresso}
                onChange={(n) => setJ((x) => ({ ...x, kmIngresso: n }))}
                decimali={0}
                suffisso="km"
              />
            )}
          </Campo>

          <Campo etichetta="Tipo di intervento">
            {(id) => <Input id={id} value={j.tipoIntervento || ''} onChange={set('tipoIntervento')} placeholder="Tagliando, freni…" />}
          </Campo>
          <Campo etichetta="Ponte / postazione">
            {(id) => (
              <Select
                id={id}
                value={j.ponte || ''}
                onChange={(e) => setJ((x) => ({ ...x, ponte: e.target.value ? Number(e.target.value) : null }))}
                vuoto="— non assegnato —"
                opzioni={Array.from({ length: settings.numeroPonti || 3 }, (_, i) => ({
                  valore: String(i + 1),
                  etichetta: `Ponte ${i + 1}`,
                }))}
              />
            )}
          </Campo>
          <Campo etichetta="Ore previste">
            {(id) => (
              <InputNumero id={id} valore={j.orePreviste} onChange={(n) => setJ((x) => ({ ...x, orePreviste: n }))} suffisso="h" />
            )}
          </Campo>
        </div>

        <Campo etichetta="Difetto segnalato dal cliente" obbligatorio>
          {(id) => <Textarea id={id} value={j.difetto} onChange={set('difetto')} righe={2} placeholder="Rumore in frenata a freddo…" />}
        </Campo>
        <Campo etichetta="Diagnosi">
          {(id) => <Textarea id={id} value={j.diagnosi || ''} onChange={set('diagnosi')} righe={2} />}
        </Campo>
        <Campo etichetta="Lavorazioni eseguite">
          {(id) => <Textarea id={id} value={j.lavorazioni || ''} onChange={set('lavorazioni')} righe={2} />}
        </Campo>

        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etichetta="Stato">
            {(id) => (
              <Select
                id={id}
                value={j.stato}
                onChange={set('stato')}
                opzioni={STATI.map((s) => ({ valore: s, etichetta: s.replace(/_/g, ' ') }))}
              />
            )}
          </Campo>
          <div className="flex items-end pb-1">
            <Checkbox
              checked={Boolean(j.garanzia)}
              onChange={(e) => setJ((x) => ({ ...x, garanzia: e.target.checked }))}
              etichetta="Rilavorazione in garanzia"
              descrizione="Non verrà fatturata al cliente, ma resta tracciata a costo."
            />
          </div>
        </div>

        <Campo etichetta="Note interne">
          {(id) => <Textarea id={id} value={j.note || ''} onChange={set('note')} righe={2} />}
        </Campo>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Dettaglio scheda
 * ------------------------------------------------------------------ */

function DettaglioScheda({ scheda: j, onChiudi, onModifica, onElimina, vaiA }) {
  const { db, azione, dataService, ruolo, toast } = useApp()
  const [tab, setTab] = useState('lavorazione')
  const [chiusura, setChiusura] = useState(false)

  const cliente = db.customers.find((c) => c.id === j.customerId)
  const veicolo = db.vehicles.find((v) => v.id === j.vehicleId)
  const righe = db.jobLines.filter((l) => l.jobId === j.id)
  const totali = totaliDocumento(righe)
  const fattura = db.invoices.find((f) => f.id === j.invoiceId)

  const cambiaStato = (nuovoStato) =>
    azione(
      () =>
        dataService.update('jobs', j.id, {
          stato: nuovoStato,
          dataInizio: j.dataInizio || (nuovoStato === 'in_lavorazione' ? oggiIso() : j.dataInizio),
          dataConsegna: nuovoStato === 'consegnato' ? oggiIso() : j.dataConsegna,
        }),
      { successo: `Scheda ${nuovoStato.replace(/_/g, ' ')}.` },
    )

  return (
    <>
      <Modal
        aperto
        onChiudi={onChiudi}
        titolo={`Scheda ${j.numero}`}
        sottotitolo={`${fmtTarga(veicolo?.targa)} · ${veicolo?.marca} ${veicolo?.modello} · ${nomeCliente(cliente)}`}
        larghezza="xl"
        piede={
          <>
            {ruolo !== 'meccanico' && (
              <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(j)} disabled={Boolean(j.invoiceId)}>
                Elimina
              </Button>
            )}
            <div className="grow" />
            {j.stato === 'accettato' && (
              <Button variante="contorno" icona={Wrench} onClick={() => cambiaStato('in_lavorazione')}>
                Inizia lavorazione
              </Button>
            )}
            {j.stato === 'in_lavorazione' && (
              <>
                <Button variante="fantasma" onClick={() => cambiaStato('attesa_ricambi')}>
                  In attesa ricambi
                </Button>
                <Button variante="contorno" icona={CheckCircle2} onClick={() => cambiaStato('pronto')}>
                  Pronto
                </Button>
              </>
            )}
            {j.stato === 'attesa_ricambi' && (
              <Button variante="contorno" onClick={() => cambiaStato('in_lavorazione')}>
                Ricambi arrivati
              </Button>
            )}
            {j.stato === 'pronto' && (
              <Button variante="contorno" onClick={() => cambiaStato('consegnato')}>
                Consegnato
              </Button>
            )}
            {!j.invoiceId && ['pronto', 'consegnato'].includes(j.stato) && ruolo !== 'meccanico' && (
              <Button variante="primario" icona={Receipt} onClick={() => setChiusura(true)}>
                {j.garanzia ? 'Chiudi in garanzia' : 'Chiudi e fattura'}
              </Button>
            )}
            {fattura && (
              <Button variante="primario" onClick={() => vaiA('fatturazione', fattura.id)}>
                Apri fattura {fattura.numero}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatoBadge stato={j.stato} />
            {j.garanzia && (
              <Badge tono="attenzione">
                <ShieldAlert size={11} aria-hidden /> Garanzia — non fatturabile
              </Badge>
            )}
            {j.ponte && <Badge>Ponte {j.ponte}</Badge>}
            {j.quoteId && <Badge tono="accento">Da preventivo</Badge>}
          </div>

          {/* Dove siamo e cosa viene dopo, senza dover conoscere il flusso. */}
          <div className="rounded-xl border border-[var(--line)] p-3.5">
            <Percorso stato={j.stato} />
            <p className="text-xs text-[var(--ink-2)] mt-3">{cosaFare(j)}</p>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Dato etichetta="Aperta il" valore={fmtData(j.dataApertura)} />
            <Dato etichetta="Inizio lavori" valore={fmtData(j.dataInizio)} />
            <Dato etichetta="Consegna prevista" valore={fmtData(j.dataConsegnaPrevista)} />
            <Dato etichetta="Consegnata il" valore={fmtData(j.dataConsegna)} />
            <Dato etichetta="Km all’ingresso" valore={fmtKm(j.kmIngresso)} />
            <Dato etichetta="Ore previste" valore={fmtOre(j.orePreviste || 0, 2)} />
            <Dato etichetta="Ore registrate" valore={fmtOre(totali.ore, 2)} />
            <Dato etichetta="Valore" valore={j.garanzia ? '— garanzia —' : euro(totali.imponibile)} />
          </dl>

          <div className="grid lg:grid-cols-3 gap-3">
            <Riquadro titolo="Difetto segnalato" testo={j.difetto} />
            <Riquadro titolo="Diagnosi" testo={j.diagnosi} />
            <Riquadro titolo="Lavorazioni eseguite" testo={j.lavorazioni} />
          </div>

          {j.note && <Avviso tipo="info" titolo="Note interne">{j.note}</Avviso>}

          <Tabs
            valore={tab}
            onChange={setTab}
            voci={[
              { valore: 'lavorazione', etichetta: 'Ore e ricambi', conteggio: righe.length },
              { valore: 'allegati', etichetta: 'Allegati', conteggio: (j.allegati || []).length },
            ]}
          />

          {tab === 'lavorazione' ? (
            <PannelloLavorazione scheda={j} righe={righe} totali={totali} />
          ) : (
            <PannelloAllegati scheda={j} />
          )}

          {ruolo !== 'meccanico' && (
            <div className="flex justify-end">
              <Button variante="contorno" icona={FileText} onClick={() => onModifica(j)}>
                Modifica intestazione
              </Button>
            </div>
          )}
        </div>
      </Modal>

      <Conferma
        aperto={chiusura}
        onChiudi={() => setChiusura(false)}
        titolo={j.garanzia ? 'Chiudere la rilavorazione in garanzia?' : 'Chiudere la scheda ed emettere fattura?'}
        messaggio={
          j.garanzia
            ? 'La scheda verrà chiusa senza emettere fattura: il costo resta a carico dell’officina e continua a pesare sui margini del periodo.'
            : `Verrà emessa la fattura ${dataService.prossimoNumero('invoices').numero} per ${euro(totali.totale)} intestata a ${nomeCliente(cliente)}.`
        }
        etichettaOk={j.garanzia ? 'Chiudi' : 'Emetti fattura'}
        onConferma={async () => {
          const esito = await azione(() => dataService.chiudiSchedaEFattura(j.id), {
            successo: j.garanzia ? 'Scheda chiusa in garanzia.' : 'Fattura emessa.',
          })
          if (esito.ok && !j.garanzia && esito.esito) {
            toast(`Fattura ${esito.esito.numero} creata.`)
          }
        }}
      />
    </>
  )
}

function Riquadro({ titolo, testo }) {
  return (
    <div className="rounded-xl border border-[var(--line)] p-3">
      <p className="text-[11px] uppercase tracking-wide text-[var(--ink-3)] mb-1.5">{titolo}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{testo || '—'}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Ore e ricambi
 * ------------------------------------------------------------------ */

function PannelloLavorazione({ scheda: j, righe, totali }) {
  const { db, settings, azione, dataService } = useApp()
  const [aggiuntaOre, setAggiuntaOre] = useState(false)
  const [aggiuntaRicambi, setAggiuntaRicambi] = useState(false)

  const chiusa = ['consegnato', 'fatturato'].includes(j.stato)
  const manodopera = righe.filter((l) => l.tipo === 'manodopera')
  const ricambi = righe.filter((l) => l.tipo !== 'manodopera')

  const perMeccanico = useMemo(() => {
    const m = new Map()
    for (const l of manodopera) {
      const k = l.employeeId || 'nessuno'
      m.set(k, arrotonda((m.get(k) || 0) + Number(l.ore || 0), 2))
    }
    return [...m.entries()]
  }, [manodopera])

  const eliminaRiga = async (l) => {
    // Togliere un ricambio dalla scheda vuol dire rimetterlo a magazzino:
    // il pezzo torna sullo scaffale, e il movimento lo dice.
    if (l.articleId) {
      await azione(
        () =>
          dataService.registerMovement({
            articleId: l.articleId,
            tipo: 'carico',
            quantita: Number(l.quantita || 0),
            prezzoUnitario: Number(l.costoUnitario || 0),
            causale: `Storno da scheda ${j.numero}`,
            jobId: j.id,
          }),
        { errore: 'Non è stato possibile riportare il ricambio a magazzino.' },
      )
    }
    await azione(() => dataService.remove('jobLines', l.id), { successo: 'Riga rimossa.' })
  }

  return (
    <div className="space-y-5">
      {/* Manodopera */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Clock size={15} className="text-accent-500" aria-hidden /> Ore per meccanico
            <span className="text-xs font-normal text-[var(--ink-3)]">{fmtOre(totali.ore, 2)}</span>
          </h4>
          {!chiusa && (
            <Button misura="sm" variante="contorno" onClick={() => setAggiuntaOre(true)}>
              Registra ore
            </Button>
          )}
        </div>

        {perMeccanico.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2.5">
            {perMeccanico.map(([empId, ore]) => (
              <Badge key={empId} tono="accento">
                {nomeDipendente(db.employees.find((e) => e.id === empId)) || 'Non assegnato'} · {fmtOre(ore, 2)}
              </Badge>
            ))}
          </div>
        )}

        {manodopera.length ? (
          <DataTable
            denso
            colonne={[
              { chiave: 'data', label: 'Data', render: (l) => fmtData(l.data) },
              { chiave: 'descrizione', label: 'Lavorazione' },
              {
                chiave: 'employeeId',
                label: 'Meccanico',
                nascondiSuMobile: true,
                render: (l) => nomeDipendente(db.employees.find((e) => e.id === l.employeeId)),
              },
              { chiave: 'ore', label: 'Ore', allinea: 'destra', render: (l) => numero(l.ore, 2) },
              { chiave: 'tariffaOraria', label: 'Tariffa', allinea: 'destra', render: (l) => euro(l.tariffaOraria) },
              {
                chiave: 'importo',
                label: 'Importo',
                allinea: 'destra',
                valore: (l) => Number(l.ore || 0) * Number(l.tariffaOraria || 0),
                render: (l) => euro(Number(l.ore || 0) * Number(l.tariffaOraria || 0)),
              },
              ...(chiusa
                ? []
                : [
                    {
                      chiave: 'azioni',
                      label: '',
                      ordinabile: false,
                      csv: false,
                      allinea: 'destra',
                      render: (l) => (
                        <button
                          type="button"
                          onClick={() => eliminaRiga(l)}
                          aria-label="Rimuovi"
                          className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)]"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      ),
                    },
                  ]),
            ]}
            righe={manodopera}
            vuoto="Nessuna ora registrata."
          />
        ) : (
          <Vuoto messaggio="Nessuna ora registrata." icona={Clock} />
        )}
      </div>

      {/* Ricambi */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Package size={15} className="text-accent-500" aria-hidden /> Ricambi impiegati
          </h4>
          {!chiusa && (
            <Button misura="sm" variante="contorno" onClick={() => setAggiuntaRicambi(true)}>
              Scarica ricambi
            </Button>
          )}
        </div>

        {ricambi.length ? (
          <DataTable
            denso
            colonne={[
              { chiave: 'codice', label: 'Codice', render: (l) => <span className="font-mono text-xs">{l.codice || '—'}</span> },
              { chiave: 'descrizione', label: 'Ricambio' },
              { chiave: 'quantita', label: 'Q.tà', allinea: 'destra', render: (l) => numero(l.quantita, 2) },
              { chiave: 'costoUnitario', label: 'Costo', allinea: 'destra', nascondiSuMobile: true, render: (l) => euro(l.costoUnitario) },
              { chiave: 'prezzo', label: 'Prezzo', allinea: 'destra', render: (l) => euro(l.prezzo) },
              {
                chiave: 'importo',
                label: 'Importo',
                allinea: 'destra',
                valore: (l) => Number(l.quantita || 0) * Number(l.prezzo || 0) * (1 - Number(l.sconto || 0) / 100),
                render: (l) => euro(Number(l.quantita || 0) * Number(l.prezzo || 0) * (1 - Number(l.sconto || 0) / 100)),
              },
              ...(chiusa
                ? []
                : [
                    {
                      chiave: 'azioni',
                      label: '',
                      ordinabile: false,
                      csv: false,
                      allinea: 'destra',
                      render: (l) => (
                        <button
                          type="button"
                          onClick={() => eliminaRiga(l)}
                          aria-label="Rimuovi e riporta a magazzino"
                          className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)]"
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      ),
                    },
                  ]),
            ]}
            righe={ricambi}
            vuoto="Nessun ricambio impiegato."
          />
        ) : (
          <Vuoto messaggio="Nessun ricambio impiegato." icona={Package} />
        )}
      </div>

      {/* Riepilogo */}
      <div className="rounded-xl border border-[var(--line)] p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 bg-[var(--surface-2)]">
        <Dato etichetta="Manodopera" valore={euro(totali.manodopera)} />
        <Dato etichetta="Ricambi" valore={euro(totali.ricambi)} />
        <Dato etichetta="Costo diretto" valore={euro(totali.costo)} />
        <Dato
          etichetta="Margine"
          valore={
            <span className="flex items-center gap-2">
              {euro(totali.margine)}
              <Badge tono={totali.marginePerc >= 0.4 ? 'positivo' : totali.marginePerc >= 0.25 ? 'attenzione' : 'negativo'}>
                {numero(totali.marginePerc * 100, 1)}%
              </Badge>
            </span>
          }
        />
      </div>

      {aggiuntaOre && (
        <ModaleOre
          scheda={j}
          onChiudi={() => setAggiuntaOre(false)}
          onSalva={async (valori) => {
            await azione(() => dataService.insert('jobLines', valori), { successo: 'Ore registrate.' })
            if (!(j.employeeIds || []).includes(valori.employeeId)) {
              await dataService.update('jobs', j.id, {
                employeeIds: [...(j.employeeIds || []), valori.employeeId],
                stato: j.stato === 'accettato' ? 'in_lavorazione' : j.stato,
                dataInizio: j.dataInizio || valori.data,
              })
            }
            setAggiuntaOre(false)
          }}
          tariffe={settings.tariffe}
          oneri={settings.oneriContributivi}
        />
      )}

      {aggiuntaRicambi && (
        <ModaleRicambi
          scheda={j}
          onChiudi={() => setAggiuntaRicambi(false)}
          onSalva={async (righeDaScaricare) => {
            const esito = await azione(
              () => dataService.scaricaRicambiScheda(j.id, righeDaScaricare),
              { successo: 'Ricambi scaricati dal magazzino.' },
            )
            if (esito.ok) setAggiuntaRicambi(false)
          }}
        />
      )}
    </div>
  )
}

function ModaleOre({ scheda, onChiudi, onSalva, tariffe, oneri }) {
  const { db } = useApp()
  const meccanici = db.employees.filter((e) => e.attivo !== false)
  const [v, setV] = useState({
    employeeId: meccanici[0]?.id || '',
    tariffaId: tariffe[0]?.id || '',
    ore: 1,
    data: oggiIso(),
    descrizione: '',
  })
  const [inCorso, setInCorso] = useState(false)

  const tariffa = tariffe.find((t) => t.id === v.tariffaId)
  const dipendente = db.employees.find((e) => e.id === v.employeeId)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo="Registra ore"
      larghezza="sm"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            caricamento={inCorso}
            disabled={!v.employeeId || !v.ore}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva({
                  jobId: scheda.id,
                  tipo: 'manodopera',
                  descrizione: v.descrizione || `${tariffa?.nome || 'Manodopera'} — ${nomeDipendente(dipendente)}`,
                  employeeId: v.employeeId,
                  tariffaId: v.tariffaId,
                  tariffaOraria: tariffa?.prezzoOrario || 0,
                  costoOrario: costoOrarioMeccanico(dipendente?.pagaOraria || 0, oneri),
                  ore: Number(v.ore),
                  sconto: 0,
                  aliquotaIva: 22,
                  data: v.data,
                })
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
        <Campo etichetta="Meccanico" obbligatorio>
          {(id) => (
            <Select
              id={id}
              value={v.employeeId}
              onChange={(e) => setV((x) => ({ ...x, employeeId: e.target.value }))}
              opzioni={meccanici.map((e) => ({ valore: e.id, etichetta: `${nomeDipendente(e)} — ${e.reparto}` }))}
            />
          )}
        </Campo>
        <Campo etichetta="Tipo di lavorazione (tariffa)">
          {(id) => (
            <Select
              id={id}
              value={v.tariffaId}
              onChange={(e) => setV((x) => ({ ...x, tariffaId: e.target.value }))}
              opzioni={tariffe.map((t) => ({ valore: t.id, etichetta: `${t.nome} — ${euro(t.prezzoOrario)}/h` }))}
            />
          )}
        </Campo>
        <div className="grid grid-cols-2 gap-3">
          <Campo etichetta="Ore" obbligatorio>
            {(id) => <InputNumero id={id} valore={v.ore} onChange={(n) => setV((x) => ({ ...x, ore: n }))} suffisso="h" />}
          </Campo>
          <Campo etichetta="Data">
            {(id) => <Input id={id} type="date" value={v.data} onChange={(e) => setV((x) => ({ ...x, data: e.target.value }))} />}
          </Campo>
        </div>
        <Campo etichetta="Descrizione" aiuto="Se la lasci vuota, viene composta da lavorazione e meccanico.">
          {(id) => <Input id={id} value={v.descrizione} onChange={(e) => setV((x) => ({ ...x, descrizione: e.target.value }))} />}
        </Campo>
        <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--line)] p-3 text-sm flex items-center justify-between">
          <span className="text-[var(--ink-2)]">Ricavo manodopera</span>
          <span className="tabnum font-medium">{euro(Number(v.ore || 0) * (tariffa?.prezzoOrario || 0))}</span>
        </div>
      </div>
    </Modal>
  )
}

function ModaleRicambi({ scheda, onChiudi, onSalva }) {
  const { db, settings } = useApp()
  const [cerca, setCerca] = useState('')
  const [selezione, setSelezione] = useState([])
  const [inCorso, setInCorso] = useState(false)

  const disponibili = useMemo(
    () =>
      filtraTesto(
        db.articles.filter((a) => a.attivo !== false),
        cerca,
        ['descrizione', 'codice', 'codiceOe', 'marca', 'categoria'],
      ).slice(0, 40),
    [db.articles, cerca],
  )

  const aggiungi = (art) => {
    if (selezione.some((s) => s.articleId === art.id)) return
    setSelezione((s) => [
      ...s,
      {
        articleId: art.id,
        codice: art.codice,
        descrizione: art.descrizione,
        quantita: 1,
        prezzo: arrotonda(art.prezzoListino || art.prezzoMedio * (1 + (art.ricarico ?? settings.ricaricoRicambi))),
        costoUnitario: art.prezzoMedio,
        sconto: 0,
        aliquotaIva: art.aliquotaIva ?? settings.aliquotaIvaDefault,
        giacenza: art.giacenza,
        unita: art.unita,
      },
    ])
    setCerca('')
  }

  const eccedenze = selezione.filter((s) => Number(s.quantita) > Number(s.giacenza))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo="Scarica ricambi sulla scheda"
      sottotitolo={`Scheda ${scheda.numero} — il magazzino viene scaricato davvero`}
      larghezza="lg"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!selezione.length || eccedenze.length > 0}
            caricamento={inCorso}
            onClick={async () => {
              setInCorso(true)
              try {
                await onSalva(selezione)
              } finally {
                setInCorso(false)
              }
            }}
          >
            Scarica {selezione.length ? `(${selezione.length})` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Campo etichetta="Cerca a magazzino">
          {(id) => (
            <Input
              id={id}
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
              placeholder="Codice, codice OE o descrizione…"
              autoFocus
            />
          )}
        </Campo>

        {cerca.trim().length >= 2 && (
          <ul className="rounded-xl border border-[var(--line)] divide-y divide-[var(--line)] max-h-56 overflow-y-auto">
            {disponibili.length ? (
              disponibili.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => aggiungi(a)}
                    className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-2)] flex items-center gap-3"
                  >
                    <span className="min-w-0 grow">
                      <span className="block text-sm truncate">{a.descrizione}</span>
                      <span className="block text-[11px] text-[var(--ink-3)] font-mono">
                        {a.codice} · OE {a.codiceOe} · {a.ubicazione}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm tabnum">{euro(a.prezzoListino)}</span>
                      <span
                        className="block text-[11px] tabnum"
                        style={{ color: a.giacenza <= a.scortaMinima ? 'var(--color-neg)' : 'var(--ink-3)' }}
                      >
                        giac. {numero(a.giacenza, 0)} {a.unita}
                      </span>
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-3 py-4 text-sm text-[var(--ink-3)] text-center">Nessun articolo trovato.</li>
            )}
          </ul>
        )}

        {selezione.length ? (
          <div className="space-y-2">
            {selezione.map((s, i) => (
              <div key={s.articleId} className="rounded-xl border border-[var(--line)] p-3 flex items-center gap-3">
                <div className="min-w-0 grow">
                  <p className="text-sm truncate">{s.descrizione}</p>
                  <p className="text-[11px] text-[var(--ink-3)] font-mono">
                    {s.codice} · giacenza {numero(s.giacenza, 0)} {s.unita}
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <InputNumero
                    valore={s.quantita}
                    onChange={(n) =>
                      setSelezione((sel) => sel.map((x, k) => (k === i ? { ...x, quantita: n } : x)))
                    }
                    className="h-9"
                  />
                </div>
                <div className="w-28 shrink-0">
                  <InputNumero
                    valore={s.prezzo}
                    onChange={(n) => setSelezione((sel) => sel.map((x, k) => (k === i ? { ...x, prezzo: n } : x)))}
                    className="h-9"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSelezione((sel) => sel.filter((_, k) => k !== i))}
                  aria-label="Togli"
                  className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)] shrink-0"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <Vuoto messaggio="Nessun ricambio selezionato." descrizione="Cerca un articolo qui sopra per aggiungerlo." icona={Package} />
        )}

        {eccedenze.length > 0 && (
          <Avviso tipo="errore" titolo="Giacenza insufficiente">
            {eccedenze.map((e) => `${e.descrizione}: richiesti ${e.quantita}, disponibili ${e.giacenza}`).join(' · ')}
          </Avviso>
        )}
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Allegati
 * ------------------------------------------------------------------ */

function PannelloAllegati({ scheda: j }) {
  const { azione, dataService, demo, profilo } = useApp()
  const [inCorso, setInCorso] = useState(false)
  const input = useRef(null)

  const carica = async (file, tipo) => {
    if (!file) return
    setInCorso(true)
    try {
      const esito = await storageService.carica(file, {
        officinaId: profilo?.officinaId || 'demo',
        cartella: `schede/${j.id}`,
      })
      const allegato = {
        id: dataService.nuovoId(),
        nome: esito.nome,
        tipo,
        path: esito.path,
        dimensione: esito.dimensione,
        data: oggiIso(),
      }
      await dataService.update('jobs', j.id, { allegati: [...(j.allegati || []), allegato] })
    } catch (e) {
      await azione(() => Promise.reject(e))
    } finally {
      setInCorso(false)
      if (input.current) input.current.value = ''
    }
  }

  const rimuovi = async (allegato) => {
    await azione(
      async () => {
        if (allegato.path) await storageService.elimina(allegato.path)
        return dataService.update('jobs', j.id, {
          allegati: (j.allegati || []).filter((a) => a.id !== allegato.id),
        })
      },
      { successo: 'Allegato rimosso.' },
    )
  }

  const apri = async (allegato) => {
    const url = await storageService.urlDi(allegato.path)
    if (url) window.open(url, '_blank', 'noopener')
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => carica(e.target.files?.[0], e.target.files?.[0]?.type?.startsWith('image/') ? 'foto' : 'documento')}
        />
        <Button icona={Camera} caricamento={inCorso} onClick={() => input.current?.click()}>
          Aggiungi foto o documento
        </Button>
        <span className="text-xs text-[var(--ink-3)]">
          Foto del danno, del pezzo sostituito, DDT del fornitore. Le immagini vengono ridotte prima
          del caricamento.
        </span>
      </div>

      {demo && (
        <Avviso tipo="info">
          In modalità demo gli allegati restano nella memoria del browser e spariscono ricaricando la
          pagina. Con Supabase configurato finiscono nel bucket privato <code>documenti</code>, e nel
          database viene salvato solo il percorso.
        </Avviso>
      )}

      {(j.allegati || []).length ? (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {j.allegati.map((a) => (
            <li key={a.id} className="rounded-xl border border-[var(--line)] p-3 flex items-center gap-3">
              <span className="h-9 w-9 rounded-lg bg-[var(--surface-3)] grid place-items-center shrink-0 text-[var(--ink-2)]">
                <Paperclip size={15} aria-hidden />
              </span>
              <button type="button" onClick={() => apri(a)} className="min-w-0 grow text-left">
                <span className="block text-sm truncate">{a.nome}</span>
                <span className="block text-[11px] text-[var(--ink-3)]">
                  {a.tipo} · {fmtData(a.data)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => rimuovi(a)}
                aria-label="Rimuovi allegato"
                className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)] shrink-0"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Vuoto messaggio="Nessun allegato." icona={Paperclip} />
      )}
    </div>
  )
}
