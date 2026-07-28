/**
 * Formule gestionali dell'officina.
 *
 * Tutte le funzioni sono pure: ricevono numeri o array di oggetti semplici e
 * non toccano lo stato. Sono coperte da test in `calc.test.js`, perché sono il
 * punto in cui un errore silenzioso costa di più.
 *
 * Convenzioni:
 * - le percentuali di sconto e ricarico viaggiano come frazioni (0.35 = 35%)
 *   tranne dove il nome dice `Perc`, che indica un valore 0-100 come lo
 *   digita l'utente;
 * - le aliquote IVA sono in punti percentuali (22 = 22%), come in fattura;
 * - gli importi sono sempre al netto dell'IVA salvo indicazione contraria.
 */

import { giorniTra, meseDi, oggiIso, rangeMese, giornoSettimana } from './format.js'

/** Arrotondamento contabile a `d` decimali, stabile sugli .005. */
export function arrotonda(n, d = 2) {
  if (!Number.isFinite(Number(n))) return 0
  const f = 10 ** d
  return Math.round((Number(n) + Number.EPSILON) * f) / f
}

const div = (a, b) => (Number(b) ? Number(a) / Number(b) : 0)

/* ------------------------------------------------------------------ *
 * 1. Manodopera
 * ------------------------------------------------------------------ */

/** Ricavo manodopera = ore lavorate × tariffa oraria della lavorazione. */
export function ricavoManodopera(ore, tariffaOraria) {
  return arrotonda(Number(ore || 0) * Number(tariffaOraria || 0))
}

/**
 * Costo orario del meccanico = paga oraria × (1 + oneri contributivi).
 * Gli straordinari sono maggiorati del 15% sulla paga, prima degli oneri.
 */
export const MAGGIORAZIONE_STRAORDINARIO = 0.15

export function costoOrarioMeccanico(pagaOraria, oneri = 0.32, { straordinario = false } = {}) {
  const paga = Number(pagaOraria || 0) * (straordinario ? 1 + MAGGIORAZIONE_STRAORDINARIO : 1)
  return arrotonda(paga * (1 + Number(oneri || 0)), 4)
}

/** Costo del lavoro di una giornata di presenza (ordinarie + straordinari). */
export function costoPresenza(presenza, pagaOraria, oneri = 0.32) {
  const ord = Number(presenza?.oreOrdinarie || 0) * costoOrarioMeccanico(pagaOraria, oneri)
  const str =
    Number(presenza?.oreStraordinario || 0) *
    costoOrarioMeccanico(pagaOraria, oneri, { straordinario: true })
  return arrotonda(ord + str)
}

/* ------------------------------------------------------------------ *
 * 2. Ricambi
 * ------------------------------------------------------------------ */

/** Margine sul ricambio = (vendita − costo medio) / vendita. */
export function margineRicambio(prezzoVendita, prezzoMedio) {
  const pv = Number(prezzoVendita || 0)
  if (!pv) return 0
  return arrotonda((pv - Number(prezzoMedio || 0)) / pv, 4)
}

/**
 * Prezzo di vendita consigliato = prezzo medio ponderato × (1 + ricarico),
 * poi ri-lordato dell'IVA per l'esposizione al cliente privato.
 */
export function prezzoVenditaConsigliato(prezzoMedio, ricarico = 0.35, aliquotaIva = 22) {
  const netto = arrotonda(Number(prezzoMedio || 0) * (1 + Number(ricarico || 0)))
  return { netto, lordo: arrotonda(netto * (1 + Number(aliquotaIva || 0) / 100)) }
}

/**
 * Prezzo medio ponderato: a ogni carico
 *   (giacenza × prezzoMedio + qta × prezzoCarico) / (giacenza + qta)
 * Con giacenza a zero o negativa il nuovo prezzo di carico fa testo:
 * mediare su una giacenza inesistente produrrebbe un costo fittizio.
 */
