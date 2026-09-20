import { PDFDocument, PDFName, PDFRawStream, StandardFonts, degrees, rgb } from 'pdf-lib'
import { loadPdfDocument, extractPageTextItems } from './pdfRender'

const LEVEL_SETTINGS = {
  high: { quality: 0.35, maxDimension: 1000 },
  recommended: { quality: 0.6, maxDimension: 1600 },
  low: { quality: 0.85, maxDimension: 2200 },
}

function isJpegFilter(filter) {
  if (!filter) return false
  const dctDecode = PDFName.of('DCTDecode')
  return Array.isArray(filter) ? filter.includes(dctDecode) : filter === dctDecode
}

function isFlateFilter(filter) {
  if (!filter) return false
  const flateDecode = PDFName.of('FlateDecode')
  return Array.isArray(filter) ? filter.includes(flateDecode) : filter === flateDecode
}

async function decodeJpeg(bytes) {
  const blob = new Blob([bytes], { type: 'image/jpeg' })
  return createImageBitmap(blob)
}

/** Inflate zlib (format utilisé par /FlateDecode) via l'API native du
 * navigateur — aucune dépendance nécessaire. */
async function inflateZlib(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))
  const buffer = await new Response(stream).arrayBuffer()
  return new Uint8Array(buffer)
}

