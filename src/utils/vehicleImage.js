/**
 * Immagine del veicolo.
 *
 * Finché nessuno ha caricato la foto vera, la scheda mostra un'illustrazione
 * generata: sagoma di profilo, tinta presa dal colore registrato sul veicolo,
 * fondo con un alone morbido. È un SVG costruito qui e passato come data URI —
 * nessuna richiesta di rete, il che è obbligatorio (la Content-Security-Policy
 * ammette come unica origine esterna `*.supabase.co`) oltre che più veloce.
 *
 * Non finge di essere una fotografia: serve a dare al parco veicoli una
 * griglia leggibile a colpo d'occhio, dove la targa e la sagoma bastano a
 * riconoscere la macchina prima ancora di leggere il modello.
 */

/** Colori di carrozzeria: quelli che si registrano davvero in accettazione. */
const VERNICI = {
  bianco: '#e9eaec',
  grigio: '#93999f',
  nero: '#26282c',
  blu: '#39537f',
  rosso: '#a03a35',
  argento: '#c2c6cb',
  azzurro: '#6d95c2',
  verde: '#3f6b52',
  giallo: '#c9a227',
  arancione: '#c4703a',
  marrone: '#6b5344',
  beige: '#c9bda6',
}

const VERNICE_PREDEFINITA = '#8b9096'

function vernice(colore) {
  if (!colore) return VERNICE_PREDEFINITA
  const k = String(colore).trim().toLowerCase()
  return VERNICI[k] || VERNICE_PREDEFINITA
}

/** Schiarisce o scurisce una tinta esadecimale di una quota fra -1 e 1. */
function sposta(hex, quota) {
  const n = parseInt(hex.slice(1), 16)
  const canale = (c) => {
    const v = quota >= 0 ? c + (255 - c) * quota : c * (1 + quota)
    return Math.max(0, Math.min(255, Math.round(v)))
  }
  const r = canale((n >> 16) & 255)
  const g = canale((n >> 8) & 255)
  const b = canale(n & 255)
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`
}

/** I furgoni hanno un'altra sagoma: in officina si riconoscono subito. */
const FURGONI = /ducato|transit|daily|sprinter|master|jumper|boxer|crafter|vivaro|traffic|trafic|doblo|doblò|partner|berlingo|caddy|scudo|expert|jumpy|talento|nv200|primastar/i

export function eFurgone(veicolo) {
  return FURGONI.test(`${veicolo?.modello || ''} ${veicolo?.allestimento || ''}`)
}

/* ------------------------------------------------------------------ *
 * Sagome
 * ------------------------------------------------------------------ */

const AUTO = {
  corpo:
    'M34 150 L34 129 C34 116 44 108 59 105 L117 96 L159 66 C169 58 183 54 199 54 L253 54 ' +
    'C271 54 287 60 299 72 L327 100 L353 107 C367 111 373 119 373 131 L373 150 Z',
  vetri: [
    'M130 96 L165 70 C173 64 183 62 195 62 L211 62 L211 96 Z',
    'M221 62 L251 62 C265 62 277 66 287 76 L305 96 L221 96 Z',
  ],
  ruote: [
    { x: 113, y: 151, r: 30 },
    { x: 301, y: 151, r: 30 },
  ],
  luci: [
    { x: 36, y: 122, w: 16, h: 11 },
    { x: 356, y: 122, w: 15, h: 11 },
  ],
}

const FURGONE = {
  corpo:
    'M30 152 L30 121 C30 109 38 101 51 99 L101 93 L139 61 C147 53 159 49 173 49 L341 49 ' +
    'C357 49 369 59 369 75 L369 152 Z',
  vetri: [
    'M149 93 L179 61 L215 61 L215 93 Z',
    'M225 61 L263 61 L263 93 L225 93 Z',
  ],
  ruote: [
    { x: 101, y: 153, r: 28 },
    { x: 313, y: 153, r: 28 },
  ],
  luci: [
    { x: 32, y: 116, w: 15, h: 10 },
    { x: 353, y: 116, w: 14, h: 10 },
  ],
}

/* ------------------------------------------------------------------ *
 * Costruzione
 * ------------------------------------------------------------------ */

/**
 * @param {object} veicolo   almeno { colore, modello }
 * @param {boolean} scuro    tema attivo, per il fondo
 * @returns {string} data URI di un SVG
 */
export function illustrazioneVeicolo(veicolo, scuro = true) {
  const s = eFurgone(veicolo) ? FURGONE : AUTO
  const tinta = vernice(veicolo?.colore)
  const chiaro = sposta(tinta, 0.24)
  const scuroTinta = sposta(tinta, -0.28)
  const cerchi = scuro ? '#5a6068' : '#b8bcc2'
  const fondo1 = scuro ? '#191a1e' : '#f4f4f6'
  const fondo2 = scuro ? '#0e0f12' : '#e2e3e6'
  const alone = scuro ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.85)'
  const ombra = scuro ? 'rgba(0,0,0,0.55)' : 'rgba(9,9,11,0.16)'
  const vetro = scuro ? '#2b3038' : '#cdd2d8'

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
<defs>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${fondo1}"/><stop offset="1" stop-color="${fondo2}"/>
</linearGradient>
<radialGradient id="a" cx="0.3" cy="0.15" r="0.8">
<stop offset="0" stop-color="${alone}"/><stop offset="1" stop-color="transparent"/>
</radialGradient>
<linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
<stop offset="0" stop-color="${chiaro}"/><stop offset="0.55" stop-color="${tinta}"/><stop offset="1" stop-color="${scuroTinta}"/>
</linearGradient>
</defs>
<rect width="400" height="200" fill="url(#f)"/>
<rect width="400" height="200" fill="url(#a)"/>
<ellipse cx="205" cy="175" rx="160" ry="12" fill="${ombra}"/>
<path d="${s.corpo}" fill="url(#c)"/>
${s.vetri.map((d) => `<path d="${d}" fill="${vetro}" opacity="0.92"/>`).join('')}
${s.luci
  .map(
    (l) =>
      `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" rx="4" fill="${sposta(tinta, 0.55)}" opacity="0.85"/>`,
  )
  .join('')}
${s.ruote
  .map(
    (r) =>
      `<circle cx="${r.x}" cy="${r.y}" r="${r.r}" fill="#17191d"/>` +
      `<circle cx="${r.x}" cy="${r.y}" r="${r.r * 0.5}" fill="${cerchi}"/>` +
      `<circle cx="${r.x}" cy="${r.y}" r="${r.r * 0.17}" fill="#17191d"/>`,
  )
  .join('')}
</svg>`

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\n/g, ''))}`
}

export { vernice }
