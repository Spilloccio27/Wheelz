/**
 * Editor delle righe di un documento — preventivo, scheda di lavoro, fattura.
 *
 * È l'unico pezzo di interfaccia condiviso fra tre moduli: le righe hanno la
 * stessa forma ovunque (manodopera a ore × tariffa, ricambi a quantità ×
 * prezzo, sconto di riga, aliquota IVA), e duplicarlo tre volte avrebbe
 * significato tre modi diversi di sbagliare gli stessi totali.
 *
 * I calcoli non stanno qui: arrivano da `utils/calc.js`, che è testato.
 */

import { useMemo, useState } from 'react'
import { Package, Plus, Trash2, Wrench } from 'lucide-react'
import {
  Badge,
  Button,
  Campo,
  Input,
  InputNumero,
  Select,
  Vuoto,
  cx,
} from './ui.jsx'
import { arrotonda, imponibileRiga, totaliDocumento } from '../utils/calc.js'
import { euro, numero, percento } from '../utils/format.js'

const nuovaChiave = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `r_${Math.random().toString(36).slice(2)}`

/**
 * @param righe          array di righe (stato controllato dal chiamante)
 * @param onChange       nuova lista di righe
 * @param tariffe        [{id, nome, prezzoOrario}] dalle impostazioni
 * @param articoli       catalogo magazzino, per l'inserimento rapido
 * @param aliquote       aliquote IVA disponibili
 * @param scontoGlobale  percentuale 0-100
 * @param soloLettura    mostra i totali senza permettere modifiche
 */