function paethPredictor(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Annule le filtrage par ligne façon PNG (Predictor 10-15) appliqué avant
 * la compression Flate par de nombreux générateurs de PDF — algorithme
 * standard (Sub/Up/Average/Paeth), identique à celui du format PNG. */
function unfilterPngScanlines(data, width, height, colors) {
  const bytesPerPixel = colors
  const rowBytes = width * colors
  const out = new Uint8Array(rowBytes * height)
  let pos = 0
  let prevRow = new Uint8Array(rowBytes)

  for (let y = 0; y < height; y++) {
    const filterType = data[pos]
    pos += 1
    const row = data.subarray(pos, pos + rowBytes)
    pos += rowBytes
    const outRow = out.subarray(y * rowBytes, y * rowBytes + rowBytes)

    for (let i = 0; i < rowBytes; i++) {
      const a = i >= bytesPerPixel ? outRow[i - bytesPerPixel] : 0
      const b = prevRow[i]
      const c = i >= bytesPerPixel ? prevRow[i - bytesPerPixel] : 0
      const raw = row[i]
      let value
      switch (filterType) {
        case 0:
          value = raw
          break
        case 1:
          value = raw + a
          break
        case 2:
          value = raw + b
          break
        case 3:
          value = raw + Math.floor((a + b) / 2)
          break
        case 4:
          value = raw + paethPredictor(a, b, c)
          break
        default:
          value = raw
      }
      outRow[i] = value & 0xff
    }
    prevRow = outRow
  }
  return out
}

/**
 * Décode une image XObject brute (/FlateDecode) en canvas, pour les cas les
 * plus courants uniquement : DeviceRGB ou DeviceGray, 8 bits par
 * composante, sans prédicteur ou avec prédicteur PNG (10-15 — le plus
 * répandu chez les générateurs de PDF). Tout le reste (CMJN, palette
 * indexée, ICCBased, prédicteur TIFF, profondeur non standard...) renvoie
 * `null` plutôt que de risquer une image aux couleurs corrompues : mieux
 * vaut laisser l'image intacte que la décoder à moitié.
 */
async function decodeFlateRasterImage(stream) {
  const dict = stream.dict
  const width = dict.lookup(PDFName.of('Width'))?.asNumber?.()
  const height = dict.lookup(PDFName.of('Height'))?.asNumber?.()
  const bpc = dict.lookup(PDFName.of('BitsPerComponent'))?.asNumber?.() ?? 8
  if (!width || !height || bpc !== 8) return null

  const colorSpace = dict.lookup(PDFName.of('ColorSpace'))
  let colors
  if (colorSpace === PDFName.of('DeviceRGB')) colors = 3
  else if (colorSpace === PDFName.of('DeviceGray')) colors = 1
  else return null

  const decodeParms = dict.lookup(PDFName.of('DecodeParms')) ?? dict.lookup(PDFName.of('DP'))
  const predictor = decodeParms?.lookup?.(PDFName.of('Predictor'))?.asNumber?.() ?? 1
  if (predictor !== 1 && predictor < 10) return null // prédicteur TIFF (2) non pris en charge

  let inflated
  try {
    inflated = await inflateZlib(stream.contents)
  } catch {
    return null
  }

  const pixels = predictor >= 10 ? unfilterPngScanlines(inflated, width, height, colors) : inflated
  if (pixels.length < width * height * colors) return null

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  const imageData = ctx.createImageData(width, height)

  for (let i = 0, p = 0; i < width * height; i++) {
    if (colors === 3) {
      imageData.data[i * 4] = pixels[p]
      imageData.data[i * 4 + 1] = pixels[p + 1]
      imageData.data[i * 4 + 2] = pixels[p + 2]
      p += 3
    } else {
      const g = pixels[p]
      imageData.data[i * 4] = g
      imageData.data[i * 4 + 1] = g
      imageData.data[i * 4 + 2] = g
      p += 1
    }
    imageData.data[i * 4 + 3] = 255
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

async function reencodeJpeg(bitmap, { quality, maxDimension }) {
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) return null
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Parcourt les pages du document et ré-encode les images JPEG intégrées
 * (sous-échantillonnage + baisse de qualité selon le niveau choisi).
 * Toute image qui ne peut pas être traitée (format exotique, masque,
 * flux non standard...) est simplement laissée telle quelle : cette
 * fonction ne doit jamais faire échouer la compression globale.
 */
async function recompressImages(pdfDoc, settings) {
  for (const page of pdfDoc.getPages()) {
    let xObjects
    try {
      xObjects = page.node.Resources()?.lookup(PDFName.of('XObject'))
    } catch {
      continue
    }
    if (!xObjects) continue

    for (const key of xObjects.keys()) {
      try {
        const stream = xObjects.lookup(key)
        if (!(stream instanceof PDFRawStream)) continue

        const isImage = stream.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')
        if (!isImage) continue

        const filter = stream.dict.lookup(PDFName.of('Filter'))
        let bitmap = null
        if (isJpegFilter(filter)) {
          bitmap = await decodeJpeg(stream.contents)
        } else if (isFlateFilter(filter)) {
          // Cas fréquent : image sans perte (souvent d'origine PNG) intégrée
          // en flux brut FlateDecode — le chemin JPEG ci-dessus ne la voit
          // jamais, alors qu'elle est souvent le principal poids d'un PDF
          // "image-lourd". Reste `null` (donc ignorée) pour tout ce que
          // `decodeFlateRasterImage` ne sait pas décoder sans risque.
          bitmap = await decodeFlateRasterImage(stream)
        }
        if (!bitmap) continue

        const newBytes = await reencodeJpeg(bitmap, settings)

        if (newBytes && newBytes.length < stream.contents.length) {
          const embedded = await pdfDoc.embedJpg(newBytes)
          xObjects.set(key, embedded.ref)
        }
      } catch {
        // On ignore cette image précise et on continue avec les suivantes.
      }
    }
  }
}

/**
 * Compresse un PDF : ré-encode ses images JPEG au niveau de qualité demandé
 * puis réécrit le document avec des flux d'objets compressés. Retourne
 * toujours un PDF valide, même si l'optimisation des images échoue.
 */
export async function compressPdf(pdfBuffer, level = 'recommended') {
  const settings = LEVEL_SETTINGS[level] ?? LEVEL_SETTINGS.recommended
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })

  try {
    await recompressImages(pdfDoc, settings)
  } catch {
    // Le document sera tout de même sauvegardé, avec l'optimisation
    // structurelle ci-dessous.
  }

  return pdfDoc.save({ useObjectStreams: true })
}

// Libellés affichés dans l'interface pour chaque champ du dictionnaire
// /Info — évite de dupliquer ces noms entre le moteur et la page d'outil.
export const METADATA_FIELDS = [
  { key: 'title', label: 'Titre' },
  { key: 'author', label: 'Auteur' },
  { key: 'subject', label: 'Sujet' },
  { key: 'keywords', label: 'Mots-clés' },
  { key: 'producer', label: 'Logiciel (Producer)' },
  { key: 'creator', label: 'Application source (Creator)' },
  { key: 'creationDate', label: 'Date de création' },
  { key: 'modificationDate', label: 'Dernière modification' },
]

/** Lit les métadonnées visibles (dictionnaire /Info) d'un PDF. */
export async function readPdfMetadata(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })

  return {
    title: pdfDoc.getTitle() || '',
    author: pdfDoc.getAuthor() || '',
    subject: pdfDoc.getSubject() || '',
    keywords: pdfDoc.getKeywords() || '',
    producer: pdfDoc.getProducer() || '',
    creator: pdfDoc.getCreator() || '',
    creationDate: pdfDoc.getCreationDate() ?? null,
    modificationDate: pdfDoc.getModificationDate() ?? null,
    pageCount: pdfDoc.getPageCount(),
  }
}