export function prezzoMedioPonderato(giacenza, prezzoMedio, qta, prezzoCarico) {
  const g = Number(giacenza || 0)
  const q = Number(qta || 0)
  const pc = Number(prezzoCarico || 0)
  if (q <= 0) return arrotonda(Number(prezzoMedio || 0), 4)
  if (g <= 0) return arrotonda(pc, 4)
  return arrotonda((g * Number(prezzoMedio || 0) + q * pc) / (g + q), 4)
}

/** Incidenza ricambi = costo dei ricambi impiegati / fatturato del periodo. */
export function incidenzaRicambi(costoRicambi, fatturato) {
  return arrotonda(div(costoRicambi, fatturato), 4)
}

/**
 * Rotazione di magazzino = costo del venduto nel periodo / giacenza media a
 * valore, riportata su base annua. Restituisce anche i giorni di copertura.
 */
export function rotazioneMagazzino(costoVenduto, valoreMedioGiacenza, giorniPeriodo = 30) {
  const indice = div(costoVenduto, valoreMedioGiacenza)
  const annuo = arrotonda(indice * (365 / (giorniPeriodo || 1)), 2)
  return {
    indicePeriodo: arrotonda(indice, 3),
    indiceAnnuo: annuo,
    giorniCopertura: annuo > 0 ? arrotonda(365 / annuo, 0) : null,
  }
}

/* ------------------------------------------------------------------ *
 * 3. Righe e totali di documento (preventivi, schede, fatture)
 * ------------------------------------------------------------------ */

/** Imponibile lordo-sconto di una singola riga, prima dello sconto globale. */
export function baseRiga(riga) {
  if (!riga) return 0
  if (riga.tipo === 'manodopera') {
    return Number(riga.ore || 0) * Number(riga.tariffaOraria || 0)
  }
  return Number(riga.quantita || 0) * Number(riga.prezzo || 0)
}

export function imponibileRiga(riga) {
  const sconto = Math.min(Math.max(Number(riga?.sconto || 0), 0), 100)
  return arrotonda(baseRiga(riga) * (1 - sconto / 100))
}

/** Costo della riga: costo medio del ricambio, costo del lavoro sulla manodopera. */
export function costoRiga(riga) {
  if (!riga) return 0
  if (riga.tipo === 'manodopera') {
    return arrotonda(Number(riga.ore || 0) * Number(riga.costoOrario || 0))
  }
  return arrotonda(Number(riga.quantita || 0) * Number(riga.costoUnitario || 0))
}

/**
 * Totali di documento. Lo sconto globale si applica proporzionalmente su
 * tutte le righe, così l'IVA resta corretta per ogni aliquota.
 */
export function totaliDocumento(righe = [], scontoGlobalePerc = 0) {
  const k = 1 - Math.min(Math.max(Number(scontoGlobalePerc || 0), 0), 100) / 100
  const perAliquota = new Map()
  let imponibile = 0
  let costo = 0
  let manodopera = 0
  let ricambi = 0
  let oreTotali = 0

  for (const r of righe) {
    const imp = arrotonda(imponibileRiga(r) * k)
    imponibile += imp
    costo += costoRiga(r)
    if (r.tipo === 'manodopera') {
      manodopera += imp
      oreTotali += Number(r.ore || 0)
    } else {
      ricambi += imp
    }
    const al = Number(r.aliquotaIva ?? 22)
    perAliquota.set(al, arrotonda((perAliquota.get(al) || 0) + imp))
  }

  imponibile = arrotonda(imponibile)
  costo = arrotonda(costo)
  const iva = arrotonda(
    [...perAliquota.entries()].reduce((s, [al, base]) => s + arrotonda((base * al) / 100), 0),
  )

  return {
    imponibile,
    manodopera: arrotonda(manodopera),
    ricambi: arrotonda(ricambi),
    ore: arrotonda(oreTotali, 2),
    costo,
    margine: arrotonda(imponibile - costo),
    marginePerc: arrotonda(div(imponibile - costo, imponibile), 4),
    iva,
    totale: arrotonda(imponibile + iva),
    ivaPerAliquota: [...perAliquota.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([aliquota, base]) => ({
        aliquota,
        imponibile: base,
        imposta: arrotonda((base * aliquota) / 100),
      })),
  }
}

