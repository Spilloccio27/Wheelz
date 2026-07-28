/**
 * Formattazione italiana.
 *
 * Regola di fondo: all'interno dell'applicazione le date viaggiano come
 * stringhe ISO `aaaa-mm-gg` (ordinabili, confrontabili, senza fuso orario);
 * la conversione a gg/mm/aaaa avviene solo al momento di mostrarle.
 */

const nf = (min, max) =>
  new Intl.NumberFormat('it-IT', { minimumFractionDigits: min, maximumFractionDigits: max })

const NUM_2 = nf(2, 2)
const NUM_0 = nf(0, 0)
const NUM_FLEX = nf(0, 2)

/** 1234.5 → "1.234,50 €" */
export function euro(v, { decimali = 2, segno = false } = {}) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  const f = decimali === 0 ? NUM_0 : NUM_2
  const s = segno && n > 0 ? '+' : ''
  return `${s}${f.format(n)} €`
}

/** 1234.5 → "1.234,5" (decimali solo se servono) */
export function numero(v, decimali) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (decimali === undefined) return NUM_FLEX.format(n)
  return nf(decimali, decimali).format(n)
}

/** 0.3567 → "35,7%" — l'ingresso è una frazione, non già moltiplicata. */
export function percento(v, decimali = 1) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${nf(decimali, decimali).format(n * 100)}%`
}

/** 7.25 → "7,25 h" */
export function ore(v, decimali = 2) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${nf(decimali === 0 ? 0 : 1, decimali).format(n)} h`
}

/** 12345 → "12.345 km" */
export function km(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  return `${NUM_0.format(n)} km`
}

/** "2025-03-04" → "04/03/2025". Accetta anche Date e ISO con orario. */
export function data(v) {
  const iso = toIso(v)
  if (!iso) return '—'
  const [a, m, g] = iso.split('-')
  return `${g}/${m}/${a}`
}

/** "2025-03-04" → "4 mar 2025" */
export function dataBreve(v) {
  const iso = toIso(v)
  if (!iso) return '—'
  const [a, m, g] = iso.split('-')
  return `${Number(g)} ${MESI_BREVI[Number(m) - 1]} ${a}`
}

/** "2025-03" → "Marzo 2025" */
export function mese(ym) {
  if (!ym) return '—'
  const [a, m] = String(ym).split('-')
  const nome = MESI[Number(m) - 1]
  if (!nome) return '—'
  return `${nome} ${a}`
}

export const MESI = [
  'Gennaio',
  'Febbraio',
  'Marzo',
  'Aprile',
  'Maggio',
  'Giugno',
  'Luglio',
  'Agosto',
  'Settembre',
  'Ottobre',
  'Novembre',
  'Dicembre',
]
export const MESI_BREVI = [
  'gen',
  'feb',
  'mar',
  'apr',
  'mag',
  'giu',
  'lug',
  'ago',
  'set',
  'ott',
  'nov',
  'dic',
]
export const GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato']
export const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab']

/** Normalizza qualunque forma di data in `aaaa-mm-gg`, o null. */
export function toIso(v) {
  if (!v) return null
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const g = String(v.getDate()).padStart(2, '0')
    return `${v.getFullYear()}-${m}-${g}`
  }
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const it = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (it) return `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`
  return null
}

/** Targa italiana in forma canonica: "ab123cd" → "AB 123 CD". */
export function targa(v) {
  if (!v) return '—'
  const s = String(v).toUpperCase().replace(/[\s-]/g, '')
  const m = s.match(/^([A-Z]{2})(\d{3})([A-Z]{2})$/)
  if (m) return `${m[1]} ${m[2]} ${m[3]}`
  const vecchia = s.match(/^([A-Z]{2})(\d{5,6})$/) // es. MI123456
  if (vecchia) return `${vecchia[1]} ${vecchia[2]}`
  return s
}