/**
 * Remet à zéro tous les champs du dictionnaire d'informations (auteur,
 * dates, logiciel source...) qui peuvent identifier l'auteur ou l'origine
 * du document, puis réécrit le PDF. `updateMetadata: false` au chargement
 * empêche pdf-lib de réinjecter automatiquement son propre Producer/ModDate
 * à la sauvegarde, ce qui viderait notre nettoyage de son sens.
 */
export async function cleanMetadata(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
  const epoch = new Date(0)

  pdfDoc.setTitle('')
  pdfDoc.setAuthor('')
  pdfDoc.setSubject('')
  pdfDoc.setKeywords([])
  pdfDoc.setProducer('')
  pdfDoc.setCreator('')
  pdfDoc.setCreationDate(epoch)
  pdfDoc.setModificationDate(epoch)

  return pdfDoc.save({ useObjectStreams: true })
}

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g
const PHONE_PATTERN = /(\+?\d[\d\s().-]{7,}\d)/g

/** Renvoie les plages [start, end) de `text` à censurer selon les options. */
function findRedactionRanges(text, { redactEmails, redactPhones, keywords }) {
  const ranges = []

  const collect = (pattern) => {
    for (const match of text.matchAll(pattern)) {
      ranges.push({ start: match.index, end: match.index + match[0].length })
    }
  }

  if (redactEmails) collect(new RegExp(EMAIL_PATTERN))
  if (redactPhones) collect(new RegExp(PHONE_PATTERN))

  for (const word of keywords) {
    if (!word) continue
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    collect(new RegExp(escaped, 'gi'))
  }

  // Fusionne les plages qui se chevauchent pour éviter de dessiner deux
  // rectangles superposés sur la même portion de texte.
  ranges.sort((a, b) => a.start - b.start)
  const merged = []
  for (const range of ranges) {
    const last = merged[merged.length - 1]
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end)
    } else {
      merged.push({ ...range })
    }
  }
  return merged
}

/**
 * Censure automatique : repère (via pdf.js) les fragments de texte
 * correspondant aux e-mails / téléphones / mots-clés choisis, puis dessine
 * (via pdf-lib) un rectangle noir opaque par-dessus, à la position exacte
 * du texte sur la page.
 *
 * Important : ceci masque visuellement le texte, ce n'est pas une
 * suppression du contenu sous-jacent (le flux de contenu du PDF garde le
 * texte d'origine). Pour une confidentialité garantie contre une extraction
 * de texte, il faut retirer physiquement le contenu, pas seulement le
 * recouvrir — c'est signalé à l'utilisateur dans l'interface.
 */
