/**
 * Palette dei grafici.
 *
 * L'interfaccia è monocroma, i grafici no: qui il colore porta informazione
 * che il grigio non porta, e sei serie di grigio diverso sono illeggibili.
 *
 * La scala è derivata da Okabe-Ito, pensata per restare distinguibile con
 * protanopia, deuteranopia e tritanopia. Verde e rosso restano fuori, perché
 * in questa applicazione significano già "meglio" e "peggio" e nient'altro.
 *
 * Alla luminosità e alla tinta si aggiunge sempre una terza chiave: il
 * tratteggio sulle linee e un filo del colore della card fra le fette delle
 * torte. Sono le due cose che tengono in piedi un grafico anche stampato in
 * bianco e nero o guardato da chi i colori non li distingue.
 *
 * Contrasto verificato ≥ 3:1 sul fondo della card del proprio tema.
 */

const SERIE_SCURO = ['#7aa2f7', '#e8a33d', '#56c4b5', '#cc79a7', '#b9a3f0', '#9aa6b8']
const SERIE_CHIARO = ['#2b57c9', '#9a5a00', '#0e7a70', '#a2357f', '#6d3fd1', '#5a6577']

/** Serie categorica del tema attivo. */
export function serie(scuro = true) {
  return scuro ? SERIE_SCURO : SERIE_CHIARO
}

/** Colore dell'i-esima serie, con rotazione. */
export function colore(i, scuro = true) {
  const s = serie(scuro)
  return s[((i % s.length) + s.length) % s.length]
}

/**
 * Tratteggi per i grafici a linee: quando due linee hanno luminosità vicine,
 * è il tratto a dire quale è quale. `0` significa linea piena.
 */
const TRATTI = ['0', '6 3', '2 3', '10 3 2 3', '1 4', '14 4']

export function tratto(i) {
  return TRATTI[((i % TRATTI.length) + TRATTI.length) % TRATTI.length]
}

/** Colore di sfondo della card: serve come separatore fra le fette. */
export function fondoCard(scuro = true) {
  return scuro ? '#16161a' : '#ffffff'
}

/**
 * Stati economici.
 *
 * Verde e rosso hanno un solo significato in tutta l'applicazione: meglio e
 * peggio. Per questo non compaiono mai nella scala categorica dei grafici —
 * una serie colorata di rosso verrebbe letta come un problema.
 *
 * Al colore si affianca sempre un secondo segnale (il segno del numero, il
 * grassetto, un'icona): chi non distingue verde e rosso non deve perdere
 * l'informazione.
 */
export const SEGNO = {
  scuro: { positivo: '#4ade80', negativo: '#ff6b6b', neutro: '#6c6c76', attenzione: '#f0b055' },
  chiaro: { positivo: '#15803d', negativo: '#c2201f', neutro: '#8b8b93', attenzione: '#a45a04' },
}

export function coloreSegno(v, scuro = true, { neutroSotto = 0 } = {}) {
  const p = scuro ? SEGNO.scuro : SEGNO.chiaro
  if (Math.abs(Number(v || 0)) <= neutroSotto) return p.neutro
  return Number(v) >= 0 ? p.positivo : p.negativo
}

/** Coppia manodopera / ricambi: deve restare stabile in tutti i grafici. */
export function coppiaRicavo(scuro = true) {
  const s = serie(scuro)
  return { manodopera: s[0], ricambi: s[1] }
}

/** Grigio di fondo per la parte "non venduta" delle barre impilate. */
export function fondoBarra(scuro = true) {
  return scuro ? 'rgba(255,255,255,0.09)' : 'rgba(9,9,11,0.1)'
}

/** Assi, griglia e tooltip di Recharts, coerenti col tema. */
export function assi(scuro = true) {
  return {
    griglia: scuro ? 'rgba(255,255,255,0.07)' : 'rgba(9,9,11,0.08)',
    testo: scuro ? '#7d7d86' : '#75757e',
    cursore: scuro ? 'rgba(255,255,255,0.05)' : 'rgba(9,9,11,0.04)',
    tooltip: {
      background: scuro ? 'rgba(22,22,26,0.92)' : 'rgba(255,255,255,0.94)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      border: `1px solid ${scuro ? 'rgba(255,255,255,0.12)' : 'rgba(9,9,11,0.12)'}`,
      borderRadius: 12,
      color: scuro ? '#f4f4f5' : '#101012',
      fontSize: 12,
      boxShadow: scuro ? '0 18px 44px -16px rgba(0,0,0,.85)' : '0 18px 44px -18px rgba(9,9,11,.3)',
      padding: '9px 11px',
    },
  }
}

/** Toni degli stati: stessa semantica in ogni modulo. */
export const STATO_COLORE = {
  // schede
  accettato: 'neutro',
  in_lavorazione: 'accento',
  attesa_ricambi: 'attenzione',
  pronto: 'positivo',
  consegnato: 'neutro',
  fatturato: 'positivo',
  // preventivi
  bozza: 'neutro',
  inviato: 'accento',
  rifiutato: 'negativo',
  scaduto: 'attenzione',
  // fatture
  emessa: 'accento',
  parziale: 'attenzione',
  incassata: 'positivo',
  insoluta: 'negativo',
  annullata: 'neutro',
  // spese e ordini
  da_pagare: 'attenzione',
  pagata: 'positivo',
  ricevuto: 'positivo',
  annullato: 'neutro',
}
