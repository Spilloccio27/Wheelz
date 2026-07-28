import { describe, it, expect } from 'vitest'
import {
  arrotonda,
  ricavoManodopera,
  costoOrarioMeccanico,
  costoPresenza,
  margineRicambio,
  prezzoVenditaConsigliato,
  prezzoMedioPonderato,
  incidenzaRicambi,
  rotazioneMagazzino,
  baseRiga,
  imponibileRiga,
  costoRiga,
  totaliDocumento,
  produttivita,
  occupazionePonti,
  valoreMedioScheda,
  breakEven,
  mediana,
  media,
  matriceInterventi,
  totaleFattura,
  incassatoFattura,
  residuoFattura,
  fatturaScaduta,
  giorniScaduto,
  contoEconomico,
  kpiMese,
  generaAlert,
  MAGGIORAZIONE_STRAORDINARIO,
} from './calc.js'

describe('arrotonda', () => {
  it('arrotonda a due decimali per difetto e per eccesso', () => {
    expect(arrotonda(10.004)).toBe(10)
    expect(arrotonda(10.005)).toBe(10.01)
    expect(arrotonda(1.005)).toBe(1.01) // il classico caso che il float sbaglia
    expect(arrotonda(-2.345, 2)).toBe(-2.34)
  })
  it('regge valori non numerici', () => {
    expect(arrotonda(undefined)).toBe(0)
    expect(arrotonda('ciao')).toBe(0)
  })
})

describe('manodopera', () => {
  it('ricavo = ore × tariffa', () => {
    expect(ricavoManodopera(2.5, 45)).toBe(112.5)
    expect(ricavoManodopera(0, 45)).toBe(0)
    expect(ricavoManodopera(1.75, 52)).toBe(91)
  })

  it('costo orario applica gli oneri contributivi', () => {
    expect(costoOrarioMeccanico(12, 0.32)).toBe(15.84)
    expect(costoOrarioMeccanico(12, 0)).toBe(12)
  })

  it('lo straordinario è maggiorato del 15% prima degli oneri', () => {
    expect(MAGGIORAZIONE_STRAORDINARIO).toBe(0.15)
    expect(costoOrarioMeccanico(12, 0.32, { straordinario: true })).toBe(
      arrotonda(12 * 1.15 * 1.32, 4),
    )
    expect(costoOrarioMeccanico(12, 0.32, { straordinario: true })).toBe(18.216)
  })

  it('il costo di una presenza somma ordinarie e straordinari', () => {
    const p = { oreOrdinarie: 8, oreStraordinario: 2 }
    expect(costoPresenza(p, 12, 0.32)).toBe(arrotonda(8 * 15.84 + 2 * 18.216))
    expect(costoPresenza({ oreOrdinarie: 0, oreStraordinario: 0 }, 12)).toBe(0)
  })
})

describe('ricambi', () => {
  it('margine = (vendita − costo) / vendita', () => {
    expect(margineRicambio(100, 65)).toBe(0.35)
    expect(margineRicambio(80, 80)).toBe(0)
    expect(margineRicambio(50, 60)).toBe(-0.2)
  })

  it('vendita sotto costo dà margine negativo, non zero', () => {
    expect(margineRicambio(10, 25)).toBeLessThan(0)
  })

  it('prezzo di vendita consigliato: ricarico e poi IVA', () => {
    expect(prezzoVenditaConsigliato(100, 0.35, 22)).toEqual({ netto: 135, lordo: 164.7 })
    expect(prezzoVenditaConsigliato(42.5, 0.4, 22).netto).toBe(59.5)
    expect(prezzoVenditaConsigliato(100, 0, 0)).toEqual({ netto: 100, lordo: 100 })
  })

  it('incidenza ricambi = costo ricambi / fatturato', () => {
    expect(incidenzaRicambi(3000, 12000)).toBe(0.25)
    expect(incidenzaRicambi(3000, 0)).toBe(0) // niente divisioni per zero
  })

  it('rotazione di magazzino su base annua e giorni di copertura', () => {
    const r = rotazioneMagazzino(6000, 12000, 30)
    expect(r.indicePeriodo).toBe(0.5)
    expect(r.indiceAnnuo).toBe(6.08)
    expect(r.giorniCopertura).toBe(60)
  })
})