export async function redactPdf(pdfBuffer, { redactEmails, redactPhones, keywords = [] }) {
  const pdfjsDoc = await loadPdfDocument(pdfBuffer)
  const pdfLibDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
  const pages = pdfLibDoc.getPages()

  let redactionCount = 0

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    let items
    try {
      items = await extractPageTextItems(pdfjsDoc, pageIndex + 1)
    } catch {
      continue
    }

    const pdfLibPage = pages[pageIndex]

    for (const item of items) {
      const ranges = findRedactionRanges(item.str, { redactEmails, redactPhones, keywords })
      if (ranges.length === 0) continue

      const [, , , , e, f] = item.transform
      const charWidth = item.width / item.str.length

      for (const { start, end } of ranges) {
        const x = e + start * charWidth
        const width = (end - start) * charWidth
        const height = item.height || 10

        pdfLibPage.drawRectangle({
          x,
          y: f - height * 0.25,
          width,
          height: height * 1.3,
          color: rgb(0, 0, 0),
        })
        redactionCount++
      }
    }
  }

  const bytes = await pdfLibDoc.save({ useObjectStreams: true })
  return { bytes, redactionCount }
}

/** Convertit une couleur hex (#rgb ou #rrggbb) en couleur pdf-lib (0-1). */
function hexToRgbColor(hex) {
  const normalized = hex.replace('#', '')
  const full =
    normalized.length === 3
      ? normalized.split('').map((c) => c + c).join('')
      : normalized
  const value = parseInt(full, 16)

  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255)
}

/**
 * Superpose un texte (filigrane) centré, incliné et semi-transparent sur
 * chaque page du PDF.
 */
export async function addWatermark(
  pdfBuffer,
  { text, fontSize = 48, opacity = 0.3, rotation = 45, color = '#808080' },
) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize()
    const textWidth = font.widthOfTextAtSize(text, fontSize)

    page.drawText(text, {
      x: width / 2 - textWidth / 2,
      y: height / 2,
      size: fontSize,
      font,
      color: hexToRgbColor(color),
      opacity,
      rotate: degrees(rotation),
    })
  }

  return pdfDoc.save({ useObjectStreams: true })
}

/**
 * Ajoute une numérotation sur chaque page (en-tête ou pied de page, alignée
 * à gauche/centre/droite), selon un gabarit texte avec {n} et {total}.
 */
export async function addPageNumbers(
  pdfBuffer,
  { position = 'footer', alignment = 'center', format = 'Page {n} sur {total}', fontSize = 10, margin = 24 },
) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const pages = pdfDoc.getPages()
  const total = pages.length

  pages.forEach((page, index) => {
    const { width, height } = page.getSize()
    const text = format.replace('{n}', String(index + 1)).replace('{total}', String(total))
    const textWidth = font.widthOfTextAtSize(text, fontSize)

    let x = margin
    if (alignment === 'right') x = width - margin - textWidth
    else if (alignment === 'center') x = width / 2 - textWidth / 2

    const y = position === 'header' ? height - margin : margin - fontSize * 0.3

    page.drawText(text, { x, y, size: fontSize, font, color: rgb(0.35, 0.35, 0.35) })
  })

  return pdfDoc.save({ useObjectStreams: true })
}

/**
 * Supprime les pages aux index donnés (base 0). On les retire de l'index le
 * plus haut au plus bas : `removePage` décale les index suivants, donc
 * traiter dans cet ordre évite de désynchroniser la liste au fil des
 * suppressions.
 */
export async function removePages(pdfBuffer, pageIndexesToRemove) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
  const sorted = [...pageIndexesToRemove].sort((a, b) => b - a)

  for (const index of sorted) {
    pdfDoc.removePage(index)
  }

  return pdfDoc.save({ useObjectStreams: true })
}