/* ------------------------------------------------------------------ *
 * 4. Produttività, ponti, valore scheda
 * ------------------------------------------------------------------ */

/** Produttività (efficienza) = ore vendute su scheda / ore di presenza. */
export function produttivita(oreVendute, orePresenza) {
  return arrotonda(div(oreVendute, orePresenza), 4)
}

/** Occupazione ponti = ore lavorate / (ponti × ore di apertura × giorni). */
export function occupazionePonti(oreLavorate, ponti, oreApertura = 8, giorni = 1) {
  const capacita = Number(ponti || 0) * Number(oreApertura || 0) * Number(giorni || 0)
  return arrotonda(div(oreLavorate, capacita), 4)
}

/** Valore medio scheda = fatturato / numero schede chiuse. */
export function valoreMedioScheda(fatturato, schedeChiuse) {
  return arrotonda(div(fatturato, schedeChiuse))
}

/* ------------------------------------------------------------------ *
 * 5. Break-even
 * ------------------------------------------------------------------ */

/**
 * Break-even mensile.
 *
 * `costiFissi` include già il costo del personale (in officina è di fatto un
 * costo fisso: le persone ci sono anche a piazzale vuoto).
 * `margineContribuzione` è una frazione: (ricavi − costi variabili) / ricavi.
 */
export function breakEven({
  costiFissi = 0,
  margineContribuzione = 0,
  valoreMedioScheda: vms = 0,
  giorniLavorativi = 22,
  tariffaMedia = 0,
  quotaManodopera = 0.6,
} = {}) {
  const mc = Number(margineContribuzione || 0)
  if (mc <= 0) {
    return { fatturato: null, schedeGiorno: null, oreVenduteGiorno: null, raggiungibile: false }
  }
  const fatturato = arrotonda(Number(costiFissi || 0) / mc)
  const gg = Number(giorniLavorativi || 0) || 1
  return {
    fatturato,
    schedeGiorno: vms > 0 ? arrotonda(fatturato / vms / gg, 2) : null,
    oreVenduteGiorno:
      tariffaMedia > 0 ? arrotonda((fatturato * quotaManodopera) / tariffaMedia / gg, 2) : null,
    raggiungibile: true,
  }
}

/* ------------------------------------------------------------------ *
 * 6. Matrice interventi
 * ------------------------------------------------------------------ */

export const QUADRANTI = {
  traino: { label: 'Traino', desc: 'Molte richieste e buon margine: è la base da difendere.' },
  volume: { label: 'Volume', desc: 'Molte richieste ma margine sotto la media: da rivedere.' },
  nicchia: { label: 'Nicchia', desc: 'Poche richieste, margine alto: vale la pena spingerle.' },
  marginale: { label: 'Marginale', desc: 'Poche richieste e margine basso: candidati a uscire.' },
}

/**
 * Solo i numeri veri. `null` e `undefined` vengono scartati, non convertiti a
 * zero: un dato mancante non è uno zero, e trattarlo come tale abbasserebbe
 * la media di un margine che non è mai stato misurato.
 */
function soloNumeri(valori = []) {
  return valori
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(Number)
    .filter(Number.isFinite)
}

export function mediana(valori = []) {
  const v = soloNumeri(valori).sort((a, b) => a - b)
  if (!v.length) return 0
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : arrotonda((v[m - 1] + v[m]) / 2, 4)
}

export function media(valori = []) {
  const v = soloNumeri(valori)
  if (!v.length) return 0
  return arrotonda(v.reduce((s, x) => s + x, 0) / v.length, 4)
}

