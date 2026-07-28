/**
 * Interazioni del sito vetrina, uguali su tutte le pagine.
 *
 * Quattro cose: l'interruttore del tema, il menu da telefono, la comparsa
 * degli elementi allo scorrimento e l'ingranditore delle schermate.
 * Nessuna dipendenza, nessuna richiesta di rete.
 */
;(function () {
  'use strict'

  var radice = document.documentElement
  var CHIAVE = 'mechflow-vetrina-tema'
  var motoRidotto =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /* ------------------------------- tema -------------------------------- */

  var bottoneTema = document.getElementById('tema')
  var metaColore = document.querySelector('meta[name="theme-color"]')

  function aggiornaColoreBarra() {
    if (metaColore) {
      metaColore.setAttribute('content', radice.classList.contains('dark') ? '#08080a' : '#ececed')
    }
  }

  aggiornaColoreBarra()

  if (bottoneTema) {
    bottoneTema.addEventListener('click', function () {
      var scuro = radice.classList.toggle('dark')
      aggiornaColoreBarra()
      try {
        localStorage.setItem(CHIAVE, scuro ? 'scuro' : 'chiaro')
      } catch (e) {
        /* niente archiviazione: il tema vale per questa visita. */
      }
    })
  }

  /* ---------------------------- menu mobile ---------------------------- */

  var bottoneMenu = document.getElementById('menu')
  var nav = document.getElementById('nav')

  function chiudiMenu() {
    if (!nav || !bottoneMenu) return
    nav.classList.remove('aperto')
    bottoneMenu.setAttribute('aria-expanded', 'false')
  }

  if (bottoneMenu && nav) {
    bottoneMenu.addEventListener('click', function () {
      var aperto = nav.classList.toggle('aperto')
      bottoneMenu.setAttribute('aria-expanded', String(aperto))
    })

    nav.addEventListener('click', function (evento) {
      if (evento.target.tagName === 'A') chiudiMenu()
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

  /* ------------------------- numeri che salgono ------------------------ */

  var contatori = Array.prototype.slice.call(document.querySelectorAll('[data-conta]'))

  function conta(elemento) {
    var arrivo = Number(elemento.getAttribute('data-conta'))
    if (!isFinite(arrivo) || motoRidotto || arrivo === 0) {
      elemento.textContent = String(arrivo)
      return
    }

    var durata = 900
    var inizio = null

    function passo(ora) {
      if (inizio === null) inizio = ora
      var quota = Math.min((ora - inizio) / durata, 1)
      var morbida = 1 - Math.pow(1 - quota, 3)
      elemento.textContent = String(Math.round(arrivo * morbida))
      if (quota < 1) requestAnimationFrame(passo)
    }

    requestAnimationFrame(passo)
  }

  if ('IntersectionObserver' in window && contatori.length) {
    var occhio = new IntersectionObserver(
      function (voci) {
        voci.forEach(function (voce) {
          if (!voce.isIntersecting) return
          conta(voce.target)
          occhio.unobserve(voce.target)
        })
      },
      { threshold: 0.5 }
    )
    contatori.forEach(function (elemento) {
      occhio.observe(elemento)
    })
  }

  /* ------------------------- ingranditore ------------------------------ *
   * Le schermate sono larghe 1440 px: dentro la pagina stanno in mezza
   * colonna e i numeri non si leggono. Un clic le apre a piena finestra.
   * Senza <dialog> non succede niente e l'immagine resta quella inline.
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
      immagine.title = 'Clic per ingrandire'

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
