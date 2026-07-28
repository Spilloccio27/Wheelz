/**
 * Tema, prima che la pagina sia disegnata.
 *
 * Questo file è caricato in modo bloccante nel <head>: è l'unico modo di
 * applicare il tema salvato senza far lampeggiare il fondo chiaro su un
 * utente che ha scelto lo scuro (o viceversa). È volutamente minuscolo.
 *
 * La classe `js` serve al foglio di stile per sapere che può nascondere gli
 * elementi in attesa della comparsa: senza JavaScript nessuno li rimetterebbe
 * più a posto, e resterebbero invisibili per sempre.
 */
(function () {
  var radice = document.documentElement
  radice.classList.add('js')

  var salvato = null
  try {
    salvato = localStorage.getItem('mechflow-vetrina-tema')
  } catch (e) {
    /* archiviazione negata (navigazione privata, cookie bloccati): pazienza. */
  }

  var scuro = salvato
    ? salvato === 'scuro'
    : !window.matchMedia || !window.matchMedia('(prefers-color-scheme: light)').matches

  radice.classList.toggle('dark', scuro)
})()