export default function RigheDocumento({
  righe = [],
  onChange,
  tariffe = [],
  articoli = [],
  aliquote = [22, 10, 4, 0],
  ricaricoDefault = 0.38,
  scontoGlobale = 0,
  onScontoGlobale,
  soloLettura = false,
  mostraMargine = true,
}) {
  const [ricercaArticolo, setRicercaArticolo] = useState('')

  const totali = useMemo(
    () => totaliDocumento(righe, scontoGlobale),
    [righe, scontoGlobale],
  )

  const aggiorna = (id, patch) =>
    onChange(righe.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const rimuovi = (id) => onChange(righe.filter((r) => r.id !== id))

  const aggiungiManodopera = () => {
    const t = tariffe[0]
    onChange([
      ...righe,
      {
        id: nuovaChiave(),
        tipo: 'manodopera',
        descrizione: t?.nome || 'Manodopera',
        tariffaId: t?.id || null,
        tariffaOraria: t?.prezzoOrario || 45,
        ore: 1,
        sconto: 0,
        aliquotaIva: aliquote[0] ?? 22,
      },
    ])
  }

  const aggiungiRicambioLibero = () => {
    onChange([
      ...righe,
      {
        id: nuovaChiave(),
        tipo: 'ricambio',
        descrizione: '',
        codice: '',
        articleId: null,
        quantita: 1,
        prezzo: 0,
        costoUnitario: 0,
        sconto: 0,
        aliquotaIva: aliquote[0] ?? 22,
      },
    ])
  }

  const aggiungiArticolo = (art) => {
    onChange([
      ...righe,
      {
        id: nuovaChiave(),
        tipo: 'ricambio',
        descrizione: art.descrizione,
        codice: art.codice,
        articleId: art.id,
        quantita: 1,
        prezzo: arrotonda(
          art.prezzoListino || art.prezzoMedio * (1 + (art.ricarico ?? ricaricoDefault)),
        ),
        costoUnitario: art.prezzoMedio,
        sconto: 0,
        aliquotaIva: art.aliquotaIva ?? aliquote[0] ?? 22,
      },
    ])
    setRicercaArticolo('')
  }

  const suggerimenti = useMemo(() => {
    const q = ricercaArticolo.trim().toLowerCase()
    if (q.length < 2) return []
    return articoli
      .filter(
        (a) =>
          a.attivo !== false &&
          (`${a.descrizione} ${a.codice} ${a.codiceOe} ${a.marca}`).toLowerCase().includes(q),
      )
      .slice(0, 8)
  }, [ricercaArticolo, articoli])

  return (
    <div className="space-y-4">
      {!soloLettura && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="relative grow min-w-[220px]">
            <Campo etichetta="Aggiungi ricambio dal magazzino">
              {(id) => (
                <Input
                  id={id}
                  value={ricercaArticolo}
                  onChange={(e) => setRicercaArticolo(e.target.value)}
                  placeholder="Codice, codice OE o descrizione…"
                />
              )}
            </Campo>
            {suggerimenti.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] shadow-xl overflow-hidden max-h-72 overflow-y-auto">
                {suggerimenti.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => aggiungiArticolo(a)}
                      className="w-full text-left px-3 py-2.5 hover:bg-[var(--surface-2)] flex items-center gap-3"
                    >
                      <span className="min-w-0 grow">
                        <span className="block text-sm truncate">{a.descrizione}</span>
                        <span className="block text-[11px] text-[var(--ink-3)] font-mono">
                          {a.codice} · OE {a.codiceOe} · {a.marca}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-sm tabnum">
                          {euro(a.prezzoListino || a.prezzoMedio * (1 + (a.ricarico ?? ricaricoDefault)))}
                        </span>
                        <span
                          className={cx(
                            'block text-[11px] tabnum',
                            Number(a.giacenza) <= Number(a.scortaMinima || 0)
                              ? 'text-[var(--color-neg)]'
                              : 'text-[var(--ink-3)]',
                          )}
                        >
                          giac. {numero(a.giacenza, 0)}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button icona={Wrench} onClick={aggiungiManodopera}>
            Manodopera
          </Button>
          <Button icona={Plus} onClick={aggiungiRicambioLibero}>
            Ricambio extra
          </Button>
        </div>
      )}

      {righe.length === 0 ? (
        <Vuoto
          messaggio="Nessuna riga."
          descrizione="Aggiungi la manodopera e i ricambi che servono."
          icona={Package}
        />
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0 sm:rounded-xl sm:border sm:border-[var(--line)]">
          <table className="w-full min-w-[820px] text-sm border-collapse">
            <thead>
              <tr className="bg-[var(--surface-2)] text-[11px] uppercase tracking-wide text-[var(--ink-3)]">
                <th className="text-left font-medium px-3 py-2.5 border-b border-[var(--line)]">Descrizione</th>
                <th className="text-right font-medium px-2 py-2.5 border-b border-[var(--line)] w-24">Q.tà / ore</th>
                <th className="text-right font-medium px-2 py-2.5 border-b border-[var(--line)] w-28">Prezzo</th>
                <th className="text-right font-medium px-2 py-2.5 border-b border-[var(--line)] w-20">Sconto</th>
                <th className="text-right font-medium px-2 py-2.5 border-b border-[var(--line)] w-20">IVA</th>
                <th className="text-right font-medium px-3 py-2.5 border-b border-[var(--line)] w-28">Imponibile</th>
                {!soloLettura && <th className="border-b border-[var(--line)] w-12" />}
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id} className="border-b border-[var(--line)] last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <span
                        className={cx(
                          'mt-1.5 h-6 w-6 rounded-md grid place-items-center shrink-0',
                          r.tipo === 'manodopera'
                            ? 'bg-accent-500/12 text-accent-400'
                            : 'bg-[var(--surface-3)] text-[var(--ink-2)]',
                        )}
                        title={r.tipo === 'manodopera' ? 'Manodopera' : 'Ricambio'}
                      >
                        {r.tipo === 'manodopera' ? <Wrench size={12} /> : <Package size={12} />}
                      </span>
                      <div className="min-w-0 grow space-y-1">
                        {soloLettura ? (
                          <p className="py-1">{r.descrizione}</p>
                        ) : (
                          <Input
                            value={r.descrizione || ''}
                            onChange={(e) => aggiorna(r.id, { descrizione: e.target.value })}
                            className="h-9"
                            placeholder="Descrizione"
                          />
                        )}
                        {r.tipo === 'manodopera' && !soloLettura && tariffe.length > 0 && (
                          <Select
                            value={r.tariffaId || ''}
                            onChange={(e) => {
                              const t = tariffe.find((x) => x.id === e.target.value)
                              aggiorna(r.id, {
                                tariffaId: t?.id || null,
                                tariffaOraria: t?.prezzoOrario ?? r.tariffaOraria,
                              })
                            }}
                            className="h-9 text-[13px]"
                            opzioni={tariffe.map((t) => ({
                              valore: t.id,
                              etichetta: `${t.nome} — ${euro(t.prezzoOrario)}/h`,
                            }))}
                          />
                        )}
                        {r.codice && (
                          <p className="text-[11px] text-[var(--ink-3)] font-mono">{r.codice}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right">
                    {soloLettura ? (
                      <span className="tabnum">{numero(r.tipo === 'manodopera' ? r.ore : r.quantita, 2)}</span>
                    ) : (
                      <InputNumero
                        valore={r.tipo === 'manodopera' ? r.ore : r.quantita}
                        onChange={(n) => aggiorna(r.id, r.tipo === 'manodopera' ? { ore: n } : { quantita: n })}
                        className="h-9"
                        suffisso={r.tipo === 'manodopera' ? 'h' : undefined}
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {soloLettura ? (
                      <span className="tabnum">{euro(r.tipo === 'manodopera' ? r.tariffaOraria : r.prezzo)}</span>
                    ) : (
                      <InputNumero
                        valore={r.tipo === 'manodopera' ? r.tariffaOraria : r.prezzo}
                        onChange={(n) =>
                          aggiorna(r.id, r.tipo === 'manodopera' ? { tariffaOraria: n } : { prezzo: n })
                        }
                        className="h-9"
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {soloLettura ? (
                      <span className="tabnum">{r.sconto ? `${numero(r.sconto, 0)}%` : '—'}</span>
                    ) : (
                      <InputNumero
                        valore={r.sconto || 0}
                        onChange={(n) => aggiorna(r.id, { sconto: Math.min(100, Math.max(0, n)) })}
                        decimali={0}
                        className="h-9"
                        suffisso="%"
                      />
                    )}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {soloLettura ? (
                      <span className="tabnum">{r.aliquotaIva}%</span>
                    ) : (
                      <Select
                        value={String(r.aliquotaIva ?? 22)}
                        onChange={(e) => aggiorna(r.id, { aliquotaIva: Number(e.target.value) })}
                        className="h-9 text-[13px]"
                        opzioni={aliquote.map((a) => ({ valore: String(a), etichetta: `${a}%` }))}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabnum font-medium">
                    {euro(imponibileRiga(r))}
                    {mostraMargine && r.tipo === 'ricambio' && Number(r.costoUnitario) > 0 && (
                      <span className="block text-[11px] text-[var(--ink-3)]">
                        marg. {percento(1 - Number(r.costoUnitario) / Math.max(Number(r.prezzo) || 1, 0.01), 0)}
                      </span>
                    )}
                  </td>
                  {!soloLettura && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => rimuovi(r.id)}
                        aria-label="Rimuovi riga"
                        className="p-2 rounded-lg text-[var(--ink-3)] hover:text-[var(--color-neg)] hover:bg-[var(--surface-3)]"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Totali */}
      <div className="flex flex-col sm:flex-row sm:justify-end gap-4">
        <div className="sm:w-80 space-y-1.5 text-sm">
          <Riga etichetta="Manodopera" valore={euro(totali.manodopera)} sfumato />
          <Riga etichetta="Ricambi e forniture" valore={euro(totali.ricambi)} sfumato />
          {onScontoGlobale && !soloLettura && (
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="text-[var(--ink-2)]">Sconto globale</span>
              <div className="w-24">
                <InputNumero
                  valore={scontoGlobale}
                  onChange={(n) => onScontoGlobale(Math.min(100, Math.max(0, n)))}
                  decimali={0}
                  className="h-9"
                  suffisso="%"
                />
              </div>
            </div>
          )}
          <div className="border-t border-[var(--line)] pt-1.5">
            <Riga etichetta="Imponibile" valore={euro(totali.imponibile)} />
          </div>
          {totali.ivaPerAliquota.map((v) => (
            <Riga
              key={v.aliquota}
              etichetta={`IVA ${v.aliquota}% su ${euro(v.imponibile)}`}
              valore={euro(v.imposta)}
              sfumato
            />
          ))}
          <div className="border-t border-[var(--line)] pt-2 flex items-center justify-between">
            <span className="font-semibold">Totale documento</span>
            <span className="font-semibold text-lg tabnum">{euro(totali.totale)}</span>
          </div>
          {mostraMargine && totali.costo > 0 && (
            <div className="pt-2 flex items-center justify-between text-xs text-[var(--ink-3)]">
              <span>Margine stimato</span>
              <span className="flex items-center gap-2">
                <span className="tabnum">{euro(totali.margine)}</span>
                <Badge tono={totali.marginePerc >= 0.4 ? 'positivo' : totali.marginePerc >= 0.25 ? 'attenzione' : 'negativo'}>
                  {percento(totali.marginePerc, 1)}
                </Badge>
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Riga({ etichetta, valore, sfumato }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={sfumato ? 'text-[var(--ink-3)]' : 'text-[var(--ink-2)]'}>{etichetta}</span>
      <span className={cx('tabnum', sfumato && 'text-[var(--ink-2)]')}>{valore}</span>
    </div>
  )
}

export { nuovaChiave }