/** Confronto insensibile a spazi e trattini, per la ricerca su targa. */
export function targaKey(v) {
  return String(v || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

/** "Mario", "Rossi" → "MR" */
export function iniziali(a, b) {
  const x = (a || '').trim()
  const y = (b || '').trim()
  if (x && y) return (x[0] + y[0]).toUpperCase()
  const s = (x || y || '?').split(/\s+/)
  return (s[0][0] + (s[1]?.[0] || '')).toUpperCase()
}

/** Nome da mostrare per un cliente privato o azienda. */
export function nomeCliente(c) {
  if (!c) return '—'
  if (c.tipo === 'azienda') return c.ragioneSociale || '—'
  return [c.cognome, c.nome].filter(Boolean).join(' ') || '—'
}

export function nomeDipendente(e) {
  if (!e) return '—'
  return [e.nome, e.cognome].filter(Boolean).join(' ') || '—'
}

/** "16 gg fa", "oggi", "tra 3 gg" — riferito a oggi (o a `rispettoA`). */
export function daOggi(iso, rispettoA) {
  const g = giorniTra(rispettoA || oggiIso(), iso)
  if (g === null) return '—'
  if (g === 0) return 'oggi'
  if (g === 1) return 'domani'
  if (g === -1) return 'ieri'
  return g > 0 ? `tra ${g} gg` : `${-g} gg fa`
}

/** Giorni interi da `a` a `b` (positivo se `b` è nel futuro). */
export function giorniTra(a, b) {
  const ia = toIso(a)
  const ib = toIso(b)
  if (!ia || !ib) return null
  const da = Date.UTC(+ia.slice(0, 4), +ia.slice(5, 7) - 1, +ia.slice(8, 10))
  const db = Date.UTC(+ib.slice(0, 4), +ib.slice(5, 7) - 1, +ib.slice(8, 10))
  return Math.round((db - da) / 86400000)
}

/** Data odierna in ISO, secondo il calendario locale. */
export function oggiIso() {
  return toIso(new Date())
}

/** Somma giorni a una data ISO. */
export function addGiorni(iso, n) {
  const base = toIso(iso)
  if (!base) return null
  const d = new Date(Date.UTC(+base.slice(0, 4), +base.slice(5, 7) - 1, +base.slice(8, 10)))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Somma mesi a una data ISO, saturando a fine mese (31/01 + 1 → 28/02). */
export function addMesi(iso, n) {
  const base = toIso(iso)
  if (!base) return null
  const a = +base.slice(0, 4)
  const m = +base.slice(5, 7) - 1
  const g = +base.slice(8, 10)
  const totale = a * 12 + m + n
  const na = Math.floor(totale / 12)
  const nm = totale % 12
  const ultimo = new Date(Date.UTC(na, nm + 1, 0)).getUTCDate()
  return `${na}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(g, ultimo)).padStart(2, '0')}`
}

/** "2025-03-04" → "2025-03" */
export function meseDi(iso) {
  const s = toIso(iso)
  return s ? s.slice(0, 7) : null
}

/** Primo e ultimo giorno del mese `aaaa-mm`. */
export function rangeMese(ym) {
  const [a, m] = String(ym).split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return { da: `${ym}-01`, a: `${ym}-${String(ultimo).padStart(2, '0')}`, giorni: ultimo }
}

/** 0=domenica … 6=sabato, calcolato sulla data ISO senza fuso orario. */
export function giornoSettimana(iso) {
  const s = toIso(iso)
  if (!s) return null
  return new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay()
}

/** "1.234,56" o "1234.56" → 1234.56 */
export function parseNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (v === null || v === undefined) return 0
  const s = String(v).trim().replace(/\s|€/g, '')
  if (!s) return 0
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s)
  return Number.isFinite(n) ? n : 0
}

/** Testo normalizzato per la ricerca: minuscolo, senza accenti. */
export function chiaveRicerca(v) {
  return String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

/** Byte → "1,4 MB" */
export function byte(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  if (v < 1024) return `${v} B`
  if (v < 1024 * 1024) return `${numero(v / 1024, 0)} KB`
  return `${numero(v / (1024 * 1024), 1)} MB`
}

/** Riga CSV con separatore `;` (Excel italiano) e decimali con la virgola. */
export function csv(colonne, righe) {
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const testa = colonne.map((c) => esc(c.label)).join(';')
  const corpo = righe.map((r) => colonne.map((c) => esc(c.value(r))).join(';'))
  return String.fromCharCode(0xfeff) + [testa, ...corpo].join('\r\n')
}
