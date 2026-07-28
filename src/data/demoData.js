/**
 * Generatore dei dati demo — "Autofficina Rossi & Figli".
 *
 * Officina generica di provincia: 5 addetti, 3 ponti, circa tre mesi di
 * storico. Serve a rendere l'applicazione esplorabile senza configurare
 * nulla, ma soprattutto a esercitare i moduli su dati che stanno in piedi.
 *
 * DETERMINISMO
 * Tutta la casualità passa da un unico RNG con seed (mulberry32): a parità
 * di seed e di data di ancoraggio, il dataset prodotto è identico byte per
 * byte. La data di ancoraggio è "oggi" per impostazione predefinita, così
 * scadenze e alert restano leggibili; passando `ancora` si ottiene un
 * dataset riproducibile anche nel tempo (lo fanno i test e `npm run seed`).
 *
 * COERENZA — le regole che il generatore non viola mai:
 *  1. ogni ora di manodopera su una scheda esiste anche come ora di presenza
 *     dello stesso meccanico nello stesso giorno;
 *  2. ogni ricambio impiegato su una scheda ha il suo movimento di scarico,
 *     e la giacenza dell'articolo è la somma algebrica dei suoi movimenti;
 *  3. ogni fattura nasce da una scheda consegnata, e ne riporta le righe;
 *  4. il prezzo medio ponderato di un articolo è il risultato dei suoi
 *     carichi, non un numero inventato;
 *  5. la domenica l'officina è chiusa: niente presenze, niente lavorazioni.
 */

import { addGiorni, addMesi, giornoSettimana, meseDi, oggiIso, toIso } from '../utils/format.js'
import { arrotonda, prezzoMedioPonderato, totaliDocumento } from '../utils/calc.js'

/* ------------------------------------------------------------------ *
 * RNG deterministico
 * ------------------------------------------------------------------ */

