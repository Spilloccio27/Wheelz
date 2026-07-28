/**
 * Fatturazione e incassi.
 *
 * La fattura nasce dalla scheda di lavoro, con manodopera e ricambi su righe
 * distinte e l'IVA separata per aliquota. La numerazione è progressiva per
 * anno e viene calcolata dai documenti esistenti, non da un contatore a parte:
 * un contatore che si disallinea produce numeri doppi, e un numero doppio in
 * fattura è un guaio vero.
 *
 * Lo scarto rispetto a un gestionale fiscale completo è dichiarato: qui non si
 * genera il tracciato XML per lo SDI. Vedi il README, sezione "Estensioni".
 */

import { useMemo, useState } from 'react'
import { AlertTriangle, Banknote, Printer, Receipt, Trash2, Wallet } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import RigheDocumento from '../components/RigheDocumento.jsx'
import {
  Avviso,
  Badge,
  Barra,
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
  Select,
  StatoBadge,
  Tabs,
  Textarea,
  TestataModulo,
  Vuoto,
  filtraTesto,
} from '../components/ui.jsx'
import {
  arrotonda,
  fatturaScaduta,
  giorniScaduto,
  incassatoFattura,
  residuoFattura,
  totaliDocumento,
  totaleFattura,
} from '../utils/calc.js'
import {
  data as fmtData,
  euro,
  giorniTra,
  nomeCliente,
  oggiIso,
  percento,
  rangeMese,
  targa as fmtTarga,
} from '../utils/format.js'

const METODI = ['Contanti', 'POS', 'Bonifico', 'Assegno', 'Carta']

export default function Fatturazione() {
  const { db, periodo, focus } = useApp()
  const [tab, setTab] = useState('fatture')

  const { da, a } = rangeMese(periodo)

  const kpi = useMemo(() => {
    const delMese = db.invoices.filter((f) => f.data >= da && f.data <= a && f.stato !== 'annullata')
    const fatturato = arrotonda(
      delMese.reduce((s, f) => s + totaliDocumento(f.righe || [], f.scontoGlobale || 0).imponibile, 0),
    )
    const incassato = arrotonda(delMese.reduce((s, f) => s + incassatoFattura(f), 0))
    const scaduto = arrotonda(
      db.invoices.filter((f) => fatturaScaduta(f)).reduce((s, f) => s + residuoFattura(f), 0),
    )
    const aperto = arrotonda(
      db.invoices
        .filter((f) => f.stato !== 'annullata' && residuoFattura(f) > 0.01)
        .reduce((s, f) => s + residuoFattura(f), 0),
    )
    return { fatturato, incassato, scaduto, aperto, numero: delMese.length }
  }, [db.invoices, da, a])

  return (
    <div>
      <TestataModulo titolo="Fatturazione e incassi" descrizione="Numerazione progressiva per anno" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KPI etichetta="Fatturato del mese" valore={kpi.fatturato} formato={(v) => euro(v, { decimali: 0 })} icona={Receipt} dettaglio={`${kpi.numero} fatture`} />
        <KPI etichetta="Incassato nel mese" valore={kpi.incassato} formato={(v) => euro(v, { decimali: 0 })} icona={Wallet} />
        <KPI etichetta="Da incassare" valore={kpi.aperto} formato={(v) => euro(v, { decimali: 0 })} icona={Banknote} />
        <KPI
          etichetta="Scaduto"
          valore={kpi.scaduto}
          formato={(v) => euro(v, { decimali: 0 })}
          icona={AlertTriangle}
          dettaglio={kpi.scaduto > 0 ? 'oltre i termini' : 'nessun insoluto'}
        />
      </div>

      <Tabs
        className="mb-4"
        valore={tab}
        onChange={setTab}
        voci={[
          { valore: 'fatture', etichetta: 'Fatture', conteggio: db.invoices.length },
          {
            valore: 'scadenzario',
            etichetta: 'Scadenzario',
            conteggio: db.invoices.filter((f) => f.stato !== 'annullata' && residuoFattura(f) > 0.01).length,
          },
        ]}
      />

      {tab === 'fatture' ? <Fatture focus={focus} /> : <Scadenzario />}
    </div>
  )
}

/* ================================================================== *
 * Elenco fatture
 * ================================================================== */

