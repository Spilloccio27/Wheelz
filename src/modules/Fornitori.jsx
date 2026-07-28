/**
 * Fornitori: ricambisti, terzisti (officine esterne a cui si manda il lavoro
 * che non si fa in casa) e servizi.
 *
 * Le condizioni di pagamento e i tempi di consegna non sono anagrafica
 * decorativa: sono quello che decide se un pezzo si ordina qui o dall'altro.
 */

import { useMemo, useState } from 'react'
import { Building2, Clock, Package, Percent, Trash2, Truck } from 'lucide-react'
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
  filtraTesto,
} from '../components/ui.jsx'
import { arrotonda } from '../utils/calc.js'
import { data as fmtData, euro, numero } from '../utils/format.js'

const TIPI = [
  { valore: 'ricambista', etichetta: 'Ricambista' },
  { valore: 'terzista', etichetta: 'Terzista' },
  { valore: 'servizi', etichetta: 'Servizi' },
]

const VUOTO = {
  ragioneSociale: '',
  tipo: 'ricambista',
  piva: '',
  referente: '',
  telefono: '',
  email: '',
  indirizzo: '',
  citta: '',
  condizioniPagamento: '30 gg d.f.f.m.',
  scontoPraticato: 0,
  tempiConsegnaGiorni: 1,
  note: '',
  attivo: true,
}