describe('prezzo medio ponderato', () => {
  it('media il carico sulla giacenza esistente', () => {
    // 10 pezzi a 20 € + 10 pezzi a 30 € → 25 €
    expect(prezzoMedioPonderato(10, 20, 10, 30)).toBe(25)
    // 8 a 12,50 + 2 a 20 → (100 + 40) / 10 = 14
    expect(prezzoMedioPonderato(8, 12.5, 2, 20)).toBe(14)
  })

  it('con giacenza a zero il nuovo prezzo di carico fa testo', () => {
    expect(prezzoMedioPonderato(0, 99, 5, 10)).toBe(10)
    expect(prezzoMedioPonderato(-3, 99, 5, 10)).toBe(10)
  })

  it('un carico di quantità nulla non muove il prezzo medio', () => {
    expect(prezzoMedioPonderato(10, 20, 0, 999)).toBe(20)
    expect(prezzoMedioPonderato(10, 20, -4, 999)).toBe(20)
  })

  it('carichi successivi convergono verso l’ultimo prezzo', () => {
    let g = 0
    let pm = 0
    for (const [q, p] of [
      [10, 10],
      [10, 20],
      [20, 30],
    ]) {
      pm = prezzoMedioPonderato(g, pm, q, p)
      g += q
    }
    // (10×10 + 10×20 + 20×30) / 40 = 900/40 = 22,50
    expect(pm).toBe(22.5)
    expect(g).toBe(40)
  })

  it('mantiene quattro decimali sui pezzi minuti', () => {
    expect(prezzoMedioPonderato(3, 0.15, 7, 0.22)).toBe(0.199)
  })
})

describe('righe e totali di documento', () => {
  const manodopera = { tipo: 'manodopera', ore: 2, tariffaOraria: 45, sconto: 0, aliquotaIva: 22 }
  const ricambio = {
    tipo: 'ricambio',
    quantita: 4,
    prezzo: 25,
    costoUnitario: 15,
    sconto: 10,
    aliquotaIva: 22,
  }

  it('base riga secondo il tipo', () => {
    expect(baseRiga(manodopera)).toBe(90)
    expect(baseRiga(ricambio)).toBe(100)
  })

  it('lo sconto di riga si applica sulla base', () => {
    expect(imponibileRiga(manodopera)).toBe(90)
    expect(imponibileRiga(ricambio)).toBe(90)
  })

  it('lo sconto è limitato a 0-100', () => {
    expect(imponibileRiga({ ...ricambio, sconto: 150 })).toBe(0)
    expect(imponibileRiga({ ...ricambio, sconto: -20 })).toBe(100)
  })

  it('costo riga: costo medio sui ricambi, costo orario sulla manodopera', () => {
    expect(costoRiga(ricambio)).toBe(60)
    expect(costoRiga({ ...manodopera, costoOrario: 15.84 })).toBe(31.68)
  })

  it('totali con IVA per aliquota', () => {
    const t = totaliDocumento([manodopera, ricambio, { ...ricambio, aliquotaIva: 10 }])
    expect(t.manodopera).toBe(90)
    expect(t.ricambi).toBe(180)
    expect(t.imponibile).toBe(270)
    expect(t.ivaPerAliquota).toEqual([
      { aliquota: 22, imponibile: 180, imposta: 39.6 },
      { aliquota: 10, imponibile: 90, imposta: 9 },
    ])
    expect(t.iva).toBe(48.6)
    expect(t.totale).toBe(318.6)
  })

  it('lo sconto globale scala tutte le righe e quindi l’IVA', () => {
    const t = totaliDocumento([manodopera, ricambio], 10)
    expect(t.imponibile).toBe(162)
    expect(t.iva).toBe(35.64)
    expect(t.totale).toBe(197.64)
  })

  it('margine di documento', () => {
    const t = totaliDocumento([{ ...manodopera, costoOrario: 15.84 }, ricambio])
    expect(t.costo).toBe(91.68)
    expect(t.margine).toBe(88.32)
    expect(t.marginePerc).toBe(0.4907)
  })

  it('documento vuoto', () => {
    const t = totaliDocumento([])
    expect(t).toMatchObject({ imponibile: 0, iva: 0, totale: 0, marginePerc: 0 })
  })
})

describe('produttività e capacità', () => {
  it('produttività = ore vendute / ore presenza', () => {
    expect(produttivita(140, 160)).toBe(0.875)
    expect(produttivita(0, 160)).toBe(0)
    expect(produttivita(10, 0)).toBe(0)
  })

  it('occupazione ponti sulla capacità del periodo', () => {
    // 3 ponti × 8 h × 22 gg = 528 h
    expect(occupazionePonti(396, 3, 8, 22)).toBe(0.75)
    expect(occupazionePonti(100, 0, 8, 22)).toBe(0)
  })

  it('valore medio scheda', () => {
    expect(valoreMedioScheda(24000, 60)).toBe(400)
    expect(valoreMedioScheda(24000, 0)).toBe(0)
  })
})

