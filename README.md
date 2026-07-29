# Wheelz

Gestionale web per autofficine: clienti e parco veicoli, preventivi, schede di
lavoro, ricambi a magazzino, fornitori, fatturazione e incassi, spese, personale
con ore e presenze, report economici.

Copre meccanica, elettrauto, gommista e carrozzeria leggera. È pensato per
un'officina che sta in un capannone, non per una rete di concessionarie: un
titolare, qualche meccanico, tre ponti, un tablet appeso al muro.

---

## Avvio in trenta secondi

```bash
npm install
npm run fonts   # scarica Inter in public/fonts (una volta sola, facoltativo)
npm run dev
```

Si apre su `http://localhost:5173` in **modalità demo**: dati precaricati,
tutto in memoria, nessuna chiamata di rete. L'officina di esempio è
**Autofficina Rossi & Figli**, tre mesi di storico, cinque addetti, tre ponti.

In fondo alla barra laterale c'è un selettore **"Guarda l'officina come"**: serve
a vedere la stessa applicazione con gli occhi del titolare, del capofficina o di
un meccanico, e capire cosa cambia.

### Script disponibili

| Comando | Cosa fa |
|---|---|
| `npm run dev` | server di sviluppo con ricarica a caldo |
| `npm run build` | build statica in `dist/` |
| `npm run preview` | serve la build appena prodotta |
| `npm run lint` | ESLint su tutto il progetto |
| `npm run test` | Vitest sulle formule di `utils/calc.js` |
| `npm run check` | lint + test + build — deve passare pulito |
| `npm run seed` | carica i dati demo su un progetto Supabase |
| `npm run fonts` | scarica Inter in `public/fonts/` |

---

## Stack

- **React 18**, solo componenti funzionali e hook
- **Vite 5** per sviluppo e build
- **Tailwind CSS 4** — monocromatico, tema scuro predefinito con toggle
- **Recharts** per i grafici, **lucide-react** per le icone
- **Inter** servito dal progetto, licenza SIL OFL
- **Supabase** (PostgreSQL + Auth + Storage) quando configurato

Niente altro. Nessuna libreria di date, di form o di state management: le date
sono stringhe ISO manipolate da una manciata di funzioni in `utils/format.js`,
i form sono `useState`, lo stato globale è un `useSyncExternalStore` su un
servizio dati che sta in un file solo.

I font non passano da Google Fonts né da alcun CDN: la
Content-Security-Policy di produzione ammette `font-src 'self'` e come unica
origine esterna `*.supabase.co`. Se `public/fonts/Inter-Variable.woff2` non
c'è, l'applicazione ricade sul font di sistema senza rompersi.

---

## Architettura

```
src/
├── data/
│   ├── supabaseClient.js   client Supabase (null senza chiavi → modalità demo)
│   ├── dataService.js      livello dati: l'unico modulo che tocca lo storage
│   ├── storageService.js   file binari (loghi, foto danni, allegati fatture)
│   ├── authService.js      registrazione, accesso, profili, inviti
│   └── demoData.js         generatore deterministico dei dati demo (RNG con seed)
├── context/AppContext.jsx  stato globale, utente attivo, tema, notifiche
├── utils/
│   ├── format.js           formattazione italiana (1.234,56 €, gg/mm/aaaa, targa)
│   ├── chartColors.js      palette dei grafici, chiaro e scuro
│   ├── image.js            ridimensionamento immagini lato client
│   ├── calc.js             KPI, marginalità, produttività, break-even, alert
│   └── calc.test.js        test delle formule
├── components/
│   ├── ui.jsx              design system (Card, DataTable, Modal, KPI…)
│   ├── RigheDocumento.jsx  editor righe condiviso da preventivi, schede, fatture
│   └── Login.jsx           accesso, registrazione, recupero password
├── modules/                un file per dominio funzionale
│   ├── Dashboard.jsx   Clienti.jsx      Veicoli.jsx
│   ├── Preventivi.jsx  SchedeLavoro.jsx Magazzino.jsx
│   ├── Fornitori.jsx   Fatturazione.jsx Spese.jsx
│   └── Personale.jsx   Report.jsx       Impostazioni.jsx
├── App.jsx                 guscio: barra laterale, intestazione, instradamento
└── main.jsx
```

Due file si aggiungono all'elenco minimo, e il motivo è lo stesso in entrambi i
casi: erano già duplicati.

- **`components/RigheDocumento.jsx`** — le righe di preventivo, scheda e fattura
  hanno la stessa forma (manodopera a ore × tariffa, ricambi a quantità ×
  prezzo, sconto di riga, aliquota IVA). Scriverne tre versioni avrebbe
  significato tre modi diversi di sbagliare gli stessi totali.
