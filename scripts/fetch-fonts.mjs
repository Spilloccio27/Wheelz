#!/usr/bin/env node
/**
 * npm run fonts — scarica Inter in public/fonts/.
 *
 * Perché uno script e non un link a Google Fonts: in produzione la
 * Content-Security-Policy ammette `font-src 'self'` e come unica origine
 * esterna `*.supabase.co`. Un @font-face che punta a fonts.gstatic.com
 * verrebbe bloccato dal browser, e in ogni caso significherebbe raccontare a
 * un terzo chi apre il gestionale.
 *
 * Il file viene scaricato una volta sola, in fase di preparazione del
 * progetto, e da quel momento fa parte della build statica. Se manca,
 * l'applicazione funziona lo stesso: il @font-face non trova il file e si
 * ricade sul font di sistema (la catena in index.css parte da ui-sans-serif).
 *
 * Inter è di Rasmus Andersson, licenza SIL Open Font License 1.1.
 * https://github.com/rsms/inter
 */

import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const radice = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cartella = resolve(radice, 'public/fonts')

const VERSIONE = '4.0'
const FILE = [
  {
    nome: 'Inter-Variable.woff2',
    url: `https://github.com/rsms/inter/raw/v${VERSIONE}/docs/font-files/InterVariable.woff2`,
  },
]

async function main() {
  mkdirSync(cartella, { recursive: true })

  for (const f of FILE) {
    const destinazione = resolve(cartella, f.nome)
    if (existsSync(destinazione) && !process.argv.includes('--forza')) {
      console.log(`  ${f.nome} già presente (usa --forza per riscaricarlo)`)
      continue
    }

    process.stdout.write(`  ${f.nome} … `)
    const risposta = await fetch(f.url, { redirect: 'follow' })
    if (!risposta.ok) {
      throw new Error(`HTTP ${risposta.status} da ${f.url}`)
    }
    const dati = Buffer.from(await risposta.arrayBuffer())
    if (dati.length < 10000) {
      throw new Error('il file scaricato è troppo piccolo per essere un font')
    }
    writeFileSync(destinazione, dati)
    console.log(`${Math.round(dati.length / 1024)} kB`)
  }

  console.log(`
Fatto. I font sono in public/fonts/ e finiranno nella build statica.
Licenza SIL Open Font License 1.1 — vedi public/fonts/LICENSE.txt.
`)
}

main().catch((e) => {
  console.error(`
Non è stato possibile scaricare i font: ${e.message}

Non è un errore bloccante: senza i file, l'applicazione usa il font di
sistema. Se preferisci procedere a mano, scarica InterVariable.woff2 da
https://github.com/rsms/inter/releases e mettilo in public/fonts/ con il
nome Inter-Variable.woff2.
`)
  process.exit(0)
})
