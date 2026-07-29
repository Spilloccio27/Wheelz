/**
 * Impostazioni: dati dell'officina, tariffe, listini, obiettivi, utenti.
 *
 * Le tariffe orarie e il ricarico ricambi non sono preferenze: entrano nei
 * calcoli di ogni preventivo e di ogni scheda. Cambiarle qui cambia i numeri
 * dei documenti nuovi, non di quelli già emessi — le righe portano con sé la
 * tariffa applicata al momento.
 */

import { useMemo, useRef, useState } from 'react'
import {
  Building2,
  Download,
  Image as ImageIcon,
  KeyRound,
  Percent,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  UserPlus,
  Wrench,
} from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import authService, { RUOLI } from '../data/authService.js'
import storageService from '../data/storageService.js'
import {
  Avviso,
  Badge,
  Button,
  Campo,
  Card,
  CardHeader,
  Conferma,
  DataTable,
  Dato,
  Input,
  InputNumero,
  Modal,
  Select,
  Tabs,
  Textarea,
  TestataModulo,
  Vuoto,
  cx,
} from '../components/ui.jsx'
import { arrotonda, prezzoVenditaConsigliato } from '../utils/calc.js'
import { data as fmtData, euro, numero, percento } from '../utils/format.js'

export default function Impostazioni() {
  const [tab, setTab] = useState('officina')

  return (
    <div>
      <TestataModulo titolo="Impostazioni" descrizione="Configurazione dell’officina e degli utenti" />

      <Tabs
        className="mb-5"
        valore={tab}
        onChange={setTab}
        voci={[
          { valore: 'officina', etichetta: 'Officina' },
          { valore: 'tariffe', etichetta: 'Tariffe e listini' },
          { valore: 'obiettivi', etichetta: 'Obiettivi' },
          { valore: 'utenti', etichetta: 'Utenti e ruoli' },
          { valore: 'sistema', etichetta: 'Dati e sistema' },
        ]}
      />

      {tab === 'officina' && <DatiOfficina />}
      {tab === 'tariffe' && <Tariffe />}
      {tab === 'obiettivi' && <Obiettivi />}
      {tab === 'utenti' && <Utenti />}
      {tab === 'sistema' && <Sistema />}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * Salvataggio comune
 * ------------------------------------------------------------------ */

function useImpostazioni() {
  const { settings, azione, dataService } = useApp()
  const [bozza, setBozza] = useState(settings)
  const [inCorso, setInCorso] = useState(false)

  const sporco = useMemo(() => JSON.stringify(bozza) !== JSON.stringify(settings), [bozza, settings])

  const salva = async () => {
    setInCorso(true)
    try {
      await azione(() => dataService.updateSettings(bozza), { successo: 'Impostazioni salvate.' })
    } finally {
      setInCorso(false)
    }
  }

  return { bozza, setBozza, sporco, salva, inCorso, settings }
}

function BarraSalva({ sporco, salva, inCorso, onAnnulla }) {
  if (!sporco) return null
  return (
    <div className="sticky bottom-4 z-10 mt-5 flex justify-end gap-2">
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-xl px-3 py-2.5 flex items-center gap-3">
        <span className="text-xs text-[var(--ink-2)]">Ci sono modifiche non salvate</span>
        <Button misura="sm" variante="fantasma" onClick={onAnnulla}>
          Annulla
        </Button>
        <Button misura="sm" variante="primario" caricamento={inCorso} onClick={salva}>
          Salva
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * Dati officina
 * ================================================================== */

function DatiOfficina() {
  const { bozza, setBozza, sporco, salva, inCorso, settings } = useImpostazioni()
  const { profilo, toast, demo } = useApp()
  const [logoUrl, setLogoUrl] = useState(null)
  const [caricando, setCaricando] = useState(false)
  const input = useRef(null)
  const set = (k) => (e) => setBozza((x) => ({ ...x, [k]: e.target.value }))

  const caricaLogo = async (file) => {
    if (!file) return
    setCaricando(true)
    try {
      const esito = await storageService.caricaLogo(file, profilo?.officinaId || 'demo')
      setBozza((x) => ({ ...x, logoPath: esito.path }))
      setLogoUrl(await storageService.urlDi(esito.path, storageService.BUCKET_LOGHI))
      toast('Logo caricato. Ricordati di salvare.')
    } catch (e) {
      toast(e?.message || 'Caricamento non riuscito.', 'errore')
    } finally {
      setCaricando(false)
    }
  }

  return (
    <div>
      <div className="grid xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader titolo="Anagrafica" sottotitolo="Compare nelle stampe e nei documenti" icona={Building2} />
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo etichetta="Ragione sociale" obbligatorio className="sm:col-span-2">
              {(id) => <Input id={id} value={bozza.ragioneSociale || ''} onChange={set('ragioneSociale')} />}
            </Campo>
            <Campo etichetta="Partita IVA">
              {(id) => <Input id={id} value={bozza.piva || ''} onChange={set('piva')} className="font-mono" />}
            </Campo>
            <Campo etichetta="Codice fiscale">
              {(id) => <Input id={id} value={bozza.codiceFiscale || ''} onChange={set('codiceFiscale')} className="font-mono" />}
            </Campo>
            <Campo etichetta="Numero REA">{(id) => <Input id={id} value={bozza.rea || ''} onChange={set('rea')} />}</Campo>
            <Campo etichetta="IBAN">
              {(id) => <Input id={id} value={bozza.iban || ''} onChange={set('iban')} className="font-mono text-xs" />}
            </Campo>
            <Campo etichetta="Indirizzo" className="sm:col-span-2">
              {(id) => <Input id={id} value={bozza.indirizzo || ''} onChange={set('indirizzo')} />}
            </Campo>
            <Campo etichetta="CAP">{(id) => <Input id={id} value={bozza.cap || ''} onChange={set('cap')} maxLength={5} />}</Campo>
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <Campo etichetta="Città">{(id) => <Input id={id} value={bozza.citta || ''} onChange={set('citta')} />}</Campo>
              <Campo etichetta="Prov.">
                {(id) => <Input id={id} value={bozza.provincia || ''} onChange={set('provincia')} maxLength={2} className="uppercase" />}
              </Campo>
            </div>
            <Campo etichetta="Telefono">{(id) => <Input id={id} type="tel" value={bozza.telefono || ''} onChange={set('telefono')} />}</Campo>
            <Campo etichetta="Email">{(id) => <Input id={id} type="email" value={bozza.email || ''} onChange={set('email')} />}</Campo>
            <Campo etichetta="PEC" className="sm:col-span-2">
              {(id) => <Input id={id} type="email" value={bozza.pec || ''} onChange={set('pec')} />}
            </Campo>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader titolo="Logo" sottotitolo="Bucket pubblico, ridotto a 512 px" icona={ImageIcon} />
            <div className="rounded-xl border border-dashed border-[var(--line)] p-6 text-center">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo dell’officina" className="max-h-24 mx-auto mb-3" />
              ) : (
                <ImageIcon size={28} className="mx-auto mb-3 text-[var(--ink-3)]" aria-hidden />
              )}
              <input
                ref={input}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => caricaLogo(e.target.files?.[0])}
              />
              <Button misura="sm" caricamento={caricando} onClick={() => input.current?.click()}>
                {bozza.logoPath ? 'Sostituisci logo' : 'Carica logo'}
              </Button>
              {bozza.logoPath && (
                <p className="text-[11px] text-[var(--ink-3)] mt-2 font-mono break-all">{bozza.logoPath}</p>
              )}
            </div>
            {demo && (
              <p className="text-xs text-[var(--ink-3)] mt-3">
                In demo il logo resta nel browser e sparisce chiudendo. Nell’officina vera viene
                conservato insieme agli altri documenti e compare su preventivi e fatture.
              </p>
            )}
          </Card>

          <Card>
            <CardHeader titolo="Officina" sottotitolo="Capacità e orari" icona={Wrench} />
            <div className="space-y-3">
              <Campo etichetta="Numero di ponti / postazioni">
                {(id) => (
                  <InputNumero
                    id={id}
                    valore={bozza.numeroPonti}
                    onChange={(n) => setBozza((x) => ({ ...x, numeroPonti: Math.max(1, Math.round(n)) }))}
                    decimali={0}
                  />
                )}
              </Campo>
              <Campo etichetta="Ore di apertura al giorno" aiuto="Serve al calcolo dell’occupazione ponti.">
                {(id) => (
                  <InputNumero id={id} valore={bozza.oreApertura} onChange={(n) => setBozza((x) => ({ ...x, oreApertura: n }))} suffisso="h" />
                )}
              </Campo>
              <Campo etichetta="Giorni di pagamento predefiniti (aziende)">
                {(id) => (
                  <InputNumero
                    id={id}
                    valore={bozza.giorniPagamentoDefault}
                    onChange={(n) => setBozza((x) => ({ ...x, giorniPagamentoDefault: Math.round(n) }))}
                    decimali={0}
                    suffisso="gg"
                  />
                )}
              </Campo>
              <Campo etichetta="Validità dei preventivi">
                {(id) => (
                  <InputNumero
                    id={id}
                    valore={bozza.giorniValiditaPreventivo}
                    onChange={(n) => setBozza((x) => ({ ...x, giorniValiditaPreventivo: Math.round(n) }))}
                    decimali={0}
                    suffisso="gg"
                  />
                )}
              </Campo>
              <Campo etichetta="Avvisa se una scheda è ferma da più di">
                {(id) => (
                  <InputNumero
                    id={id}
                    valore={bozza.giorniAlertScheda}
                    onChange={(n) => setBozza((x) => ({ ...x, giorniAlertScheda: Math.round(n) }))}
                    decimali={0}
                    suffisso="gg"
                  />
                )}
              </Campo>
              <Campo etichetta="Finestra avvisi scadenze veicolo">
                {(id) => (
                  <InputNumero
                    id={id}
                    valore={bozza.giorniAlertScadenze}
                    onChange={(n) => setBozza((x) => ({ ...x, giorniAlertScadenze: Math.round(n) }))}
                    decimali={0}
                    suffisso="gg"
                  />
                )}
              </Campo>
            </div>
          </Card>
        </div>
      </div>

      <BarraSalva sporco={sporco} salva={salva} inCorso={inCorso} onAnnulla={() => setBozza(settings)} />
    </div>
  )
}

/* ================================================================== *
 * Tariffe e listini
 * ================================================================== */

function Tariffe() {
  const { bozza, setBozza, sporco, salva, inCorso, settings } = useImpostazioni()

  const aggiungiTariffa = () =>
    setBozza((x) => ({
      ...x,
      tariffe: [
        ...(x.tariffe || []),
        { id: `t_${Date.now().toString(36)}`, nome: 'Nuova lavorazione', prezzoOrario: 45 },
      ],
    }))

  const esempio = prezzoVenditaConsigliato(50, bozza.ricaricoRicambi, bozza.aliquotaIvaDefault)

  return (
    <div>
      <div className="grid xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            titolo="Tariffe orarie per tipo di lavorazione"
            sottotitolo="Ogni riga di manodopera sceglie una di queste tariffe"
            icona={Wrench}
            azioni={
              <Button misura="sm" variante="contorno" onClick={aggiungiTariffa}>
                Aggiungi
              </Button>
            }
          />
          <div className="space-y-2">
            {(bozza.tariffe || []).map((t, i) => (
              <div key={t.id} className="flex items-center gap-2">
                <Input
                  value={t.nome}
                  onChange={(e) =>
                    setBozza((x) => ({
                      ...x,
                      tariffe: x.tariffe.map((y, k) => (k === i ? { ...y, nome: e.target.value } : y)),
                    }))
                  }
                  className="grow"
                />
                <div className="w-32 shrink-0">
                  <InputNumero
                    valore={t.prezzoOrario}
                    onChange={(n) =>
                      setBozza((x) => ({
                        ...x,
                        tariffe: x.tariffe.map((y, k) => (k === i ? { ...y, prezzoOrario: n } : y)),
                      }))
                    }
                    suffisso="€/h"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setBozza((x) => ({ ...x, tariffe: x.tariffe.filter((_, k) => k !== i) }))}
                  aria-label="Rimuovi tariffa"
                  disabled={(bozza.tariffe || []).length <= 1}
                  className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)] disabled:opacity-30 shrink-0"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--ink-3)] mt-3">
            La manodopera è calcolata a ore reali × tariffa. Non c’è un tempario acquistato: i tempi
            standard di riparazione restano un’estensione possibile.
          </p>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader titolo="Ricambi e IVA" sottotitolo="Ricarico predefinito e aliquote disponibili" icona={Percent} />
            <div className="grid sm:grid-cols-2 gap-3">
              <Campo etichetta="Ricarico predefinito sui ricambi">
                {(id) => (
                  <InputNumero
                    id={id}
                    valore={arrotonda((bozza.ricaricoRicambi || 0) * 100, 0)}
                    onChange={(n) => setBozza((x) => ({ ...x, ricaricoRicambi: n / 100 }))}
                    decimali={0}
                    suffisso="%"
                  />
                )}
              </Campo>
              <Campo etichetta="Aliquota IVA predefinita">
                {(id) => (
                  <Select
                    id={id}
                    value={String(bozza.aliquotaIvaDefault)}
                    onChange={(e) => setBozza((x) => ({ ...x, aliquotaIvaDefault: Number(e.target.value) }))}
                    opzioni={(bozza.aliquote || [22, 10, 4, 0]).map((v) => ({ valore: String(v), etichetta: `${v}%` }))}
                  />
                )}
              </Campo>
              <Campo etichetta="Aliquote disponibili" className="sm:col-span-2" aiuto="Separate da virgola.">
                {(id) => (
                  <Input
                    id={id}
                    value={(bozza.aliquote || []).join(', ')}
                    onChange={(e) =>
                      setBozza((x) => ({
                        ...x,
                        aliquote: e.target.value
                          .split(',')
                          .map((v) => Number(v.trim()))
                          .filter((v) => Number.isFinite(v)),
                      }))
                    }
                  />
                )}
              </Campo>
            </div>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-3 mt-3 text-sm">
              <p className="text-[var(--ink-2)]">
                Esempio: un pezzo che costa <strong className="tabnum">{euro(50)}</strong> a prezzo medio
                ponderato si vende a <strong className="tabnum">{euro(esempio.netto)}</strong> netto,{' '}
                <strong className="tabnum">{euro(esempio.lordo)}</strong> IVA inclusa.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader titolo="Costo del lavoro" sottotitolo="Stima gestionale, non un cedolino" icona={Percent} />
            <Campo
              etichetta="Oneri contributivi"
              aiuto="Applicati sulla paga oraria per stimare il costo aziendale. Gli straordinari sono maggiorati del 15% prima degli oneri."
            >
              {(id) => (
                <InputNumero
                  id={id}
                  valore={arrotonda((bozza.oneriContributivi || 0) * 100, 0)}
                  onChange={(n) => setBozza((x) => ({ ...x, oneriContributivi: n / 100 }))}
                  decimali={0}
                  suffisso="%"
                />
              )}
            </Campo>
            <p className="text-xs text-[var(--ink-3)] mt-3">
              Con oneri al {percento(bozza.oneriContributivi, 0)}, un meccanico pagato {euro(13)} l’ora
              costa all’officina {euro(13 * (1 + (bozza.oneriContributivi || 0)))} l’ora.
            </p>
          </Card>
        </div>
      </div>

      <BarraSalva sporco={sporco} salva={salva} inCorso={inCorso} onAnnulla={() => setBozza(settings)} />
    </div>
  )
}

/* ================================================================== *
 * Obiettivi
 * ================================================================== */

function Obiettivi() {
  const { bozza, setBozza, sporco, salva, inCorso, settings } = useImpostazioni()
  const { kpi } = useApp()
  const ob = bozza.obiettivi || {}

  const setOb = (k, v) => setBozza((x) => ({ ...x, obiettivi: { ...(x.obiettivi || {}), [k]: v } }))

  const voci = [
    { chiave: 'fatturatoMese', etichetta: 'Fatturato mensile', suffisso: '€', attuale: kpi.fatturato, formato: (v) => euro(v, { decimali: 0 }), decimali: 0 },
    { chiave: 'oreVenduteGiorno', etichetta: 'Ore vendute al giorno', suffisso: 'h', attuale: null, formato: (v) => `${numero(v, 1)} h`, decimali: 1 },
    { chiave: 'produttivita', etichetta: 'Produttività', percentuale: true, attuale: kpi.produttivita, formato: (v) => percento(v, 0) },
    { chiave: 'marginalita', etichetta: 'Marginalità', percentuale: true, attuale: kpi.contoEconomico?.margineContribuzionePerc, formato: (v) => percento(v, 0) },
    { chiave: 'incidenzaRicambi', etichetta: 'Incidenza ricambi (massimo)', percentuale: true, attuale: kpi.incidenzaRicambi, formato: (v) => percento(v, 0), inverso: true },
  ]

  return (
    <div>
      <Card>
        <CardHeader
          titolo="Obiettivi dell’officina"
          sottotitolo="Compaiono come barre di avanzamento sui KPI della dashboard"
          icona={Target}
        />
        <div className="space-y-4">
          {voci.map((v) => {
            const valore = ob[v.chiave] ?? 0
            const quota = valore
              ? v.inverso
                ? Math.min(1, valore / Math.max(v.attuale || 0.0001, 0.0001))
                : Math.min(1, (v.attuale || 0) / valore)
              : 0
            return (
              <div key={v.chiave} className="grid sm:grid-cols-[1fr_160px] gap-3 items-end">
                <div>
                  <p className="text-sm font-medium mb-1">{v.etichetta}</p>
                  {v.attuale !== null && v.attuale !== undefined && (
                    <>
                      <div className="flex items-center justify-between text-xs text-[var(--ink-3)] mb-1">
                        <span>Attuale: {v.formato(v.attuale)}</span>
                        <span>{valore ? `Obiettivo: ${v.formato(valore)}` : 'Nessun obiettivo'}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--surface-3)] overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${quota * 100}%`,
                            background: quota >= 0.95 ? 'var(--color-pos)' : 'var(--color-accent-500)',
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
                <InputNumero
                  valore={v.percentuale ? arrotonda(valore * 100, 0) : valore}
                  onChange={(n) => setOb(v.chiave, v.percentuale ? n / 100 : n)}
                  decimali={v.percentuale ? 0 : (v.decimali ?? 0)}
                  suffisso={v.percentuale ? '%' : v.suffisso}
                />
              </div>
            )
          })}
        </div>
      </Card>

      <BarraSalva sporco={sporco} salva={salva} inCorso={inCorso} onAnnulla={() => setBozza(settings)} />
    </div>
  )
}

/* ================================================================== *
 * Utenti e ruoli
 * ================================================================== */

function Utenti() {
  const { db, demo, profilo, azione, toast } = useApp()
  const [invito, setInvito] = useState(null)
  const [nuovoInvito, setNuovoInvito] = useState(false)
  const [daRevocare, setDaRevocare] = useState(null)

  const titolari = db.profiles.filter((p) => p.ruolo === 'titolare' && p.attivo !== false)

  const colonne = [
    { chiave: 'nome', label: 'Utente' },
    { chiave: 'email', label: 'Email', nascondiSuMobile: true },
    {
      chiave: 'ruolo',
      label: 'Ruolo',
      render: (p) => (
        <Badge tono={p.ruolo === 'titolare' ? 'accento' : 'neutro'}>{RUOLI[p.ruolo]?.nome || p.ruolo}</Badge>
      ),
    },
    {
      chiave: 'dipendente',
      label: 'Scheda personale',
      nascondiSuMobile: true,
      valore: (p) => {
        const e = db.employees.find((x) => x.id === p.employeeId)
        return e ? `${e.nome} ${e.cognome}` : '—'
      },
    },
    {
      chiave: 'attivo',
      label: 'Stato',
      render: (p) => <Badge tono={p.attivo !== false ? 'positivo' : 'neutro'}>{p.attivo !== false ? 'Attivo' : 'Disattivato'}</Badge>,
    },
  ]

  return (
    <div className="space-y-4">
      <IlMioProfilo />

      <Avviso tipo="info" titolo="I permessi non sono un’impostazione dello schermo">
        Nascondere una voce di menu non ha mai fermato nessuno: qui i limiti valgono davvero, anche
        per chi provasse ad aggirare questa schermata. Il ruolo lo assegna solo il titolare —
        nessuno può alzarsi da solo i permessi — e l’ultimo titolare non può essere rimosso.
      </Avviso>

      <div className="grid lg:grid-cols-3 gap-3">
        {Object.values(RUOLI).map((r) => (
          <Card key={r.id}>
            <p className="text-sm font-semibold flex items-center gap-2 mb-1.5">
              <ShieldCheck size={15} className="text-accent-500" aria-hidden />
              {r.nome}
            </p>
            <p className="text-xs text-[var(--ink-2)] leading-relaxed">{r.descrizione}</p>
            <p className="text-[11px] text-[var(--ink-3)] mt-2">
              {db.profiles.filter((p) => p.ruolo === r.id).length} utenti
            </p>
          </Card>
        ))}
      </div>

      <Card padding={false}>
        <div className="p-4 flex items-center justify-between gap-2 border-b border-[var(--line)]">
          <h3 className="text-sm font-semibold">Utenti dell’officina</h3>
          <Button misura="sm" variante="primario" icona={UserPlus} onClick={() => setNuovoInvito(true)}>
            Invita
          </Button>
        </div>
        <DataTable colonne={colonne} righe={db.profiles} vuoto="Nessun utente." />
      </Card>

      <Card padding={false}>
        <div className="p-4 border-b border-[var(--line)]">
          <h3 className="text-sm font-semibold">Inviti in sospeso</h3>
        </div>
        {db.invites.length ? (
          <DataTable
            colonne={[
              { chiave: 'email', label: 'Email' },
              { chiave: 'ruolo', label: 'Ruolo', render: (i) => <Badge>{RUOLI[i.ruolo]?.nome || i.ruolo}</Badge> },
              { chiave: 'codice', label: 'Codice', render: (i) => <span className="font-mono">{i.codice}</span> },
              { chiave: 'scadenza', label: 'Scade il', render: (i) => fmtData(i.scadenza) },
              {
                chiave: 'usato',
                label: 'Stato',
                render: (i) => <Badge tono={i.usato ? 'neutro' : 'attenzione'}>{i.usato ? 'Usato' : 'In attesa'}</Badge>,
              },
              {
                chiave: 'azioni',
                label: '',
                ordinabile: false,
                csv: false,
                allinea: 'destra',
                render: (i) => (
                  <button
                    type="button"
                    onClick={() => setDaRevocare(i)}
                    aria-label="Revoca invito"
                    className="p-1.5 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)]"
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                ),
              },
            ]}
            righe={db.invites}
          />
        ) : (
          <Vuoto messaggio="Nessun invito in sospeso." icona={KeyRound} />
        )}
      </Card>

      {demo && (
        <Avviso tipo="attenzione">
          In modalità demo gli inviti e i cambi di ruolo non hanno effetto reale: servono a mostrare
          come funzionano. Il selettore in fondo alla barra laterale permette di guardare l’officina
          con gli occhi di ciascun ruolo.
        </Avviso>
      )}

      {nuovoInvito && (
        <Modal
          aperto
          onChiudi={() => setNuovoInvito(false)}
          titolo="Invita una persona"
          larghezza="sm"
          piede={
            <Button variante="fantasma" onClick={() => setNuovoInvito(false)}>
              Chiudi
            </Button>
          }
        >
          <FormInvito
            onCreato={(dati) => {
              setInvito(dati)
              setNuovoInvito(false)
            }}
            azione={azione}
          />
        </Modal>
      )}

      {invito && (
        <Modal
          aperto
          onChiudi={() => setInvito(null)}
          titolo="Invito creato"
          larghezza="sm"
          piede={
            <Button variante="primario" onClick={() => setInvito(null)}>
              Ho capito
            </Button>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-[var(--ink-2)]">
              Passa questo codice a {invito.email}. Lo inserirà in fase di registrazione ed entrerà
              in officina con il ruolo di {RUOLI[invito.ruolo]?.nome}.
            </p>
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4 text-center">
              <p className="font-mono text-xl tracking-wider">{invito.codice}</p>
            </div>
            <p className="text-xs text-[var(--ink-3)]">
              L’invito vale una volta sola: la funzione lato database che lo riscatta è atomica,
              quindi due persone non possono usarlo contemporaneamente.
            </p>
            <Button
              misura="sm"
              variante="contorno"
              onClick={() => {
                navigator.clipboard?.writeText(invito.codice)
                toast('Codice copiato.')
              }}
            >
              Copia il codice
            </Button>
          </div>
        </Modal>
      )}

      <Conferma
        aperto={Boolean(daRevocare)}
        onChiudi={() => setDaRevocare(null)}
        titolo="Revocare l’invito?"
        messaggio={daRevocare ? `L’invito per ${daRevocare.email} non sarà più utilizzabile.` : ''}
        etichettaOk="Revoca"
        pericoloso
        onConferma={async () => {
          if (demo) {
            toast('In demo la revoca non ha effetto reale.', 'info')
            return
          }
          await azione(() => authService.revocaInvito(daRevocare.id), { successo: 'Invito revocato.' })
        }}
      />

      <p className="text-xs text-[var(--ink-3)]">
        Titolari attivi: {titolari.length}. Utente collegato: {profilo?.nome || '—'}.
      </p>
    </div>
  )
}

/**
 * Il proprio nome.
 *
 * Serve più di quanto sembri: chi si registra con la conferma via email crea
 * il profilo al primo accesso, e se qualcosa va storto nel passaggio si
 * ritrova l'indirizzo di posta al posto del nome — in barra laterale, negli
 * elenchi, ovunque. Senza questo riquadro non c'era modo di correggerlo
 * dall'applicazione.
 */
function IlMioProfilo() {
  const { profilo, demo, azione, dataService, db } = useApp()
  const [nome, setNome] = useState(profilo?.nome || '')
  const [inCorso, setInCorso] = useState(false)

  const dipendente = db.employees.find((e) => e.id === profilo?.employeeId)
  const sembraEmail = /@/.test(profilo?.nome || '')
  const cambiato = nome.trim() && nome.trim() !== (profilo?.nome || '')

  const salva = async () => {
    setInCorso(true)
    try {
      if (demo) {
        await azione(
          () =>
            dipendente
              ? dataService.update('employees', dipendente.id, {
                  nome: nome.trim().split(' ')[0],
                  cognome: nome.trim().split(' ').slice(1).join(' '),
                })
              : Promise.resolve(),
          { successo: 'In demo il nome resta solo per questa sessione.' },
        )
      } else {
        await azione(() => authService.aggiornaNomeProfilo(nome), {
          successo: 'Nome aggiornato.',
        })
        window.location.reload()
      }
    } finally {
      setInCorso(false)
    }
  }

  return (
    <Card>
      <CardHeader
        titolo="Il tuo profilo"
        sottotitolo="Come compari nell’applicazione e nella scheda del personale"
      />
      {sembraEmail && (
        <Avviso tipo="attenzione" className="mb-4">
          Al posto del nome compare il tuo indirizzo email: succede quando la
          registrazione viene completata dopo la conferma via posta. Scrivilo qui e si
          sistema anche la scheda personale.
        </Avviso>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <Campo etichetta="Nome e cognome" className="grow min-w-0">
          {(id) => (
            <Input
              id={id}
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Mattia De Palma"
            />
          )}
        </Campo>
        <Button variante="primario" disabled={!cambiato} caricamento={inCorso} onClick={salva}>
          Salva
        </Button>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 mt-4">
        <Dato etichetta="Email" valore={profilo?.email} />
        <Dato etichetta="Ruolo" valore={RUOLI[profilo?.ruolo]?.nome} />
        <Dato
          etichetta="Scheda personale"
          valore={dipendente ? `${dipendente.nome} ${dipendente.cognome}`.trim() : '—'}
        />
      </dl>
    </Card>
  )
}

function FormInvito({ onCreato, azione }) {
  const [v, setV] = useState({ email: '', ruolo: 'meccanico' })
  const [inCorso, setInCorso] = useState(false)

  return (
    <div className="space-y-3">
      <Campo etichetta="Email" obbligatorio>
        {(id) => <Input id={id} type="email" value={v.email} onChange={(e) => setV((x) => ({ ...x, email: e.target.value }))} />}
      </Campo>
      <Campo etichetta="Ruolo" aiuto={RUOLI[v.ruolo]?.descrizione}>
        {(id) => (
          <Select
            id={id}
            value={v.ruolo}
            onChange={(e) => setV((x) => ({ ...x, ruolo: e.target.value }))}
            opzioni={Object.values(RUOLI).map((r) => ({ valore: r.id, etichetta: r.nome }))}
          />
        )}
      </Campo>
      <Button
        variante="primario"
        className="w-full"
        disabled={!v.email.trim()}
        caricamento={inCorso}
        onClick={async () => {
          setInCorso(true)
          try {
            const esito = await azione(() => authService.creaInvito(v), { successo: 'Invito creato.' })
            if (esito.ok) onCreato({ ...v, codice: esito.esito.codice })
          } finally {
            setInCorso(false)
          }
        }}
      >
        Crea invito
      </Button>
    </div>
  )
}

/* ================================================================== *
 * Dati e sistema
 * ================================================================== */

function Sistema() {
  const { db, demo, backend, azione, dataService, toast, settings } = useApp()
  const [ricarica, setRicarica] = useState(false)

  const conteggi = [
    ['Clienti', db.customers.length],
    ['Veicoli', db.vehicles.length],
    ['Preventivi', db.quotes.length],
    ['Schede di lavoro', db.jobs.length],
    ['Righe scheda', db.jobLines.length],
    ['Articoli', db.articles.length],
    ['Movimenti', db.movements.length],
    ['Fatture', db.invoices.length],
    ['Spese', db.expenses.length],
    ['Presenze', db.attendance.length],
  ]

  const esporta = () => {
    const blob = new Blob([dataService.esportaArchivio()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `wheelz-archivio-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast('Archivio esportato.')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader titolo="Stato dell’applicazione" sottotitolo="Da dove arrivano i dati che stai guardando" />
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Dato etichetta="Modalità" valore={demo ? 'Demo (niente viene salvato)' : 'Officina attiva'} />
          <Dato etichetta="Backend" valore={backend} />
          <Dato etichetta="Officina" valore={settings.ragioneSociale} />
          <Dato etichetta="Numerazione fatture" valore={`${dataService.prossimoNumero('invoices').numero} (prossima)`} />
        </dl>
        <div className={cx('grid grid-cols-2 sm:grid-cols-5 gap-3 mt-5')}>
          {conteggi.map(([nome, n]) => (
            <div key={nome} className="rounded-xl border border-[var(--line)] p-3">
              <p className="text-[11px] uppercase tracking-wide text-[var(--ink-3)]">{nome}</p>
              <p className="text-lg font-semibold tabnum">{numero(n, 0)}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader titolo="Archivio" sottotitolo="Copia di sicurezza in JSON di tutto quello che c’è in memoria" />
        <div className="flex flex-wrap gap-2">
          <Button icona={Download} onClick={esporta}>
            Esporta archivio JSON
          </Button>
          {demo && (
            <Button icona={RefreshCw} variante="contorno" onClick={() => setRicarica(true)}>
              Rigenera i dati demo
            </Button>
          )}
        </div>
        <p className="text-xs text-[var(--ink-3)] mt-3">
          L’esportazione è una copia di sicurezza a mano, non un tracciato fiscale. Nell’officina
          vera i dati sono già conservati: questo file serve solo a portarseli via.
        </p>
      </Card>

      {demo && (
        <Avviso tipo="attenzione" titolo="Sei in modalità demo">
          I dati sono generati da un RNG con seed fisso e vivono solo nella memoria del browser:
          ricaricando la pagina tornano com’erano, e nulla viene inviato in rete. Per avere
          persistenza vera, compila <code>VITE_SUPABASE_URL</code> e{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env</code> — l’applicazione ripartirà da un
          gestionale vuoto.
        </Avviso>
      )}

      <Conferma
        aperto={ricarica}
        onChiudi={() => setRicarica(false)}
        titolo="Rigenerare i dati demo?"
        messaggio="Tutte le modifiche fatte in questa sessione andranno perse e il dataset tornerà quello iniziale."
        etichettaOk="Rigenera"
        pericoloso
        onConferma={() => azione(() => dataService.ricaricaDemo(), { successo: 'Dati demo rigenerati.' })}
      />
    </div>
  )
}