/**
 * Matrice interventi: frequenza (rispetto alla mediana) × margine (rispetto
 * alla media) → quattro quadranti. La mediana sulla frequenza evita che due
 * o tre tagliandi in più spostino la soglia per tutti gli altri.
 */
export function matriceInterventi(voci = []) {
  const sogliaFrequenza = mediana(voci.map((v) => v.frequenza))
  const sogliaMargine = media(voci.map((v) => v.margine))
  return {
    sogliaFrequenza,
    sogliaMargine,
    voci: voci.map((v) => {
      const altaF = Number(v.frequenza) >= sogliaFrequenza
      const altoM = Number(v.margine) >= sogliaMargine
      const quadrante = altaF ? (altoM ? 'traino' : 'volume') : altoM ? 'nicchia' : 'marginale'
      return { ...v, quadrante, altaFrequenza: altaF, altoMargine: altoM }
    }),
  }
}

/* ------------------------------------------------------------------ *
 * 7. Aggregatori sul dataset
 * ------------------------------------------------------------------ */

/** Imponibile di una fattura, sconti di riga inclusi. */
export function imponibileFattura(f) {
  return totaliDocumento(f?.righe || [], f?.scontoGlobale || 0).imponibile
}

export function totaleFattura(f) {
  return totaliDocumento(f?.righe || [], f?.scontoGlobale || 0).totale
}

export function incassatoFattura(f) {
  return arrotonda((f?.pagamenti || []).reduce((s, p) => s + Number(p.importo || 0), 0))
}

export function residuoFattura(f) {
  return arrotonda(totaleFattura(f) - incassatoFattura(f))
}

/** Una fattura è scaduta se ha residuo e la scadenza è passata. */
export function fatturaScaduta(f, oggi = oggiIso()) {
  if (!f || f.stato === 'annullata') return false
  if (residuoFattura(f) <= 0.01) return false
  const g = giorniTra(oggi, f.scadenza)
  return g !== null && g < 0
}

export function giorniScaduto(f, oggi = oggiIso()) {
  const g = giorniTra(oggi, f?.scadenza)
  return g === null ? 0 : Math.max(0, -g)
}

/**
 * Conto economico del periodo: ricavi per componente, costi diretti, costo
 * del lavoro, spese, risultato. Tutto al netto dell'IVA.
 */
export function contoEconomico({
  invoices = [],
  expenses = [],
  attendance = [],
  employees = [],
  da,
  a,
  oneri = 0.32,
} = {}) {
  const inRange = (d) => (!da || d >= da) && (!a || d <= a)

  let manodopera = 0
  let ricambi = 0
  let costoRicambi = 0
  for (const f of invoices) {
    if (f.stato === 'annullata' || !inRange(f.data)) continue
    const t = totaliDocumento(f.righe || [], f.scontoGlobale || 0)
    manodopera += t.manodopera
    ricambi += t.ricambi
    costoRicambi += (f.righe || [])
      .filter((r) => r.tipo !== 'manodopera')
      .reduce((s, r) => s + costoRiga(r), 0)
  }

  const pagaDi = new Map(employees.map((e) => [e.id, Number(e.pagaOraria || 0)]))
  let costoLavoro = 0
  let orePresenza = 0
  for (const p of attendance) {
    if (!inRange(p.data)) continue
    costoLavoro += costoPresenza(p, pagaDi.get(p.employeeId) || 0, oneri)
    orePresenza += Number(p.oreOrdinarie || 0) + Number(p.oreStraordinario || 0)
  }

  const speseFisse = []
  const speseVariabili = []
  for (const s of expenses) {
    if (!inRange(s.data)) continue
    // I ricambi acquistati sono già valorizzati come costo del venduto sulle
    // fatture: contarli anche come spesa li conterebbe due volte.
    if (s.categoria === 'Ricambi e materiali') continue
    ;(s.tipo === 'fisso' ? speseFisse : speseVariabili).push(s)
  }
  const sommaSpese = (arr) => arrotonda(arr.reduce((t, s) => t + Number(s.imponibile || 0), 0))

  const ricavi = arrotonda(manodopera + ricambi)
  const costiVariabili = arrotonda(costoRicambi + sommaSpese(speseVariabili))
  const costiFissi = arrotonda(sommaSpese(speseFisse) + costoLavoro)

  return {
    ricaviManodopera: arrotonda(manodopera),
    ricaviRicambi: arrotonda(ricambi),
    ricavi,
    costoRicambi: arrotonda(costoRicambi),
    costoLavoro: arrotonda(costoLavoro),
    orePresenza: arrotonda(orePresenza, 2),
    speseFisse: sommaSpese(speseFisse),
    speseVariabili: sommaSpese(speseVariabili),
    costiVariabili,
    costiFissi,
    margineContribuzione: arrotonda(ricavi - costiVariabili),
    margineContribuzionePerc: arrotonda(div(ricavi - costiVariabili, ricavi), 4),
    margineManodopera: arrotonda(manodopera - costoLavoro),
    margineRicambi: arrotonda(ricambi - costoRicambi),
    margineRicambiPerc: arrotonda(div(ricambi - costoRicambi, ricambi), 4),
    risultato: arrotonda(ricavi - costiVariabili - costiFissi),
    risultatoPerc: arrotonda(div(ricavi - costiVariabili - costiFissi, ricavi), 4),
  }
}