function Fatture({ focus }) {
  const { db, azione, dataService, vaiA } = useApp()
  const [cerca, setCerca] = useState('')
  const [stato, setStato] = useState(null)
  const [dettaglio, setDettaglio] = useState(focus ? db.invoices.find((f) => f.id === focus) : null)
  const [incasso, setIncasso] = useState(null)
  const [daAnnullare, setDaAnnullare] = useState(null)

  const filtrate = useMemo(() => {
    let righe = db.invoices
    if (stato === 'scadute') righe = righe.filter((f) => fatturaScaduta(f))
    else if (stato) righe = righe.filter((f) => f.stato === stato)
    return filtraTesto(righe, cerca, [
      'numero',
      (f) => nomeCliente(db.customers.find((c) => c.id === f.customerId)),
      (f) => db.vehicles.find((v) => v.id === f.vehicleId)?.targa || '',
    ])
  }, [db.invoices, db.customers, db.vehicles, cerca, stato])

  const colonne = [
    { chiave: 'numero', label: 'Numero', render: (f) => <span className="font-medium">{f.numero}</span> },
    { chiave: 'data', label: 'Data', render: (f) => fmtData(f.data) },
    {
      chiave: 'cliente',
      label: 'Cliente',
      valore: (f) => nomeCliente(db.customers.find((c) => c.id === f.customerId)),
    },
    {
      chiave: 'veicolo',
      label: 'Veicolo',
      nascondiSuMobile: true,
      valore: (f) => db.vehicles.find((v) => v.id === f.vehicleId)?.targa || '',
      render: (f) => {
        const v = db.vehicles.find((x) => x.id === f.vehicleId)
        return v ? <span className="font-mono text-xs">{fmtTarga(v.targa)}</span> : '—'
      },
    },
    {
      chiave: 'imponibile',
      label: 'Imponibile',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (f) => totaliDocumento(f.righe || [], f.scontoGlobale || 0).imponibile,
      render: (f) => euro(totaliDocumento(f.righe || [], f.scontoGlobale || 0).imponibile),
    },
    { chiave: 'totale', label: 'Totale', allinea: 'destra', valore: totaleFattura, render: (f) => euro(totaleFattura(f)) },
    {
      chiave: 'residuo',
      label: 'Residuo',
      allinea: 'destra',
      valore: residuoFattura,
      render: (f) => {
        const r = residuoFattura(f)
        if (r <= 0.01) return <span className="text-[var(--ink-3)]">—</span>
        return <span style={fatturaScaduta(f) ? { color: 'var(--color-neg)', fontWeight: 500 } : undefined}>{euro(r)}</span>
      },
    },
    {
      chiave: 'scadenza',
      label: 'Scadenza',
      allinea: 'destra',
      nascondiSuMobile: true,
      render: (f) => {
        const gg = giorniScaduto(f)
        return (
          <span style={gg > 0 ? { color: 'var(--color-neg)' } : undefined}>
            {fmtData(f.scadenza)}
            {gg > 0 && <span className="block text-[11px]">da {gg} gg</span>}
          </span>
        )
      },
    },
    { chiave: 'stato', label: 'Stato', render: (f) => <StatoBadge stato={f.stato} /> },
  ]

  const conta = (s) => db.invoices.filter((f) => f.stato === s).length

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <Filtri
          className="grow min-w-0"
          valore={stato}
          onChange={setStato}
          opzioni={[
            { valore: null, etichetta: 'Tutte', conteggio: db.invoices.length },
            { valore: 'emessa', etichetta: 'Emesse', conteggio: conta('emessa') },
            { valore: 'parziale', etichetta: 'Acconto', conteggio: conta('parziale') },
            { valore: 'incassata', etichetta: 'Incassate', conteggio: conta('incassata') },
            { valore: 'scadute', etichetta: 'Scadute', conteggio: db.invoices.filter((f) => fatturaScaduta(f)).length },
            { valore: 'annullata', etichetta: 'Annullate', conteggio: conta('annullata') },
          ]}
        />
        <div className="flex items-center gap-2">
          <Input value={cerca} onChange={(e) => setCerca(e.target.value)} placeholder="Numero, cliente o targa…" className="lg:w-64" />
          <EsportaCsv nomeFile="fatture" colonne={colonne} righe={filtrate} />
        </div>
      </div>

      <Avviso tipo="info" className="mb-4">
        Le fatture si emettono dalla scheda di lavoro, chiudendola. Qui si consultano, si registrano
        gli incassi e si tiene d’occhio lo scaduto.
      </Avviso>

      <Card padding={false}>
        <DataTable
          colonne={colonne}
          righe={filtrate}
          onRiga={setDettaglio}
          rigaEvidenziata={(f) => fatturaScaduta(f)}
          vuoto={cerca ? 'Nessuna fattura trovata.' : 'Ancora nessuna fattura.'}
        />
      </Card>

      {dettaglio && (
        <DettaglioFattura
          fattura={db.invoices.find((f) => f.id === dettaglio.id) || dettaglio}
          onChiudi={() => setDettaglio(null)}
          onIncasso={(f) => {
            setDettaglio(null)
            setIncasso(f)
          }}
          onAnnulla={(f) => {
            setDettaglio(null)
            setDaAnnullare(f)
          }}
          vaiA={vaiA}
        />
      )}

      {incasso && (
        <FormIncasso
          fattura={incasso}
          onChiudi={() => setIncasso(null)}
          onSalva={async (valori) => {
            const esito = await azione(() => dataService.registraIncasso(incasso.id, valori), {
              successo: 'Incasso registrato.',
            })
            if (esito.ok) setIncasso(null)
          }}
        />
      )}

      <Conferma
        aperto={Boolean(daAnnullare)}
        onChiudi={() => setDaAnnullare(null)}
        titolo="Annullare la fattura?"
        messaggio={
          daAnnullare
            ? `La fattura ${daAnnullare.numero} verrà segnata come annullata. Il numero resta occupato: la numerazione progressiva non ammette buchi.`
            : ''
        }
        etichettaOk="Annulla la fattura"
        pericoloso
        onConferma={() =>
          azione(() => dataService.update('invoices', daAnnullare.id, { stato: 'annullata' }), {
            successo: 'Fattura annullata.',
          })
        }
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Dettaglio fattura
 * ------------------------------------------------------------------ */

function DettaglioFattura({ fattura: f, onChiudi, onIncasso, onAnnulla, vaiA }) {
  const { db, settings } = useApp()
  const cliente = db.customers.find((c) => c.id === f.customerId)
  const veicolo = db.vehicles.find((v) => v.id === f.vehicleId)
  const scheda = db.jobs.find((j) => j.id === f.jobId)
  const totali = totaliDocumento(f.righe || [], f.scontoGlobale || 0)
  const incassato = incassatoFattura(f)
  const residuo = residuoFattura(f)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={`Fattura ${f.numero}`}
      sottotitolo={`${nomeCliente(cliente)}${veicolo ? ` · ${fmtTarga(veicolo.targa)}` : ''}`}
      larghezza="xl"
      piede={
        <>
          {f.stato !== 'annullata' && !incassato && (
            <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onAnnulla(f)}>
              Annulla
            </Button>
          )}
          <Button variante="fantasma" icona={Printer} misura="sm" onClick={() => window.print()}>
            Stampa
          </Button>
          <div className="grow" />
          {scheda && (
            <Button variante="contorno" onClick={() => vaiA('schede', scheda.id)}>
              Apri scheda {scheda.numero}
            </Button>
          )}
          {residuo > 0.01 && f.stato !== 'annullata' && (
            <Button variante="primario" icona={Wallet} onClick={() => onIncasso(f)}>
              Registra incasso
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <StatoBadge stato={f.stato} />
          {fatturaScaduta(f) && <Badge tono="negativo">Scaduta da {giorniScaduto(f)} giorni</Badge>}
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Data" valore={fmtData(f.data)} />
          <Dato etichetta="Scadenza" valore={fmtData(f.scadenza)} />
          <Dato etichetta="Totale" valore={euro(totali.totale)} />
          <Dato etichetta="Residuo" valore={euro(residuo)} />
        </dl>

        {incassato > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-[var(--ink-2)]">Incassato</span>
              <span className="tabnum">
                {euro(incassato)} su {euro(totali.totale)} ({percento(incassato / (totali.totale || 1), 0)})
              </span>
            </div>
            <Barra quota={incassato / (totali.totale || 1)} colore="var(--color-pos)" altezza={8} />
          </div>
        )}

        <RigheDocumento
          righe={f.righe || []}
          onChange={() => {}}
          tariffe={settings.tariffe}
          articoli={db.articles}
          aliquote={settings.aliquote}
          scontoGlobale={f.scontoGlobale || 0}
          soloLettura
        />

        <div>
          <h4 className="text-sm font-semibold mb-2.5">Incassi registrati</h4>
          {(f.pagamenti || []).length ? (
            <DataTable
              denso
              colonne={[
                { chiave: 'data', label: 'Data', render: (p) => fmtData(p.data) },
                { chiave: 'metodo', label: 'Metodo' },
                { chiave: 'note', label: 'Note', nascondiSuMobile: true },
                { chiave: 'importo', label: 'Importo', allinea: 'destra', render: (p) => euro(p.importo) },
              ]}
              righe={f.pagamenti}
              chiaveRiga={(p) => p.id || `${p.data}-${p.importo}`}
              vuoto="Nessun incasso."
            />
          ) : (
            <Vuoto messaggio="Nessun incasso registrato." icona={Wallet} />
          )}
        </div>

        {f.note && <Avviso tipo="info" titolo="Note">{f.note}</Avviso>}
      </div>
    </Modal>
  )
}

function FormIncasso({ fattura, onChiudi, onSalva }) {
  const residuo = residuoFattura(fattura)
  const [v, setV] = useState({ importo: residuo, data: oggiIso(), metodo: 'Bonifico', note: '' })
  const [inCorso, setInCorso] = useState(false)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo="Registra incasso"
      sottotitolo={`Fattura ${fattura.numero} — residuo ${euro(residuo)}`}
      larghezza="sm"
      piede={
        <>
          <Button variante="fantasma" onClick={onChiudi}>
            Annulla
          </Button>
          <Button
            variante="primario"
            disabled={!v.importo || v.importo <= 0}
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
            Registra
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Campo etichetta="Importo" obbligatorio aiuto={v.importo < residuo ? 'Importo inferiore al residuo: verrà registrato come acconto.' : undefined}>
          {(id) => <InputNumero id={id} valore={v.importo} onChange={(n) => setV((x) => ({ ...x, importo: n }))} suffisso="€" />}
        </Campo>
        <Campo etichetta="Data">
          {(id) => <Input id={id} type="date" value={v.data} onChange={(e) => setV((x) => ({ ...x, data: e.target.value }))} />}
        </Campo>
        <Campo etichetta="Metodo di pagamento">
          {(id) => <Select id={id} value={v.metodo} onChange={(e) => setV((x) => ({ ...x, metodo: e.target.value }))} opzioni={METODI} />}
        </Campo>
        <Campo etichetta="Note">
          {(id) => <Textarea id={id} value={v.note} onChange={(e) => setV((x) => ({ ...x, note: e.target.value }))} righe={2} />}
        </Campo>
      </div>
    </Modal>
  )
}

/* ================================================================== *
 * Scadenzario
 * ================================================================== */

function Scadenzario() {
  const { db } = useApp()
  const oggi = oggiIso()

  const aperte = useMemo(
    () => db.invoices.filter((f) => f.stato !== 'annullata' && residuoFattura(f) > 0.01),
    [db.invoices],
  )

  const fasce = useMemo(() => {
    const out = {
      corrente: { etichetta: 'A scadere', importo: 0, righe: [] },
      f30: { etichetta: 'Scaduto 1-30 gg', importo: 0, righe: [] },
      f60: { etichetta: 'Scaduto 31-60 gg', importo: 0, righe: [] },
      f90: { etichetta: 'Scaduto oltre 60 gg', importo: 0, righe: [] },
    }
    for (const f of aperte) {
      const gg = giorniScaduto(f, oggi)
      const chiave = gg === 0 ? 'corrente' : gg <= 30 ? 'f30' : gg <= 60 ? 'f60' : 'f90'
      out[chiave].importo = arrotonda(out[chiave].importo + residuoFattura(f))
      out[chiave].righe.push(f)
    }
    return out
  }, [aperte, oggi])

  const perCliente = useMemo(() => {
    const m = new Map()
    for (const f of aperte) {
      const k = f.customerId
      const attuale = m.get(k) || { residuo: 0, scaduto: 0, fatture: 0 }
      attuale.residuo = arrotonda(attuale.residuo + residuoFattura(f))
      if (fatturaScaduta(f, oggi)) attuale.scaduto = arrotonda(attuale.scaduto + residuoFattura(f))
      attuale.fatture += 1
      m.set(k, attuale)
    }
    return [...m.entries()]
      .map(([customerId, v]) => ({ customerId, ...v }))
      .sort((a, b) => b.scaduto - a.scaduto || b.residuo - a.residuo)
  }, [aperte, oggi])

  const colonne = [
    {
      chiave: 'cliente',
      label: 'Cliente',
      valore: (r) => nomeCliente(db.customers.find((c) => c.id === r.customerId)),
    },
    { chiave: 'fatture', label: 'Fatture aperte', allinea: 'destra' },
    { chiave: 'residuo', label: 'Residuo', allinea: 'destra', render: (r) => euro(r.residuo) },
    {
      chiave: 'scaduto',
      label: 'Di cui scaduto',
      allinea: 'destra',
      render: (r) =>
        r.scaduto > 0 ? (
          <span style={{ color: 'var(--color-neg)', fontWeight: 500 }}>{euro(r.scaduto)}</span>
        ) : (
          <span className="text-[var(--ink-3)]">—</span>
        ),
    },
    {
      chiave: 'quota',
      label: 'Quota scaduta',
      allinea: 'destra',
      nascondiSuMobile: true,
      valore: (r) => (r.residuo ? r.scaduto / r.residuo : 0),
      render: (r) => (
        <div className="flex items-center gap-2 justify-end">
          <Barra quota={r.residuo ? r.scaduto / r.residuo : 0} colore="var(--color-neg)" className="w-16" />
          <span className="tabnum text-xs w-10">{percento(r.residuo ? r.scaduto / r.residuo : 0, 0)}</span>
        </div>
      ),
      csv: (r) => (r.residuo ? r.scaduto / r.residuo : 0),
    },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {Object.entries(fasce).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
            <p className="text-[11px] uppercase tracking-wide text-[var(--ink-3)] mb-1.5">{v.etichetta}</p>
            <p
              className="text-xl font-semibold tabnum"
              style={k !== 'corrente' && v.importo > 0 ? { color: 'var(--color-neg)' } : undefined}
            >
              {euro(v.importo, { decimali: 0 })}
            </p>
            <p className="text-xs text-[var(--ink-3)] mt-1">{v.righe.length} fatture</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end mb-3">
        <EsportaCsv nomeFile="scadenzario-clienti" colonne={colonne} righe={perCliente} />
      </div>

      <Card padding={false}>
        <DataTable
          colonne={colonne}
          righe={perCliente}
          chiaveRiga={(r) => r.customerId}
          ordineIniziale={{ chiave: 'scaduto', direzione: 'desc' }}
          rigaEvidenziata={(r) => r.scaduto > 0}
          vuoto="Nessuna fattura aperta: tutto incassato."
        />
      </Card>

      {aperte.length > 0 && (
        <Card className="mt-4">
          <h3 className="text-sm font-semibold mb-3">Fatture aperte, per scadenza</h3>
          <DataTable
            denso
            colonne={[
              { chiave: 'numero', label: 'Numero' },
              { chiave: 'data', label: 'Data', render: (f) => fmtData(f.data) },
              {
                chiave: 'cliente',
                label: 'Cliente',
                valore: (f) => nomeCliente(db.customers.find((c) => c.id === f.customerId)),
              },
              { chiave: 'scadenza', label: 'Scadenza', render: (f) => fmtData(f.scadenza) },
              {
                chiave: 'giorni',
                label: 'Giorni',
                allinea: 'destra',
                valore: (f) => giorniTra(oggi, f.scadenza),
                render: (f) => {
                  const g = giorniTra(oggi, f.scadenza)
                  return (
                    <span style={g < 0 ? { color: 'var(--color-neg)' } : undefined}>
                      {g < 0 ? `${-g} gg fa` : `tra ${g} gg`}
                    </span>
                  )
                },
              },
              { chiave: 'residuo', label: 'Residuo', allinea: 'destra', valore: residuoFattura, render: (f) => euro(residuoFattura(f)) },
            ]}
            righe={aperte}
            ordineIniziale={{ chiave: 'scadenza', direzione: 'asc' }}
            massimo={30}
          />
        </Card>
      )}
    </div>
  )
}