/**
 * Fusionne plusieurs PDF en un seul document, dans l'ordre fourni.
 * `ignoreEncryption` sur le chargement de chaque source tolère les PDF avec
 * des restrictions de permissions ; `copyPages` + `addPage` est la méthode
 * standard de pdf-lib pour assembler des pages venant de documents source
 * différents dans un nouveau document.
 */
export async function mergePdfs(files) {
  if (!files || files.length < 2) {
    throw new Error('Veuillez sélectionner au moins 2 fichiers PDF.')
  }

  const mergedPdf = await PDFDocument.create()

  for (const file of files) {
    const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file
    const srcDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })

    const pageIndices = srcDoc.getPageIndices()
    const copiedPages = await mergedPdf.copyPages(srcDoc, pageIndices)
    copiedPages.forEach((page) => mergedPdf.addPage(page))
  }

  return mergedPdf.save()
}

/**
 * Extrait un sous-ensemble de pages (index base 0, dans l'ordre fourni) vers
 * un unique nouveau PDF. `pageIndexes` doit déjà être converti depuis la
 * numérotation utilisateur (base 1) par l'appelant.
 */
export async function extractPages(pdfBuffer, pageIndexes) {
  if (!pageIndexes || pageIndexes.length === 0) {
    throw new Error('Sélectionnez au moins une page à extraire.')
  }

  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const newDoc = await PDFDocument.create()

  const copiedPages = await newDoc.copyPages(srcDoc, pageIndexes)
  copiedPages.forEach((page) => newDoc.addPage(page))

  return newDoc.save({ useObjectStreams: true })
}

/**
 * Éclate un PDF en autant de documents que de pages, chacun réduit à une
 * seule page. Retourne un tableau de Uint8Array, un par page, dans l'ordre
 * du document source.
 */
export async function splitPdfToPages(pdfBuffer) {
  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const pageCount = srcDoc.getPageCount()
  const pages = []

  for (let i = 0; i < pageCount; i++) {
    const newDoc = await PDFDocument.create()
    const [copiedPage] = await newDoc.copyPages(srcDoc, [i])
    newDoc.addPage(copiedPage)
    pages.push(await newDoc.save({ useObjectStreams: true }))
  }

  return pages
}

/**
 * Incruste une image de signature (PNG ou JPEG) sur une page, aux
 * coordonnées et dimensions déjà converties dans le repère PDF (origine en
 * bas à gauche, en points) par l'appelant.
 */
export async function signPdf(pdfBuffer, { pageIndex, imageBytes, imageType, x, y, width, height }) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false })
  const page = pdfDoc.getPages()[pageIndex]
  if (!page) {
    throw new Error('Page invalide.')
  }

  const image =
    imageType === 'image/png' ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes)

  page.drawImage(image, { x, y, width, height })

  return pdfDoc.save({ useObjectStreams: true })
}

/**
 * Extrait les images JPEG intégrées d'un PDF (copie directe des octets bruts
 * du flux /DCTDecode, sans ré-encodage — fidélité garantie). Les images
 * dans un autre format (bitmap brut FlateDecode, JPEG2000, CCITT...) ne
 * sont pas reconstructibles de façon fiable ici : elles sont comptées à
 * part plutôt que silencieusement ignorées, pour rester honnête sur ce que
 * l'outil sait vraiment extraire.
 */
export async function extractImages(pdfBuffer) {
  const pdfDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true, updateMetadata: false })
  const images = []
  let unsupportedCount = 0

  pdfDoc.getPages().forEach((page, pageIndex) => {
    let xObjects
    try {
      xObjects = page.node.Resources()?.lookup(PDFName.of('XObject'))
    } catch {
      return
    }
    if (!xObjects) return

    for (const key of xObjects.keys()) {
      try {
        const stream = xObjects.lookup(key)
        if (!(stream instanceof PDFRawStream)) continue

        const isImage = stream.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')
        if (!isImage) continue

        if (isJpegFilter(stream.dict.lookup(PDFName.of('Filter')))) {
          images.push({ bytes: stream.contents, mime: 'image/jpeg', ext: 'jpg', pageIndex })
        } else {
          unsupportedCount++
        }
      } catch {
        unsupportedCount++
      }
    }
  })

  return { images, unsupportedCount }
}