- **`components/Login.jsx`** — l'accesso non è un modulo di dominio: non compare
  nel menu e non ha dati suoi.

### Il livello dati

`dataService.js` è l'unico punto che parla con lo storage. Espone:

```js
list / get / insert / update / remove        // CRUD generico
updateSettings                                // impostazioni (riga unica)
prossimoNumero(tipo, anno)                    // numerazione progressiva
registerMovement(...)                         // magazzino, con prezzo medio ponderato
scaricaRicambiScheda(jobId, righe)            // ricambi impiegati su una scheda
preventivoInScheda(quoteId, opzioni)          // preventivo accettato → commessa
chiudiSchedaEFattura(jobId, opzioni)          // consegna → fattura
registraIncasso(invoiceId, pagamento)
riceviOrdine(orderId)                         // carico magazzino + spesa
generateRecurring(mese)                       // spese ricorrenti, idempotente
```

Tiene una copia in memoria dell'officina corrente e scrive in write-through sul
backend attivo. Cambiare backend significa riscrivere solo le funzioni di quel
file: **l'interfaccia non cambia di una riga**.

I campi in JavaScript sono `camelCase`, le colonne in PostgreSQL `snake_case`.
La traduzione è automatica e simmetrica (`prezzoMedio` ⇄ `prezzo_medio`), quindi
aggiungere un campo non richiede toccare nessuna mappa — basta rispettare la
convenzione. È l'unico motivo per cui il codice originale del ricambio si chiama
`codiceOe` e non `codiceOE`.

---

## Modello dati

Documentato per esteso in testa a [`src/data/dataService.js`](src/data/dataService.js).
Ogni riga di ogni tabella porta `id` e `officinaId`.

| Entità | Contenuto | Relazioni |
|---|---|---|
| `settings` | dati officina, tariffe orarie, ricarichi, IVA, obiettivi, % oneri, n. ponti | — |
| `customers` | privati e aziende, contatti, dati fiscali (P.IVA, SDI, PEC) | ← vehicles, jobs, invoices |
| `vehicles` | targa, VIN, marca/modello, km, alimentazione, scadenze | → customers |
| `quotes` | preventivi: righe manodopera e ricambi, sconti, stato, validità | → customers, vehicles |
| `jobs` | schede di lavoro: difetto, diagnosi, stato, ponte, date, garanzia | → vehicles, customers, employees |
| `jobLines` | righe scheda: manodopera (ore × tariffa) o ricambio (qtà × prezzo) | → jobs, articles |
| `articles` | ricambi: codice OE, giacenza, scorte, prezzo medio ponderato, listino | → suppliers |
| `movements` | carico / scarico / reso / rettifica, con causale | → articles, jobs, orders |
| `priceHistory` | prezzi d'acquisto storici per articolo | → articles, suppliers |
| `orders` | ordini fornitore: alla ricezione carico magazzino + spesa automatica | → suppliers, articles |
| `suppliers` | ricambisti e terzisti: condizioni, sconti, tempi di consegna | ← articles, expenses |
| `invoices` | fatture: righe, IVA per aliquota, stato, scadenza, pagamenti | → jobs, customers |
| `expenses` | spese: categoria, fisso/variabile, imponibile + IVA, stato, scadenza | → suppliers, recurring |
| `recurring` | template di spesa ricorrente mensile | ← expenses |
| `employees` | anagrafica, contratto, paga oraria, specializzazione, certificazioni | ← shifts, attendance, jobs |
| `shifts` | turni pianificati per giorno e postazione | → employees |
| `attendance` | presenze: ore, straordinari, ritardi, ferie, permessi, malattia | → employees |
| `profiles` | utenti dell'applicazione, con ruolo | → officine, employees |
| `invites` | inviti a entrare in officina | → officine |

---

## Formule

Stanno tutte in [`src/utils/calc.js`](src/utils/calc.js), sono funzioni pure e
sono coperte da 47 test in `calc.test.js`. È il punto in cui un errore
silenzioso costa di più.

