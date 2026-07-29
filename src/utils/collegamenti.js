/**
 * I tre indirizzi in rete, in un posto solo.
 *
 * L'applicazione è la stessa in tutti e due i casi: cambia solo che sulla
 * demo i dati sono già dentro e non vengono conservati. Il sito vetrina è
 * separato e serve a chi deve ancora capire cos'è.
 *
 * Stanno qui e non in `.env` di proposito: non sono configurazione di
 * un'installazione, sono i tre indirizzi ufficiali del prodotto, uguali per
 * chiunque apra l'applicazione.
 */
export const SITO = 'https://wheelz-site.netlify.app'
export const DEMO = 'https://wheelz-demo.netlify.app'
export const GESTIONALE = 'https://wheelz-manager.netlify.app'

/** Vero quando l'applicazione sta girando sull'indirizzo della demo. */
export function suDemo() {
  if (typeof window === 'undefined') return false
  return window.location.hostname === new URL(DEMO).hostname
}
