/**
 * Clienti — privati e aziende, con i loro veicoli e il loro storico.
 *
 * La ricerca lavora insieme su nome, telefono e targa: in accettazione il
 * cliente si presenta con la macchina, e quasi sempre la targa è l'unica
 * cosa che si ha in mano.
 */

import { useMemo, useState } from 'react'
import { Building2, Car, Mail, Phone, Plus, Trash2, User, Wrench } from 'lucide-react'
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
  Modal,
  Nuovo,
  Select,
  StatoBadge,
  Textarea,
  TestataModulo,
  Vuoto,
  cx,
  filtraTesto,
} from '../components/ui.jsx'
import { totaliDocumento } from '../utils/calc.js'
import {
  chiaveRicerca,
  data as fmtData,
  euro,
  km as fmtKm,
  nomeCliente,
  targa as fmtTarga,
} from '../utils/format.js'

const VUOTO = {
  tipo: 'privato',
  nome: '',
  cognome: '',
  ragioneSociale: '',
  codiceFiscale: '',
  piva: '',
  sdi: '',
  pec: '',
  telefono: '',
  cellulare: '',
  email: '',
  indirizzo: '',
  cap: '',
  citta: '',
  provincia: '',
  note: '',
  attivo: true,
}

export default function Clienti() {
  const { db, azione, dataService, focus, setFocus, vaiA } = useApp()
  const [cerca, setCerca] = useState('')
  const [tipo, setTipo] = useState(null)
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(focus ? db.customers.find((c) => c.id === focus) : null)
  const [daEliminare, setDaEliminare] = useState(null)

  /** Indice targa → cliente, per far funzionare la ricerca sulla targa. */
  const targhePerCliente = useMemo(() => {
    const m = new Map()
    for (const v of db.vehicles) {
      m.set(v.customerId, `${m.get(v.customerId) || ''} ${v.targa} ${v.marca} ${v.modello}`)
    }
    return m
  }, [db.vehicles])

  const statistiche = useMemo(() => {
    const m = new Map()
    for (const f of db.invoices) {
      if (f.stato === 'annullata') continue
      const t = totaliDocumento(f.righe || [], f.scontoGlobale || 0)
      const s = m.get(f.customerId) || { speso: 0, fatture: 0, ultima: null }
      s.speso += t.imponibile
      s.fatture += 1
      if (!s.ultima || f.data > s.ultima) s.ultima = f.data
      m.set(f.customerId, s)
    }
    return m
  }, [db.invoices])

  const filtrati = useMemo(() => {
    let righe = db.customers
    if (tipo) righe = righe.filter((c) => c.tipo === tipo)
    return filtraTesto(righe, cerca, [
      (c) => nomeCliente(c),
      'telefono',
      'cellulare',
      'email',
      'citta',
      'piva',
      (c) => targhePerCliente.get(c.id) || '',
    ])
  }, [db.customers, cerca, tipo, targhePerCliente])

  const colonne = [
    {
      chiave: 'nome',
      label: 'Cliente',
      valore: (c) => chiaveRicerca(nomeCliente(c)),
      render: (c) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className={cx(
              'h-8 w-8 rounded-lg grid place-items-center shrink-0',
              c.tipo === 'azienda' ? 'bg-accent-500/12 text-accent-400' : 'bg-[var(--surface-3)] text-[var(--ink-2)]',
            )}
          >
            {c.tipo === 'azienda' ? <Building2 size={15} /> : <User size={15} />}
          </span>
          <div className="min-w-0">
            <p className="font-medium truncate">{nomeCliente(c)}</p>
            <p className="text-[11px] text-[var(--ink-3)] truncate">{c.citta || '—'}</p>
          </div>
        </div>
      ),
      csv: (c) => nomeCliente(c),
    },
    {
      chiave: 'contatti',
      label: 'Contatti',
      nascondiSuMobile: true,
      valore: (c) => c.cellulare || c.telefono || '',
      render: (c) => (
        <div className="text-xs space-y-0.5">
          {(c.cellulare || c.telefono) && (
            <p className="flex items-center gap-1.5 text-[var(--ink-2)]">
              <Phone size={11} aria-hidden /> {c.cellulare || c.telefono}
            </p>
          )}
          {c.email && (
            <p className="flex items-center gap-1.5 text-[var(--ink-3)] truncate max-w-[220px]">
              <Mail size={11} aria-hidden /> {c.email}
            </p>
          )}
        </div>
      ),
      csv: (c) => `${c.cellulare || c.telefono || ''} ${c.email || ''}`.trim(),
    },
    {
      chiave: 'veicoli',
      label: 'Veicoli',
      allinea: 'centro',
      valore: (c) => db.vehicles.filter((v) => v.customerId === c.id).length,
      render: (c) => {
        const n = db.vehicles.filter((v) => v.customerId === c.id).length
        return n ? <Badge>{n}</Badge> : <span className="text-[var(--ink-3)]">—</span>
      },
    },
    {
      chiave: 'speso',
      label: 'Spesa totale',
      allinea: 'destra',
      valore: (c) => statistiche.get(c.id)?.speso || 0,
      render: (c) => euro(statistiche.get(c.id)?.speso || 0, { decimali: 0 }),
    },
    {
      chiave: 'ultima',
      label: 'Ultimo passaggio',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (c) => statistiche.get(c.id)?.ultima || '',
      render: (c) => fmtData(statistiche.get(c.id)?.ultima),
    },
  ]

  return (
    <div>
      <TestataModulo
        titolo="Clienti"
        conteggio={filtrati.length}
        cerca={cerca}
        onCerca={setCerca}
        segnaposto="Nome, telefono o targa…"
        azioni={
          <>
            <EsportaCsv nomeFile="clienti" colonne={colonne} righe={filtrati} />
            <Nuovo onClick={() => setModifica({ ...VUOTO })}>Cliente</Nuovo>
          </>
        }
      />

      <Filtri
        className="mb-4"
        valore={tipo}
        onChange={setTipo}
        opzioni={[
          { valore: null, etichetta: 'Tutti', conteggio: db.customers.length },
          { valore: 'privato', etichetta: 'Privati', conteggio: db.customers.filter((c) => c.tipo === 'privato').length },
          { valore: 'azienda', etichetta: 'Aziende', conteggio: db.customers.filter((c) => c.tipo === 'azienda').length },
        ]}
      />

      <Card padding={false}>
        <DataTable
          colonne={colonne}
          righe={filtrati}
          onRiga={setDettaglio}
          vuoto={cerca ? 'Nessun cliente corrisponde alla ricerca.' : 'Ancora nessun cliente.'}
        />
      </Card>

      {modifica && (
        <FormCliente
          cliente={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const nuovo = !valori.id
            await azione(
              () =>
                nuovo
                  ? dataService.insert('customers', valori)
                  : dataService.update('customers', valori.id, valori),
              { successo: nuovo ? 'Cliente creato.' : 'Cliente aggiornato.' },
            )
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioCliente
          cliente={db.customers.find((c) => c.id === dettaglio.id) || dettaglio}
          onChiudi={() => {
            setDettaglio(null)
            setFocus(null)
          }}
          onModifica={(c) => {
            setDettaglio(null)
            setModifica(c)
          }}
          onElimina={(c) => {
            setDettaglio(null)
            setDaEliminare(c)
          }}
          vaiA={vaiA}
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare il cliente?"
        messaggio={
          daEliminare
            ? dataService.bloccoCancellazione('customers', daEliminare.id) ||
              `${nomeCliente(daEliminare)} verrà rimosso definitivamente.`
            : ''
        }
        etichettaOk="Elimina"
        pericoloso
        onConferma={async () => {
          const blocco = dataService.bloccoCancellazione('customers', daEliminare.id)
          if (blocco) throw new Error(blocco)
          await azione(() => dataService.remove('customers', daEliminare.id), {
            successo: 'Cliente eliminato.',
          })
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Modulo di inserimento
 * ------------------------------------------------------------------ */

function FormCliente({ cliente, onChiudi, onSalva }) {
  const [v, setV] = useState(cliente)
  const [inCorso, setInCorso] = useState(false)
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }))
  const azienda = v.tipo === 'azienda'

  const valido = azienda ? v.ragioneSociale.trim() : v.cognome.trim() || v.nome.trim()

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={v.id ? 'Modifica cliente' : 'Nuovo cliente'}
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
                await onSalva(v)
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
        <Filtri
          valore={v.tipo}
          onChange={(t) => setV((x) => ({ ...x, tipo: t }))}
          opzioni={[
            { valore: 'privato', etichetta: 'Privato' },
            { valore: 'azienda', etichetta: 'Azienda o ente' },
          ]}
        />

        <div className="grid sm:grid-cols-2 gap-3">
          {azienda ? (
            <Campo etichetta="Ragione sociale" obbligatorio className="sm:col-span-2">
              {(id) => <Input id={id} value={v.ragioneSociale} onChange={set('ragioneSociale')} />}
            </Campo>
          ) : (
            <>
              <Campo etichetta="Nome">{(id) => <Input id={id} value={v.nome} onChange={set('nome')} />}</Campo>
              <Campo etichetta="Cognome" obbligatorio>
                {(id) => <Input id={id} value={v.cognome} onChange={set('cognome')} />}
              </Campo>
            </>
          )}

          <Campo etichetta={azienda ? 'Partita IVA' : 'Codice fiscale'}>
            {(id) => (
              <Input
                id={id}
                value={azienda ? v.piva : v.codiceFiscale}
                onChange={set(azienda ? 'piva' : 'codiceFiscale')}
                className="font-mono uppercase"
              />
            )}
          </Campo>
          {azienda && (
            <Campo etichetta="Codice fiscale">
              {(id) => <Input id={id} value={v.codiceFiscale} onChange={set('codiceFiscale')} className="font-mono uppercase" />}
            </Campo>
          )}

          {azienda && (
            <>
              <Campo etichetta="Codice destinatario (SDI)" aiuto="Sette caratteri, oppure la PEC.">
                {(id) => <Input id={id} value={v.sdi} onChange={set('sdi')} className="font-mono uppercase" maxLength={7} />}
              </Campo>
              <Campo etichetta="PEC">{(id) => <Input id={id} type="email" value={v.pec} onChange={set('pec')} />}</Campo>
            </>
          )}

          <Campo etichetta="Cellulare">{(id) => <Input id={id} type="tel" value={v.cellulare} onChange={set('cellulare')} />}</Campo>
          <Campo etichetta="Telefono">{(id) => <Input id={id} type="tel" value={v.telefono} onChange={set('telefono')} />}</Campo>
          <Campo etichetta="Email" className="sm:col-span-2">
            {(id) => <Input id={id} type="email" value={v.email} onChange={set('email')} />}
          </Campo>

          <Campo etichetta="Indirizzo" className="sm:col-span-2">
            {(id) => <Input id={id} value={v.indirizzo} onChange={set('indirizzo')} />}
          </Campo>
          <Campo etichetta="CAP">{(id) => <Input id={id} value={v.cap} onChange={set('cap')} maxLength={5} />}</Campo>
          <div className="grid grid-cols-[1fr_90px] gap-3">
            <Campo etichetta="Città">{(id) => <Input id={id} value={v.citta} onChange={set('citta')} />}</Campo>
            <Campo etichetta="Prov.">
              {(id) => <Input id={id} value={v.provincia} onChange={set('provincia')} maxLength={2} className="uppercase" />}
            </Campo>
          </div>

          <Campo etichetta="Note" className="sm:col-span-2">
            {(id) => <Textarea id={id} value={v.note} onChange={set('note')} righe={2} />}
          </Campo>
        </div>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Scheda di dettaglio
 * ------------------------------------------------------------------ */

function DettaglioCliente({ cliente, onChiudi, onModifica, onElimina, vaiA }) {
  const { db } = useApp()

  const veicoli = db.vehicles.filter((v) => v.customerId === cliente.id)
  const schede = db.jobs.filter((j) => j.customerId === cliente.id)
  const fatture = db.invoices.filter((f) => f.customerId === cliente.id && f.stato !== 'annullata')
  const speso = fatture.reduce((s, f) => s + totaliDocumento(f.righe || [], f.scontoGlobale || 0).imponibile, 0)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={nomeCliente(cliente)}
      sottotitolo={[cliente.citta, cliente.piva && `P.IVA ${cliente.piva}`].filter(Boolean).join(' · ')}
      larghezza="lg"
      piede={
        <>
          <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(cliente)}>
            Elimina
          </Button>
          <div className="grow" />
          <Button variante="fantasma" onClick={onChiudi}>
            Chiudi
          </Button>
          <Button variante="primario" onClick={() => onModifica(cliente)}>
            Modifica
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Veicoli" valore={veicoli.length} />
          <Dato etichetta="Interventi" valore={schede.length} />
          <Dato etichetta="Spesa totale" valore={euro(speso, { decimali: 0 })} />
          <Dato etichetta="Fatture" valore={fatture.length} />
        </dl>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Dato etichetta="Cellulare" valore={cliente.cellulare} />
          <Dato etichetta="Telefono" valore={cliente.telefono} />
          <Dato etichetta="Email" valore={cliente.email} />
          <Dato etichetta="Indirizzo" valore={[cliente.indirizzo, cliente.cap, cliente.citta].filter(Boolean).join(', ')} className="sm:col-span-2" />
          {cliente.tipo === 'azienda' && <Dato etichetta="SDI" valore={cliente.sdi} mono />}
          {cliente.tipo === 'azienda' && <Dato etichetta="PEC" valore={cliente.pec} />}
          <Dato etichetta="Codice fiscale" valore={cliente.codiceFiscale} mono />
        </dl>

        {cliente.note && (
          <Avviso tipo="info" titolo="Note">
            {cliente.note}
          </Avviso>
        )}

        <div>
          <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
            <Car size={15} className="text-accent-500" aria-hidden /> Veicoli
          </h4>
          {veicoli.length ? (
            <ul className="grid sm:grid-cols-2 gap-2">
              {veicoli.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => vaiA('veicoli', v.id)}
                    className="w-full text-left rounded-xl border border-[var(--line)] p-3 hover:border-accent-500/50 transition-colors"
                  >
                    <p className="font-mono text-sm font-medium">{fmtTarga(v.targa)}</p>
                    <p className="text-xs text-[var(--ink-2)] mt-0.5 truncate">
                      {v.marca} {v.modello} {v.allestimento}
                    </p>
                    <p className="text-[11px] text-[var(--ink-3)] mt-1">
                      {v.anno} · {fmtKm(v.km)} · {v.alimentazione}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Vuoto messaggio="Nessun veicolo collegato." azione={<Button misura="sm" icona={Plus} onClick={() => vaiA('veicoli')}>Aggiungi veicolo</Button>} />
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
            <Wrench size={15} className="text-accent-500" aria-hidden /> Storico interventi
          </h4>
          {schede.length ? (
            <DataTable
              denso
              massimo={12}
              colonne={[
                { chiave: 'dataApertura', label: 'Data', render: (j) => fmtData(j.dataApertura) },
                { chiave: 'numero', label: 'Scheda' },
                {
                  chiave: 'veicolo',
                  label: 'Veicolo',
                  render: (j) => fmtTarga(db.vehicles.find((v) => v.id === j.vehicleId)?.targa),
                },
                { chiave: 'tipoIntervento', label: 'Intervento', nascondiSuMobile: true },
                { chiave: 'stato', label: 'Stato', render: (j) => <StatoBadge stato={j.stato} /> },
                {
                  chiave: 'importo',
                  label: 'Importo',
                  allinea: 'destra',
                  valore: (j) => {
                    const f = db.invoices.find((x) => x.id === j.invoiceId)
                    return f ? totaliDocumento(f.righe || [], f.scontoGlobale || 0).imponibile : 0
                  },
                  render: (j) => {
                    const f = db.invoices.find((x) => x.id === j.invoiceId)
                    if (j.garanzia) return <Badge tono="attenzione">Garanzia</Badge>
                    return f ? euro(totaliDocumento(f.righe || [], f.scontoGlobale || 0).imponibile) : '—'
                  },
                },
              ]}
              righe={schede}
              onRiga={(j) => vaiA('schede', j.id)}
            />
          ) : (
            <Vuoto messaggio="Nessun intervento registrato." />
          )}
        </div>
      </div>
    </Modal>
  )
}