| Formula | Definizione |
|---|---|
| Ricavo manodopera | ore lavorate × tariffa oraria della lavorazione |
| Margine ricambio | (prezzo di vendita − prezzo medio ponderato) / prezzo di vendita |
| Prezzo di vendita consigliato | prezzo medio ponderato × (1 + ricarico), poi ri-lordato dell'IVA |
| Incidenza ricambi | costo dei ricambi impiegati / fatturato del periodo |
| Costo orario meccanico | paga oraria × (1 + oneri %) — straordinari maggiorati del 15% prima degli oneri |
| Produttività | ore vendute su scheda / ore di presenza |
| Occupazione ponti | ore lavorate / (ponti × ore di apertura × giorni) |
| Valore medio scheda | fatturato / numero di schede chiuse |
| Break-even | costi fissi mensili (personale incluso) / margine di contribuzione |
| Prezzo medio ponderato | a ogni carico: (giacenza × prezzoMedio + qtà × prezzoCarico) / (giacenza + qtà) |
| Matrice interventi | frequenza (vs mediana) × margine (vs media) → quattro quadranti |

Tre dettagli che non si leggono dalla formula:

- **Prezzo medio ponderato, giacenza a zero.** Con giacenza nulla o negativa fa
  testo il prezzo del carico: mediare su una giacenza che non esiste produce un
  costo inventato.
- **Break-even.** Restituisce il fatturato di pareggio e lo converte in schede
  al giorno (dividendo per il valore medio scheda) e in ore vendute al giorno
  (usando la tariffa media e la quota di manodopera del periodo).
- **Matrice interventi.** La soglia sulla frequenza è la **mediana** e non la
  media: due o tre tagliandi in più non devono spostare l'asticella per tutti
  gli altri. Sulla marginalità la media va bene, perché lì gli estremi
  contano davvero.

### Produttività: chi sta al denominatore

La produttività è ore vendute / ore di presenza, ma la presenza è quella di **chi
può vendere ore**. Ogni dipendente ha un campo `produttivo`: chi sta in
accettazione o in amministrazione ha le ore nel **costo del lavoro** — dove è
giusto che siano — ma non nel denominatore della produttività, perché quelle ore
non sono mai state fatturabili. Mettercele darebbe un numero sempre basso e
privo di significato.

Nella demo: i tre meccanici e il titolare sono produttivi, l'accettazione no.
Il risultato è una produttività d'officina intorno al 52%, con i meccanici
singoli intorno al 70% — che è quello che si vede in un'officina vera.

---

## Modalità demo

Senza `.env` l'applicazione parte in modalità demo. I dati sono generati da
[`src/data/demoData.js`](src/data/demoData.js) con un RNG con seed (mulberry32):
a parità di seed e di data di ancoraggio il dataset è identico byte per byte.
La data di ancoraggio è "oggi" per impostazione predefinita, così scadenze e
avvisi restano leggibili.

Il generatore non produce righe a caso: **simula tre mesi di officina**, giorno
per giorno. Ogni mattina entrano cinque-nove veicoli, i meccanici hanno una
capacità in ore, prendono le schede dalla coda, scaricano i ricambi (e se il
pezzo non c'è, otto volte su dieci arriva in giornata dal ricambista e una volta
su cinque la scheda resta ferma in attesa), consegnano e fatturano.

Ne discendono cinque invarianti che il dataset non viola mai:

1. ogni ora di manodopera su una scheda esiste anche come ora di presenza dello
   stesso meccanico nello stesso giorno, e non la supera mai;
2. ogni ricambio impiegato ha il suo movimento di scarico, e la giacenza di ogni
   articolo è la somma algebrica dei suoi movimenti;
3. ogni fattura nasce da una scheda consegnata e ne riporta le righe;
4. il prezzo medio ponderato è il risultato dei carichi, non un numero inventato;
5. la domenica l'officina è chiusa: niente presenze, niente lavorazioni.

Ordine di grandezza del dataset generato: 256 clienti, 360 veicoli, 509 schede,
2.088 righe, 1.380 movimenti, 469 fatture, 387 presenze. Il parco clienti è
volutamente ampio: tre ponti che lavorano tutto il giorno fanno oltre
millecinquecento passaggi l'anno, e con quaranta clienti ognuno di loro dovrebbe
entrare in officina una volta al mese.

In demo gli allegati e il logo restano nella memoria del browser come data URL:
niente lascia la macchina.

---

## Collegamento a Supabase

Con le chiavi in `.env` l'applicazione parte da un gestionale **vuoto** e ogni
modifica è persistente. I dati demo non finiscono mai in un database reale se
non li si chiede esplicitamente con `npm run seed`.

### 1. Variabili d'ambiente

Copia `.env.example` in `.env`:

```bash
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_MIN_PASSWORD_LENGTH=10

# solo per `npm run seed`, mai esposta al browser
SUPABASE_URL=https://xxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
```

`VITE_MIN_PASSWORD_LENGTH` **deve coincidere** con Supabase → Authentication →
Providers → Email → *Minimum password length*. Se i due valori divergono, il
client accetta una password che il server poi rifiuta, e l'utente si trova
davanti a un errore che non sa spiegarsi.

