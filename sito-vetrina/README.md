# Sito vetrina di MechFlow

Pagina di presentazione dell'applicazione, **separata dal gestionale**: vive in
questa cartella, non condivide niente con `src/`, non entra nella build di Vite
e non ha dipendenze da installare. È HTML, un foglio di stile e due file
JavaScript.

Si può spostare in un repository a sé stante copiando questa sola cartella:
non c'è alcun percorso che risalga verso la radice del progetto.

---

## Aprirlo

Basta un doppio clic su `index.html`. Per vederlo esattamente come sarà in
produzione — percorsi assoluti, intestazioni, tipi MIME — serve un server
qualunque:

```bash
cd sito-vetrina
python3 -m http.server 4173      # oppure: npx serve .
```

E poi `http://localhost:4173`.

---

## Che cosa c'è dentro

```
sito-vetrina/
├── index.html            la pagina, in una sola vista
├── assets/
│   ├── style.css         palette, superfici di vetro, impianto, adattivo
│   ├── tema.js           chiaro/scuro applicato prima del primo disegno
│   ├── script.js         menu, comparsa allo scorrimento, contatori
│   └── favicon.svg
├── netlify.toml          pubblicazione della sola cartella
├── _headers              stesse intestazioni, per gli host che leggono questo
└── README.md
```

### Le sezioni della pagina

| Ancora | Contenuto |
|---|---|
| apertura | promessa, due inviti all'azione, mockup della dashboard costruito in CSS |
| `#perche` | il problema: lo stesso dato riscritto tre volte |
| `#moduli` | le dodici aree funzionali, una scheda per ciascuna |
| `#flusso` | accettazione → preventivo → scheda → fattura |
| `#numeri` | le formule gestionali e tre note che non si leggono dalla formula |
| `#ruoli` | titolare, capofficina, meccanico; le cinque regole non negoziabili |
| `#officina` | l'uso da tablet: barra in basso, tabelle che diventano card |
| `#demo` | il dataset dimostrativo, le sue invarianti, l'avvio in trenta secondi |
| `#tecnica` | stack e scelte dichiarate |
| `#domande` | fatturazione elettronica, tempari, FIFO, dove finiscono i dati |

I contenuti vengono dal `README.md` alla radice: se cambia il comportamento
dell'applicazione — una formula, un permesso, un modulo — la sezione
corrispondente qui va aggiornata a mano. Sono testi, non dati generati:
è un compromesso voluto, per non far dipendere la vetrina dalla build.

---

## Scelte

**Nessuna richiesta esterna.** Niente CDN, niente Google Fonts, niente
tracciamento, niente cookie. Inter viene usata solo se è già installata sul
sistema (`local()`), altrimenti si ricade sul font di sistema. La CSP dichiarata
in `_headers` è di conseguenza molto stretta: `connect-src 'none'`.

**Stessa pelle dell'applicazione.** Le variabili di colore, i raggi, le ombre e
le superfici di vetro sono copiate da `src/index.css`. Il sito e il gestionale
devono sembrare la stessa cosa, perché lo sono.

**Niente immagini.** Il mockup della dashboard e quello del telefono sono
costruiti con `div` e CSS: pesano zero, sono nitidi a qualunque densità e
seguono il tema chiaro/scuro senza dover mantenere due schermate. Quando ci
saranno screenshot veri dell'applicazione, prenderanno il posto dei mockup senza
toccare l'impianto.

**Degrada bene.** Senza JavaScript la pagina si legge tutta (le animazioni di
comparsa si attivano solo con la classe `js`). Senza `backdrop-filter` le
superfici diventano opache. Con `prefers-reduced-motion` le animazioni spariscono.

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