/** KPI del mese per la dashboard. */
export function kpiMese(db, ym = meseDi(oggiIso()), settings = {}) {
  const { da, a, giorni } = rangeMese(ym)
  const oneri = Number(settings.oneriContributivi ?? 0.32)
  const ce = contoEconomico({
    invoices: db.invoices || [],
    expenses: db.expenses || [],
    attendance: db.attendance || [],
    employees: db.employees || [],
    da,
    a,
    oneri,
  })

  const fatture = (db.invoices || []).filter(
    (f) => f.data >= da && f.data <= a && f.stato !== 'annullata',
  )
  const schedeChiuse = (db.jobs || []).filter(
    (j) => j.dataConsegna && j.dataConsegna >= da && j.dataConsegna <= a,
  )
  const righe = (db.jobLines || []).filter((l) => l.data >= da && l.data <= a)
  const oreVendute = righe
    .filter((l) => l.tipo === 'manodopera')
    .reduce((s, l) => s + Number(l.ore || 0), 0)

  // La produttività si misura su chi può vendere ore. Mettere al
  // denominatore anche l'accettazione e l'amministrazione darebbe un numero
  // sempre basso e senza significato: quelle ore non sono mai state
  // fatturabili. Restano invece nel costo del lavoro, dove è giusto che siano.
  const produttivi = new Set(
    (db.employees || []).filter((e) => e.produttivo !== false).map((e) => e.id),
  )
  const orePresenzaProduttiva = (db.attendance || [])
    .filter((p) => p.data >= da && p.data <= a && produttivi.has(p.employeeId))
    .reduce((s, p) => s + Number(p.oreOrdinarie || 0) + Number(p.oreStraordinario || 0), 0)

  // Giorni di apertura: domenica è chiusa.
  let giorniAperti = 0
  for (let g = 1; g <= giorni; g++) {
    const iso = `${ym}-${String(g).padStart(2, '0')}`
    if (giornoSettimana(iso) !== 0) giorniAperti++
  }

  const marginiScheda = schedeChiuse.map((j) => {
    const t = totaliDocumento((db.jobLines || []).filter((l) => l.jobId === j.id))
    return t.marginePerc
  })

  return {
    periodo: ym,
    da,
    a,
    fatturato: ce.ricavi,
    fatturatoManodopera: ce.ricaviManodopera,
    fatturatoRicambi: ce.ricaviRicambi,
    numeroFatture: fatture.length,
    oreVendute: arrotonda(oreVendute, 2),
    orePresenza: ce.orePresenza,
    orePresenzaProduttiva: arrotonda(orePresenzaProduttiva, 2),
    produttivita: produttivita(oreVendute, orePresenzaProduttiva),
    incidenzaRicambi: incidenzaRicambi(ce.costoRicambi, ce.ricavi),
    margineMedioScheda: media(marginiScheda),
    schedeChiuse: schedeChiuse.length,
    schedeAperte: (db.jobs || []).filter(
      (j) => !['consegnato', 'fatturato', 'annullato'].includes(j.stato),
    ).length,
    valoreMedioScheda: valoreMedioScheda(ce.ricavi, schedeChiuse.length),
    occupazionePonti: occupazionePonti(
      oreVendute,
      settings.numeroPonti || 3,
      settings.oreApertura || 8,
      giorniAperti,
    ),
    risultato: ce.risultato,
    contoEconomico: ce,
  }
}