### 2. Script SQL, in quest'ordine

Nell'SQL Editor di Supabase, uno alla volta:

| # | File | Cosa crea |
|---|---|---|
| 1 | `supabase/01-schema.sql` | tabelle di dominio, vincoli, indici |
| 2 | `supabase/02-auth.sql` | officine, profili, inviti, `fonda_officina()`, `riscatta_invito()`, trigger sui ruoli |
| 3 | `supabase/03-ordini.sql` | ordini, storico prezzi, `registra_movimento()`, `ricevi_ordine()`, `genera_ricorrenti()` |
| 4 | `supabase/04-storage.sql` | bucket `loghi` e `documenti` con le loro policy |
| 5 | `supabase/05-sicurezza.sql` | RLS attiva ovunque, policy per ruolo |
| 6 | `supabase/06-multi-officina.sql` | default su `officina_id`, trigger anti riferimenti incrociati |
| 7 | `supabase/07-nome-di-una-parola.sql` | correzione a `fonda_officina()` e `riscatta_invito()` — serve solo a chi ha installato prima di questa versione |

Ogni script è **idempotente per rifiuto**: se è già stato applicato si ferma con
un errore invece di rifare il lavoro. Il registro è la tabella `_migrazioni`.

`supabase/99-svuota-demo.sql` è di servizio: svuota i dati operativi di
un'officina lasciando utenti e impostazioni. Va modificato incollandoci l'id
dell'officina, ed è l'unico pensato per girare più volte.

### 3. Configurazione del progetto

- **Authentication → URL Configuration → Site URL**: l'URL di produzione
  (`https://tuo-dominio.it`). In sviluppo aggiungi `http://localhost:5173` fra
  i *Redirect URLs*, altrimenti i link di conferma e di reset password
  rimandano in un posto sbagliato.
- **Authentication → Providers → Email**: attiva *Confirm email* e imposta la
  lunghezza minima password sullo stesso valore del client.
