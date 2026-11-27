import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from 'pdf-lib'
import { AnnotationMode } from 'pdfjs-dist'
import { loadPdfDocument, destroyPdfDocument } from './pdfRender'

/**
 * Aplatissement de PDF, 100 % local. Deux stratégies :
 *
 * - `interactive` : pdf-lib fige les champs de formulaire (form.flatten),
 *   puis chaque annotation visible restante (surlignage, encre, tampon,
 *   note, signature dessinée...) est dessinée dans le contenu de sa page à
 *   partir de son apparence (/AP /N) et retirée de /Annots. Le texte reste
 *   sélectionnable et le fichier reste léger.
 * - `raster` : chaque page est rendue en image par pdf.js puis replacée
 *   seule dans un nouveau PDF. Plus aucun texte, calque caché, champ ni
 *   métadonnée d'origine ne subsiste.
 */

// Annotations sans rendu propre (liens) ou rattachées à une autre (popups).
const SKIPPED_SUBTYPES = new Set(['Link', 'Popup'])
const FLAG_HIDDEN = 1 << 1
const FLAG_NO_VIEW = 1 << 5
const MAX_RASTER_DIMENSION = 7000

function annotationRefs(page) {
  const annots = page.node.Annots()
  if (!annots) return []
  return annots.asArray()
}

function lookupDict(context, value) {
  const obj = value instanceof PDFRef ? context.lookup(value) : value
  return obj instanceof PDFDict ? obj : null
}

function numbersOf(context, value) {
  const arr = value instanceof PDFRef ? context.lookup(value) : value
  if (!(arr instanceof PDFArray)) return null
  return arr.asArray().map((n) => {
    const num = n instanceof PDFRef ? context.lookup(n) : n
    return num instanceof PDFNumber ? num.asNumber() : 0
  })
}

/**
 * Apparence normale d'une annotation, sous forme de référence vers un flux
 * (Form XObject). Gère les apparences à états (cases à cocher : /AS).
 */
function normalAppearanceRef(context, annot) {
  const ap = lookupDict(context, annot.get(PDFName.of('AP')))
  if (!ap) return null
  let normal = ap.get(PDFName.of('N'))
  const resolved = normal instanceof PDFRef ? context.lookup(normal) : normal

  if (resolved instanceof PDFDict && !(resolved instanceof PDFStream)) {
    const state = annot.get(PDFName.of('AS'))
    if (!(state instanceof PDFName)) return null
    normal = resolved.get(state)
  }
  if (!normal) return null
  if (normal instanceof PDFRef) {
    return context.lookup(normal) instanceof PDFStream ? normal : null
  }
  return normal instanceof PDFStream ? context.register(normal) : null
}

function isFlattenable(context, annot) {
  const subtype = annot.get(PDFName.of('Subtype'))
  if (!(subtype instanceof PDFName)) return false
  if (SKIPPED_SUBTYPES.has(subtype.decodeText())) return false
  const flags = annot.get(PDFName.of('F'))
  const f = flags instanceof PDFNumber ? flags.asNumber() : 0
  if (f & FLAG_HIDDEN || f & FLAG_NO_VIEW) return false
  return Boolean(normalAppearanceRef(context, annot))
}

/** Statistiques affichées avant traitement. */
export async function analyzePdf(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })
  const context = doc.context

  let fieldCount = 0
  let hasXfa = false
  try {
    const form = doc.getForm()
    fieldCount = form.getFields().length
    hasXfa = form.hasXFA()
  } catch {
    // Formulaire illisible : on continue avec 0 champ.
  }

  let annotationCount = 0
  for (const page of doc.getPages()) {
    for (const ref of annotationRefs(page)) {
      const annot = lookupDict(context, ref)
      if (!annot) continue
      const subtype = annot.get(PDFName.of('Subtype'))
      if (subtype instanceof PDFName && subtype.decodeText() === 'Widget') continue
      if (isFlattenable(context, annot)) annotationCount += 1
    }
  }

  return {
    pageCount: doc.getPageCount(),
    fieldCount,
    annotationCount,
    hasXfa,
    isEncrypted: doc.isEncrypted,
  }
}

