# Sito vetrina di MechFlow

Sito di presentazione dell'applicazione: **otto pagine statiche**, separate dal
gestionale. Vive in questa cartella, non condivide niente con `src/`, non entra
nella build di Vite e non ha dipendenze da installare. HTML, un foglio di stile,
due file JavaScript e le schermate dell'applicazione in WebP.

Si può spostare in un repository o in un hosting a sé copiando questa sola
cartella: non c'è alcun percorso che risalga verso la radice del progetto.

---

## Aprirlo

Doppio clic su `index.html` funziona. Per vederlo come sarà in produzione —
tipi MIME, intestazioni, cache — serve un server qualunque:

```bash
cd sito-vetrina
python3 -m http.server 4173      # oppure: npx serve .
```

E poi `http://localhost:4173`.

---

## Le pagine

| File | Contenuto |
|---|---|
| `index.html` | apertura, il problema che risolve, tre schermate d'assaggio |
| `moduli.html` | i dodici moduli, uno per uno, ognuno con la sua schermata |
| `flusso.html` | accettazione → preventivo → lavorazione → consegna e fattura |
| `numeri.html` | conto economico, marginalità, produttività, tabella delle formule |
| `officina.html` | l'uso da tablet e telefono, tema chiaro e scuro |
| `sicurezza.html` | i tre ruoli, le cinque regole non negoziabili, dove finiscono i dati |
| `demo.html` | il dataset dimostrativo, l'avvio, il collegamento a Supabase |
| `domande.html` | le domande frequenti, comprese le risposte scomode |

In fondo a ogni pagina ci sono i collegamenti alla precedente e alla successiva:
lette in fila raccontano l'applicazione dall'inizio alla fine.

---

## Le schermate

Sono **riprese vere** dell'applicazione in modalità demo, non mockup: browser
reale a 1440 × 900 per il desktop, 390 × 844 (a densità doppia) per il telefono.
Stanno in `immagini/`, in WebP a due risoluzioni — quella piena e una a metà
larghezza servita via `srcset` agli schermi stretti. In tutto meno di 2 MB.

I dati che si vedono sono quelli dell'officina di esempio, generati da un
simulatore: nessun dato di un cliente reale è mai finito in una schermata.

Un clic su una schermata la apre a piena finestra: a 1440 px dentro mezza
colonna i numeri non si leggono.

### Rifarle dopo una modifica all'applicazione

Non c'è uno script nel sito che le rigeneri — le schermate si scattano quando
l'interfaccia cambia davvero, non a ogni build. Il procedimento:

1. avviare l'applicazione in modalità demo (`npm run dev` nella radice);
2. catturare la pagina interessata a 1440 × 900 con il tema scuro;
3. convertirla in WebP a qualità 80, salvando anche la versione a metà
   larghezza con il suffisso `@720` (`@390` per le schermate da telefono);
4. sostituire il file in `immagini/` mantenendo lo stesso nome.

I nomi dei file corrispondono ai moduli: `dashboard`, `clienti`, `veicoli`,
`preventivi`, `schede-aperte`, `magazzino`, `fornitori`, `fatturazione`,
`spese`, `personale-turni`, `report`, `impostazioni`, più i dettagli
(`scheda-dettaglio`, `preventivo-dettaglio`, `articolo-dettaglio`), le varianti
in tema chiaro (`-chiaro`) e le tre da telefono (`mobile-`).

---

## Che cosa c'è dentro

```
sito-vetrina/
├── index.html  moduli.html  flusso.html  numeri.html
├── officina.html  sicurezza.html  demo.html  domande.html
├── assets/
│   ├── style.css         palette, superfici di vetro, impianto, adattivo
│   ├── tema.js           chiaro/scuro applicato prima del primo disegno
│   ├── script.js         menu, comparsa allo scorrimento, ingranditore
│   └── favicon.svg
├── immagini/             le schermate, WebP a due risoluzioni
├── netlify.toml          pubblicazione della sola cartella
├── _headers              stesse intestazioni, per gli host che leggono questo
└── README.md
```

L'intestazione e il piè di pagina sono ripetuti in ognuna delle otto pagine: è
il prezzo di non avere un generatore. Se cambia una voce di menu va cambiata in
otto file — una sostituzione, non un lavoro.

---

## Scelte

**Nessuna richiesta esterna.** Niente CDN, niente Google Fonts, niente
tracciamento, niente cookie. Inter viene usata solo se è già installata sul
sistema (`local()`), altrimenti si ricade sul font di sistema. La CSP dichiarata
in `_headers` è di conseguenza molto stretta: `connect-src 'none'`.

**Stessa pelle dell'applicazione.** Le variabili di colore, i raggi, le ombre e
le superfici di vetro sono copiate da `src/index.css`. Il sito e il gestionale
devono sembrare la stessa cosa, perché lo sono.

**Degrada bene.** Senza JavaScript la pagina si legge tutta (le animazioni di
comparsa si attivano solo con la classe `js`, e l'ingranditore semplicemente non
si apre). Senza `backdrop-filter` le superfici diventano opache. Con
`prefers-reduced-motion` le animazioni spariscono.

**Onesto su quello che manca.** La pagina delle domande dice per esteso che
l'invio allo SDI non è implementato, che non c'è un tempario, che i ricambi sono
a prezzo medio ponderato e non a FIFO. Un cliente che lo scopre dopo è un
cliente perso peggio.

---

## Pubblicarlo

**Netlify** — nuovo sito dallo stesso repository, *base directory*
`sito-vetrina`, nessun comando di build, *publish directory* `sito-vetrina`.
La `netlify.toml` qui dentro fa il resto.

**Vercel** — *root directory* `sito-vetrina`, framework preset «Other», nessun
comando di build.

**GitHub Pages** — pubblicare dalla cartella `/sito-vetrina` del branch scelto.
Le intestazioni di `_headers` non vengono applicate: Pages non le legge.

**Un hosting qualunque** — copiare il contenuto della cartella nella document
root. Non c'è niente da compilare.