/**
 * Reconstruit un PDF à partir d'une liste ordonnée de pages à conserver,
 * chacune avec une rotation à ajouter à celle déjà présente sur la page
 * source. `pageOrder` : [{ index (0-based dans le document source),
 * rotation (degrés à ajouter : 0/90/180/270) }], dans l'ordre final voulu.
 * Une page absente de la liste est simplement omise (= supprimée).
 */
export async function organizePdf(pdfBuffer, pageOrder) {
  if (!pageOrder || pageOrder.length === 0) {
    throw new Error('Il ne reste plus aucune page à conserver.')
  }

  const srcDoc = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true })
  const newDoc = await PDFDocument.create()

  const copiedPages = await newDoc.copyPages(
    srcDoc,
    pageOrder.map((p) => p.index),
  )

  copiedPages.forEach((page, i) => {
    const { rotation } = pageOrder[i]
    if (rotation) {
      const baseAngle = page.getRotation().angle || 0
      // Modulo positif garanti (utile si l'angle de base d'un PDF source
      // exotique n'est pas un multiple de 90 déjà normalisé côté pdf-lib).
      const finalAngle = ((baseAngle + rotation) % 360 + 360) % 360
      page.setRotation(degrees(finalAngle))
    }
    newDoc.addPage(page)
  })

  return newDoc.save({ useObjectStreams: true })
}

/** Décode n'importe quelle image affichable par le navigateur (y compris
 * WebP, que pdf-lib ne sait pas incruster directement) et la ré-encode en
 * PNG via un canvas — seul moyen de la rendre compatible avec `embedPng`.
 * Les PNG/JPEG d'origine sont, eux, réutilisés tels quels (pas de perte).
 */
async function normalizeImageForEmbed(file) {
  if (file.type === 'image/png' || file.type === 'image/jpeg') {
    return { bytes: new Uint8Array(await file.arrayBuffer()), isPng: file.type === 'image/png' }
  }

  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), isPng: true }
}

const A4_PORTRAIT = { width: 595.28, height: 841.89 } // points (1/72 pouce)
const MARGIN_POINTS = { none: 0, small: 20, large: 50 }

/**
 * Assemble une liste d'images en un PDF, une image par page, centrée avec
 * conservation des proportions. `pageSize: 'a4' | 'original'`,
 * `orientation: 'portrait' | 'landscape'` (ignoré si 'original'),
 * `margin: 'none' | 'small' | 'large'`.
 */
export async function imagesToPdf(files, { pageSize = 'a4', orientation = 'portrait', margin = 'none' } = {}) {
  if (!files || files.length === 0) {
    throw new Error('Ajoutez au moins une image.')
  }

  const pdfDoc = await PDFDocument.create()
  const marginPt = MARGIN_POINTS[margin] ?? 0

  for (const file of files) {
    const { bytes, isPng } = await normalizeImageForEmbed(file)
    const image = isPng ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)

    let pageWidth
    let pageHeight
    if (pageSize === 'original') {
      pageWidth = image.width
      pageHeight = image.height
    } else {
      pageWidth = orientation === 'landscape' ? A4_PORTRAIT.height : A4_PORTRAIT.width
      pageHeight = orientation === 'landscape' ? A4_PORTRAIT.width : A4_PORTRAIT.height
    }

    const page = pdfDoc.addPage([pageWidth, pageHeight])

    const maxWidth = Math.max(1, pageWidth - marginPt * 2)
    const maxHeight = Math.max(1, pageHeight - marginPt * 2)
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale

    page.drawImage(image, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    })
  }

  return pdfDoc.save({ useObjectStreams: true })
}