/** Matrice qui place le BBox (transformé par /Matrix) de l'apparence sur /Rect. */
function appearanceMatrix(context, stream, rect) {
  const bbox = numbersOf(context, stream.dict.get(PDFName.of('BBox'))) ?? [0, 0, 1, 1]
  const [a, b, c, d, e, f] = numbersOf(context, stream.dict.get(PDFName.of('Matrix'))) ?? [1, 0, 0, 1, 0, 0]
  const corners = [
    [bbox[0], bbox[1]],
    [bbox[2], bbox[1]],
    [bbox[0], bbox[3]],
    [bbox[2], bbox[3]],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f])
  const xs = corners.map((p) => p[0])
  const ys = corners.map((p) => p[1])
  const bx0 = Math.min(...xs)
  const by0 = Math.min(...ys)
  const bw = Math.max(...xs) - bx0 || 1
  const bh = Math.max(...ys) - by0 || 1

  const rx0 = Math.min(rect[0], rect[2])
  const ry0 = Math.min(rect[1], rect[3])
  const sx = Math.abs(rect[2] - rect[0]) / bw
  const sy = Math.abs(rect[3] - rect[1]) / bh
  return [sx, 0, 0, sy, rx0 - bx0 * sx, ry0 - by0 * sy]
}

/**
 * Aplatissement interactif (pdf-lib). `onProgress` reçoit une valeur 0-1.
 */
export async function flattenInteractive(buffer, onProgress = () => {}) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const context = doc.context

  // 1. Champs de formulaire. La régénération des apparences peut échouer
  //    (caractères hors WinAnsi, polices manquantes) : on retente alors en
  //    gardant les apparences existantes.
  try {
    const form = doc.getForm()
    if (form.hasXFA()) form.deleteXFA()
    try {
      form.flatten({ updateFieldAppearances: true })
    } catch {
      form.flatten({ updateFieldAppearances: false })
    }
  } catch (err) {
    console.warn('Aplatissement du formulaire partiel :', err)
  }
  onProgress(0.15)

  // 2. Annotations restantes, page par page.
  const pages = doc.getPages()
  pages.forEach((page, index) => {
    const refs = annotationRefs(page)
    if (refs.length) {
      const kept = []
      for (const ref of refs) {
        const annot = lookupDict(context, ref)
        if (!annot) continue
        const subtype = annot.get(PDFName.of('Subtype'))
        const name = subtype instanceof PDFName ? subtype.decodeText() : ''

        if (name === 'Link') {
          kept.push(ref)
          continue
        }
        if (name === 'Popup' || !isFlattenable(context, annot)) continue

        const appearanceRef = normalAppearanceRef(context, annot)
        const stream = context.lookup(appearanceRef)
        const rect = numbersOf(context, annot.get(PDFName.of('Rect')))
        if (!rect) continue
        stream.dict.set(PDFName.of('Type'), PDFName.of('XObject'))
        stream.dict.set(PDFName.of('Subtype'), PDFName.of('Form'))

        const xObjectName = page.node.newXObject('FlatAnnot', appearanceRef)
        page.pushOperators(
          pushGraphicsState(),
          concatTransformationMatrix(...appearanceMatrix(context, stream, rect)),
          drawObject(xObjectName),
          popGraphicsState(),
        )
      }

      if (kept.length) page.node.set(PDFName.of('Annots'), context.obj(kept))
      else page.node.delete(PDFName.of('Annots'))
    }
    onProgress(0.15 + (0.75 * (index + 1)) / pages.length)
  })

  // Plus aucun champ : l'AcroForm restant ne sert qu'à tromper les lecteurs.
  doc.catalog.delete(PDFName.of('AcroForm'))

  const bytes = await doc.save()
  onProgress(1)
  return bytes
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject) : reject(new Error('toBlob'))),
      'image/jpeg',
      quality,
    )
  })
}

/**
 * Aplatissement intégral : rastérisation de chaque page à `dpi`, puis
 * reconstruction d'un PDF neuf ne contenant que ces images.
 */
export async function flattenRaster(buffer, { dpi = 150, onProgress = () => {} } = {}) {
  const source = await loadPdfDocument(buffer)
  const output = await PDFDocument.create()
  output.setProducer('ONE')
  output.setCreator('ONE')

  try {
    for (let n = 1; n <= source.numPages; n++) {
      const page = await source.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(dpi / 72, MAX_RASTER_DIMENSION / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })

      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Intent "print" + ENABLE_STORAGE : les valeurs des champs remplis et
      // les annotations imprimables sont incluses dans l'image.
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        intent: 'print',
        annotationMode: AnnotationMode.ENABLE_STORAGE,
      }).promise

      const jpg = await output.embedJpg(await canvasToJpeg(canvas, 0.92))
      const outPage = output.addPage([base.width, base.height])
      outPage.drawImage(jpg, { x: 0, y: 0, width: base.width, height: base.height })

      canvas.width = 0
      canvas.height = 0
      page.cleanup()
      onProgress(n / source.numPages)
    }
  } finally {
    destroyPdfDocument(source)
  }

  return output.save()
}
