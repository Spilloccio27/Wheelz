/**
 * Veicoli — parco macchine, scadenze e timeline degli interventi.
 *
 * Le scadenze sono la parte che porta lavoro in officina: revisione,
 * tagliando (a data o a chilometri), bollo, assicurazione, distribuzione.
 * Quelle in avvicinamento finiscono negli alert della dashboard.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Camera, Gauge, LayoutGrid, Rows3, Trash2, Wrench } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import storageService from '../data/storageService.js'
import { illustrazioneVeicolo } from '../utils/vehicleImage.js'
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
  data as fmtData,
  euro,
  giorniTra,
  km as fmtKm,
  nomeCliente,
  numero,
  oggiIso,
  targa as fmtTarga,
  targaKey,
} from '../utils/format.js'

const ALIMENTAZIONI = ['Benzina', 'Diesel', 'Benzina/GPL', 'Benzina/Metano', 'Ibrido', 'Elettrico']
const PNEUMATICI = ['Estivi', 'Invernali', 'Quattro stagioni']

const SCADENZE = [
  { campo: 'scadenzaRevisione', etichetta: 'Revisione' },
  { campo: 'prossimoTagliandoData', etichetta: 'Tagliando' },
  { campo: 'scadenzaBollo', etichetta: 'Bollo' },
  { campo: 'scadenzaAssicurazione', etichetta: 'Assicurazione' },
  { campo: 'scadenzaDistribuzione', etichetta: 'Distribuzione' },
]

const VUOTO = {
  customerId: '',
  targa: '',
  vin: '',
  marca: '',
  modello: '',
  allestimento: '',
  anno: new Date().getFullYear(),
  alimentazione: 'Diesel',
  cilindrata: 0,
  potenzaKw: 0,
  km: 0,
  colore: '',
  tipoPneumatici: 'Quattro stagioni',
  misuraPneumatici: '',
  codiceMotore: '',
  codiceChiave: '',
  scadenzaRevisione: '',
  scadenzaBollo: '',
  scadenzaAssicurazione: '',
  tagliandoData: '',
  tagliandoKm: 0,
  prossimoTagliandoData: '',
  prossimoTagliandoKm: 0,
  scadenzaDistribuzione: '',
  distribuzioneKm: 0,
  fotoPath: null,
  note: '',
  attivo: true,
}

/* ------------------------------------------------------------------ *
 * Foto
 * ------------------------------------------------------------------ */

/**
 * Foto del veicolo.
 *
 * Se ne è stata caricata una, si mostra quella: il percorso è nel database,
 * il file nel bucket privato, e l'URL firmato si chiede al momento. Altrimenti
 * si disegna una sagoma con la tinta registrata sul veicolo — nessuna
 * richiesta di rete, e il parco resta leggibile a colpo d'occhio.
 */
function FotoVeicolo({ veicolo, className, alt }) {
  const { scuro } = useApp()
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let vivo = true
    if (!veicolo?.fotoPath) {
      setUrl(null)
      return () => {
        vivo = false
      }
    }
    storageService
      .urlDi(veicolo.fotoPath)
      .then((u) => vivo && setUrl(u))
      .catch(() => vivo && setUrl(null))
    return () => {
      vivo = false
    }
  }, [veicolo?.fotoPath])

  const sorgente = url || illustrazioneVeicolo(veicolo, scuro)

  return (
    <img
      src={sorgente}
      alt={alt || `${veicolo?.marca || ''} ${veicolo?.modello || ''}`.trim() || 'Veicolo'}
      loading="lazy"
      className={cx('w-full h-full object-cover', className)}
    />
  )
}

