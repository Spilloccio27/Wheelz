/**
 * Preventivi.
 *
 * Ciclo di vita: bozza → inviato → accettato / rifiutato / scaduto.
 * Un preventivo accettato diventa scheda di lavoro con un click, portandosi
 * dietro tutte le righe: è il passaggio che in officina si fa venti volte al
 * giorno, e deve costare un gesto solo.
 */

import { useMemo, useState } from 'react'
import { ArrowRight, Copy, FileText, Printer, Send, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import RigheDocumento, { nuovaChiave } from '../components/RigheDocumento.jsx'
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
  Modal,
  Nuovo,
  Select,
  StatoBadge,
  Textarea,
  TestataModulo,
  cx,
  filtraTesto,
} from '../components/ui.jsx'
import { totaliDocumento } from '../utils/calc.js'
import {
  addGiorni,
  data as fmtData,
  euro,
  giorniTra,
  nomeCliente,
  oggiIso,
  targa as fmtTarga,
} from '../utils/format.js'

export default function Preventivi() {
  const { db, settings, azione, dataService, toast, focus, setFocus, vaiA } = useApp()
  const [cerca, setCerca] = useState('')
  const [stato, setStato] = useState(null)
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(focus ? db.quotes.find((q) => q.id === focus) : null)
  const [daEliminare, setDaEliminare] = useState(null)
  const [daConvertire, setDaConvertire] = useState(null)

  const oggi = oggiIso()

  const totaleDi = (q) => totaliDocumento(q.righe || [], q.scontoGlobale || 0).totale

  const filtrati = useMemo(() => {
    let righe = db.quotes
    if (stato) righe = righe.filter((q) => q.stato === stato)
    return filtraTesto(righe, cerca, [
      'numero',
      'tipoIntervento',
      (q) => nomeCliente(db.customers.find((c) => c.id === q.customerId)),
      (q) => db.vehicles.find((v) => v.id === q.vehicleId)?.targa || '',
    ])
  }, [db.quotes, db.customers, db.vehicles, cerca, stato])

  const conta = (s) => db.quotes.filter((q) => q.stato === s).length

  const colonne = [
    { chiave: 'numero', label: 'Numero', render: (q) => <span className="font-medium">{q.numero}</span> },
    { chiave: 'data', label: 'Data', render: (q) => fmtData(q.data) },
    {
      chiave: 'cliente',
      label: 'Cliente',
      valore: (q) => nomeCliente(db.customers.find((c) => c.id === q.customerId)),
    },
    {
      chiave: 'veicolo',
      label: 'Veicolo',
      nascondiSuMobile: true,
      valore: (q) => db.vehicles.find((v) => v.id === q.vehicleId)?.targa || '',
      render: (q) => {
        const v = db.vehicles.find((x) => x.id === q.vehicleId)
        return v ? (
          <span className="font-mono text-xs">{fmtTarga(v.targa)}</span>
        ) : (
          <span className="text-[var(--ink-3)]">—</span>
        )
      },
    },
    { chiave: 'tipoIntervento', label: 'Intervento', nascondiSuMobile: true },
    {
      chiave: 'validoAl',
      label: 'Valido al',
      allinea: 'destra',
      nascondiSuMobile: true,
      render: (q) => {
        const g = giorniTra(oggi, q.validoAl)
        const scaduto = g !== null && g < 0 && ['bozza', 'inviato'].includes(q.stato)
        return (
          <span style={scaduto ? { color: 'var(--color-neg)' } : undefined}>{fmtData(q.validoAl)}</span>
        )
      },
    },
    { chiave: 'stato', label: 'Stato', render: (q) => <StatoBadge stato={q.stato} /> },
    {
      chiave: 'totale',
      label: 'Totale',
      allinea: 'destra',
      valore: totaleDi,
      render: (q) => euro(totaleDi(q)),
    },
  ]

  const nuovo = () => ({
    numero: dataService.prossimoNumero('quotes').numero,
    data: oggi,
    validoAl: addGiorni(oggi, settings.giorniValiditaPreventivo || 30),
    customerId: '',
    vehicleId: '',
    tipoIntervento: '',
    stato: 'bozza',
    righe: [],
    scontoGlobale: 0,
    note: '',
    jobId: null,
  })

  return (
    <div>
      <TestataModulo
        titolo="Preventivi"
        conteggio={filtrati.length}
        cerca={cerca}
        onCerca={setCerca}
        segnaposto="Numero, cliente o targa…"
        azioni={
          <>
            <EsportaCsv nomeFile="preventivi" colonne={colonne} righe={filtrati} />
            <Nuovo onClick={() => setModifica(nuovo())}>Preventivo</Nuovo>
          </>
        }
      />

      <Filtri
        className="mb-4"
        valore={stato}
        onChange={setStato}
        opzioni={[
          { valore: null, etichetta: 'Tutti', conteggio: db.quotes.length },
          { valore: 'bozza', etichetta: 'Bozze', conteggio: conta('bozza') },
          { valore: 'inviato', etichetta: 'Inviati', conteggio: conta('inviato') },
          { valore: 'accettato', etichetta: 'Accettati', conteggio: conta('accettato') },
          { valore: 'rifiutato', etichetta: 'Rifiutati', conteggio: conta('rifiutato') },
          { valore: 'scaduto', etichetta: 'Scaduti', conteggio: conta('scaduto') },
        ]}
      />

      <Card padding={false}>
        <DataTable
          colonne={colonne}
          righe={filtrati}
          onRiga={setDettaglio}
          vuoto={cerca ? 'Nessun preventivo trovato.' : 'Ancora nessun preventivo.'}
        />
      </Card>

      {modifica && (
        <FormPreventivo
          preventivo={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const creazione = !valori.id
            await azione(
              () =>
                creazione
                  ? dataService.insert('quotes', valori)
                  : dataService.update('quotes', valori.id, valori),
              { successo: creazione ? 'Preventivo creato.' : 'Preventivo aggiornato.' },
            )
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioPreventivo
          preventivo={db.quotes.find((q) => q.id === dettaglio.id) || dettaglio}
          onChiudi={() => {
            setDettaglio(null)
            setFocus(null)
          }}
          onModifica={(q) => {
            setDettaglio(null)
            setModifica(q)
          }}
          onElimina={(q) => {
            setDettaglio(null)
            setDaEliminare(q)
          }}
          onConverti={(q) => {
            setDettaglio(null)
            setDaConvertire(q)
          }}
          onStato={async (q, nuovoStato) => {
            await azione(() => dataService.update('quotes', q.id, { stato: nuovoStato }), {
              successo: `Preventivo segnato come ${nuovoStato}.`,
            })
          }}
          onDuplica={async (q) => {
            const copia = {
              ...q,
              id: undefined,
              numero: dataService.prossimoNumero('quotes').numero,
              data: oggi,
              validoAl: addGiorni(oggi, settings.giorniValiditaPreventivo || 30),
              stato: 'bozza',
              jobId: null,
              righe: (q.righe || []).map((r) => ({ ...r, id: nuovaChiave() })),
            }
            delete copia.id
            await azione(() => dataService.insert('quotes', copia), { successo: 'Preventivo duplicato.' })
            setDettaglio(null)
          }}
          vaiA={vaiA}
        />
      )}

      <Conferma
        aperto={Boolean(daConvertire)}
        onChiudi={() => setDaConvertire(null)}
        titolo="Trasformare in scheda di lavoro?"
        messaggio={
          daConvertire
            ? `Verrà creata una nuova scheda con tutte le righe del preventivo ${daConvertire.numero}. I ricambi non vengono scaricati adesso: lo si fa quando si montano davvero.`
            : ''
        }
        etichettaOk="Crea la scheda"
        onConferma={async () => {
          const esito = await azione(() => dataService.preventivoInScheda(daConvertire.id), {
            successo: 'Scheda di lavoro creata dal preventivo.',
          })
          if (esito.ok) {
            toast('Apri la scheda dal modulo Schede di lavoro.', 'info')
            vaiA('schede', esito.esito.id)
          }
        }}
      />

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare il preventivo?"
        messaggio={daEliminare ? `Il preventivo ${daEliminare.numero} verrà rimosso.` : ''}
        etichettaOk="Elimina"
        pericoloso
        onConferma={async () => {
          if (daEliminare.jobId) throw new Error('Il preventivo è già stato convertito in scheda.')
          await azione(() => dataService.remove('quotes', daEliminare.id), { successo: 'Preventivo eliminato.' })
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Modulo di inserimento
 * ------------------------------------------------------------------ */

function FormPreventivo({ preventivo, onChiudi, onSalva }) {
  const { db, settings } = useApp()
  const [q, setQ] = useState(preventivo)
  const [inCorso, setInCorso] = useState(false)
  const set = (k) => (e) => setQ((x) => ({ ...x, [k]: e.target.value }))

  const veicoliCliente = db.vehicles.filter((v) => !q.customerId || v.customerId === q.customerId)
  const valido = q.customerId && (q.righe || []).length > 0

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={q.id ? `Preventivo ${q.numero}` : 'Nuovo preventivo'}
      larghezza="xl"
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
                await onSalva(q)
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
      <div className="space-y-6">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Campo etichetta="Numero">{(id) => <Input id={id} value={q.numero} onChange={set('numero')} />}</Campo>
          <Campo etichetta="Data">{(id) => <Input id={id} type="date" value={q.data} onChange={set('data')} />}</Campo>
          <Campo etichetta="Valido al">
            {(id) => <Input id={id} type="date" value={q.validoAl} onChange={set('validoAl')} />}
          </Campo>
          <Campo etichetta="Stato">
            {(id) => (
              <Select
                id={id}
                value={q.stato}
                onChange={set('stato')}
                opzioni={[
                  { valore: 'bozza', etichetta: 'Bozza' },
                  { valore: 'inviato', etichetta: 'Inviato' },
                  { valore: 'accettato', etichetta: 'Accettato' },
                  { valore: 'rifiutato', etichetta: 'Rifiutato' },
                  { valore: 'scaduto', etichetta: 'Scaduto' },
                ]}
              />
            )}
          </Campo>

          <Campo etichetta="Cliente" obbligatorio className="lg:col-span-2">
            {(id) => (
              <Select
                id={id}
                value={q.customerId}
                onChange={(e) => setQ((x) => ({ ...x, customerId: e.target.value, vehicleId: '' }))}
                vuoto="— seleziona —"
                opzioni={db.customers.map((c) => ({ valore: c.id, etichetta: nomeCliente(c) }))}
              />
            )}
          </Campo>
          <Campo etichetta="Veicolo">
            {(id) => (
              <Select
                id={id}
                value={q.vehicleId}
                onChange={set('vehicleId')}
                vuoto="— nessuno —"
                opzioni={veicoliCliente.map((v) => ({
                  valore: v.id,
                  etichetta: `${fmtTarga(v.targa)} — ${v.marca} ${v.modello}`,
                }))}
              />
            )}
          </Campo>
          <Campo etichetta="Tipo di intervento">
            {(id) => <Input id={id} value={q.tipoIntervento || ''} onChange={set('tipoIntervento')} placeholder="Freni, tagliando…" />}
          </Campo>
        </div>

        <RigheDocumento
          righe={q.righe || []}
          onChange={(righe) => setQ((x) => ({ ...x, righe }))}
          tariffe={settings.tariffe}
          articoli={db.articles}
          aliquote={settings.aliquote}
          ricaricoDefault={settings.ricaricoRicambi}
          scontoGlobale={q.scontoGlobale || 0}
          onScontoGlobale={(n) => setQ((x) => ({ ...x, scontoGlobale: n }))}
        />

        <Campo etichetta="Note per il cliente">
          {(id) => <Textarea id={id} value={q.note || ''} onChange={set('note')} righe={2} />}
        </Campo>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Dettaglio
 * ------------------------------------------------------------------ */

function DettaglioPreventivo({ preventivo: q, onChiudi, onModifica, onElimina, onConverti, onStato, onDuplica, vaiA }) {
  const { db, settings } = useApp()
  const cliente = db.customers.find((c) => c.id === q.customerId)
  const veicolo = db.vehicles.find((v) => v.id === q.vehicleId)
  const totali = totaliDocumento(q.righe || [], q.scontoGlobale || 0)
  const giorni = giorniTra(oggiIso(), q.validoAl)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={`Preventivo ${q.numero}`}
      sottotitolo={`${nomeCliente(cliente)}${veicolo ? ` · ${fmtTarga(veicolo.targa)}` : ''}`}
      larghezza="xl"
      piede={
        <>
          <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(q)}>
            Elimina
          </Button>
          <Button variante="fantasma" icona={Copy} misura="sm" onClick={() => onDuplica(q)}>
            Duplica
          </Button>
          <Button variante="fantasma" icona={Printer} misura="sm" onClick={() => window.print()}>
            Stampa
          </Button>
          <div className="grow" />
          {q.stato === 'bozza' && (
            <Button variante="contorno" icona={Send} onClick={() => onStato(q, 'inviato')}>
              Segna come inviato
            </Button>
          )}
          {['bozza', 'inviato'].includes(q.stato) && (
            <Button variante="fantasma" onClick={() => onStato(q, 'rifiutato')}>
              Rifiutato
            </Button>
          )}
          {!q.jobId && (
            <Button variante="primario" icona={ArrowRight} onClick={() => onConverti(q)}>
              Crea scheda
            </Button>
          )}
          {q.jobId && (
            <Button variante="primario" onClick={() => vaiA('schede', q.jobId)}>
              Apri la scheda
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatoBadge stato={q.stato} />
          {giorni !== null && ['bozza', 'inviato'].includes(q.stato) && (
            <Badge tono={giorni < 0 ? 'negativo' : giorni <= 7 ? 'attenzione' : 'neutro'}>
              {giorni < 0 ? `scaduto da ${-giorni} gg` : `valido ancora ${giorni} gg`}
            </Badge>
          )}
          {q.jobId && <Badge tono="positivo">Convertito in scheda</Badge>}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Data" valore={fmtData(q.data)} />
          <Dato etichetta="Valido al" valore={fmtData(q.validoAl)} />
          <Dato etichetta="Intervento" valore={q.tipoIntervento} />
          <Dato etichetta="Ore preventivate" valore={`${totali.ore} h`} />
        </dl>

        {q.note && <Avviso tipo="info">{q.note}</Avviso>}

        <RigheDocumento
          righe={q.righe || []}
          onChange={() => {}}
          tariffe={settings.tariffe}
          articoli={db.articles}
          aliquote={settings.aliquote}
          scontoGlobale={q.scontoGlobale || 0}
          soloLettura
        />

        <div className={cx('flex justify-end')}>
          <Button variante="contorno" icona={FileText} onClick={() => onModifica(q)}>
            Modifica le righe
          </Button>
        </div>
      </div>
    </Modal>
  )
}