- **Project Settings → Auth → SMTP**: il mittente predefinito di Supabase ha un
  limite di poche email all'ora e finisce spesso in spam. Prima di andare
  online configura un SMTP tuo (Resend, Postmark, SendGrid, o il server di
  posta dell'officina).
- **Authentication → Attack Protection → Captcha**: **da attivare prima di
  esporre la registrazione al pubblico**. Senza, la pagina di iscrizione è un
  invito a riempirti il database.

### 4. Primo accesso

Chi si registra **senza codice invito** fonda una nuova officina e ne diventa
titolare. Chi si registra **con un codice invito** entra nell'officina che l'ha
emesso, con il ruolo scritto nell'invito. Gli inviti si creano da
Impostazioni → Utenti e ruoli.

---

## Sicurezza e ruoli

I permessi sono applicati **nel database**, non nell'interfaccia. Quello che si
vede nel menu è cortesia verso l'utente; il controllo vero sono le policy RLS di
PostgreSQL, che valgono anche per una chiamata REST fatta a mano con il token in
mano.

| Ruolo | Cosa può fare |
|---|---|
| **Titolare** | tutto |
| **Capofficina / accettatore** | clienti, veicoli, preventivi, schede, magazzino, fornitori, personale. Niente spese, niente report economici, niente impostazioni |
| **Meccanico** | le proprie schede assegnate (avanzamento, ore, ricambi), i propri turni e le proprie presenze. Nessun dato economico, dei colleghi solo nome e reparto |

### I cinque requisiti non negoziabili, e dove sono implementati

1. **Il ruolo non è modificabile dall'utente.** Il trigger
   `profiles_blocca_cambio_ruolo` (02-auth.sql) rifiuta qualunque variazione
   della colonna `ruolo` che non provenga dal titolare della stessa officina.
   L'unica via consentita al client è la funzione `cambia_ruolo()`, che
   ricontrolla il chiamante.
2. **I profili non si creano dal client.** Non esiste alcuna policy di `insert`
   su `profiles`: qualunque tentativo diretto viene respinto. Restano due sole
   strade, entrambe `SECURITY DEFINER`: `fonda_officina()` e
   `riscatta_invito()`.
3. **`riscatta_invito()` è atomica.** Il `select … for update` sulla riga
   dell'invito serializza due riscatti simultanei: il secondo trova
   `usato = true` e viene respinto. Un invito vale una volta sola, anche se il
   codice gira in una chat di gruppo. È anche nominale: se l'invito porta un
   indirizzo email, deve essere quello.
4. **Senza profilo non si legge nulla.** Ogni policy confronta `officina_id` con
   `officina_corrente()`, che restituisce `NULL` a chi non ha un profilo attivo:
   nessuna condizione è soddisfatta, nessuna riga esce. Vale per `anon` e per
   `authenticated`, gli unici due ruoli che il browser può assumere. La RLS è
   attivata con `ENABLE` e non con `FORCE`, perché `FORCE` si applicherebbe
   anche al proprietario delle tabelle — cioè al ruolo con cui girano le
   funzioni che creano i profili, che a quel punto non riuscirebbero più a
   scrivere e nessuno potrebbe registrarsi.
5. **L'ultimo titolare non può essere rimosso.** Né cambiandogli ruolo, né
   disattivandolo, né cancellandolo: tre controlli distinti fra
   `blocca_cambio_ruolo` e `protegge_ultimo_titolare`. Un'officina senza
   titolare è un'officina che nessuno può più amministrare.

In più, `06-multi-officina.sql` chiude le due strade che restano: `officina_id`
ha un `DEFAULT` che lo prende da `officina_corrente()`, e un trigger generico
verifica che ogni riferimento (il `customer_id` di un veicolo, l'`article_id` di
un movimento…) punti dentro la stessa officina.

### Una scelta dichiarata: il capofficina e le fatture

Il capofficina deve poter **emettere** una fattura — la crea chiudendo una
scheda — ma non deve vedere il fatturato complessivo. Le due cose sono in
tensione: un documento che non puoi rileggere non è utilizzabile.

La soluzione adottata: `insert` libero, `select` limitato agli ultimi sette
giorni. Quanto basta per lavorare, non abbastanza per ricostruire il fatturato
di un periodo. Il modulo Fatturazione resta comunque fuori dal suo menu.

---

## Archivio file

Due bucket, regole diverse:

- **`loghi`** — pubblico in lettura, URL stabile. Il logo compare nelle stampe,
  non ha senso firmarlo ogni volta. In scrittura solo il titolare.
- **`documenti`** — privato. Fatture, DDT, foto dei danni e dei pezzi
  sostituiti. Si legge solo con **link firmato valido un'ora**.

Il percorso è parte del modello di sicurezza:

```
<officina_id>/<cartella>/<timestamp>-<random>-<nome file>
```

Il primo segmento è l'officina, e ogni policy di storage lo confronta con
l'officina di chi sta chiedendo.

**Nel database finisce solo il percorso, mai il file.**

Le immagini vengono ridimensionate nel browser prima di partire
([`utils/image.js`](src/utils/image.js)): lato lungo a 1600 px, ricompressione
in WebP con fallback JPEG. Una foto scattata col telefono in officina passa da
sei megabyte a poche centinaia di kilobyte, e la scheda resta leggera anche
sulla rete dati del piazzale.

---

## Pubblicazione

Build statica in `dist/`. `netlify.toml`, `public/_redirects` e
`public/_headers` sono già configurati:

- rewrite di ogni percorso su `index.html` (l'applicazione è una SPA);
- `Cache-Control: immutable` per un anno su `/assets/*` e `/fonts/*` (hanno
  l'hash nel nome), `must-revalidate` su `index.html`;
- header di sicurezza: `X-Frame-Options: DENY`, `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS;
- **Content-Security-Policy** con `*.supabase.co` come unica origine esterna:

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https://*.supabase.co;
font-src 'self';
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'
```

`'unsafe-inline'` resta su `style-src` perché React scrive stili inline sugli
elementi (le barre di avanzamento, i colori delle serie nei grafici). Su
`script-src` non c'è, ed è quello che conta.

Su Netlify basta collegare il repository. Altrove: `npm run build` e servi
`dist/` con le stesse regole di rewrite e gli stessi header.

---

## Qualità

`npm run check` esegue lint, test e build e deve passare **senza errori né
warning**. Al momento della consegna passa: 47 test, zero segnalazioni ESLint,
build senza avvisi.

Verificato a mano nel browser: dodici moduli visitati in sequenza senza un
errore in console, nessun colore saturo in pagina in entrambi i temi, barra in
basso presente sotto i 1024 px e barra laterale sopra.

---

## Interfaccia

**Monocromatica, tranne dove il colore porta informazione.** Pannelli,
pulsanti, tabelle e navigazione sono in bianco, nero e grigi: la gerarchia si
costruisce con il contrasto, il peso del carattere e la profondità delle
superfici. L'accento non è un colore ma l'inversione — bianco su nero nel tema
scuro, nero su bianco nel chiaro.

Il colore compare in tre soli posti, perché in quei tre posti il grigio non
basta:

- **il segno di un importo** — verde e rosso, con il `+`/`−` sempre presente
  accanto, così chi non li distingue non perde niente;
- **gli stati che chiedono un intervento** — una fattura insoluta, un ricambio
  sotto scorta, una revisione scaduta. È l'unica cosa che si legge
  attraversando l'officina con il tablet in mano;
- **le serie dei grafici**, dove sei livelli di grigio sono illeggibili.

Verde e rosso non entrano mai nella scala dei grafici: significano già "meglio"
e "peggio", e una serie rossa verrebbe letta come un problema.

**Vetro.** Card, modali, barra laterale, intestazione e barra in basso sono
lastre semitrasparenti con `backdrop-filter`, sopra un fondo che ha due aloni
morbidi e una grana finissima — senza qualcosa da sfocare, il vetro è solo un
rettangolo grigio. Dove `backdrop-filter` non esiste, un `@supports` rende le
superfici opache e tutto resta leggibile.

**Barra in basso da telefono e tablet.** Sotto i 1024 px la barra laterale
sparisce e compare una navigazione in basso, dove arriva il pollice di chi tiene
il dispositivo con una mano e una chiave inglese con l'altra. Quattro voci
(Oggi, Schede, Clienti, Ricambi) più *Altro*, che apre un foglio dal basso con i
moduli restanti, il tema e il cambio utente.

Non è appoggiata al bordo: **galleggia** staccata di dodici pixel, in vetro
liquido. Tre strati sovrapposti le danno spessore — il fondo semitrasparente con
sfocatura a 30 px e saturazione al 190% che raccoglie il colore di ciò che scorre
sotto; un filo di luce sul bordo superiore e uno d'ombra all'interno in basso; un
riflesso speculare in diagonale che si spegne a metà lastra. La voce attiva è
sotto una **lente** più chiara che scivola da una posizione all'altra con una
curva appena elastica, mentre l'icona si solleva di tre pixel e cresce del 18%.
Rispetta `env(safe-area-inset-bottom)`.

### Mobile: cosa cambia sotto i 1024 px

Da `lg` in su l'interfaccia è quella descritta sopra, invariata. Sotto:

- **le tabelle diventano card impilate.** Una tabella con dieci colonne su uno
  schermo da 375 px è una tabella che si legge trascinando: al suo posto ogni
  riga è una card con l'identificativo in grande, il dato più importante in alto
  a destra e il resto come coppie etichetta/valore. Le colonne già marcate
  `nascondiSuMobile` restano fuori, e con loro le colonne di azioni — dentro una
  card un pulsantino di cestino non ha senso, la card si apre e basta. In cima
  c'è un selettore **Ordina per** con le colonne ordinabili, perché l'intestazione
  cliccabile non c'è più. Le card si caricano trenta per volta;
- **i campi sono alti 48 px e il testo è 16 px.** La misura del testo non è un
  gusto: sotto i 16 px iOS ingrandisce la pagina appena il campo prende il fuoco,
  e l'utente si ritrova il modulo sformato con lo zoom da annullare a mano;
- **il piede delle modali impila i pulsanti a tutta larghezza**, in ordine
  inverso, così l'azione principale finisce in cima dove arriva il pollice;
- **i filtri scorrono a filo schermo** come un nastro, senza barra di
  scorrimento e con l'aggancio sulle pillole, che sono alte 40 px invece di 36;
- **le modali usano `dvh` e non `vh`**, perché su mobile la barra del browser
  compare e sparisce mentre si scorre e con `vh` il foglio finisce sotto.

**Gli overlay stanno fuori dall'albero.** Modali, fogli e notifiche vengono
montati in fondo a `document.body` con un portale, non dove sono scritti nel
JSX. Non è un vezzo: `position: fixed` smette di riferirsi al viewport se un
antenato ha un `transform`, un `filter`, un `backdrop-filter` o un
`will-change` — quell'antenato diventa il suo contenitore. In un'interfaccia
dove ogni card di vetro ha un `backdrop-filter` e ogni modulo entra con una
piccola traslazione, succede continuamente: senza portale, il modulo "Nuovo
cliente" finiva a settemila pixel dalla cima della pagina invece che davanti
agli occhi. Fuori dall'albero il problema non si pone, oggi né domani.

Nella stessa logica, il blocco dello scorrimento va su `html` e non su `body`:
da quando lo scorrimento sta sulla pagina, l'elemento che scorre è
`document.documentElement`, e bloccare il body non fermava più niente.

**Movimento.** Una curva sola per tutto (`cubic-bezier(.22,1,.36,1)`), mai
rimbalzante:

- i **KPI contano** dal valore precedente a quello nuovo con interpolazione
  cubica in uscita — cambiando mese, la differenza si vede prima di leggerla;
- le **righe di tabella** entrano scalate di 26 ms l'una dall'altra, con il
  ritardo calcolato da una variabile CSS invece che da venti classi;
- le **modali** sono fogli che salgono dal basso sul telefono (con la maniglia)
  e pannelli che si aprono in scala sul desktop: stesso componente, due gesti;
- gli **indicatori** di filtri, linguette e navigazione scivolano fra le
  posizioni misurando gli elementi reali — tutti dallo stesso hook
  `useIndicatore`, con una regola non negoziabile: l'elemento che scivola va
  **ancorato** con `left-0` o `top-0`. Senza ancora cade sulla sua posizione
  statica, cioè dopo il padding del contenitore, e resta spostato esattamente
  di quel padding: un difetto invisibile dove il padding è zero e vistoso dove
  non lo è. L'hook rimisura dopo ogni render, a ogni cambio di dimensione e
  quando i font finiscono di caricarsi;
- le **icone del tema** ruotano l'una nell'altra invece di sostituirsi;
- il **caricamento** è uno scheletro che luccica, non uno spinner.

Tutto si spegne con `prefers-reduced-motion: reduce`, compreso lo schiacciamento
al tocco.

**Grafici** ([`utils/chartColors.js`](src/utils/chartColors.js)). La scala
categorica deriva da Okabe-Ito, pensata per restare distinguibile con
protanopia, deuteranopia e tritanopia, verificata a contrasto ≥ 3:1 sul fondo
della card del proprio tema. Alla tinta si affianca sempre una seconda chiave:
un tratteggio diverso per ogni linea, e un filo del colore della card fra le
fette delle torte. Sono le due cose che tengono in piedi un grafico anche
stampato in bianco e nero.

**Veicoli con la foto.** Il parco si apre in griglia: immagine grande, sotto
targa, chilometri, modello e proprietario; un tocco apre la scheda completa.
Chi preferisce l'elenco ha l'interruttore in alto a destra. La foto vera si
scatta o si carica dalla scheda del veicolo — ridotta nel browser prima di
partire, salvata nel bucket privato, con il solo percorso nel database.

Finché la foto non c'è, la card mostra **un'illustrazione generata**
([`utils/vehicleImage.js`](src/utils/vehicleImage.js)): sagoma di profilo —
diversa fra vettura e furgone — con la tinta presa dal colore registrato sul
veicolo, disegnata come SVG e passata come data URI. Nessuna richiesta di rete,
il che è obbligatorio (la CSP ammette solo `*.supabase.co`) oltre che più
veloce. Non finge di essere una fotografia: serve a rendere il parco
riconoscibile a colpo d'occhio.

**Tocco.** Aree da almeno 44 px, tabelle che scorrono in orizzontale senza
trascinarsi dietro la pagina, ricerca sempre in cima al modulo, feedback tattile
immediato sui pulsanti.

### Lo stato dice dov'è la scheda, l'azione dice cosa fare

Sono due cose diverse, e confonderle è il modo più rapido per rendere un
gestionale inutilizzabile da chi non l'ha progettato. "In lavorazione" è
un'informazione sul sistema; "Ho finito" è un'informazione su cosa ci si
aspetta da chi guarda.

[`components/flusso.jsx`](src/components/flusso.jsx) tiene in un posto solo il
ciclo di vita della scheda e la sua traduzione in azioni con il verbo
all'imperativo:

| Stato | Cosa vede il meccanico |
|---|---|
| Accettata | **Inizia il lavoro** |
| In lavorazione | **Ho finito** · Manca un pezzo |
| Attesa ricambi | **Il pezzo è arrivato** |
| Pronta | **Consegnata al cliente** |
| Consegnata | *(al titolare)* **Chiudi e fattura** |

La stessa traduzione la usano la dashboard, l'elenco schede e il dettaglio: se
il flusso cambia, cambia in un file solo. Ogni scheda mostra anche il
**percorso** — cinque tacche che dicono a che punto siamo e cosa viene dopo,
senza bisogno di conoscere il gestionale.

**La giornata del meccanico** non è una dashboard di numeri, è un elenco di
cose da fare. In cima c'è la scheda su cui sta lavorando adesso, grande, con il
pulsante dell'azione successiva; sotto, in ordine di urgenza (prima le ferme,
poi quelle che aspettano il cliente), le altre. Le ore e la resa stanno in
fondo: servono a fine mese, non alle otto del mattino. Se non sta lavorando su
niente, la pagina glielo dice e gli indica cosa fare.

Le schede si presentano come **card** — targa grande e monospaziata, difetto
per esteso, azione in fondo — e lo stato si fa avanzare senza aprire niente.
Il meccanico apre su questa vista, chi sta in ufficio sull'elenco; entrambi
possono passare all'altra con l'interruttore in alto.

I moduli, per lui, si chiamano come le cose che ci trova dentro: **La mia
giornata**, **I miei lavori**, **Le mie ore**.

---

## Scelte fatte, e perché

**1. Date ISO all'interno, gg/mm/aaaa a schermo.**
Dentro l'applicazione le date sono stringhe `aaaa-mm-gg`: ordinabili con un
confronto fra stringhe, confrontabili senza fusi orari, senza sorprese fra
`Date` del browser e `timestamp` del database. La conversione avviene solo al
momento di mostrarle.

**2. Manodopera a ore reali, tariffa configurabile per tipo di lavorazione.**
Le tariffe si impostano in Impostazioni → Tariffe (meccanica, diagnosi, clima,
gommista, carrozzeria) e ogni riga di manodopera ne sceglie una. Non c'è un
tempario acquistato: i tempi standard di riparazione sono dati sotto licenza, e
restano un'estensione. Le righe portano con sé la tariffa applicata al momento,
quindi cambiarla non riscrive i documenti già emessi.

**3. Ricambi a prezzo medio ponderato, non FIFO.**
Il FIFO richiede di tenere traccia dei lotti e di quale lotto è uscito su quale
scheda. Per un'officina che compra dallo stesso ricambista con variazioni di
prezzo del pochi punti percentuali, il medio ponderato dà lo stesso margine con
un decimo della complessità. Il prezzo medio è tenuto a quattro decimali, perché
sulla minuteria da 0,15 € due decimali si mangiano il margine
nell'arrotondamento.

**4. Oneri contributivi come percentuale configurabile, default 32%.**
È una stima gestionale, non un cedolino. Serve a sapere quanto costa davvero
un'ora di meccanico quando si guarda il margine di una scheda. Gli straordinari
sono maggiorati del 15% sulla paga, prima degli oneri.

**5. Fatturazione interna con numerazione progressiva; nessun tracciato XML.**
Il numero è calcolato dai documenti esistenti, non da un contatore separato: un
contatore che si disallinea produce numeri doppi, e un numero doppio in fattura
è un problema serio. Il vincolo `unique (officina_id, anno, progressivo)` lo
garantisce anche a livello di database. Le fatture non si cancellano, si
annullano: il numero resta occupato. **L'invio allo SDI non è implementato** e il
tracciato XML non viene generato: è la cosa che più di ogni altra richiede di
essere fatta bene o per niente.

**6. Spese ricorrenti come template + generazione mensile idempotente.**
Le ricorrenti non sono righe di spesa: sono modelli. Ogni mese generano la spesa
vera una volta sola. La chiave è la coppia (template, mese), garantita da un
indice unico su `(recurring_id, date_trunc('month', data))`: la generazione si
può lanciare tutte le volte che si vuole senza duplicare nulla, ed è esattamente
quello che l'applicazione fa aprendo il modulo Spese.

**7. Domenica chiusa nei dati demo.**
Nessuna presenza, nessuna lavorazione, nessuna scheda aperta. Nel calendario dei
turni la colonna resta a sfondo pieno e senza pulsante di inserimento.

---

## Estensioni possibili (non implementate)

- **Fatturazione elettronica SDI** — generazione del tracciato XML, firma,
  invio e gestione delle ricevute.
- **Tempari ufficiali e cataloghi ricambi** (TecDoc e simili) — tempi standard
  di riparazione e applicabilità dei pezzi per motorizzazione.
- **Lettura targa e VIN da foto** in accettazione.
- **Promemoria scadenze via SMS o WhatsApp** al cliente (revisione, tagliando,
  cambio gomme stagionale).
- **App per il meccanico** con timbratura direttamente sulla scheda.
- **Portale cliente** per approvare i preventivi da remoto.
- **Multi-sede** — l'isolamento per officina c'è già; mancano il passaggio di
  contesto fra sedi e i report consolidati.
- **Integrazione con banche dati diagnostiche** per collegare i codici errore
  letti in centralina alla diagnosi della scheda.

---

## Licenza dei font

Inter è di Rasmus Andersson, distribuito con **SIL Open Font License 1.1**.
Vedi [`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt). I file `.woff2` non
sono nel controllo di versione: si scaricano con `npm run fonts`.