export default function Veicoli() {
  const { db, settings, azione, dataService, focus, setFocus, vaiA } = useApp()
  const [cerca, setCerca] = useState('')
  const [filtro, setFiltro] = useState(null)
  // La griglia con le foto è la vista predefinita: in accettazione si
  // riconosce prima la macchina che il nome del cliente.
  const [vista, setVista] = useState('griglia')
  const [modifica, setModifica] = useState(null)
  const [dettaglio, setDettaglio] = useState(focus ? db.vehicles.find((v) => v.id === focus) : null)
  const [daEliminare, setDaEliminare] = useState(null)

  const oggi = oggiIso()
  const finestra = settings.giorniAlertScadenze || 30

  /** Prima scadenza utile del veicolo: è quella che conta in accettazione. */
  const prossimaScadenza = (v) => {
    let migliore = null
    for (const s of SCADENZE) {
      const g = giorniTra(oggi, v[s.campo])
      if (g === null) continue
      if (!migliore || g < migliore.giorni) migliore = { ...s, giorni: g, data: v[s.campo] }
    }
    return migliore
  }

  const inScadenza = (v) => {
    const p = prossimaScadenza(v)
    if (p && p.giorni <= finestra) return true
    return Boolean(v.prossimoTagliandoKm && Number(v.km) >= Number(v.prossimoTagliandoKm) - 1000)
  }

  const filtrati = useMemo(() => {
    let righe = db.vehicles
    if (filtro === 'scadenze') righe = righe.filter(inScadenza)
    if (filtro === 'aziende') {
      const aziende = new Set(db.customers.filter((c) => c.tipo === 'azienda').map((c) => c.id))
      righe = righe.filter((v) => aziende.has(v.customerId))
    }
    const q = cerca.trim()
    if (targaKey(q).length >= 3 && /^[A-Za-z0-9\s-]+$/.test(q)) {
      const k = targaKey(q)
      const perTarga = righe.filter((v) => targaKey(v.targa).includes(k))
      if (perTarga.length) return perTarga
    }
    return filtraTesto(righe, cerca, [
      'targa',
      'marca',
      'modello',
      'vin',
      (v) => nomeCliente(db.customers.find((c) => c.id === v.customerId)),
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.vehicles, db.customers, cerca, filtro, oggi, finestra])

  const colonne = [
    {
      chiave: 'targa',
      label: 'Targa',
      render: (v) => <span className="font-mono font-medium">{fmtTarga(v.targa)}</span>,
    },
    {
      chiave: 'veicolo',
      label: 'Veicolo',
      valore: (v) => `${v.marca} ${v.modello}`,
      render: (v) => (
        <div className="min-w-0">
          <p className="truncate">{v.marca} {v.modello}</p>
          <p className="text-[11px] text-[var(--ink-3)] truncate">{v.allestimento} · {v.anno}</p>
        </div>
      ),
    },
    {
      chiave: 'cliente',
      label: 'Cliente',
      nascondiSuMobile: true,
      valore: (v) => nomeCliente(db.customers.find((c) => c.id === v.customerId)),
    },
    { chiave: 'alimentazione', label: 'Alimentazione', nascondiSuMobile: true },
    { chiave: 'km', label: 'Km', allinea: 'destra', render: (v) => fmtKm(v.km) },
    {
      chiave: 'scadenza',
      label: 'Prossima scadenza',
      allinea: 'destra',
      valore: (v) => prossimaScadenza(v)?.giorni ?? 99999,
      render: (v) => {
        const p = prossimaScadenza(v)
        if (!p) return <span className="text-[var(--ink-3)]">—</span>
        const tono = p.giorni < 0 ? 'negativo' : p.giorni <= finestra ? 'attenzione' : 'neutro'
        return (
          <Badge tono={tono}>
            {p.etichetta} · {fmtData(p.data)}
          </Badge>
        )
      },
      csv: (v) => {
        const p = prossimaScadenza(v)
        return p ? `${p.etichetta} ${fmtData(p.data)}` : ''
      },
    },
  ]

  return (
    <div>
      <TestataModulo
        titolo="Veicoli"
        conteggio={filtrati.length}
        cerca={cerca}
        onCerca={setCerca}
        segnaposto="Targa, marca, modello o cliente…"
        azioni={
          <>
            <SelettoreVista valore={vista} onChange={setVista} />
            <EsportaCsv nomeFile="veicoli" colonne={colonne} righe={filtrati} />
            <Nuovo onClick={() => setModifica({ ...VUOTO })}>Veicolo</Nuovo>
          </>
        }
      />

      <Filtri
        className="mb-4"
        valore={filtro}
        onChange={setFiltro}
        opzioni={[
          { valore: null, etichetta: 'Tutti', conteggio: db.vehicles.length },
          { valore: 'scadenze', etichetta: 'In scadenza', conteggio: db.vehicles.filter(inScadenza).length },
          { valore: 'aziende', etichetta: 'Flotte aziendali' },
        ]}
      />

      {vista === 'griglia' ? (
        <GrigliaVeicoli
          veicoli={filtrati}
          onApri={setDettaglio}
          inScadenza={inScadenza}
          prossimaScadenza={prossimaScadenza}
          finestra={finestra}
          vuoto={cerca ? 'Nessun veicolo trovato.' : 'Ancora nessun veicolo.'}
        />
      ) : (
        <Card padding={false}>
          <DataTable
            colonne={colonne}
            righe={filtrati}
            onRiga={setDettaglio}
            rigaEvidenziata={(v) => inScadenza(v)}
            vuoto={cerca ? 'Nessun veicolo trovato.' : 'Ancora nessun veicolo.'}
          />
        </Card>
      )}

      {modifica && (
        <FormVeicolo
          veicolo={modifica}
          clienti={db.customers}
          onChiudi={() => setModifica(null)}
          onSalva={async (valori) => {
            const nuovo = !valori.id
            await azione(
              () =>
                nuovo
                  ? dataService.insert('vehicles', valori)
                  : dataService.update('vehicles', valori.id, valori),
              { successo: nuovo ? 'Veicolo creato.' : 'Veicolo aggiornato.' },
            )
            setModifica(null)
          }}
        />
      )}

      {dettaglio && (
        <DettaglioVeicolo
          veicolo={db.vehicles.find((v) => v.id === dettaglio.id) || dettaglio}
          onChiudi={() => {
            setDettaglio(null)
            setFocus(null)
          }}
          onModifica={(v) => {
            setDettaglio(null)
            setModifica(v)
          }}
          onElimina={(v) => {
            setDettaglio(null)
            setDaEliminare(v)
          }}
          vaiA={vaiA}
        />
      )}

      <Conferma
        aperto={Boolean(daEliminare)}
        onChiudi={() => setDaEliminare(null)}
        titolo="Eliminare il veicolo?"
        messaggio={
          daEliminare
            ? dataService.bloccoCancellazione('vehicles', daEliminare.id) ||
              `${fmtTarga(daEliminare.targa)} verrà rimosso definitivamente.`
            : ''
        }
        etichettaOk="Elimina"
        pericoloso
        onConferma={async () => {
          const blocco = dataService.bloccoCancellazione('vehicles', daEliminare.id)
          if (blocco) throw new Error(blocco)
          await azione(() => dataService.remove('vehicles', daEliminare.id), { successo: 'Veicolo eliminato.' })
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Griglia con le foto
 * ------------------------------------------------------------------ */

function SelettoreVista({ valore, onChange }) {
  const voci = [
    { id: 'griglia', icona: LayoutGrid, etichetta: 'Griglia con foto' },
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
              attivo
                ? 'bg-[var(--accent)] text-[var(--accent-ink)]'
                : 'text-[var(--ink-3)] hover:text-[var(--ink)]',
            )}
          >
            <Icona size={16} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

function GrigliaVeicoli({ veicoli, onApri, inScadenza, prossimaScadenza, finestra, vuoto }) {
  const { db } = useApp()

  if (!veicoli.length) return <Card><Vuoto messaggio={vuoto} /></Card>

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3 mf-scaglione">
      {veicoli.slice(0, 60).map((v, i) => {
        const cliente = db.customers.find((c) => c.id === v.customerId)
        const p = prossimaScadenza(v)
        const urgente = inScadenza(v)
        return (
          <button
            key={v.id}
            type="button"
            style={{ '--i': Math.min(i, 16) }}
            onClick={() => onApri(v)}
            className={cx(
              'premi group text-left vetro vetro-luce rounded-2xl overflow-hidden',
              'hover:border-[var(--line-forte)] focus-visible:border-[var(--line-forte)]',
            )}
          >
            <span className="block relative aspect-[16/9] overflow-hidden bg-[var(--surface-2)]">
              <FotoVeicolo
                veicolo={v}
                className="transition-transform duration-500 ease-out group-hover:scale-[1.04]"
              />
              {p && p.giorni <= finestra && (
                <span className="absolute top-2.5 right-2.5">
                  <Badge tono={p.giorni < 0 ? 'negativo' : 'attenzione'}>
                    {p.etichetta} {p.giorni < 0 ? 'scaduta' : `tra ${p.giorni} gg`}
                  </Badge>
                </span>
              )}
              {!v.fotoPath && (
                <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-[var(--ink-3)] bg-[var(--surface-3)] backdrop-blur px-1.5 py-0.5 rounded">
                  <Camera size={10} aria-hidden /> senza foto
                </span>
              )}
            </span>

            <span className="block p-3.5">
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-base font-semibold tracking-tight">
                  {fmtTarga(v.targa)}
                </span>
                <span className="text-[11px] text-[var(--ink-3)] tabnum shrink-0">{fmtKm(v.km)}</span>
              </span>
              <span className="block text-sm mt-1 truncate">
                {v.marca} {v.modello}
              </span>
              <span className="block text-xs text-[var(--ink-3)] mt-0.5 truncate">
                {nomeCliente(cliente)}
              </span>
            </span>

            {urgente && <span className="block h-0.5 bg-[var(--segno-warn)]" />}
          </button>
        )
      })}

      {veicoli.length > 60 && (
        <p className="sm:col-span-2 xl:col-span-3 2xl:col-span-4 text-xs text-[var(--ink-3)] text-center py-3">
          Mostrati 60 veicoli su {veicoli.length}. Restringi la ricerca oppure passa all’elenco.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Modulo di inserimento
 * ------------------------------------------------------------------ */

function FormVeicolo({ veicolo, clienti, onChiudi, onSalva }) {
  const { profilo, toast, demo } = useApp()
  const [v, setV] = useState(veicolo)
  const [inCorso, setInCorso] = useState(false)
  const [caricando, setCaricando] = useState(false)
  const inputFoto = useRef(null)
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.value }))
  const setNum = (k) => (n) => setV((x) => ({ ...x, [k]: n }))

  const valido = v.targa.trim().length >= 5 && v.customerId && v.marca.trim()

  /**
   * La foto si carica subito, prima ancora che il veicolo esista.
   *
   * Il percorso nel bucket porta già data e casuale, quindi non ha bisogno
   * dell'identificativo del veicolo per essere unico: si può scattare la foto
   * mentre si compila il modulo, che è l'ordine in cui le cose succedono
   * davvero in accettazione — prima si guarda la macchina, poi si scrive.
   */
  const caricaFoto = async (file) => {
    if (!file) return
    setCaricando(true)
    try {
      const esito = await storageService.carica(file, {
        officinaId: profilo?.officinaId || 'demo',
        cartella: 'veicoli',
        latoMax: 1400,
      })
      setV((x) => ({ ...x, fotoPath: esito.path }))
      toast('Foto pronta. Verrà salvata con il veicolo.')
    } catch (e) {
      toast(e?.message || 'Caricamento non riuscito.', 'errore')
    } finally {
      setCaricando(false)
      if (inputFoto.current) inputFoto.current.value = ''
    }
  }

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={v.id ? `Modifica ${fmtTarga(v.targa)}` : 'Nuovo veicolo'}
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
                await onSalva({ ...v, targa: v.targa.toUpperCase().replace(/\s/g, '') })
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
        {/* La foto in cima, prima dei dati: in accettazione si guarda la
            macchina e poi si scrive, non il contrario. */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative w-full sm:w-64 shrink-0 aspect-[16/9] rounded-xl overflow-hidden border border-[var(--line)] bg-[var(--surface-2)]">
            <FotoVeicolo veicolo={v} alt="Foto del veicolo" />
          </div>
          <div className="min-w-0 grow flex flex-col justify-center gap-2">
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => caricaFoto(e.target.files?.[0])}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                icona={Camera}
                caricamento={caricando}
                onClick={() => inputFoto.current?.click()}
              >
                {v.fotoPath ? 'Sostituisci foto' : 'Scatta o carica foto'}
              </Button>
              {v.fotoPath && (
                <Button variante="fantasma" onClick={() => setV((x) => ({ ...x, fotoPath: null }))}>
                  Rimuovi
                </Button>
              )}
            </div>
            <p className="text-xs text-[var(--ink-3)] leading-relaxed">
              {v.fotoPath
                ? 'Foto caricata. Viene salvata insieme al veicolo.'
                : 'Senza foto la scheda mostra una sagoma con il colore che registri qui sotto. Dal telefono il pulsante apre direttamente la fotocamera.'}
              {demo && ' In demo la foto resta nella memoria del browser.'}
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Campo etichetta="Cliente" obbligatorio>
            {(id) => (
              <Select
                id={id}
                value={v.customerId}
                onChange={set('customerId')}
                vuoto="— seleziona —"
                opzioni={clienti.map((c) => ({ valore: c.id, etichetta: nomeCliente(c) }))}
              />
            )}
          </Campo>
          <Campo etichetta="Targa" obbligatorio>
            {(id) => (
              <Input id={id} value={v.targa} onChange={set('targa')} className="font-mono uppercase" maxLength={10} />
            )}
          </Campo>
          <Campo etichetta="Marca" obbligatorio>{(id) => <Input id={id} value={v.marca} onChange={set('marca')} />}</Campo>
          <Campo etichetta="Modello">{(id) => <Input id={id} value={v.modello} onChange={set('modello')} />}</Campo>
          <Campo etichetta="Allestimento" className="sm:col-span-2">
            {(id) => <Input id={id} value={v.allestimento} onChange={set('allestimento')} placeholder="1.6 TDI Comfortline" />}
          </Campo>
          <Campo etichetta="Telaio (VIN)">
            {(id) => <Input id={id} value={v.vin} onChange={set('vin')} className="font-mono uppercase" maxLength={17} />}
          </Campo>
          <Campo etichetta="Anno">{(id) => <InputNumero id={id} valore={v.anno} onChange={setNum('anno')} decimali={0} />}</Campo>
          <Campo etichetta="Alimentazione">
            {(id) => <Select id={id} value={v.alimentazione} onChange={set('alimentazione')} opzioni={ALIMENTAZIONI} />}
          </Campo>
          <Campo etichetta="Colore">{(id) => <Input id={id} value={v.colore} onChange={set('colore')} />}</Campo>
          <Campo etichetta="Cilindrata" >
            {(id) => <InputNumero id={id} valore={v.cilindrata} onChange={setNum('cilindrata')} decimali={0} suffisso="cc" />}
          </Campo>
          <Campo etichetta="Potenza">
            {(id) => <InputNumero id={id} valore={v.potenzaKw} onChange={setNum('potenzaKw')} decimali={0} suffisso="kW" />}
          </Campo>
          <Campo etichetta="Chilometri attuali">
            {(id) => <InputNumero id={id} valore={v.km} onChange={setNum('km')} decimali={0} suffisso="km" />}
          </Campo>
          <Campo etichetta="Codice motore">
            {(id) => <Input id={id} value={v.codiceMotore} onChange={set('codiceMotore')} className="font-mono" />}
          </Campo>
          <Campo etichetta="Codice chiave">
            {(id) => <Input id={id} value={v.codiceChiave} onChange={set('codiceChiave')} className="font-mono" />}
          </Campo>
          <Campo etichetta="Pneumatici">
            {(id) => <Select id={id} value={v.tipoPneumatici} onChange={set('tipoPneumatici')} opzioni={PNEUMATICI} />}
          </Campo>
          <Campo etichetta="Misura pneumatici">
            {(id) => <Input id={id} value={v.misuraPneumatici} onChange={set('misuraPneumatici')} placeholder="195/65 R15" />}
          </Campo>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <CalendarClock size={15} className="text-accent-500" aria-hidden /> Scadenze
          </h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Campo etichetta="Revisione">{(id) => <Input id={id} type="date" value={v.scadenzaRevisione || ''} onChange={set('scadenzaRevisione')} />}</Campo>
            <Campo etichetta="Bollo">{(id) => <Input id={id} type="date" value={v.scadenzaBollo || ''} onChange={set('scadenzaBollo')} />}</Campo>
            <Campo etichetta="Assicurazione">{(id) => <Input id={id} type="date" value={v.scadenzaAssicurazione || ''} onChange={set('scadenzaAssicurazione')} />}</Campo>
            <Campo etichetta="Ultimo tagliando">{(id) => <Input id={id} type="date" value={v.tagliandoData || ''} onChange={set('tagliandoData')} />}</Campo>
            <Campo etichetta="Km ultimo tagliando">
              {(id) => <InputNumero id={id} valore={v.tagliandoKm} onChange={setNum('tagliandoKm')} decimali={0} suffisso="km" />}
            </Campo>
            <Campo etichetta="Prossimo tagliando (data)" aiuto="Vale la prima che scatta fra data e chilometri.">
              {(id) => <Input id={id} type="date" value={v.prossimoTagliandoData || ''} onChange={set('prossimoTagliandoData')} />}
            </Campo>
            <Campo etichetta="Prossimo tagliando (km)">
              {(id) => <InputNumero id={id} valore={v.prossimoTagliandoKm} onChange={setNum('prossimoTagliandoKm')} decimali={0} suffisso="km" />}
            </Campo>
            <Campo etichetta="Distribuzione (data)">{(id) => <Input id={id} type="date" value={v.scadenzaDistribuzione || ''} onChange={set('scadenzaDistribuzione')} />}</Campo>
            <Campo etichetta="Distribuzione (km)">
              {(id) => <InputNumero id={id} valore={v.distribuzioneKm} onChange={setNum('distribuzioneKm')} decimali={0} suffisso="km" />}
            </Campo>
          </div>
        </div>

        <Campo etichetta="Note">{(id) => <Textarea id={id} value={v.note} onChange={set('note')} righe={2} />}</Campo>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * Dettaglio
 * ------------------------------------------------------------------ */

function DettaglioVeicolo({ veicolo, onChiudi, onModifica, onElimina, vaiA }) {
  const { db, settings, azione, dataService, profilo, toast, demo } = useApp()
  const oggi = oggiIso()
  const inputFoto = useRef(null)
  const [caricando, setCaricando] = useState(false)

  const caricaFoto = async (file) => {
    if (!file) return
    setCaricando(true)
    try {
      const esito = await storageService.carica(file, {
        officinaId: profilo?.officinaId || 'demo',
        cartella: `veicoli/${veicolo.id}`,
        latoMax: 1400,
      })
      // Nel database va solo il percorso: il file resta nel bucket privato.
      await dataService.update('vehicles', veicolo.id, { fotoPath: esito.path })
      toast('Foto aggiornata.')
    } catch (e) {
      toast(e?.message || 'Caricamento non riuscito.', 'errore')
    } finally {
      setCaricando(false)
      if (inputFoto.current) inputFoto.current.value = ''
    }
  }

  const rimuoviFoto = () =>
    azione(
      async () => {
        if (veicolo.fotoPath) await storageService.elimina(veicolo.fotoPath)
        return dataService.update('vehicles', veicolo.id, { fotoPath: null })
      },
      { successo: 'Foto rimossa.' },
    )

  const cliente = db.customers.find((c) => c.id === veicolo.customerId)
  const schede = db.jobs
    .filter((j) => j.vehicleId === veicolo.id)
    .sort((a, b) => (b.dataApertura || '').localeCompare(a.dataApertura || ''))

  const importoDi = (j) => {
    const f = db.invoices.find((x) => x.id === j.invoiceId)
    return f ? totaliDocumento(f.righe || [], f.scontoGlobale || 0).imponibile : null
  }

  const totale = schede.reduce((s, j) => s + (importoDi(j) || 0), 0)

  return (
    <Modal
      aperto
      onChiudi={onChiudi}
      titolo={fmtTarga(veicolo.targa)}
      sottotitolo={`${veicolo.marca} ${veicolo.modello} ${veicolo.allestimento || ''} · ${nomeCliente(cliente)}`}
      larghezza="lg"
      piede={
        <>
          <Button variante="pericolo" icona={Trash2} misura="sm" onClick={() => onElimina(veicolo)}>
            Elimina
          </Button>
          <div className="grow" />
          <Button variante="fantasma" onClick={onChiudi}>
            Chiudi
          </Button>
          <Button variante="primario" onClick={() => onModifica(veicolo)}>
            Modifica
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <div className="relative rounded-2xl overflow-hidden border border-[var(--line)] aspect-[16/9] sm:aspect-[21/9] bg-[var(--surface-2)] mf-scala">
          <FotoVeicolo veicolo={veicolo} alt={`${veicolo.marca} ${veicolo.modello} — ${veicolo.targa}`} />
          <input
            ref={inputFoto}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => caricaFoto(e.target.files?.[0])}
          />
          <div className="absolute bottom-3 right-3 flex gap-2">
            {veicolo.fotoPath && (
              <Button misura="sm" variante="secondario" onClick={rimuoviFoto}>
                Rimuovi
              </Button>
            )}
            <Button
              misura="sm"
              variante="secondario"
              icona={Camera}
              caricamento={caricando}
              onClick={() => inputFoto.current?.click()}
            >
              {veicolo.fotoPath ? 'Sostituisci foto' : 'Scatta o carica foto'}
            </Button>
          </div>
        </div>

        {demo && !veicolo.fotoPath && (
          <p className="text-xs text-[var(--ink-3)] -mt-3">
            L’immagine è una sagoma generata dal colore registrato sul veicolo. Caricando una foto
            vera prende il suo posto — in demo resta nella memoria del browser.
          </p>
        )}

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Chilometri" valore={fmtKm(veicolo.km)} />
          <Dato etichetta="Anno" valore={veicolo.anno} />
          <Dato etichetta="Alimentazione" valore={veicolo.alimentazione} />
          <Dato etichetta="Cilindrata" valore={veicolo.cilindrata ? `${numero(veicolo.cilindrata, 0)} cc` : '—'} />
          <Dato etichetta="Potenza" valore={veicolo.potenzaKw ? `${veicolo.potenzaKw} kW` : '—'} />
          <Dato etichetta="Telaio" valore={veicolo.vin} mono />
          <Dato etichetta="Codice motore" valore={veicolo.codiceMotore} mono />
          <Dato etichetta="Pneumatici" valore={[veicolo.tipoPneumatici, veicolo.misuraPneumatici].filter(Boolean).join(' · ')} />
        </dl>

        <div>
          <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
            <CalendarClock size={15} className="text-accent-500" aria-hidden /> Scadenze
          </h4>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SCADENZE.map((s) => {
              const valore = veicolo[s.campo]
              const g = giorniTra(oggi, valore)
              const tono = g === null ? 'neutro' : g < 0 ? 'negativo' : g <= (settings.giorniAlertScadenze || 30) ? 'attenzione' : 'positivo'
              return (
                <div key={s.campo} className="rounded-xl border border-[var(--line)] p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--ink-3)]">{s.etichetta}</p>
                    <p className="text-sm font-medium">{fmtData(valore)}</p>
                  </div>
                  {g !== null && (
                    <Badge tono={tono}>{g < 0 ? `scaduta da ${-g} gg` : `${g} gg`}</Badge>
                  )}
                </div>
              )
            })}
            {Boolean(veicolo.prossimoTagliandoKm) && (
              <div className="rounded-xl border border-[var(--line)] p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-[var(--ink-3)]">Tagliando a km</p>
                  <p className="text-sm font-medium">{fmtKm(veicolo.prossimoTagliandoKm)}</p>
                </div>
                <Badge tono={Number(veicolo.km) >= Number(veicolo.prossimoTagliandoKm) ? 'negativo' : 'neutro'}>
                  {numero(Math.max(0, veicolo.prossimoTagliandoKm - veicolo.km), 0)} km
                </Badge>
              </div>
            )}
          </div>
        </div>

        {veicolo.note && <Avviso tipo="info" titolo="Note">{veicolo.note}</Avviso>}

        <div>
          <h4 className="text-sm font-semibold mb-2.5 flex items-center gap-2">
            <Wrench size={15} className="text-accent-500" aria-hidden />
            Timeline interventi
            <span className="ml-auto text-xs font-normal text-[var(--ink-3)]">
              {schede.length} passaggi · {euro(totale, { decimali: 0 })}
            </span>
          </h4>
          {schede.length ? (
            <ol className="relative pl-5 border-l border-[var(--line)] space-y-3">
              {schede.map((j) => {
                const importo = importoDi(j)
                return (
                  <li key={j.id} className="relative">
                    <span
                      className={cx(
                        'absolute -left-[25px] top-2 w-2.5 h-2.5 rounded-full border-2 border-[var(--surface)]',
                        j.garanzia ? 'bg-[var(--color-warn)]' : 'bg-accent-500',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => vaiA('schede', j.id)}
                      className="w-full text-left rounded-xl border border-[var(--line)] p-3 hover:border-accent-500/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-[var(--ink-3)] tabnum">{fmtData(j.dataApertura)}</span>
                        <span className="text-sm font-medium">{j.tipoIntervento}</span>
                        <StatoBadge stato={j.stato} />
                        {j.garanzia && <Badge tono="attenzione">Garanzia</Badge>}
                        <span className="ml-auto text-sm tabnum font-medium">
                          {importo !== null ? euro(importo) : '—'}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--ink-2)] mt-1.5 line-clamp-2">{j.difetto}</p>
                      <p className="text-[11px] text-[var(--ink-3)] mt-1 flex items-center gap-1.5">
                        <Gauge size={11} aria-hidden /> {fmtKm(j.kmIngresso)} · scheda {j.numero}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ol>
          ) : (
            <Vuoto messaggio="Nessun intervento registrato su questo veicolo." />
          )}
        </div>
      </div>
    </Modal>
  )
}
