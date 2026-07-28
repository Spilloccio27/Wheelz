/**
 * Interazioni del sito vetrina, uguali su tutte le pagine.
 *
 * L'interruttore del tema, il foglio «Altro» della barra in basso, la
 * comparsa degli elementi allo scorrimento e l'ingranditore delle
 * schermate. Nessuna dipendenza, nessuna richiesta di rete.
 */
;(function () {
  'use strict'

  var radice = document.documentElement
  var CHIAVE = 'mechflow-vetrina-tema'
  var motoRidotto =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ------------------------------- tema -------------------------------- */

  var metaColore = document.querySelector('meta[name="theme-color"]')

  function aggiornaColoreBarra() {
    if (metaColore) {
      metaColore.setAttribute('content', radice.classList.contains('dark') ? '#08080a' : '#ececed')
    }
  }

  function cambiaTema() {
    var scuro = radice.classList.toggle('dark')
    aggiornaColoreBarra()
    try {
      localStorage.setItem(CHIAVE, scuro ? 'scuro' : 'chiaro')
    } catch (e) {
      /* niente archiviazione: il tema vale per questa visita. */
    }
  }

  aggiornaColoreBarra()

  Array.prototype.slice.call(document.querySelectorAll('[data-tema]')).forEach(function (bottone) {
    bottone.addEventListener('click', cambiaTema)
  })

  /* ------------------- foglio «Altro» da telefono ---------------------- */

  var foglio = document.getElementById('foglio')
  var apriFoglio = document.getElementById('altro')

  function chiudiFoglio() {
    if (!foglio) return
    foglio.hidden = true
    document.body.style.overflow = ''
    if (apriFoglio) {
      apriFoglio.setAttribute('aria-expanded', 'false')
      apriFoglio.focus()
    }
  }

  if (foglio && apriFoglio) {
    apriFoglio.addEventListener('click', function () {
      foglio.hidden = false
      document.body.style.overflow = 'hidden'
      apriFoglio.setAttribute('aria-expanded', 'true')
      var prima = foglio.querySelector('a, button')
      if (prima) prima.focus()
    })

    foglio.addEventListener('click', function (evento) {
      /* il velo e le voci chiudono; il resto del foglio no */
      if (evento.target.closest('.foglio__velo, .foglio__voci a')) chiudiFoglio()
    })

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape' && !foglio.hidden) chiudiFoglio()
    })
  }

  /* ------------------- intestazione: appoggiata o no ------------------- */

  var testata = document.getElementById('testata')

  function scorrimento() {
    if (testata) testata.classList.toggle('attaccata', window.scrollY > 8)
  }

  scorrimento()
  window.addEventListener('scroll', scorrimento, { passive: true })

  /* --------------------- comparsa degli elementi ----------------------- */

  var daRivelare = Array.prototype.slice.call(document.querySelectorAll('.rivela'))

  if (!('IntersectionObserver' in window) || motoRidotto) {
    daRivelare.forEach(function (elemento) {
      elemento.classList.add('visibile')
    })
  } else {
    var osservatore = new IntersectionObserver(
      function (voci) {
        voci.forEach(function (voce) {
          if (!voce.isIntersecting) return
          voce.target.classList.add('visibile')
          osservatore.unobserve(voce.target)
        })
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
    )

    /* Un ritardo progressivo fra fratelli: le griglie compaiono a cascata,
       non tutte insieme come una tenda che si alza. */
    daRivelare.forEach(function (elemento) {
      var fratelli = elemento.parentElement
        ? Array.prototype.slice.call(elemento.parentElement.children)
        : []
      var posizione = fratelli.indexOf(elemento)
      if (posizione > 0) elemento.style.transitionDelay = Math.min(posizione, 8) * 55 + 'ms'
      osservatore.observe(elemento)
    })
  }

  /* ------------------------- ingranditore ------------------------------ *
   * Le schermate sono larghe 1440 px: dentro la colonna i numeri non si
   * leggono. Un clic le apre a piena finestra. Senza <dialog> non succede
   * niente e l'immagine resta quella inline.
   * -------------------------------------------------------------------- */

  var schermate = Array.prototype.slice.call(
    document.querySelectorAll('.cornice img, .telefono img')
  )

  if (schermate.length && typeof HTMLDialogElement === 'function') {
    var lente = document.createElement('dialog')
    lente.className = 'lente'
    var grande = document.createElement('img')
    var didascalia = document.createElement('p')
    lente.appendChild(grande)
    lente.appendChild(didascalia)
    document.body.appendChild(lente)

    schermate.forEach(function (immagine) {
      immagine.setAttribute('role', 'button')
      immagine.setAttribute('tabindex', '0')
      immagine.title = 'Tocca per ingrandire'

      function apri() {
        grande.src = immagine.currentSrc || immagine.src
        grande.alt = immagine.alt
        var figura = immagine.closest('figure')
        var testo = figura ? figura.querySelector('figcaption') : null
        didascalia.textContent = testo ? testo.textContent : immagine.alt
        lente.showModal()
      }

      immagine.addEventListener('click', apri)
      immagine.addEventListener('keydown', function (evento) {
        if (evento.key === 'Enter' || evento.key === ' ') {
          evento.preventDefault()
          apri()
        }
      })
    })

    lente.addEventListener('click', function () {
      lente.close()
    })
  }
})()