function mulberry32(seed) {
  let a = seed >>> 0
  return function rng() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const int = (r, min, max) => min + Math.floor(r() * (max - min + 1))
const num = (r, min, max, d = 2) => arrotonda(min + r() * (max - min), d)
const pick = (r, arr) => arr[Math.floor(r() * arr.length)]
const chance = (r, p) => r() < p
/** Valore continuo riportato al quarto d'ora: le officine fatturano così. */
const quarti = (v) => Math.max(0.25, Math.round(v * 4) / 4)

function pickPesato(r, voci) {
  const totale = voci.reduce((s, v) => s + v.peso, 0)
  let x = r() * totale
  for (const v of voci) {
    x -= v.peso
    if (x <= 0) return v
  }
  return voci[voci.length - 1]
}

const id = (prefisso, n) => `${prefisso}_${String(n).padStart(4, '0')}`

/* ------------------------------------------------------------------ *
 * Cataloghi
 * ------------------------------------------------------------------ */

const NOMI_M = ['Marco', 'Luca', 'Andrea', 'Giuseppe', 'Paolo', 'Stefano', 'Davide', 'Fabio', 'Alessandro', 'Roberto', 'Matteo', 'Simone', 'Giorgio', 'Nicola', 'Antonio']
const NOMI_F = ['Silvia', 'Chiara', 'Elena', 'Francesca', 'Giulia', 'Laura', 'Martina', 'Sara', 'Anna', 'Valentina', 'Federica', 'Ilaria']
const COGNOMI = ['Bianchi', 'Ferrari', 'Esposito', 'Romano', 'Colombo', 'Ricci', 'Marino', 'Greco', 'Bruno', 'Gallo', 'Conti', 'De Luca', 'Mancini', 'Costa', 'Giordano', 'Rizzo', 'Lombardi', 'Moretti', 'Barbieri', 'Fontana', 'Santoro', 'Mariani', 'Rinaldi', 'Caruso', 'Ferrara', 'Galli', 'Martini', 'Leone', 'Longo', 'Gentile']

const AZIENDE = [
  { ragioneSociale: 'Edilcasa Costruzioni S.r.l.', tipo: 'edilizia' },
  { ragioneSociale: 'Verdi Trasporti S.n.c.', tipo: 'trasporti' },
  { ragioneSociale: 'Panificio Aurora S.a.s.', tipo: 'alimentare' },
  { ragioneSociale: 'Idro Impianti Termotecnica S.r.l.', tipo: 'impianti' },
  { ragioneSociale: 'Agriservice Valle S.r.l.', tipo: 'agricolo' },
  { ragioneSociale: 'Comune di Villafranca', tipo: 'ente' },
]

const MODELLI = [
  { marca: 'Fiat', modello: 'Panda', allestimenti: ['1.2 Lounge', '1.0 Hybrid City Life', '1.3 MJT 4x4'], alim: ['Benzina', 'Diesel', 'Benzina/GPL'], cc: [1242, 999, 1248], kw: [51, 51, 59], peso: 12 },
  { marca: 'Fiat', modello: 'Punto', allestimenti: ['1.3 MJT Street', '1.2 Easy'], alim: ['Diesel', 'Benzina'], cc: [1248, 1242], kw: [70, 51], peso: 7 },
  { marca: 'Fiat', modello: 'Ducato', allestimenti: ['2.3 MJT 130 L2H2', '2.3 MJT 140 Maxi'], alim: ['Diesel'], cc: [2287], kw: [96, 103], peso: 5 },
  { marca: 'Volkswagen', modello: 'Golf', allestimenti: ['1.6 TDI Comfortline', '1.5 TSI Life'], alim: ['Diesel', 'Benzina'], cc: [1598, 1498], kw: [85, 96], peso: 9 },
  { marca: 'Volkswagen', modello: 'Polo', allestimenti: ['1.0 TSI Highline', '1.6 TDI Trendline'], alim: ['Benzina', 'Diesel'], cc: [999, 1598], kw: [70, 59], peso: 6 },
  { marca: 'Ford', modello: 'Fiesta', allestimenti: ['1.5 TDCi Titanium', '1.0 EcoBoost ST-Line'], alim: ['Diesel', 'Benzina'], cc: [1499, 998], kw: [63, 74], peso: 6 },
  { marca: 'Ford', modello: 'Transit Custom', allestimenti: ['2.0 TDCi 130 Trend'], alim: ['Diesel'], cc: [1995], kw: [96], peso: 4 },
  { marca: 'Renault', modello: 'Clio', allestimenti: ['1.5 dCi Zen', '1.0 TCe Intens'], alim: ['Diesel', 'Benzina'], cc: [1461, 999], kw: [63, 74], peso: 7 },
  { marca: 'Opel', modello: 'Corsa', allestimenti: ['1.3 CDTI Cosmo', '1.2 Edition'], alim: ['Diesel', 'Benzina'], cc: [1248, 1199], kw: [70, 55], peso: 6 },
  { marca: 'Peugeot', modello: '208', allestimenti: ['1.5 BlueHDi Allure', '1.2 PureTech Active'], alim: ['Diesel', 'Benzina'], cc: [1499, 1199], kw: [74, 60], peso: 5 },
  { marca: 'Citroën', modello: 'C3', allestimenti: ['1.5 BlueHDi Feel'], alim: ['Diesel'], cc: [1499], kw: [75], peso: 4 },
  { marca: 'Toyota', modello: 'Yaris', allestimenti: ['1.5 Hybrid Active'], alim: ['Ibrido'], cc: [1490], kw: [68], peso: 5 },
  { marca: 'Audi', modello: 'A3', allestimenti: ['2.0 TDI Business', '1.5 TFSI Sport'], alim: ['Diesel', 'Benzina'], cc: [1968, 1498], kw: [110, 110], peso: 4 },
  { marca: 'BMW', modello: 'Serie 1', allestimenti: ['118d Business', '116i Advantage'], alim: ['Diesel', 'Benzina'], cc: [1995, 1499], kw: [110, 80], peso: 3 },
  { marca: 'Mercedes-Benz', modello: 'Classe A', allestimenti: ['180 d Sport'], alim: ['Diesel'], cc: [1461], kw: [85], peso: 3 },
  { marca: 'Jeep', modello: 'Renegade', allestimenti: ['1.6 MJT Longitude'], alim: ['Diesel'], cc: [1598], kw: [88], peso: 3 },
  { marca: 'Dacia', modello: 'Duster', allestimenti: ['1.5 dCi 4x2 Comfort'], alim: ['Diesel'], cc: [1461], kw: [85], peso: 4 },
  { marca: 'Lancia', modello: 'Ypsilon', allestimenti: ['1.2 Gold', '0.9 TwinAir GPL'], alim: ['Benzina', 'Benzina/GPL'], cc: [1242, 875], kw: [51, 59], peso: 5 },
  { marca: 'Iveco', modello: 'Daily', allestimenti: ['35S14 2.3 HPI'], alim: ['Diesel'], cc: [2287], kw: [100], peso: 2 },
  { marca: 'Alfa Romeo', modello: 'Giulietta', allestimenti: ['1.6 JTDm Distinctive'], alim: ['Diesel'], cc: [1598], kw: [88], peso: 3 },
]

const CITTA = [
  ['Villafranca', '37069', 'VR'],
  ['Valeggio sul Mincio', '37067', 'VR'],
  ['Sommacampagna', '37066', 'VR'],
  ['Custoza', '37060', 'VR'],
  ['Povegliano Veronese', '37064', 'VR'],
  ['Mozzecane', '37060', 'VR'],
  ['Nogarole Rocca', '37060', 'VR'],
]

const VIE = ['Via Roma', 'Via Mazzini', 'Via Garibaldi', 'Via della Stazione', 'Viale Europa', 'Via Don Milani', 'Via dei Tigli', 'Via Kennedy', 'Corso Vittorio Emanuele', 'Via San Rocco']

/**
 * Tipi di intervento: ore preventivate, tariffa di riferimento e ricambi
 * tipicamente impiegati. È la spina dorsale del generatore, e la stessa
 * tabella alimenta la matrice interventi del modulo Report.
 */
const INTERVENTI = [
  { nome: 'Tagliando', peso: 26, ore: [1.25, 2.5], tariffa: 'mecc', reparto: 'meccanica', ricambi: ['filtro-olio', 'filtro-aria', 'filtro-abitacolo', 'olio-motore'], difetti: ['Tagliando programmato', 'Manutenzione ordinaria da libretto', 'Cambio olio e filtri'] },
  { nome: 'Freni', peso: 16, ore: [1.5, 3], tariffa: 'mecc', reparto: 'meccanica', ricambi: ['pastiglie-ant', 'dischi-ant', 'pastiglie-post', 'liquido-freni'], difetti: ['Rumore in frenata', 'Pedale lungo, frenata poco incisiva', 'Vibrazione al pedale del freno', 'Spia usura pastiglie accesa'] },
  { nome: 'Pneumatici', peso: 13, ore: [0.5, 1.5], tariffa: 'gomm', reparto: 'gommista', ricambi: ['pneumatico', 'valvola-tpms', 'equilibratura'], difetti: ['Cambio stagionale', 'Foratura anteriore destra', 'Usura irregolare battistrada', 'Sostituzione treno gomme'] },
  { nome: 'Elettrauto e diagnosi', peso: 12, ore: [0.75, 3], tariffa: 'diag', reparto: 'elettrauto', ricambi: ['batteria', 'sensore-abs', 'lampade', 'sonda-lambda'], difetti: ['Spia motore accesa', 'Non parte a freddo', 'Luce anabbagliante fulminata', 'Ricarica batteria assente', 'Errore centralina ABS'] },
  { nome: 'Climatizzazione', peso: 8, ore: [1, 2], tariffa: 'clima', reparto: 'elettrauto', ricambi: ['gas-r1234yf', 'filtro-abitacolo', 'sanificazione'], difetti: ['Clima non raffredda', 'Cattivo odore dalle bocchette', 'Ricarica impianto A/C'] },
  { nome: 'Sospensioni e sterzo', peso: 8, ore: [2, 4.5], tariffa: 'mecc', reparto: 'meccanica', ricambi: ['ammortizzatore', 'braccio-oscillante', 'assetto'], difetti: ['Rumore sui dossi', 'Sterzo che tira a destra', 'Ammortizzatore posteriore che perde'] },
  { nome: 'Distribuzione', peso: 5, ore: [4, 7], tariffa: 'mecc', reparto: 'meccanica', ricambi: ['kit-distribuzione', 'pompa-acqua', 'liquido-refrigerante'], difetti: ['Sostituzione cinghia a scadenza', 'Fischio dal vano motore', 'Cinghia distribuzione a 120.000 km'] },
  { nome: 'Frizione e cambio', peso: 4, ore: [4.5, 8], tariffa: 'mecc', reparto: 'meccanica', ricambi: ['kit-frizione', 'olio-cambio'], difetti: ['Frizione che slitta in salita', 'Difficoltà a innestare la seconda', 'Pedale frizione basso'] },
  { nome: 'Scarico e antinquinamento', peso: 4, ore: [1, 3.5], tariffa: 'mecc', reparto: 'meccanica', ricambi: ['sonda-lambda', 'marmitta', 'additivo-fap'], difetti: ['Rumore allo scarico', 'Rigenerazione FAP fallita', 'Spia antinquinamento'] },
  { nome: 'Revisione e pratiche', peso: 3, ore: [0.5, 1], tariffa: 'mecc', reparto: 'accettazione', ricambi: ['revisione-ministeriale'], difetti: ['Accompagnamento a revisione', 'Pre-revisione e messa a punto'] },
  { nome: 'Riparazione motore', peso: 1, ore: [6, 14], tariffa: 'mecc', reparto: 'meccanica', ricambi: ['guarnizione-testata', 'liquido-refrigerante', 'olio-motore'], difetti: ['Perdita di liquido refrigerante', 'Fumo bianco allo scarico', 'Motore in avaria'] },
]

/** Anagrafica ricambi: chiave interna → dati d'acquisto e di listino. */
const CATALOGO_RICAMBI = {
  'filtro-olio': { descrizione: 'Filtro olio motore', marca: 'Bosch', categoria: 'Filtri', costo: [4.2, 9.5], oe: 'F 026 407', ubicazione: 'A1', iva: 22 },
  'filtro-aria': { descrizione: 'Filtro aria motore', marca: 'Mann-Filter', categoria: 'Filtri', costo: [6.5, 16], oe: 'C 25 114', ubicazione: 'A2', iva: 22 },
  'filtro-abitacolo': { descrizione: 'Filtro abitacolo ai carboni attivi', marca: 'Mann-Filter', categoria: 'Filtri', costo: [7, 18], oe: 'CUK 26 009', ubicazione: 'A3', iva: 22 },
  'filtro-gasolio': { descrizione: 'Filtro gasolio', marca: 'UFI', categoria: 'Filtri', costo: [9, 24], oe: '24.ONE.00', ubicazione: 'A4', iva: 22 },
  'olio-motore': { descrizione: 'Olio motore 5W30 (al litro)', marca: 'Selenia', categoria: 'Lubrificanti', costo: [4.8, 7.5], oe: 'ACEA C3', ubicazione: 'B1', iva: 22, unita: 'lt' },
  'olio-cambio': { descrizione: 'Olio cambio 75W90 (al litro)', marca: 'Castrol', categoria: 'Lubrificanti', costo: [8, 13], oe: 'API GL-4', ubicazione: 'B2', iva: 22, unita: 'lt' },
  'liquido-freni': { descrizione: 'Liquido freni DOT 4 (1 lt)', marca: 'ATE', categoria: 'Lubrificanti', costo: [5.5, 9], oe: 'DOT4', ubicazione: 'B3', iva: 22 },
  'liquido-refrigerante': { descrizione: 'Liquido refrigerante G12 (al litro)', marca: 'Petronas', categoria: 'Lubrificanti', costo: [3.2, 5.5], oe: 'G12++', ubicazione: 'B4', iva: 22, unita: 'lt' },
  'pastiglie-ant': { descrizione: 'Kit pastiglie freno anteriori', marca: 'Brembo', categoria: 'Freni', costo: [22, 58], oe: 'P 23 139', ubicazione: 'C1', iva: 22 },
  'pastiglie-post': { descrizione: 'Kit pastiglie freno posteriori', marca: 'Brembo', categoria: 'Freni', costo: [18, 44], oe: 'P 85 020', ubicazione: 'C2', iva: 22 },
  'dischi-ant': { descrizione: 'Coppia dischi freno anteriori', marca: 'Brembo', categoria: 'Freni', costo: [38, 96], oe: '09.9464.11', ubicazione: 'C3', iva: 22 },
  'kit-distribuzione': { descrizione: 'Kit distribuzione completo', marca: 'Gates', categoria: 'Motore', costo: [78, 185], oe: 'K015623XS', ubicazione: 'D1', iva: 22 },
  'pompa-acqua': { descrizione: 'Pompa acqua', marca: 'SKF', categoria: 'Motore', costo: [28, 72], oe: 'VKPC 81230', ubicazione: 'D2', iva: 22 },
  'kit-frizione': { descrizione: 'Kit frizione con cuscinetto', marca: 'LuK', categoria: 'Trasmissione', costo: [120, 290], oe: '624 3164 09', ubicazione: 'D3', iva: 22 },
  'guarnizione-testata': { descrizione: 'Guarnizione testata', marca: 'Elring', categoria: 'Motore', costo: [42, 110], oe: '714.190', ubicazione: 'D4', iva: 22 },
  'batteria': { descrizione: 'Batteria 12V 70Ah', marca: 'Varta', categoria: 'Elettrico', costo: [58, 105], oe: 'E44', ubicazione: 'E1', iva: 22 },
  'sensore-abs': { descrizione: 'Sensore ABS ruota', marca: 'Bosch', categoria: 'Elettrico', costo: [19, 52], oe: '0 265 007 928', ubicazione: 'E2', iva: 22 },
  'lampade': { descrizione: 'Coppia lampade H7 55W', marca: 'Philips', categoria: 'Elettrico', costo: [5, 14], oe: 'H7', ubicazione: 'E3', iva: 22 },
  'sonda-lambda': { descrizione: 'Sonda lambda', marca: 'NGK', categoria: 'Elettrico', costo: [42, 98], oe: 'OZA659-EE86', ubicazione: 'E4', iva: 22 },
  'ammortizzatore': { descrizione: 'Ammortizzatore (cadauno)', marca: 'Monroe', categoria: 'Sospensioni', costo: [34, 88], oe: 'G8127', ubicazione: 'F1', iva: 22 },
  'braccio-oscillante': { descrizione: 'Braccio oscillante', marca: 'Lemförder', categoria: 'Sospensioni', costo: [28, 76], oe: '30875 01', ubicazione: 'F2', iva: 22 },
  'marmitta': { descrizione: 'Silenziatore posteriore', marca: 'Bosal', categoria: 'Scarico', costo: [45, 120], oe: '145-509', ubicazione: 'F3', iva: 22 },
  'pneumatico': { descrizione: 'Pneumatico 195/65 R15 (cadauno)', marca: 'Michelin', categoria: 'Pneumatici', costo: [48, 92], oe: '195/65R15 91H', ubicazione: 'G1', iva: 22 },
  'valvola-tpms': { descrizione: 'Valvola TPMS programmabile', marca: 'Schrader', categoria: 'Pneumatici', costo: [12, 26], oe: 'EZ-Sensor', ubicazione: 'G2', iva: 22 },
  'gas-r1234yf': { descrizione: 'Gas refrigerante R1234yf (100 g)', marca: 'Errecom', categoria: 'Clima', costo: [9, 16], oe: 'R1234yf', ubicazione: 'H1', iva: 22 },
  'additivo-fap': { descrizione: 'Additivo rigenerazione FAP', marca: 'Liqui Moly', categoria: 'Consumabili', costo: [8, 15], oe: 'LM-5171', ubicazione: 'H2', iva: 22 },
}

/** Voci a listino che non sono ricambi ma prestazioni con costo esterno. */
const PRESTAZIONI = {
  equilibratura: { descrizione: 'Equilibratura ruota', prezzo: 8, costo: 0, iva: 22 },
  assetto: { descrizione: 'Assetto ruote con banco prova', prezzo: 65, costo: 0, iva: 22 },
  sanificazione: { descrizione: 'Sanificazione impianto climatizzazione', prezzo: 35, costo: 6, iva: 22 },
  'revisione-ministeriale': { descrizione: 'Revisione ministeriale (centro convenzionato)', prezzo: 79.02, costo: 54, iva: 22 },
}

const FORNITORI = [
  { ragioneSociale: 'Ricambi Veneto S.p.A.', tipo: 'ricambista', sconto: 32, giorni: 1, pagamento: '30 gg d.f.f.m.' },
  { ragioneSociale: 'AutoParti Distribuzione S.r.l.', tipo: 'ricambista', sconto: 28, giorni: 2, pagamento: '60 gg d.f.f.m.' },
  { ragioneSociale: 'Gomme Nord S.r.l.', tipo: 'ricambista', sconto: 22, giorni: 2, pagamento: '30 gg d.f.' },
  { ragioneSociale: 'Elettro Diesel Service', tipo: 'terzista', sconto: 0, giorni: 4, pagamento: 'Bonifico a vista' },
  { ragioneSociale: 'Carrozzeria San Marco S.n.c.', tipo: 'terzista', sconto: 0, giorni: 6, pagamento: '30 gg d.f.' },
  { ragioneSociale: 'Centro Revisioni Villafranca', tipo: 'servizi', sconto: 0, giorni: 1, pagamento: 'Contanti' },
]

const CATEGORIE_SPESA = [
  'Ricambi e materiali',
  'Affitto',
  'Utenze',
  'Attrezzatura',
  'Smaltimento oli e rifiuti',
  'Assicurazioni',
  'Consulenze',
  'Formazione',
  'Carburante',
]

/* ------------------------------------------------------------------ *
 * Impostazioni predefinite
 * ------------------------------------------------------------------ */

export const TARIFFE_DEFAULT = [
  { id: 'mecc', nome: 'Meccanica generale', prezzoOrario: 45 },
  { id: 'diag', nome: 'Diagnosi ed elettrauto', prezzoOrario: 58 },
  { id: 'clima', nome: 'Climatizzazione', prezzoOrario: 50 },
  { id: 'gomm', nome: 'Gommista', prezzoOrario: 35 },
  { id: 'carr', nome: 'Carrozzeria', prezzoOrario: 52 },
]

export function settingsDefault(officinaId = 'demo') {
  return {
    id: 'settings',
    officinaId,
    ragioneSociale: 'Autofficina Rossi & Figli S.n.c.',
    piva: '03871540234',
    codiceFiscale: '03871540234',
    rea: 'VR-368421',
    indirizzo: 'Via dell’Artigianato 14',
    cap: '37069',
    citta: 'Villafranca di Verona',
    provincia: 'VR',
    telefono: '045 7900123',
    email: 'officina@rossiefigli.it',
    pec: 'rossiefigli@pec.it',
    sitoWeb: '',
    iban: 'IT60X0542811101000000123456',
    logoPath: null,
    tariffe: TARIFFE_DEFAULT.map((t) => ({ ...t })),
    ricaricoRicambi: 0.38,
    aliquotaIvaDefault: 22,
    aliquote: [22, 10, 4, 0],
    numeroPonti: 3,
    oreApertura: 8,
    giorniLavorativi: [1, 2, 3, 4, 5, 6],
    oneriContributivi: 0.32,
    giorniPagamentoDefault: 30,
    giorniValiditaPreventivo: 30,
    giorniAlertScheda: 5,
    giorniAlertScadenze: 30,
    // Obiettivi tarati su un'officina con tre ponti e cinque addetti, non su
    // numeri da manuale: servono a far muovere le barre della dashboard in
    // modo credibile, non a far vedere che va tutto bene.
    obiettivi: {
      fatturatoMese: 40000,
      oreVenduteGiorno: 16,
      marginalita: 0.5,
      incidenzaRicambi: 0.38,
      produttivita: 0.6,
    },
    numerazione: { jobs: 0, quotes: 0, invoices: 0, orders: 0 },
  }
}

/* ------------------------------------------------------------------ *
 * Generatore
 * ------------------------------------------------------------------ */

/**
 * @param {object} opzioni
 * @param {number} opzioni.seed      seed dell'RNG (default 20250127)
 * @param {string} opzioni.ancora    ultimo giorno dello storico, ISO
 * @param {number} opzioni.giorni    ampiezza dello storico in giorni
 */
export function generaDemo({ seed = 20250127, ancora = oggiIso(), giorni = 92 } = {}) {
  const r = mulberry32(seed)
  const officinaId = 'demo'
  const settings = settingsDefault(officinaId)
  const tariffaDi = Object.fromEntries(settings.tariffe.map((t) => [t.id, t.prezzoOrario]))

  const fine = toIso(ancora)
  const inizio = addGiorni(fine, -giorni)
  const base = { officinaId }

  /* --- Personale ------------------------------------------------- */

  const employees = [
    {
      ...base, id: id('emp', 1), nome: 'Giuseppe', cognome: 'Rossi', ruolo: 'titolare',
      reparto: 'Direzione', contratto: 'Socio', livello: '—', pagaOraria: 24,
      specializzazione: 'Meccanica generale', dataAssunzione: '1998-03-02',
      telefono: '335 1122334', email: 'giuseppe@rossiefigli.it', operativo: true,
      certificazioni: [{ nome: 'Responsabile tecnico', scadenza: null }],
    },
    {
      ...base, id: id('emp', 2), nome: 'Marco', cognome: 'Rossi', ruolo: 'capofficina',
      reparto: 'Meccanica', contratto: 'Tempo indeterminato', livello: '5° livello', pagaOraria: 15.5,
      specializzazione: 'Meccanica e diagnosi', dataAssunzione: '2011-09-01',
      telefono: '340 5566778', email: 'marco@rossiefigli.it', operativo: true,
      certificazioni: [{ nome: 'Patentino F-Gas', scadenza: addMesi(fine, 14) }],
    },
    {
      ...base, id: id('emp', 3), nome: 'Luca', cognome: 'Ferrari', ruolo: 'meccanico',
      reparto: 'Elettrauto', contratto: 'Tempo indeterminato', livello: '4° livello', pagaOraria: 13.8,
      specializzazione: 'Elettrauto e climatizzazione', dataAssunzione: '2017-02-13',
      telefono: '347 9988776', email: 'luca@rossiefigli.it', operativo: true,
      certificazioni: [
        { nome: 'Patentino F-Gas', scadenza: addGiorni(fine, 24) },
        { nome: 'Abilitazione veicoli ibridi/elettrici (PES-PAV)', scadenza: addMesi(fine, 9) },
      ],
    },
    {
      ...base, id: id('emp', 4), nome: 'Ahmed', cognome: 'Bensaid', ruolo: 'meccanico',
      reparto: 'Meccanica e gommista', contratto: 'Tempo indeterminato', livello: '3° livello', pagaOraria: 12.4,
      specializzazione: 'Gommista e meccanica rapida', dataAssunzione: '2020-06-15',
      telefono: '351 2233445', email: 'ahmed@rossiefigli.it', operativo: true,
      certificazioni: [{ nome: 'Addetto antincendio', scadenza: addMesi(fine, 20) }],
    },
    {
      ...base, id: id('emp', 5), nome: 'Silvia', cognome: 'Conti', ruolo: 'capofficina',
      reparto: 'Accettazione e amministrazione', contratto: 'Part-time 30h', livello: '4° livello', pagaOraria: 13.2,
      specializzazione: 'Accettazione, preventivi, fatturazione', dataAssunzione: '2019-10-07',
      telefono: '333 4455667', email: 'silvia@rossiefigli.it', operativo: false,
      certificazioni: [{ nome: 'Primo soccorso', scadenza: addMesi(fine, 4) }],
    },
  ].map((e, i) => ({
    ...e,
    attivo: true,
    colore: i,
    createdAt: e.dataAssunzione,
    // `produttivo` = può vendere ore su una scheda. Silvia sta in accettazione:
    // le sue ore sono un costo, non un ricavo mancato, e non vanno al
    // denominatore della produttività.
    produttivo: e.operativo,
  }))

  const operativi = employees.filter((e) => e.operativo)
  const pagaDi = Object.fromEntries(employees.map((e) => [e.id, e.pagaOraria]))

  /* --- Fornitori ------------------------------------------------- */

  const suppliers = FORNITORI.map((f, i) => ({
    ...base,
    id: id('sup', i + 1),
    ragioneSociale: f.ragioneSociale,
    tipo: f.tipo,
    piva: `0${int(r, 1000000, 9999999)}${int(r, 100, 999)}`,
    referente: `${pick(r, NOMI_M)} ${pick(r, COGNOMI)}`,
    telefono: `04${int(r, 10, 99)} ${int(r, 100000, 999999)}`,
    email: `ordini@${f.ragioneSociale.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.it`,
    indirizzo: `${pick(r, VIE)} ${int(r, 1, 90)}`,
    citta: pick(r, CITTA)[0],
    condizioniPagamento: f.pagamento,
    scontoPraticato: f.sconto,
    tempiConsegnaGiorni: f.giorni,
    note: '',
    attivo: true,
    createdAt: inizio,
  }))

  const fornitoreDiCategoria = (cat) => {
    if (cat === 'Pneumatici') return suppliers[2].id
    if (cat === 'Elettrico') return suppliers[1].id
    return suppliers[int(r, 0, 1)].id
  }

  /* --- Magazzino: articoli, carichi iniziali, storico prezzi ------ */

  const articles = []
  const movements = []
  const priceHistory = []
  let nMov = 0
  let nPrice = 0
  const articoloDi = {}

  Object.entries(CATALOGO_RICAMBI).forEach(([chiave, c], i) => {
    const costoIniziale = num(r, c.costo[0], c.costo[1])
    const supplierId = fornitoreDiCategoria(c.categoria)
    const ricarico = arrotonda(num(r, 0.3, 0.55), 2)
    const art = {
      ...base,
      id: id('art', i + 1),
      chiave,
      codice: `${c.categoria.slice(0, 2).toUpperCase()}-${String(1000 + i * 7)}`,
      codiceOe: c.oe,
      descrizione: c.descrizione,
      marca: c.marca,
      categoria: c.categoria,
      applicabilita: 'Vetture e furgoni leggeri — verificare su catalogo',
      unita: c.unita || 'pz',
      giacenza: 0,
      scortaMinima: c.unita === 'lt' ? 20 : int(r, 2, 6),
      puntoRiordino: c.unita === 'lt' ? 30 : int(r, 4, 10),
      ubicazione: `Scaffale ${c.ubicazione[0]} — cassetto ${c.ubicazione.slice(1)}`,
      prezzoMedio: 0,
      prezzoListino: 0,
      ricarico,
      aliquotaIva: c.iva,
      supplierId,
      attivo: true,
      note: '',
      createdAt: inizio,
    }
    articoloDi[chiave] = art
    articles.push(art)

    // Carico iniziale d'inventario + uno o due riassortimenti storici.
    const carichi = [
      { data: inizio, qta: c.unita === 'lt' ? int(r, 60, 120) : int(r, 6, 20), prezzo: costoIniziale },
    ]
    if (chance(r, 0.7)) {
      carichi.push({
        data: addGiorni(inizio, int(r, 10, giorni - 20)),
        qta: c.unita === 'lt' ? int(r, 40, 80) : int(r, 4, 14),
        prezzo: arrotonda(costoIniziale * num(r, 0.96, 1.12, 4)),
      })
    }
    for (const ca of carichi) {
      art.prezzoMedio = prezzoMedioPonderato(art.giacenza, art.prezzoMedio, ca.qta, ca.prezzo)
      art.giacenza += ca.qta
      movements.push({
        ...base,
        id: id('mov', ++nMov),
        articleId: art.id,
        tipo: 'carico',
        quantita: ca.qta,
        prezzoUnitario: ca.prezzo,
        causale: 'Riassortimento da fornitore',
        supplierId,
        jobId: null,
        orderId: null,
        data: ca.data,
      })
      priceHistory.push({
        ...base,
        id: id('prz', ++nPrice),
        articleId: art.id,
        supplierId,
        prezzo: ca.prezzo,
        quantita: ca.qta,
        data: ca.data,
      })
    }
    art.prezzoListino = arrotonda(art.prezzoMedio * (1 + art.ricarico))
  })

  /* --- Clienti e veicoli ----------------------------------------- */

  const customers = []
  const vehicles = []
  let nCli = 0
  let nVei = 0

  const nuovoPrivato = (dataIscrizione) => {
    const donna = chance(r, 0.35)
    const nome = pick(r, donna ? NOMI_F : NOMI_M)
    const cognome = pick(r, COGNOMI)
    const [citta, cap, prov] = pick(r, CITTA)
    const c = {
      ...base,
      id: id('cus', ++nCli),
      tipo: 'privato',
      nome,
      cognome,
      ragioneSociale: '',
      codiceFiscale: `${cognome.slice(0, 3).toUpperCase()}${nome.slice(0, 3).toUpperCase()}${int(r, 50, 99)}${pick(r, 'ABCDEHLMPRST'.split(''))}${int(r, 10, 28)}L781${pick(r, 'ABCDEFGHJKLMNPQRSTUVWXYZ'.split(''))}`,
      piva: '',
      sdi: '',
      pec: '',
      telefono: '',
      cellulare: `3${int(r, 20, 49)} ${int(r, 1000000, 9999999)}`,
      email: chance(r, 0.7) ? `${nome.toLowerCase()}.${cognome.toLowerCase().replace(/\s/g, '')}@${pick(r, ['gmail.com', 'libero.it', 'virgilio.it', 'outlook.it'])}` : '',
      indirizzo: `${pick(r, VIE)} ${int(r, 1, 120)}`,
      cap,
      citta,
      provincia: prov,
      note: '',
      attivo: true,
      createdAt: dataIscrizione,
    }
    customers.push(c)
    return c
  }

  const nuovaAzienda = (a, dataIscrizione) => {
    const [citta, cap, prov] = pick(r, CITTA)
    const piva = `0${int(r, 1000000, 9999999)}${int(r, 100, 999)}`
    const c = {
      ...base,
      id: id('cus', ++nCli),
      tipo: 'azienda',
      nome: '',
      cognome: '',
      ragioneSociale: a.ragioneSociale,
      codiceFiscale: piva,
      piva,
      sdi: a.tipo === 'ente' ? 'UFY9M4' : pick(r, ['M5UXCR1', 'SUBM70N', 'KRRH6B9', 'A4707H7']),
      pec: `amministrazione@pec.${a.ragioneSociale.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.it`,
      telefono: `045 ${int(r, 6000000, 7999999)}`,
      cellulare: `3${int(r, 20, 49)} ${int(r, 1000000, 9999999)}`,
      email: `info@${a.ragioneSociale.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '')}.it`,
      indirizzo: `${pick(r, VIE)} ${int(r, 1, 60)}`,
      cap,
      citta,
      provincia: prov,
      note: a.tipo === 'ente' ? 'Fatturazione elettronica PA — richiede CIG in fattura.' : '',
      attivo: true,
      createdAt: dataIscrizione,
    }
    customers.push(c)
    return c
  }

  const nuovoVeicolo = (customerId, dataIscrizione) => {
    const m = pickPesato(
      r,
      MODELLI.map((x) => ({ ...x, peso: x.peso })),
    )
    const idx = int(r, 0, m.allestimenti.length - 1)
    const anno = int(r, 2008, 2023)
    const eta = Math.max(1, Number(fine.slice(0, 4)) - anno)
    const kmAnno = int(r, 7000, 22000)
    const v = {
      ...base,
      id: id('veh', ++nVei),
      customerId,
      targa: `${pick(r, 'ABCDEFGHJKLMNPRSTVWXYZ'.split(''))}${pick(r, 'ABCDEFGHJKLMNPRSTVWXYZ'.split(''))}${int(r, 100, 999)}${pick(r, 'ABCDEFGHJKLMNPRSTVWXYZ'.split(''))}${pick(r, 'ABCDEFGHJKLMNPRSTVWXYZ'.split(''))}`,
      vin: `ZFA${int(r, 100, 999)}00${int(r, 1000000, 9999999)}`,
      marca: m.marca,
      modello: m.modello,
      allestimento: m.allestimenti[idx],
      anno,
      alimentazione: m.alim[Math.min(idx, m.alim.length - 1)],
      cilindrata: m.cc[Math.min(idx, m.cc.length - 1)],
      potenzaKw: m.kw[Math.min(idx, m.kw.length - 1)],
      km: eta * kmAnno + int(r, 0, 9000),
      kmAnnui: kmAnno,
      colore: pick(r, ['Bianco', 'Grigio', 'Nero', 'Blu', 'Rosso', 'Argento', 'Azzurro']),
      tipoPneumatici: pick(r, ['Estivi', 'Invernali', 'Quattro stagioni']),
      misuraPneumatici: pick(r, ['185/65 R15', '195/65 R15', '205/55 R16', '215/60 R16', '225/45 R17']),
      codiceMotore: `${pick(r, ['199A', 'CAYC', 'K9K', 'B37', 'DV6', '1KR'])}${int(r, 100, 999)}`,
      codiceChiave: chance(r, 0.4) ? `KY-${int(r, 1000, 9999)}` : '',
      scadenzaRevisione: addGiorni(fine, int(r, -25, 400)),
      scadenzaBollo: addGiorni(fine, int(r, -10, 350)),
      scadenzaAssicurazione: addGiorni(fine, int(r, -5, 360)),
      tagliandoData: addGiorni(fine, -int(r, 60, 400)),
      tagliandoKm: 0,
      prossimoTagliandoData: null,
      prossimoTagliandoKm: 0,
      scadenzaDistribuzione: chance(r, 0.3) ? addGiorni(fine, int(r, -30, 500)) : null,
      distribuzioneKm: chance(r, 0.3) ? int(r, 120000, 180000) : null,
      // Nessuna foto caricata: la scheda disegna una sagoma con il colore
      // registrato finché qualcuno non scatta quella vera.
      fotoPath: null,
      note: '',
      attivo: true,
      createdAt: dataIscrizione,
    }
    v.tagliandoKm = Math.max(0, v.km - int(r, 8000, 18000))
    v.prossimoTagliandoKm = v.tagliandoKm + pick(r, [15000, 20000, 30000])
    v.prossimoTagliandoData = addMesi(v.tagliandoData, 12)
    vehicles.push(v)
    return v
  }

  // Parco clienti storico: chi c'era già prima della finestra dei tre mesi.
  //
  // Il numero non è decorativo. Tre ponti che lavorano tutto il giorno fanno
  // sei-otto schede al giorno, cioè oltre millecinquecento passaggi l'anno:
  // con quaranta clienti ognuno dovrebbe entrare in officina una volta al mese.
  // Un parco di circa trecento veicoli è quello che serve perché i numeri
  // della dashboard somiglino a quelli di un'officina vera.
  const dataStorica = () => addGiorni(inizio, -int(r, 30, 2000))
  for (let i = 0; i < 250; i++) {
    const c = nuovoPrivato(dataStorica())
    const quanti = chance(r, 0.28) ? 2 : 1
    for (let k = 0; k < quanti; k++) nuovoVeicolo(c.id, c.createdAt)
  }
  for (const a of AZIENDE) {
    const c = nuovaAzienda(a, dataStorica())
    const quanti = a.tipo === 'ente' ? 8 : int(r, 3, 7)
    for (let k = 0; k < quanti; k++) nuovoVeicolo(c.id, c.createdAt)
  }

  /* --- Giorni di apertura ---------------------------------------- */

  const giorniApertura = []
  for (let d = inizio; d <= fine; d = addGiorni(d, 1)) {
    if (giornoSettimana(d) !== 0) giorniApertura.push(d) // domenica chiusa
  }

  /* --- Assenze programmate --------------------------------------- */

  const assenze = new Map() // `${empId}|${data}` → tipo
  for (const e of operativi) {
    // una settimana di ferie a testa, sfalsata
    const inizioFerie = giorniApertura[int(r, 8, giorniApertura.length - 12)]
    for (let k = 0; k < 6; k++) {
      const d = addGiorni(inizioFerie, k)
      if (giornoSettimana(d) !== 0) assenze.set(`${e.id}|${d}`, 'ferie')
    }
    // qualche giorno di malattia o permesso
    for (let k = 0; k < int(r, 1, 3); k++) {
      const d = pick(r, giorniApertura)
      if (!assenze.has(`${e.id}|${d}`)) assenze.set(`${e.id}|${d}`, chance(r, 0.6) ? 'malattia' : 'permesso')
    }
  }

  /* --- Motore: schede, righe, movimenti, presenze ----------------- */

  const jobs = []
  const jobLines = []
  const attendance = []
  const invoices = []
  const quotes = []
  let nJob = 0
  let nLinea = 0
  let nFatt = 0
  let nPrev = 0
  let nPres = 0

  const anno = Number(fine.slice(0, 4))
  const coda = [] // schede aperte, in ordine di accettazione
  const numeroJob = () => `${String(anno).slice(2)}/${String(++nJob).padStart(4, '0')}`

  const repartoDi = (e) =>
    e.reparto.toLowerCase().includes('elettrauto')
      ? 'elettrauto'
      : e.reparto.toLowerCase().includes('gommista')
        ? 'gommista'
        : 'meccanica'

  /** Il meccanico è adatto al reparto dell'intervento? */
  const compatibile = (e, intervento) => {
    const rep = repartoDi(e)
    if (intervento.reparto === 'elettrauto') return rep === 'elettrauto'
    if (intervento.reparto === 'gommista') return rep === 'gommista' || rep === 'meccanica'
    return rep !== 'elettrauto' || chance(r, 0.35)
  }

  function apriScheda(data) {
    const veicolo = pick(r, vehicles)
    const cliente = customers.find((c) => c.id === veicolo.customerId)
    const intervento = pickPesato(r, INTERVENTI)
    const orePreviste = quarti(num(r, intervento.ore[0], intervento.ore[1]))
    const kmIngresso = veicolo.km + int(r, 150, 2600)
    veicolo.km = kmIngresso

    const garanzia = chance(r, 0.035) && jobs.length > 8
    const origine = garanzia ? pick(r, jobs.filter((j) => j.stato === 'fatturato')) : null

    const j = {
      ...base,
      id: id('job', nJob + 1),
      numero: numeroJob(),
      customerId: cliente.id,
      vehicleId: veicolo.id,
      kmIngresso,
      tipoIntervento: intervento.nome,
      difetto: pick(r, intervento.difetti),
      diagnosi: '',
      lavorazioni: '',
      stato: 'accettato',
      ponte: null,
      garanzia,
      jobOrigineGaranzia: origine?.id || null,
      dataApertura: data,
      dataInizio: null,
      dataConsegnaPrevista: addGiorni(data, orePreviste > 4 ? 2 : 1),
      dataConsegna: null,
      employeeIds: [],
      allegati: [],
      note: garanzia ? 'Rilavorazione in garanzia: non fatturabile al cliente.' : '',
      quoteId: null,
      invoiceId: null,
      createdAt: data,
      // campi di lavoro del generatore, rimossi alla fine
      _intervento: intervento,
      _oreResidue: orePreviste,
      _orePreviste: orePreviste,
      _ricambiFatti: false,
      _attesaRicambi: false,
    }
    jobs.push(j)
    coda.push(j)
    return j
  }

  /**
   * Riassortimento al volo.
   *
   * Un'officina di provincia non tiene a scaffale sei mesi di consumo: chiama
   * il ricambista la mattina e il pezzo arriva nel pomeriggio. Il generatore
   * fa lo stesso — quando la giacenza non basta, carica un lotto a un prezzo
   * leggermente diverso dal precedente. È così che il prezzo medio ponderato
   * si muove nel tempo e lo storico prezzi ha qualcosa da raccontare.
   */
  function riassortisci(art, data, qtaRichiesta) {
    const lotto = Math.max(
      qtaRichiesta,
      art.unita === 'lt' ? int(r, 60, 140) : int(r, Math.max(2, art.puntoRiordino), art.puntoRiordino * 3),
    )
    const prezzo = arrotonda(art.prezzoMedio * num(r, 0.94, 1.11, 4), 4)
    art.prezzoMedio = prezzoMedioPonderato(art.giacenza, art.prezzoMedio, lotto, prezzo)
    art.giacenza += lotto
    art.prezzoListino = arrotonda(art.prezzoMedio * (1 + art.ricarico))
    movements.push({
      ...base,
      id: id('mov', ++nMov),
      articleId: art.id,
      tipo: 'carico',
      quantita: lotto,
      prezzoUnitario: prezzo,
      causale: 'Riassortimento da fornitore',
      supplierId: art.supplierId,
      jobId: null,
      orderId: null,
      data,
    })
    priceHistory.push({
      ...base,
      id: id('prz', ++nPrice),
      articleId: art.id,
      supplierId: art.supplierId,
      prezzo,
      quantita: lotto,
      data,
    })
  }

  function scaricaRicambi(j, data, employeeId) {
    const intervento = j._intervento
    const scelti = intervento.ricambi.filter(() => chance(r, 0.78))
    if (!scelti.length) scelti.push(intervento.ricambi[0])

    for (const chiave of scelti) {
      const prestazione = PRESTAZIONI[chiave]
      if (prestazione) {
        jobLines.push({
          ...base,
          id: id('jln', ++nLinea),
          jobId: j.id,
          tipo: 'ricambio',
          descrizione: prestazione.descrizione,
          codice: chiave.toUpperCase(),
          articleId: null,
          quantita: chiave === 'equilibratura' ? 4 : 1,
          prezzo: prestazione.prezzo,
          costoUnitario: prestazione.costo,
          sconto: 0,
          aliquotaIva: prestazione.iva,
          employeeId,
          data,
        })
        j._haRicambi = true
        continue
      }

      const art = articoloDi[chiave]
      if (!art) continue
      let qta = 1
      if (art.unita === 'lt') qta = int(r, 3, 6)
      else if (chiave === 'pneumatico') qta = pick(r, [2, 4])
      else if (chiave === 'lampade' || chiave === 'gas-r1234yf') qta = int(r, 1, 2)

      // Non si scarica ciò che non c'è. Quasi sempre il pezzo arriva in
      // giornata dal ricambista; una volta su cinque no, e la scheda resta
      // ferma in attesa ricambi — è lo stato che in officina fa più danno,
      // e serve che nella demo esista davvero.
      if (art.giacenza < qta) {
        if (chance(r, 0.8)) {
          riassortisci(art, data, qta)
        } else {
          j._attesaRicambi = true
          continue
        }
      }

      art.giacenza -= qta
      const prezzo = arrotonda(art.prezzoMedio * (1 + art.ricarico))
      movements.push({
        ...base,
        id: id('mov', ++nMov),
        articleId: art.id,
        tipo: 'scarico',
        quantita: qta,
        prezzoUnitario: art.prezzoMedio,
        causale: `Impiego su scheda ${j.numero}`,
        supplierId: null,
        jobId: j.id,
        orderId: null,
        data,
      })
      jobLines.push({
        ...base,
        id: id('jln', ++nLinea),
        jobId: j.id,
        tipo: 'ricambio',
        descrizione: art.descrizione,
        codice: art.codice,
        articleId: art.id,
        quantita: qta,
        prezzo,
        costoUnitario: art.prezzoMedio,
        sconto: chance(r, 0.12) ? pick(r, [5, 10]) : 0,
        aliquotaIva: art.aliquotaIva,
        employeeId,
        data,
      })
      j._haRicambi = true
    }
    j._ricambiFatti = true
  }

  function chiudiEFattura(j, data) {
    j.stato = 'consegnato'
    j.dataConsegna = data
    j.lavorazioni = descriviLavorazioni(r, j._intervento)
    j.diagnosi = descriviDiagnosi(r, j._intervento)

    const veicolo = vehicles.find((v) => v.id === j.vehicleId)
    if (veicolo && j._intervento.nome === 'Tagliando') {
      veicolo.tagliandoData = data
      veicolo.tagliandoKm = j.kmIngresso
      veicolo.prossimoTagliandoKm = j.kmIngresso + pick(r, [15000, 20000, 30000])
      veicolo.prossimoTagliandoData = addMesi(data, 12)
    }

    if (j.garanzia) return // le rilavorazioni non si fatturano

    const righe = jobLines.filter((l) => l.jobId === j.id)
    if (!righe.length) return

    const cliente = customers.find((c) => c.id === j.customerId)
    const scontoGlobale = chance(r, 0.18) ? pick(r, [3, 5, 10]) : 0
    const dataFattura = chance(r, 0.75) ? data : addGiorni(data, int(r, 1, 6))
    const giorniPagamento = cliente.tipo === 'azienda' ? pick(r, [30, 60]) : 0

    const f = {
      ...base,
      id: id('inv', nFatt + 1),
      numero: `${++nFatt}/${anno}`,
      progressivo: nFatt,
      anno,
      data: dataFattura,
      customerId: j.customerId,
      jobId: j.id,
      vehicleId: j.vehicleId,
      righe: righe.map((l) => ({
        id: l.id,
        tipo: l.tipo,
        descrizione: l.descrizione,
        codice: l.codice || '',
        ore: l.ore,
        tariffaOraria: l.tariffaOraria,
        quantita: l.quantita,
        prezzo: l.prezzo,
        costoUnitario: l.costoUnitario,
        costoOrario: l.costoOrario,
        sconto: l.sconto,
        aliquotaIva: l.aliquotaIva,
      })),
      scontoGlobale,
      stato: 'emessa',
      scadenza: addGiorni(dataFattura, giorniPagamento),
      pagamenti: [],
      allegatoPath: null,
      note: '',
      createdAt: dataFattura,
    }

    const totale = totaliDocumento(f.righe, f.scontoGlobale).totale
    // Privati: quasi sempre saldano alla consegna. Aziende: a scadenza,
    // con una quota fisiologica di ritardatari e qualche acconto.
    const paga = cliente.tipo === 'azienda' ? chance(r, 0.62) : chance(r, 0.93)
    if (paga) {
      const dataIncasso = cliente.tipo === 'azienda' ? addGiorni(f.scadenza, int(r, -5, 8)) : dataFattura
      if (dataIncasso <= fine) {
        f.pagamenti.push({
          id: `pay_${f.id}`,
          data: dataIncasso,
          importo: totale,
          metodo: cliente.tipo === 'azienda' ? 'Bonifico' : pick(r, ['POS', 'POS', 'Contanti', 'Bonifico']),
          note: '',
        })
        f.stato = 'incassata'
      }
    } else if (chance(r, 0.3)) {
      f.pagamenti.push({
        id: `pay_${f.id}`,
        data: addGiorni(f.data, int(r, 2, 20)),
        importo: arrotonda(totale * pick(r, [0.3, 0.5])),
        metodo: 'Bonifico',
        note: 'Acconto',
      })
      f.stato = 'parziale'
    }
    if (f.stato !== 'incassata' && f.scadenza < fine) f.stato = 'insoluta'

    invoices.push(f)
    j.invoiceId = f.id
    j.stato = 'fatturato'
  }

  // Ciclo giorno per giorno.
  const ponti = [1, 2, 3]
  for (const giorno of giorniApertura) {
    const sabato = giornoSettimana(giorno) === 6

    // 1. accettazioni — tante quante ne servono per tenere occupati tre ponti
    const nuove = sabato ? int(r, 2, 4) : int(r, 5, 9)
    for (let k = 0; k < nuove; k++) apriScheda(giorno)

    // 2. arrivano i ricambi mancanti del giorno prima
    for (const j of coda) {
      if (j._attesaRicambi && chance(r, 0.5)) {
        j._attesaRicambi = false
        j._ricambiFatti = false
      }
    }

    // 3. lavorazione
    for (const e of operativi) {
      const assente = assenze.get(`${e.id}|${giorno}`)
      let oreLavorate = 0
      if (!assente) {
        // Il titolare sta in officina tutto il giorno ma passa metà del tempo
        // in accettazione, al telefono e dietro ai preventivi: sul ponte ci
        // sta poco, e la sua produttività lo dice.
        const [minimo, massimo] = e.ruolo === 'titolare' ? [1, 2.75] : [4.75, 6.5]
        const capacitaGiorno = sabato ? num(r, minimo * 0.4, massimo * 0.6) : num(r, minimo, massimo)
        let capacita = quarti(capacitaGiorno)

        while (capacita >= 0.25) {
          const j = coda.find(
            (x) =>
              !x._attesaRicambi &&
              x._oreResidue > 0 &&
              compatibile(e, x._intervento) &&
              (x.employeeIds.length === 0 || x.employeeIds.includes(e.id)),
          )
          if (!j) break

          if (!j.dataInizio) {
            j.dataInizio = giorno
            j.stato = 'in_lavorazione'
            j.ponte = j._intervento.reparto === 'gommista' ? 3 : pick(r, ponti)
          }
          if (!j.employeeIds.includes(e.id)) j.employeeIds.push(e.id)
          if (!j._ricambiFatti) scaricaRicambi(j, giorno, e.id)
          if (j._attesaRicambi && !j._haRicambi) {
            j.stato = 'attesa_ricambi'
            continue
          }

          const ore = quarti(Math.min(capacita, j._oreResidue))
          const tariffaId = j._intervento.tariffa
          jobLines.push({
            ...base,
            id: id('jln', ++nLinea),
            jobId: j.id,
            tipo: 'manodopera',
            descrizione: `${j._intervento.nome} — ${e.nome} ${e.cognome}`,
            tariffaId,
            tariffaOraria: tariffaDi[tariffaId],
            ore,
            costoOrario: arrotonda(pagaDi[e.id] * (1 + settings.oneriContributivi), 4),
            employeeId: e.id,
            sconto: 0,
            aliquotaIva: settings.aliquotaIvaDefault,
            data: giorno,
          })
          j._oreResidue = arrotonda(j._oreResidue - ore, 2)
          capacita = arrotonda(capacita - ore, 2)
          oreLavorate = arrotonda(oreLavorate + ore, 2)

          if (j._oreResidue <= 0) {
            j.stato = 'pronto'
            j._pronto = giorno
          }
        }
      }

      // 4. presenza del giorno — mai inferiore alle ore vendute
      const oreOrdinarie = assente ? 0 : Math.max(oreLavorate, sabato ? 4 : 8)
      const straordinario = !assente && !sabato && chance(r, 0.12) ? num(r, 0.5, 2, 1) : 0
      attendance.push({
        ...base,
        id: id('att', ++nPres),
        employeeId: e.id,
        data: giorno,
        tipo: assente || 'presenza',
        oreOrdinarie: assente ? 0 : arrotonda(oreOrdinarie, 2),
        oreStraordinario: straordinario,
        ritardoMin: !assente && chance(r, 0.08) ? int(r, 5, 25) : 0,
        note: assente === 'permesso' ? 'Permesso retribuito' : '',
      })
    }

    // 5. consegne: il cliente ritira in giornata o il giorno dopo
    for (let i = coda.length - 1; i >= 0; i--) {
      const j = coda[i]
      if (j.stato !== 'pronto') continue
      const ritira = j._pronto === giorno ? chance(r, 0.55) : true
      if (!ritira) continue
      chiudiEFattura(j, giorno)
      coda.splice(i, 1)
    }
  }

  // Le presenze di Silvia (accettazione) non passano dalle schede.
  const silvia = employees.find((e) => e.nome === 'Silvia')
  for (const giorno of giorniApertura) {
    if (giornoSettimana(giorno) === 6) continue
    const assente = assenze.get(`${silvia.id}|${giorno}`)
    attendance.push({
      ...base,
      id: id('att', ++nPres),
      employeeId: silvia.id,
      data: giorno,
      tipo: assente || 'presenza',
      oreOrdinarie: assente ? 0 : 6,
      oreStraordinario: 0,
      ritardoMin: 0,
      note: '',
    })
  }

  /* --- Preventivi ------------------------------------------------ */

  // Una parte delle schede nasce da un preventivo accettato; il resto sono
  // preventivi ancora aperti, rifiutati o scaduti.
  const numeroPrev = () => `P${String(anno).slice(2)}/${String(++nPrev).padStart(4, '0')}`

  const daSchede = jobs.filter(() => chance(r, 0.22)).slice(0, 26)
  for (const j of daSchede) {
    const righe = jobLines
      .filter((l) => l.jobId === j.id)
      .map((l) => ({
        id: `qln_${l.id}`,
        tipo: l.tipo,
        descrizione: l.descrizione,
        codice: l.codice || '',
        articleId: l.articleId || null,
        tariffaId: l.tariffaId,
        ore: l.ore,
        tariffaOraria: l.tariffaOraria,
        quantita: l.quantita,
        prezzo: l.prezzo,
        costoUnitario: l.costoUnitario,
        sconto: l.sconto || 0,
        aliquotaIva: l.aliquotaIva,
      }))
    if (!righe.length) continue
    const dataPrev = addGiorni(j.dataApertura, -int(r, 1, 6))
    const q = {
      ...base,
      id: id('quo', nPrev + 1),
      numero: numeroPrev(),
      data: dataPrev,
      customerId: j.customerId,
      vehicleId: j.vehicleId,
      tipoIntervento: j.tipoIntervento,
      stato: 'accettato',
      validoAl: addGiorni(dataPrev, settings.giorniValiditaPreventivo),
      righe,
      scontoGlobale: 0,
      note: '',
      jobId: j.id,
      createdAt: dataPrev,
    }
    quotes.push(q)
    j.quoteId = q.id
  }

  // Preventivi non convertiti.
  for (let k = 0; k < 14; k++) {
    const veicolo = pick(r, vehicles)
    const intervento = pickPesato(r, INTERVENTI)
    const dataPrev = addGiorni(fine, -int(r, 0, 55))
    const orePrev = quarti(num(r, intervento.ore[0], intervento.ore[1]))
    const righe = [
      {
        id: `qln_m_${k}`,
        tipo: 'manodopera',
        descrizione: `${intervento.nome} — manodopera`,
        tariffaId: intervento.tariffa,
        tariffaOraria: tariffaDi[intervento.tariffa],
        ore: orePrev,
        sconto: 0,
        aliquotaIva: 22,
      },
      ...intervento.ricambi
        .map((chiave) => articoloDi[chiave])
        .filter(Boolean)
        .slice(0, 3)
        .map((art, i) => ({
          id: `qln_r_${k}_${i}`,
          tipo: 'ricambio',
          descrizione: art.descrizione,
          codice: art.codice,
          articleId: art.id,
          quantita: art.unita === 'lt' ? 4 : 1,
          prezzo: arrotonda(art.prezzoMedio * (1 + art.ricarico)),
          costoUnitario: art.prezzoMedio,
          sconto: 0,
          aliquotaIva: art.aliquotaIva,
        })),
    ]
    const validoAl = addGiorni(dataPrev, settings.giorniValiditaPreventivo)
    const stato = validoAl < fine ? pick(r, ['scaduto', 'rifiutato', 'rifiutato']) : pick(r, ['inviato', 'inviato', 'bozza'])
    quotes.push({
      ...base,
      id: id('quo', nPrev + 1),
      numero: numeroPrev(),
      data: dataPrev,
      customerId: veicolo.customerId,
      vehicleId: veicolo.id,
      tipoIntervento: intervento.nome,
      stato,
      validoAl,
      righe,
      scontoGlobale: chance(r, 0.3) ? 5 : 0,
      note: stato === 'rifiutato' ? 'Cliente ha preferito rimandare l’intervento.' : '',
      jobId: null,
      createdAt: dataPrev,
    })
  }
  quotes.sort((a, b) => a.data.localeCompare(b.data))

  /* --- Ordini a fornitore ---------------------------------------- */

  const orders = []
  const expenses = []
  let nOrd = 0
  let nSpesa = 0

  const sottoScorta = articles.filter((a) => a.giacenza <= a.puntoRiordino)
  const gruppi = new Map()
  for (const a of sottoScorta) {
    if (!gruppi.has(a.supplierId)) gruppi.set(a.supplierId, [])
    gruppi.get(a.supplierId).push(a)
  }

  // Due ordini già ricevuti nello storico e uno ancora in viaggio.
  const ordiniDaFare = [...gruppi.entries()].slice(0, 3)
  ordiniDaFare.forEach(([supplierId, arts], idxOrdine) => {
    const ricevuto = idxOrdine < 2
    const dataOrdine = addGiorni(fine, ricevuto ? -int(r, 12, 40) : -int(r, 1, 3))
    const fornitore = suppliers.find((s) => s.id === supplierId)
    const righe = arts.slice(0, 6).map((a) => ({
      articleId: a.id,
      codice: a.codice,
      descrizione: a.descrizione,
      quantita: a.unita === 'lt' ? 60 : int(r, 4, 12),
      prezzo: arrotonda(a.prezzoMedio * num(r, 0.95, 1.08, 4)),
      aliquotaIva: a.aliquotaIva,
    }))
    const o = {
      ...base,
      id: id('ord', ++nOrd),
      numero: `ORD ${String(anno).slice(2)}/${String(nOrd).padStart(3, '0')}`,
      supplierId,
      stato: ricevuto ? 'ricevuto' : 'inviato',
      dataOrdine,
      dataPrevista: addGiorni(dataOrdine, fornitore.tempiConsegnaGiorni),
      dataRicezione: ricevuto ? addGiorni(dataOrdine, fornitore.tempiConsegnaGiorni) : null,
      righe,
      note: '',
      expenseId: null,
      createdAt: dataOrdine,
    }
    orders.push(o)

    if (!ricevuto) return

    // Ricezione: carico a magazzino, ricalcolo del prezzo medio, spesa.
    let imponibile = 0
    for (const rg of o.righe) {
      const art = articles.find((a) => a.id === rg.articleId)
      art.prezzoMedio = prezzoMedioPonderato(art.giacenza, art.prezzoMedio, rg.quantita, rg.prezzo)
      art.giacenza += rg.quantita
      art.prezzoListino = arrotonda(art.prezzoMedio * (1 + art.ricarico))
      imponibile += rg.quantita * rg.prezzo
      movements.push({
        ...base,
        id: id('mov', ++nMov),
        articleId: art.id,
        tipo: 'carico',
        quantita: rg.quantita,
        prezzoUnitario: rg.prezzo,
        causale: `Ricezione ordine ${o.numero}`,
        supplierId,
        jobId: null,
        orderId: o.id,
        data: o.dataRicezione,
      })
      priceHistory.push({
        ...base,
        id: id('prz', ++nPrice),
        articleId: art.id,
        supplierId,
        prezzo: rg.prezzo,
        quantita: rg.quantita,
        data: o.dataRicezione,
      })
    }
    const spesa = {
      ...base,
      id: id('exp', ++nSpesa),
      data: o.dataRicezione,
      categoria: 'Ricambi e materiali',
      descrizione: `Fornitura ricambi — ordine ${o.numero}`,
      supplierId,
      imponibile: arrotonda(imponibile),
      aliquotaIva: 22,
      tipo: 'variabile',
      stato: chance(r, 0.6) ? 'pagata' : 'da_pagare',
      scadenza: addGiorni(o.dataRicezione, 30),
      metodoPagamento: 'Bonifico',
      allegatoPath: null,
      recurringId: null,
      orderId: o.id,
      note: '',
      createdAt: o.dataRicezione,
    }
    expenses.push(spesa)
    o.expenseId = spesa.id
  })

  // Fattura mensile del ricambista: raccoglie tutti i riassortimenti al volo
  // del mese, che è come arriva davvero il conto — non pezzo per pezzo.
  const carichiPerMeseFornitore = new Map()
  for (const m of movements) {
    if (m.tipo !== 'carico' || m.orderId || !m.supplierId) continue
    const chiave = `${meseDi(m.data)}|${m.supplierId}`
    carichiPerMeseFornitore.set(
      chiave,
      arrotonda((carichiPerMeseFornitore.get(chiave) || 0) + m.quantita * m.prezzoUnitario),
    )
  }
  for (const [chiave, importo] of carichiPerMeseFornitore) {
    if (importo < 1) continue
    const [ym, supplierId] = chiave.split('|')
    const fornitore = suppliers.find((s) => s.id === supplierId)
    const dataFattura = `${ym}-28` > fine ? fine : `${ym}-28`
    expenses.push({
      ...base,
      id: id('exp', ++nSpesa),
      data: dataFattura,
      categoria: 'Ricambi e materiali',
      descrizione: `Riepilogo forniture — ${fornitore?.ragioneSociale || 'fornitore'}`,
      supplierId,
      imponibile: importo,
      aliquotaIva: 22,
      tipo: 'variabile',
      stato: dataFattura < addGiorni(fine, -30) ? 'pagata' : chance(r, 0.4) ? 'pagata' : 'da_pagare',
      scadenza: addGiorni(dataFattura, 30),
      metodoPagamento: 'Bonifico',
      allegatoPath: null,
      recurringId: null,
      orderId: null,
      note: '',
      createdAt: dataFattura,
    })
  }

  // Qualche rettifica d'inventario, come capita nella realtà.
  for (let k = 0; k < 4; k++) {
    const art = pick(r, articles)
    const delta = pick(r, [-2, -1, 1])
    if (art.giacenza + delta < 0) continue
    art.giacenza += delta
    movements.push({
      ...base,
      id: id('mov', ++nMov),
      articleId: art.id,
      tipo: 'rettifica',
      quantita: delta,
      prezzoUnitario: art.prezzoMedio,
      causale: delta < 0 ? 'Inventario: differenza a scalare' : 'Inventario: differenza a carico',
      supplierId: null,
      jobId: null,
      orderId: null,
      data: addGiorni(fine, -int(r, 2, 45)),
    })
  }

  /* --- Spese e ricorrenti ---------------------------------------- */

  const recurring = [
    { descrizione: 'Affitto capannone', categoria: 'Affitto', imponibile: 1450, iva: 22, tipo: 'fisso', giorno: 5, supplier: null },
    { descrizione: 'Energia elettrica', categoria: 'Utenze', imponibile: 340, iva: 22, tipo: 'variabile', giorno: 12, supplier: null },
    { descrizione: 'Gas e riscaldamento', categoria: 'Utenze', imponibile: 180, iva: 22, tipo: 'variabile', giorno: 12, supplier: null },
    { descrizione: 'Connettività e gestionale', categoria: 'Utenze', imponibile: 89, iva: 22, tipo: 'fisso', giorno: 1, supplier: null },
    { descrizione: 'Assicurazione RC officina', categoria: 'Assicurazioni', imponibile: 210, iva: 0, tipo: 'fisso', giorno: 15, supplier: null },
    { descrizione: 'Commercialista', categoria: 'Consulenze', imponibile: 250, iva: 22, tipo: 'fisso', giorno: 20, supplier: null },
    { descrizione: 'Ritiro oli esausti e filtri', categoria: 'Smaltimento oli e rifiuti', imponibile: 120, iva: 22, tipo: 'variabile', giorno: 25, supplier: null },
  ].map((t, i) => ({
    ...base,
    id: id('rec', i + 1),
    descrizione: t.descrizione,
    categoria: t.categoria,
    supplierId: t.supplier,
    imponibile: t.imponibile,
    aliquotaIva: t.iva,
    tipo: t.tipo,
    giornoMese: t.giorno,
    attivo: true,
    dataInizio: addMesi(inizio, -12),
    dataFine: null,
    createdAt: addMesi(inizio, -12),
  }))

  // Generazione idempotente dei mesi coperti dallo storico.
  const mesi = []
  for (let d = `${inizio.slice(0, 7)}-01`; d <= fine; d = addMesi(d, 1)) mesi.push(meseDi(d))
  for (const ym of mesi) {
    for (const t of recurring) {
      const data = `${ym}-${String(t.giornoMese).padStart(2, '0')}`
      if (data > fine) continue
      const variazione = t.tipo === 'variabile' ? num(r, 0.82, 1.24, 4) : 1
      expenses.push({
        ...base,
        id: id('exp', ++nSpesa),
        data,
        categoria: t.categoria,
        descrizione: t.descrizione,
        supplierId: t.supplierId,
        imponibile: arrotonda(t.imponibile * variazione),
        aliquotaIva: t.aliquotaIva,
        tipo: t.tipo,
        stato: data < addGiorni(fine, -20) ? 'pagata' : chance(r, 0.5) ? 'pagata' : 'da_pagare',
        scadenza: addGiorni(data, 15),
        metodoPagamento: pick(r, ['Bonifico', 'Addebito SDD', 'Bonifico']),
        allegatoPath: null,
        recurringId: t.id,
        orderId: null,
        note: '',
        createdAt: data,
      })
    }
  }

  // Spese occasionali.
  const occasionali = [
    { cat: 'Attrezzatura', desc: 'Kit estrattori idraulici', imp: 340, tipo: 'variabile' },
    { cat: 'Attrezzatura', desc: 'Taratura banco prova assetto', imp: 180, tipo: 'variabile' },
    { cat: 'Formazione', desc: 'Corso aggiornamento sistemi ADAS', imp: 450, tipo: 'variabile' },
    { cat: 'Carburante', desc: 'Carburante furgone officina', imp: 95, tipo: 'variabile' },
    { cat: 'Carburante', desc: 'Carburante furgone officina', imp: 110, tipo: 'variabile' },
    { cat: 'Consulenze', desc: 'Consulenza sicurezza sul lavoro', imp: 380, tipo: 'variabile' },
    { cat: 'Smaltimento oli e rifiuti', desc: 'Ritiro straordinario pneumatici fuori uso', imp: 210, tipo: 'variabile' },
    { cat: 'Attrezzatura', desc: 'Sostituzione compressore aria', imp: 890, tipo: 'variabile' },
  ]
  for (const o of occasionali) {
    const data = addGiorni(fine, -int(r, 3, giorni - 5))
    expenses.push({
      ...base,
      id: id('exp', ++nSpesa),
      data,
      categoria: o.cat,
      descrizione: o.desc,
      supplierId: chance(r, 0.4) ? pick(r, suppliers).id : null,
      imponibile: o.imp,
      aliquotaIva: 22,
      tipo: o.tipo,
      stato: chance(r, 0.75) ? 'pagata' : 'da_pagare',
      scadenza: addGiorni(data, 30),
      metodoPagamento: pick(r, ['Bonifico', 'Carta', 'Contanti']),
      allegatoPath: null,
      recurringId: null,
      orderId: null,
      note: '',
      createdAt: data,
    })
  }
  expenses.sort((a, b) => a.data.localeCompare(b.data))

  /* --- Turni della settimana corrente ----------------------------- */

  const shifts = []
  let nTurno = 0
  const lunedi = addGiorni(fine, -((giornoSettimana(fine) + 6) % 7))
  for (let k = 0; k < 12; k++) {
    const giorno = addGiorni(lunedi, k)
    if (giornoSettimana(giorno) === 0) continue
    const sabato = giornoSettimana(giorno) === 6
    for (const e of employees) {
      if (sabato && !e.operativo) continue
      shifts.push({
        ...base,
        id: id('shf', ++nTurno),
        employeeId: e.id,
        data: giorno,
        oraInizio: sabato ? '08:00' : e.nome === 'Silvia' ? '08:30' : '08:00',
        oraFine: sabato ? '12:30' : e.nome === 'Silvia' ? '15:30' : '18:00',
        postazione: e.operativo ? `Ponte ${((nTurno % 3) + 1)}` : 'Accettazione',
        note: '',
      })
    }
  }

  /* --- Utenti e inviti -------------------------------------------- */

  const profiles = employees.map((e, i) => ({
    ...base,
    id: `usr_${String(i + 1).padStart(4, '0')}`,
    email: e.email,
    nome: `${e.nome} ${e.cognome}`,
    ruolo: e.ruolo === 'titolare' ? 'titolare' : e.ruolo === 'capofficina' ? 'capofficina' : 'meccanico',
    employeeId: e.id,
    attivo: true,
    createdAt: e.dataAssunzione,
  }))

  const invites = [
    {
      ...base,
      id: 'inv_0001',
      email: 'nuovo.meccanico@rossiefigli.it',
      ruolo: 'meccanico',
      codice: 'MF-DEMO-2K7Q',
      usato: false,
      createdAt: addGiorni(fine, -3),
      scadenza: addGiorni(fine, 11),
    },
  ]

  /* --- Pulizia dei campi di servizio ------------------------------ */

  for (const j of jobs) {
    j.orePreviste = j._orePreviste
    if (j.stato === 'pronto' && j._oreResidue > 0) j.stato = 'in_lavorazione'
    if (j._attesaRicambi && !['consegnato', 'fatturato'].includes(j.stato)) j.stato = 'attesa_ricambi'
    delete j._intervento
    delete j._oreResidue
    delete j._orePreviste
    delete j._ricambiFatti
    delete j._attesaRicambi
    delete j._haRicambi
    delete j._pronto
  }

  // Allegati dimostrativi su un paio di schede recenti.
  const recenti = jobs.filter((j) => j.dataConsegna).slice(-3)
  recenti.forEach((j, i) => {
    j.allegati = [
      { id: `alg_${j.id}_1`, nome: `foto-danno-${i + 1}.webp`, tipo: 'foto', path: null, data: j.dataApertura },
      { id: `alg_${j.id}_2`, nome: `ddt-fornitore-${i + 1}.pdf`, tipo: 'documento', path: null, data: j.dataApertura },
    ]
  })

  settings.numerazione = {
    jobs: nJob,
    quotes: nPrev,
    invoices: nFatt,
    orders: nOrd,
  }

  return {
    settings,
    customers,
    vehicles,
    quotes,
    jobs,
    jobLines,
    articles: articles.map(({ chiave: _chiave, ...a }) => a),
    movements,
    priceHistory,
    orders,
    suppliers,
    invoices,
    expenses,
    recurring,
    employees: employees.map(({ operativo: _operativo, ...e }) => e),
    shifts,
    attendance,
    profiles,
    invites,
  }
}

/* ------------------------------------------------------------------ *
 * Testi
 * ------------------------------------------------------------------ */

function descriviDiagnosi(r, intervento) {
  const per = {
    Tagliando: ['Controllo generale eseguito, nessuna anomalia rilevata.', 'Verificati livelli e usura: nella norma.'],
    Freni: ['Pastiglie anteriori sotto il minimo, dischi rigati.', 'Spessore pastiglie 2 mm, dischi entro tolleranza.'],
    Pneumatici: ['Battistrada sotto i 2 mm sull’asse anteriore.', 'Foratura non riparabile su spalla.'],
    'Elettrauto e diagnosi': ['Lettura centralina: codice memorizzato su circuito sensore.', 'Batteria con tensione a vuoto insufficiente sotto carico.'],
    Climatizzazione: ['Carica gas insufficiente, nessuna perdita rilevata con tracciante.', 'Filtro abitacolo saturo, evaporatore da sanificare.'],
    'Sospensioni e sterzo': ['Ammortizzatore posteriore destro trafilante.', 'Gioco su braccio oscillante anteriore sinistro.'],
    Distribuzione: ['Cinghia con segni di usura, tenditore rumoroso.', 'Intervento a scadenza chilometrica da costruttore.'],
    'Frizione e cambio': ['Disco frizione usurato, spingidisco da sostituire.', 'Reggispinta rumoroso a pedale premuto.'],
    'Scarico e antinquinamento': ['Sonda lambda a monte fuori range.', 'Silenziatore posteriore forato in corrispondenza del giunto.'],
    'Revisione e pratiche': ['Veicolo preparato per la revisione ministeriale.'],
    'Riparazione motore': ['Perdita dalla guarnizione testata, tracce di refrigerante nell’olio.'],
  }
  return pick(r, per[intervento.nome] || ['Verifica eseguita in officina.'])
}

function descriviLavorazioni(r, intervento) {
  const per = {
    Tagliando: 'Sostituiti olio motore e filtri, controllo freni, livelli, pressioni e usura pneumatici. Reset spia service.',
    Freni: 'Sostituite pastiglie e dischi anteriori, pulizia pinze, spurgo impianto e prova su strada.',
    Pneumatici: 'Smontaggio, sostituzione pneumatici, equilibratura e controllo pressioni. Serraggio a coppia.',
    'Elettrauto e diagnosi': 'Diagnosi strumentale, sostituzione componente, cancellazione errori e prova funzionale.',
    Climatizzazione: 'Recupero gas, vuoto impianto, ricarica con nuovo refrigerante, controllo tenuta e sostituzione filtro abitacolo.',
    'Sospensioni e sterzo': 'Sostituzione componenti sospensione, controllo assetto e prova su strada.',
    Distribuzione: 'Sostituzione kit distribuzione e pompa acqua, messa in fase, rabbocco refrigerante e prova a caldo.',
    'Frizione e cambio': 'Stacco cambio, sostituzione kit frizione, rimontaggio, rabbocco olio e prova su strada.',
    'Scarico e antinquinamento': 'Sostituzione componente di scarico, controllo emissioni e cancellazione errori.',
    'Revisione e pratiche': 'Controllo pre-revisione, accompagnamento al centro convenzionato ed esito favorevole.',
    'Riparazione motore': 'Smontaggio testata, planatura, sostituzione guarnizione e ripristino impianto di raffreddamento.',
  }
  return per[intervento.nome] || pick(r, ['Intervento eseguito e collaudato.'])
}