describe('break-even', () => {
  it('fatturato di pareggio = costi fissi / margine di contribuzione', () => {
    const b = breakEven({
      costiFissi: 18000,
      margineContribuzione: 0.6,
      valoreMedioScheda: 400,
      giorniLavorativi: 25,
      tariffaMedia: 45,
      quotaManodopera: 0.6,
    })
    expect(b.fatturato).toBe(30000)
    expect(b.schedeGiorno).toBe(3) // 30000 / 400 / 25
    expect(b.oreVenduteGiorno).toBe(16) // 30000 × 0,6 / 45 / 25
    expect(b.raggiungibile).toBe(true)
  })

  it('margine di contribuzione nullo o negativo: pareggio irraggiungibile', () => {
    expect(breakEven({ costiFissi: 10000, margineContribuzione: 0 }).raggiungibile).toBe(false)
    expect(breakEven({ costiFissi: 10000, margineContribuzione: -0.1 }).fatturato).toBe(null)
  })
})

describe('statistica di supporto', () => {
  it('mediana su lunghezza dispari e pari', () => {
    expect(mediana([3, 1, 2])).toBe(2)
    expect(mediana([4, 1, 3, 2])).toBe(2.5)
    expect(mediana([])).toBe(0)
  })
  it('media ignora i valori non numerici', () => {
    expect(media([2, 4, 6])).toBe(4)
    expect(media([2, null, 6])).toBe(4)
    expect(media([])).toBe(0)
  })
})

describe('matrice interventi', () => {
  const voci = [
    { tipo: 'Tagliando', frequenza: 40, margine: 0.55 },
    { tipo: 'Freni', frequenza: 25, margine: 0.48 },
    { tipo: 'Gomme', frequenza: 30, margine: 0.22 },
    { tipo: 'Distribuzione', frequenza: 6, margine: 0.62 },
    { tipo: 'Carrozzeria', frequenza: 4, margine: 0.2 },
  ]

  it('assegna i quattro quadranti rispetto a mediana e media', () => {
    const m = matriceInterventi(voci)
    expect(m.sogliaFrequenza).toBe(25)
    const per = Object.fromEntries(m.voci.map((v) => [v.tipo, v.quadrante]))
    expect(per).toEqual({
      Tagliando: 'traino',
      Freni: 'traino',
      Gomme: 'volume',
      Distribuzione: 'nicchia',
      Carrozzeria: 'marginale',
    })
  })

  it('lista vuota non rompe nulla', () => {
    expect(matriceInterventi([]).voci).toEqual([])
  })
})

describe('fatture', () => {
  const f = {
    id: 'f1',
    numero: '12/2025',
    data: '2025-03-10',
    scadenza: '2025-04-09',
    stato: 'emessa',
    righe: [
      { tipo: 'manodopera', ore: 2, tariffaOraria: 45, aliquotaIva: 22 },
      { tipo: 'ricambio', quantita: 1, prezzo: 60, costoUnitario: 40, aliquotaIva: 22 },
    ],
    pagamenti: [{ importo: 100, metodo: 'POS', data: '2025-03-12' }],
  }

  it('totale, incassato e residuo', () => {
    expect(totaleFattura(f)).toBe(183)
    expect(incassatoFattura(f)).toBe(100)
    expect(residuoFattura(f)).toBe(83)
  })

  it('è scaduta solo se ha residuo e la data è passata', () => {
    expect(fatturaScaduta(f, '2025-04-20')).toBe(true)
    expect(giorniScaduto(f, '2025-04-20')).toBe(11)
    expect(fatturaScaduta(f, '2025-04-01')).toBe(false)
    const saldata = { ...f, pagamenti: [{ importo: 183 }] }
    expect(fatturaScaduta(saldata, '2025-06-01')).toBe(false)
    expect(fatturaScaduta({ ...f, stato: 'annullata' }, '2025-06-01')).toBe(false)
  })
})