export default function Fornitori() {
  const { db, azione, dataService } = useApp()
  const [cerca, setCerca] = useState('')
  const [tipo, setTipo] = useState(null)
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(null)
  const [daEliminare, setDaEliminare] = useState(null)

  const statistiche = useMemo(() => {
    const m = new Map()
    for (const s of db.suppliers) {
      m.set(s.id, {
        articoli: db.articles.filter((a) => a.supplierId === s.id).length,
        ordini: db.orders.filter((o) => o.supplierId === s.id).length,
        acquistato: arrotonda(
          db.expenses.filter((e) => e.supplierId === s.id).reduce((t, e) => t + Number(e.imponibile || 0), 0),
        ),
        daPagare: arrotonda(
          db.expenses
            .filter((e) => e.supplierId === s.id && e.stato === 'da_pagare')
            .reduce((t, e) => t + Number(e.imponibile || 0), 0),
        ),
      })
    }
    return m
  }, [db.suppliers, db.articles, db.orders, db.expenses])

  const filtrati = useMemo(() => {
    let righe = db.suppliers
    if (tipo) righe = righe.filter((s) => s.tipo === tipo)
    return filtraTesto(righe, cerca, ['ragioneSociale', 'referente', 'citta', 'piva', 'email'])
  }, [db.suppliers, cerca, tipo])

  const colonne = [
    {
      chiave: 'ragioneSociale',
      label: 'Fornitore',
      render: (s) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-8 w-8 rounded-lg bg-[var(--surface-3)] grid place-items-center shrink-0 text-[var(--ink-2)]">
            {s.tipo === 'terzista' ? <Building2 size={15} /> : <Truck size={15} />}
          </span>
          <div className="min-w-0">
            <p className="font-medium truncate">{s.ragioneSociale}</p>
            <p className="text-[11px] text-[var(--ink-3)] truncate">{s.citta || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      chiave: 'tipo',
      label: 'Tipo',
      render: (s) => <Badge tono={s.tipo === 'terzista' ? 'attenzione' : 'neutro'}>{TIPI.find((t) => t.valore === s.tipo)?.etichetta || s.tipo}</Badge>,
    },
    { chiave: 'referente', label: 'Referente', nascondiSuMobile: true },
    { chiave: 'condizioniPagamento', label: 'Pagamento', nascondiSuMobile: true },
    { chiave: 'scontoPraticato', label: 'Sconto', allinea: 'destra', render: (s) => (s.scontoPraticato ? `${numero(s.scontoPraticato, 0)}%` : '—') },
    { chiave: 'tempiConsegnaGiorni', label: 'Consegna', allinea: 'destra', render: (s) => `${s.tempiConsegnaGiorni} gg` },
    {
      chiave: 'articoli',
      label: 'Articoli',
      allinea: 'destra',
      valore: (s) => statistiche.get(s.id)?.articoli || 0,
    },
    {
      chiave: 'acquistato',
      label: 'Acquistato',
      allinea: 'destra',
      valore: (s) => statistiche.get(s.id)?.acquistato || 0,
      render: (s) => euro(statistiche.get(s.id)?.acquistato || 0, { decimali: 0 }),
    },
  ]

  return (
    <div>
      <TestataModulo
        titolo="Fornitori"
        conteggio={filtrati.length}
        cerca={cerca}
        onCerca={setCerca}
        segnaposto="Ragione sociale, referente o città…"
        azioni={
          <>
            <EsportaCsv nomeFile="fornitori" colonne={colonne} righe={filtrati} />
            <Nuovo onClick={() => setModifica({ ...VUOTO })}>Fornitore</Nuovo>
          </>
        }
      />

      <Filtri
        className="mb-4"
        valore={tipo}
        onChange={setTipo}
        opzioni={[
          { valore: null, etichetta: 'Tutti', conteggio: db.suppliers.length },
          ...TIPI.map((t) => ({
            ...t,
            conteggio: db.suppliers.filter((s) => s.tipo === t.valore).length,
          })),
        ]}
      />

      <Card padding={false}>
        <DataTable colonne={colonne} righe={filtrati} onRiga={setDettaglio} vuoto="Ancora nessun fornitore." />
      </Card>

      {modifica && (
        <FormFornitore
          fornitore={modifica}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const creazione = !valori.id
            await azione(
              () =>
                creazione
                  ? dataService.insert('suppliers', valori)
                  : dataService.update('suppliers', valori.id, valori),
              { successo: creazione ? 'Fornitore creato.' : 'Fornitore aggiornato.' },
            )
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioFornitore
          fornitore={db.suppliers.find((s) => s.id === dettaglio.id) || dettaglio}
          statistiche={statistiche.get(dettaglio.id)}
          onChiudi={() => setDettaglio(null)}
          onModifica={(s) => {
            setDettaglio(null)
            setModifica(s)
          }}
          onElimina={(s) => {
            setDettaglio(null)
            setDaEliminare(s)
          }}
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare il fornitore?"
        messaggio={
          daEliminare
            ? dataService.bloccoCancellazione('suppliers', daEliminare.id) ||
              `${daEliminare.ragioneSociale} verrà rimosso.`
            : ''
        }
        etichettaOk="Elimina"
        pericoloso
        onConferma={async () => {
          const blocco = dataService.bloccoCancellazione('suppliers', daEliminare.id)
          if (blocco) throw new Error(blocco)
          await azione(() => dataService.remove('suppliers', daEliminare.id), { successo: 'Fornitore eliminato.' })
        }}
      />
    </div>
  )
}

function FormFornitore({ fornitore, onChiudi, onSalva }) {
  const [s, setS] = useState(fornitore)
  const [inCorso, setInCorso] = useState(false)
  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.value }))

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={s.id ? 'Modifica fornitore' : 'Nuovo fornitore'}
      larghezza="md"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!s.ragioneSociale.trim()}
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
        <Campo etichetta="Ragione sociale" obbligatorio className="sm:col-span-2">
          {(id) => <Input id={id} value={s.ragioneSociale} onChange={set('ragioneSociale')} />}
        </Campo>
        <Campo etichetta="Tipo">
          {(id) => <Select id={id} value={s.tipo} onChange={set('tipo')} opzioni={TIPI} />}
        </Campo>
        <Campo etichetta="Partita IVA">
          {(id) => <Input id={id} value={s.piva} onChange={set('piva')} className="font-mono" />}
        </Campo>
        <Campo etichetta="Referente">{(id) => <Input id={id} value={s.referente} onChange={set('referente')} />}</Campo>
        <Campo etichetta="Telefono">{(id) => <Input id={id} type="tel" value={s.telefono} onChange={set('telefono')} />}</Campo>
        <Campo etichetta="Email" className="sm:col-span-2">
          {(id) => <Input id={id} type="email" value={s.email} onChange={set('email')} />}
        </Campo>
        <Campo etichetta="Indirizzo">{(id) => <Input id={id} value={s.indirizzo} onChange={set('indirizzo')} />}</Campo>
        <Campo etichetta="Città">{(id) => <Input id={id} value={s.citta} onChange={set('citta')} />}</Campo>
        <Campo etichetta="Condizioni di pagamento">
          {(id) => (
            <Select
              id={id}
              value={s.condizioniPagamento}
              onChange={set('condizioniPagamento')}
              opzioni={['Contanti', 'Bonifico a vista', '30 gg d.f.', '30 gg d.f.f.m.', '60 gg d.f.f.m.', '90 gg d.f.f.m.']}
            />
          )}
        </Campo>
        <Campo etichetta="Sconto praticato">
          {(id) => (
            <InputNumero id={id} valore={s.scontoPraticato} onChange={(n) => setS((x) => ({ ...x, scontoPraticato: n }))} decimali={0} suffisso="%" />
          )}
        </Campo>
        <Campo etichetta="Tempi di consegna">
          {(id) => (
            <InputNumero id={id} valore={s.tempiConsegnaGiorni} onChange={(n) => setS((x) => ({ ...x, tempiConsegnaGiorni: n }))} decimali={0} suffisso="gg" />
          )}
        </Campo>
        <Campo etichetta="Note" className="sm:col-span-2">
          {(id) => <Textarea id={id} value={s.note} onChange={set('note')} righe={2} />}
        </Campo>
      </div>
    </Modal>
  )
}

