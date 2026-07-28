/**
 * Interazioni del sito vetrina.
 *
 * Quattro cose e basta: l'interruttore del tema, il menu da telefono, la
 * comparsa degli elementi allo scorrimento e i numeri della fascia che
 * salgono. Nessuna dipendenza, nessuna richiesta di rete.
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
    if (metaColore) metaColore.setAttribute('content', radice.classList.contains('dark') ? '#08080a' : '#ececed')
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

    document.addEventListener('keydown', function (evento) {
      if (evento.key === 'Escape') chiudiMenu()
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
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
    )

    /* Un ritardo progressivo fra fratelli: le griglie compaiono a cascata,
       non tutte insieme come una tenda che si alza. */
    daRivelare.forEach(function (elemento) {
      var fratelli = elemento.parentElement ? Array.prototype.slice.call(elemento.parentElement.children) : []
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

  /* --------------------- voce di menu corrispondente ------------------- */

  var sezioni = Array.prototype.slice.call(
    document.querySelectorAll('main section[id]')
  )
  var voci = Array.prototype.slice.call(document.querySelectorAll('.testata__nav a'))

  if ('IntersectionObserver' in window && sezioni.length && voci.length) {
    var corrente = new IntersectionObserver(
      function (righe) {
        righe.forEach(function (riga) {
          if (!riga.isIntersecting) return
          var id = riga.target.id
          voci.forEach(function (voce) {
            voce.classList.toggle('corrente', voce.getAttribute('href') === '#' + id)
          })
        })
      },
      { rootMargin: '-45% 0px -50% 0px' }
    )
    sezioni.forEach(function (sezione) {
      corrente.observe(sezione)
    })
  }
})()