describe('conto economico', () => {
  const dati = {
    da: '2025-03-01',
    a: '2025-03-31',
    oneri: 0.32,
    employees: [{ id: 'e1', pagaOraria: 12 }],
    attendance: [
      { employeeId: 'e1', data: '2025-03-03', oreOrdinarie: 8, oreStraordinario: 0 },
      { employeeId: 'e1', data: '2025-03-04', oreOrdinarie: 8, oreStraordinario: 2 },
      { employeeId: 'e1', data: '2025-02-27', oreOrdinarie: 8, oreStraordinario: 0 }, // fuori periodo
    ],
    invoices: [
      {
        data: '2025-03-10',
        stato: 'emessa',
        righe: [
          { tipo: 'manodopera', ore: 10, tariffaOraria: 45, aliquotaIva: 22 },
          { tipo: 'ricambio', quantita: 2, prezzo: 100, costoUnitario: 60, aliquotaIva: 22 },
        ],
      },
      { data: '2025-03-11', stato: 'annullata', righe: [{ tipo: 'manodopera', ore: 99, tariffaOraria: 45 }] },
    ],
    expenses: [
      { data: '2025-03-01', categoria: 'Affitto', tipo: 'fisso', imponibile: 900 },
      { data: '2025-03-05', categoria: 'Utenze', tipo: 'variabile', imponibile: 210 },
      { data: '2025-03-06', categoria: 'Ricambi e materiali', tipo: 'variabile', imponibile: 5000 },
    ],
  }

  it('separa ricavi, costi variabili e costi fissi', () => {
    const ce = contoEconomico(dati)
    expect(ce.ricaviManodopera).toBe(450)
    expect(ce.ricaviRicambi).toBe(200)
    expect(ce.ricavi).toBe(650)
    expect(ce.costoRicambi).toBe(120)
    expect(ce.orePresenza).toBe(18)
    expect(ce.costoLavoro).toBe(arrotonda(16 * 15.84 + 2 * 18.216))
    expect(ce.speseFisse).toBe(900)
    expect(ce.speseVariabili).toBe(210)
  })

  it('non conta due volte l’acquisto di ricambi', () => {
    const ce = contoEconomico(dati)
    // la spesa da 5.000 € in "Ricambi e materiali" è esclusa: il costo dei
    // ricambi è già valorizzato a costo del venduto sulle fatture.
    expect(ce.costiVariabili).toBe(330)
  })

  it('esclude le fatture annullate', () => {
    const ce = contoEconomico(dati)
    expect(ce.ricaviManodopera).toBe(450)
  })

  it('margine di contribuzione e risultato', () => {
    const ce = contoEconomico(dati)
    expect(ce.margineContribuzione).toBe(320)
    expect(ce.risultato).toBe(arrotonda(650 - 330 - (900 + ce.costoLavoro)))
  })
})

describe('kpiMese', () => {
  const db = {
    invoices: [
      {
        id: 'f1',
        data: '2025-03-10',
        stato: 'emessa',
        righe: [
          { tipo: 'manodopera', ore: 10, tariffaOraria: 45, aliquotaIva: 22 },
          { tipo: 'ricambio', quantita: 2, prezzo: 100, costoUnitario: 60, aliquotaIva: 22 },
        ],
      },
    ],
    jobs: [
      { id: 'j1', dataConsegna: '2025-03-11', stato: 'fatturato' },
      { id: 'j2', dataApertura: '2025-03-20', stato: 'in_lavorazione' },
    ],
    jobLines: [
      { jobId: 'j1', data: '2025-03-10', tipo: 'manodopera', ore: 10, tariffaOraria: 45, costoOrario: 15.84 },
      { jobId: 'j1', data: '2025-03-10', tipo: 'ricambio', quantita: 2, prezzo: 100, costoUnitario: 60 },
    ],
    attendance: [
      { employeeId: 'e1', data: '2025-03-10', oreOrdinarie: 8 },
      // L'accettazione è presente, ma non vende ore su scheda.
      { employeeId: 'e2', data: '2025-03-10', oreOrdinarie: 6 },
    ],
    employees: [
      { id: 'e1', pagaOraria: 12 },
      { id: 'e2', pagaOraria: 11, produttivo: false },
    ],
    expenses: [],
  }

  it('riassume il mese', () => {
    const k = kpiMese(db, '2025-03', { numeroPonti: 3, oreApertura: 8, oneriContributivi: 0.32 })
    expect(k.fatturato).toBe(650)
    expect(k.oreVendute).toBe(10)
    expect(k.orePresenza).toBe(14)
    expect(k.produttivita).toBe(1.25)
    expect(k.schedeChiuse).toBe(1)
    expect(k.schedeAperte).toBe(1)
    expect(k.valoreMedioScheda).toBe(650)
    expect(k.incidenzaRicambi).toBe(incidenzaRicambi(120, 650))
  })

  it('la produttività esclude chi non vende ore, il costo del lavoro no', () => {
    const k = kpiMese(db, '2025-03', { oneriContributivi: 0.32 })
    // Denominatore: solo le 8 ore del meccanico, non le 6 dell'accettazione.
    expect(k.orePresenzaProduttiva).toBe(8)
    expect(k.produttivita).toBe(produttivita(10, 8))
    // Le ore dell'accettazione restano però nel costo del lavoro.
    expect(k.contoEconomico.orePresenza).toBe(14)
    expect(k.contoEconomico.costoLavoro).toBe(
      arrotonda(8 * costoOrarioMeccanico(12, 0.32) + 6 * costoOrarioMeccanico(11, 0.32)),
    )
  })

  it('un mese senza attività non produce NaN', () => {
    const k = kpiMese(db, '2025-01', {})
    expect(k.fatturato).toBe(0)
    expect(Number.isFinite(k.produttivita)).toBe(true)
    expect(k.valoreMedioScheda).toBe(0)
  })
})

