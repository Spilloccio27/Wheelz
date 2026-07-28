/**
 * Ridimensionamento delle immagini lato client.
 *
 * Le foto scattate col telefono in officina arrivano da 4-8 MB l'una: caricarle
 * così com'è riempirebbe lo storage e renderebbe lente le schede. Qui vengono
 * riportate a un lato massimo ragionevole e ricompresse in WebP (con fallback
 * JPEG dove non è supportato) prima di lasciare il browser.
 */

const MIME_FALLBACK = 'image/jpeg'

/** Il browser sa produrre WebP da canvas? */
function supportaWebp() {
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    return c.toDataURL('image/webp').startsWith('data:image/webp')
  } catch {
    return false
  }
}

function caricaImmagine(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Immagine non leggibile'))
    }
    img.src = url
  })
}

/**
 * Ridimensiona mantenendo le proporzioni e restituisce un Blob pronto al
 * caricamento. `latoMax` è il lato lungo: 1600 px basta per leggere un codice
 * stampigliato su un pezzo, 320 px per un logo.
 */
export async function ridimensiona(
  file,
  { latoMax = 1600, qualita = 0.82, mime, sfondo } = {},
) {
  if (!file || !file.type?.startsWith('image/')) {
    throw new Error('Il file non è un’immagine')
  }
  // Gli SVG (loghi vettoriali) non vanno rasterizzati: passano intatti.
  if (file.type === 'image/svg+xml') return { blob: file, larghezza: null, altezza: null }

  const img = await caricaImmagine(file)
  const scala = Math.min(1, latoMax / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scala))
  const h = Math.max(1, Math.round(img.height * scala))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  if (sfondo) {
    ctx.fillStyle = sfondo
    ctx.fillRect(0, 0, w, h)
  }
  ctx.drawImage(img, 0, 0, w, h)

  const tipo = mime || (supportaWebp() ? 'image/webp' : MIME_FALLBACK)
  const blob = await new Promise((res) => canvas.toBlob((b) => res(b), tipo, qualita))
  if (!blob) throw new Error('Conversione dell’immagine non riuscita')
  return { blob, larghezza: w, altezza: h, mime: tipo }
}

/** Anteprima quadrata (avatar, miniature di galleria). */
export async function miniatura(file, lato = 240, qualita = 0.8) {
  const img = await caricaImmagine(file)
  const canvas = document.createElement('canvas')
  canvas.width = lato
  canvas.height = lato
  const ctx = canvas.getContext('2d')
  const min = Math.min(img.width, img.height)
  ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, lato, lato)
  const tipo = supportaWebp() ? 'image/webp' : MIME_FALLBACK
  return new Promise((res) => canvas.toBlob((b) => res(b), tipo, qualita))
}

/** Blob → data URL, per l'anteprima immediata e per la modalità demo. */
export function aDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error('Lettura del file non riuscita'))
    fr.readAsDataURL(blob)
  })
}

/** Estensione coerente col mime prodotto, per il nome del file su storage. */
export function estensione(mime) {
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/svg+xml') return 'svg'
  return 'jpg'
}