function DettaglioFornitore({ fornitore: s, statistiche, onChiudi, onModifica, onElimina }) {
  const { db, vaiA } = useApp()
  const articoli = db.articles.filter((a) => a.supplierId === s.id)
  const ordini = db.orders.filter((o) => o.supplierId === s.id)
  const spese = db.expenses.filter((e) => e.supplierId === s.id).slice(0, 10)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={s.ragioneSociale}
      sottotitolo={[s.citta, s.piva && `P.IVA ${s.piva}`].filter(Boolean).join(' · ')}
      larghezza="lg"
      piede={
        <>
          <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(s)}>
            Elimina
          </Button>
          <div className="grow" />
          <Button variante="fantasma" onClick={onChiudi}>
            Chiudi
          </Button>
          <Button variante="primario" onClick={() => onModifica(s)}>
            Modifica
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Articoli collegati" valore={statistiche?.articoli ?? 0} />
          <Dato etichetta="Ordini" valore={statistiche?.ordini ?? 0} />
          <Dato etichetta="Acquistato" valore={euro(statistiche?.acquistato || 0, { decimali: 0 })} />
          <Dato etichetta="Da pagare" valore={euro(statistiche?.daPagare || 0, { decimali: 0 })} />
        </dl>

        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Dato etichetta="Referente" valore={s.referente} />
          <Dato etichetta="Telefono" valore={s.telefono} />
          <Dato etichetta="Email" valore={s.email} />
          <Dato etichetta="Condizioni" valore={s.condizioniPagamento} />
          <Dato etichetta="Sconto" valore={`${numero(s.scontoPraticato, 0)}%`} />
          <Dato etichetta="Consegna" valore={`${s.tempiConsegnaGiorni} giorni`} />
        </dl>

        {s.note && <Avviso tipo="info" titolo="Note">{s.note}</Avviso>}

        <div>
          <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
            <Package size={15} className="text-accent-500" aria-hidden /> Articoli collegati
          </h4>
          {articoli.length ? (
            <DataTable
              denso
              massimo={10}
              colonne={[
                { chiave: 'codice', label: 'Codice', render: (a) => <span className="font-mono text-xs">{a.codice}</span> },
                { chiave: 'descrizione', label: 'Descrizione' },
                { chiave: 'giacenza', label: 'Giacenza', allinea: 'destra', render: (a) => numero(a.giacenza, 0) },
                { chiave: 'prezzoMedio', label: 'Costo medio', allinea: 'destra', render: (a) => euro(a.prezzoMedio) },
              ]}
              righe={articoli}
              onRiga={() => vaiA('magazzino')}
            />
          ) : (
            <Vuoto messaggio="Nessun articolo collegato." />
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
            <Clock size={15} className="text-accent-500" aria-hidden /> Ultimi ordini e spese
          </h4>
          {ordini.length || spese.length ? (
            <DataTable
              denso
              colonne={[
                { chiave: 'data', label: 'Data', valore: (r) => r.data || r.dataOrdine, render: (r) => fmtData(r.data || r.dataOrdine) },
                { chiave: 'descrizione', label: 'Documento', valore: (r) => r.descrizione || r.numero },
                { chiave: 'stato', label: 'Stato', render: (r) => <StatoBadge stato={r.stato} /> },
                {
                  chiave: 'importo',
                  label: 'Imponibile',
                  allinea: 'destra',
                  valore: (r) =>
                    r.imponibile ??
                    arrotonda((r.righe || []).reduce((t, x) => t + Number(x.quantita || 0) * Number(x.prezzo || 0), 0)),
                  render: (r) =>
                    euro(
                      r.imponibile ??
                        arrotonda((r.righe || []).reduce((t, x) => t + Number(x.quantita || 0) * Number(x.prezzo || 0), 0)),
                    ),
                },
              ]}
              righe={[...ordini, ...spese].slice(0, 12)}
              vuoto="Nessun documento."
            />
          ) : (
            <Vuoto messaggio="Nessun ordine né spesa collegata." icona={Percent} />
          )}
        </div>
      </div>
    </Modal>
  )
}