/* ------------------------------------------------------------------ *
 * 8. Alert
 * ------------------------------------------------------------------ */

/**
 * Alert operativi della dashboard, in ordine di urgenza.
 * Ogni voce porta il modulo di destinazione, così il click ci va sopra.
 */
export function generaAlert(db, settings = {}, oggi = oggiIso()) {
  const out = []
  const push = (a) => out.push(a)

  const gFermo = Number(settings.giorniAlertScheda ?? 5)
  const finestraScadenze = Number(settings.giorniAlertScadenze ?? 30)

  const clienteDi = new Map((db.customers || []).map((c) => [c.id, c]))
  const veicoloDi = new Map((db.vehicles || []).map((v) => [v.id, v]))

  // Schede ferme
  for (const j of db.jobs || []) {
    if (['consegnato', 'fatturato', 'annullato'].includes(j.stato)) continue
    const rif = j.dataInizio || j.dataApertura
    const fermo = -giorniTra(oggi, rif)
    if (fermo > gFermo) {
      push({
        id: `job-fermo-${j.id}`,
        gravita: fermo > gFermo * 2 ? 'alta' : 'media',
        modulo: 'schede',
        entita: j.id,
        titolo: `Scheda ${j.numero} ferma da ${fermo} giorni`,
        dettaglio: `${veicoloDi.get(j.vehicleId)?.targa || '—'} · ${j.stato.replace(/_/g, ' ')}`,
        valore: fermo,
      })
    }
  }

  // Sotto scorta
  for (const art of db.articles || []) {
    if (art.attivo === false) continue
    const soglia = Number(art.puntoRiordino || art.scortaMinima || 0)
    if (soglia > 0 && Number(art.giacenza || 0) <= soglia) {
      push({
        id: `art-scorta-${art.id}`,
        gravita: Number(art.giacenza || 0) <= 0 ? 'alta' : 'media',
        modulo: 'magazzino',
        entita: art.id,
        titolo: `${art.descrizione} sotto scorta`,
        dettaglio: `Giacenza ${art.giacenza} · minimo ${art.scortaMinima} · ${art.codice}`,
        valore: soglia - Number(art.giacenza || 0),
      })
    }
  }

  // Preventivi in scadenza o scaduti
  for (const q of db.quotes || []) {
    if (!['inviato', 'bozza'].includes(q.stato)) continue
    const g = giorniTra(oggi, q.validoAl)
    if (g === null) continue
    if (g < 0) {
      push({
        id: `quote-scaduto-${q.id}`,
        gravita: 'bassa',
        modulo: 'preventivi',
        entita: q.id,
        titolo: `Preventivo ${q.numero} scaduto`,
        dettaglio: `${nomeBreveCliente(clienteDi.get(q.customerId))} · da ${-g} giorni`,
        valore: -g,
      })
    } else if (g <= 7) {
      push({
        id: `quote-scadenza-${q.id}`,
        gravita: 'media',
        modulo: 'preventivi',
        entita: q.id,
        titolo: `Preventivo ${q.numero} in scadenza`,
        dettaglio: `${nomeBreveCliente(clienteDi.get(q.customerId))} · ${g === 0 ? 'oggi' : `tra ${g} gg`}`,
        valore: g,
      })
    }
  }

  // Scadenze veicolo
  const scadenzeVeicolo = [
    ['scadenzaRevisione', 'Revisione'],
    ['scadenzaBollo', 'Bollo'],
    ['scadenzaAssicurazione', 'Assicurazione'],
    ['prossimoTagliandoData', 'Tagliando'],
    ['scadenzaDistribuzione', 'Distribuzione'],
  ]
  for (const v of db.vehicles || []) {
    for (const [campo, etichetta] of scadenzeVeicolo) {
      const g = giorniTra(oggi, v[campo])
      if (g === null || g > finestraScadenze) continue
      push({
        id: `veh-${campo}-${v.id}`,
        gravita: g < 0 ? 'alta' : g <= 10 ? 'media' : 'bassa',
        modulo: 'veicoli',
        entita: v.id,
        titolo: `${etichetta} ${g < 0 ? 'scaduta' : 'in scadenza'} — ${v.targa}`,
        dettaglio: `${v.marca} ${v.modello} · ${nomeBreveCliente(clienteDi.get(v.customerId))}`,
        valore: g,
      })
    }
    // Tagliando a chilometraggio. La soglia è 2.000 km e non 1.000: chi fa
    // 15.000 km l'anno copre mille chilometri in tre settimane, e a quel punto
    // chiamarlo per fissare l'appuntamento è tardi.
    if (v.prossimoTagliandoKm && Number(v.km || 0) >= Number(v.prossimoTagliandoKm) - 2000) {
      push({
        id: `veh-tagliando-km-${v.id}`,
        gravita: Number(v.km) >= Number(v.prossimoTagliandoKm) ? 'alta' : 'bassa',
        modulo: 'veicoli',
        entita: v.id,
        titolo: `Tagliando a km — ${v.targa}`,
        dettaglio: `${v.km} km su ${v.prossimoTagliandoKm} previsti`,
        valore: Number(v.prossimoTagliandoKm) - Number(v.km),
      })
    }
  }

  // Fatture scadute
  for (const f of db.invoices || []) {
    if (!fatturaScaduta(f, oggi)) continue
    const gg = giorniScaduto(f, oggi)
    push({
      id: `inv-scaduta-${f.id}`,
      gravita: gg > 30 ? 'alta' : 'media',
      modulo: 'fatturazione',
      entita: f.id,
      titolo: `Fattura ${f.numero} non incassata`,
      dettaglio: `${nomeBreveCliente(clienteDi.get(f.customerId))} · scaduta da ${gg} gg`,
      valore: residuoFattura(f),
    })
  }

  // Certificazioni del personale
  for (const e of db.employees || []) {
    for (const c of e.certificazioni || []) {
      const g = giorniTra(oggi, c.scadenza)
      if (g === null || g > 60) continue
      push({
        id: `emp-cert-${e.id}-${c.nome}`,
        gravita: g < 0 ? 'alta' : 'bassa',
        modulo: 'personale',
        entita: e.id,
        titolo: `${c.nome} ${g < 0 ? 'scaduta' : 'in scadenza'} — ${e.nome} ${e.cognome}`,
        dettaglio: g < 0 ? `da ${-g} giorni` : `tra ${g} giorni`,
        valore: g,
      })
    }
  }

  const peso = { alta: 0, media: 1, bassa: 2 }
  return out.sort((a, b) => peso[a.gravita] - peso[b.gravita] || a.titolo.localeCompare(b.titolo))
}

function nomeBreveCliente(c) {
  if (!c) return '—'
  return c.tipo === 'azienda' ? c.ragioneSociale : `${c.cognome} ${c.nome}`
}