describe('generaAlert', () => {
  const db = {
    customers: [{ id: 'c1', tipo: 'privato', nome: 'Mario', cognome: 'Bianchi' }],
    vehicles: [
      {
        id: 'v1',
        customerId: 'c1',
        targa: 'AB123CD',
        marca: 'Fiat',
        modello: 'Panda',
        km: 118000,
        prossimoTagliandoKm: 120000,
        scadenzaRevisione: '2025-03-20',
      },
    ],
    jobs: [
      { id: 'j1', numero: '25/0007', vehicleId: 'v1', stato: 'attesa_ricambi', dataApertura: '2025-03-01' },
      { id: 'j2', numero: '25/0008', vehicleId: 'v1', stato: 'consegnato', dataApertura: '2025-01-01' },
    ],
    articles: [
      { id: 'a1', codice: 'OF-101', descrizione: 'Filtro olio', giacenza: 1, scortaMinima: 4, puntoRiordino: 6 },
      { id: 'a2', codice: 'OF-102', descrizione: 'Filtro aria', giacenza: 20, scortaMinima: 4, puntoRiordino: 6 },
    ],
    quotes: [{ id: 'q1', numero: '25/0012', customerId: 'c1', stato: 'inviato', validoAl: '2025-03-18' }],
    invoices: [
      {
        id: 'f1',
        numero: '3/2025',
        customerId: 'c1',
        stato: 'emessa',
        scadenza: '2025-02-01',
        righe: [{ tipo: 'manodopera', ore: 1, tariffaOraria: 45, aliquotaIva: 22 }],
        pagamenti: [],
      },
    ],
    employees: [
      { id: 'e1', nome: 'Luca', cognome: 'Verdi', certificazioni: [{ nome: 'Patentino F-Gas', scadenza: '2025-04-01' }] },
    ],
  }

  const alert = generaAlert(db, { giorniAlertScheda: 5 }, '2025-03-15')
  const ids = alert.map((a) => a.id)

  it('segnala le schede ferme e ignora quelle chiuse', () => {
    expect(ids).toContain('job-fermo-j1')
    expect(ids).not.toContain('job-fermo-j2')
  })

  it('segnala solo i ricambi sotto il punto di riordino', () => {
    expect(ids).toContain('art-scorta-a1')
    expect(ids).not.toContain('art-scorta-a2')
  })

  it('segnala preventivi, revisioni, tagliandi a km, insoluti e certificazioni', () => {
    expect(ids).toContain('quote-scadenza-q1')
    expect(ids).toContain('veh-scadenzaRevisione-v1')
    expect(ids).toContain('veh-tagliando-km-v1')
    expect(ids).toContain('inv-scaduta-f1')
    expect(ids).toContain('emp-cert-e1-Patentino F-Gas')
  })

  it('ordina per gravità decrescente', () => {
    const peso = { alta: 0, media: 1, bassa: 2 }
    const pesi = alert.map((a) => peso[a.gravita])
    expect([...pesi].sort((x, y) => x - y)).toEqual(pesi)
  })

  it('un database vuoto non genera alert', () => {
    expect(generaAlert({}, {}, '2025-03-15')).toEqual([])
  })
})
