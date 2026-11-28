import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib'
import { destroyPdfDocument, loadPdfDocument } from './pdfRender'
import { buildPageSearchIndex, normalizeQuery, originalText, pdfRectToViewport, rangeRects } from './pdfReader'
import { collectGarbage, readLayers, writeLayers } from './pdfLayersWorker'

/**
 * Nettoyage et anonymisation, 100 % en local.
 *
 * Garantie visée : le texte biffé n'existe plus nulle part dans le fichier.
 * Une page biffée est rendue en image (masques fusionnés dans les pixels)
 * et remplace l'originale ; l'ancienne page n'étant plus référencée, ses
 * flux de contenu sont effacés du fichier (sinon pdf-lib les réécrirait
 * tels quels). Les renvois vers l'ancienne page (liens, signets) sont
 * redirigés, l'arbre de balisage (qui peut contenir le texte en clair via
 * /ActualText) est retiré et les champs de formulaire de la page supprimés.
 * `auditOutput` vérifie ensuite le résultat de manière indépendante.
 *
 * Coordonnées des zones : repère de la page affichée à l'échelle 1 (points,
 * origine en haut à gauche, rotation /Rotate appliquée).
 */

const N = (name) => PDFName.of(name)
const nameOf = (v) => (v instanceof PDFName ? v.decodeText() : null)
const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '')

/* -------------------------------------------------------------------------- */
/* Texte des pages                                                            */
/* -------------------------------------------------------------------------- */

/** Texte de chaque page (fragments, index normalisé, géométrie d'affichage). */
export async function extractPages(pdf, onProgress = () => {}) {
  const pages = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const items = (await page.getTextContent()).items.filter((it) => typeof it.str === 'string')
    pages.push({ page: n, items, index: buildPageSearchIndex(items), viewport })
    onProgress(n / pdf.numPages)
  }
  return pages
}

const toViewBox = (viewport, rect) => {
  const { left, top, width, height } = pdfRectToViewport(viewport, rect)
  return { x: left, y: top, w: width, h: height }
}

/* -------------------------------------------------------------------------- */
/* Détection des données sensibles                                            */
/* -------------------------------------------------------------------------- */

function ibanValid(raw) {
  const iban = raw.replace(/\s+/g, '').toUpperCase()
  if (iban.length < 15 || iban.length > 34) return false
  const moved = iban.slice(4) + iban.slice(0, 4)
  let rest = 0
  for (const ch of moved) {
    const code = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch
    for (const d of code) rest = (rest * 10 + Number(d)) % 97
  }
  return rest === 1
}

function luhnValid(raw) {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

const MONTHS =
  'janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre|january|february|march|april|may|june|july|august|september|october|november|december|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre'

/** Motifs appliqués au texte normalisé (minuscules, sans accents). */
const DETECTORS = {
  email: [{ re: /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g }],
  phone: [
    { re: /(?:\+|\b00)[1-9]\d{0,2}[\s.-]?(?:\(0\)[\s.-]?)?\d{1,4}(?:[\s.-]?\d{2,4}){2,4}\b/g },
    { re: /\b0[1-9](?:[\s.-]?\d{2}){4}\b/g },
    { re: /\(\d{3}\)\s?\d{3}[\s.-]\d{4}\b/g },
  ],
  bank: [
    { re: /\b[a-z]{2}\d{2}(?:\s?[a-z0-9]{4}){2,7}(?:\s?[a-z0-9]{1,3})?\b/g, valid: ibanValid },
    { re: /\b(?:\d[ -]?){12,18}\d\b/g, valid: luhnValid },
  ],
  dates: [
    { re: /\b(?:\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2})|\d{4}-\d{2}-\d{2})\b/g },
    { re: new RegExp(`\\b\\d{1,2}(?:er)?\\s+(?:${MONTHS})\\s+\\d{4}\\b`, 'g') },
    // NIR (sécurité sociale) et SIREN/SIRET
    { re: /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2])\s?(?:\d{2}|2a|2b)\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b/g },
    { re: /\b\d{3}\s?\d{3}\s?\d{3}(?:\s?\d{5})?\b/g },
  ],
}

/**
 * Recherche des données sensibles. `options` : { email, phone, bank, dates,
 * keywords: string[] }. Les correspondances qui se chevauchent sont
 * fusionnées au profit de la plus longue.
 */
export function detectSensitive(pages, options) {
  const results = []
  for (const { page, items, index, viewport } of pages) {
    const found = []
    for (const category of ['email', 'phone', 'bank', 'dates']) {
      if (!options[category]) continue
      for (const { re, valid } of DETECTORS[category]) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(index.text))) {
          if (valid && !valid(m[0])) continue
          found.push({ category, start: m.index, end: m.index + m[0].length })
        }
      }
    }
    for (const keyword of options.keywords ?? []) {
      const q = normalizeQuery(keyword)
      if (q.length < 2) continue
      let from = 0
      while ((from = index.text.indexOf(q, from)) !== -1) {
        found.push({ category: 'keyword', start: from, end: from + q.length, keyword })
        from += q.length
      }
    }

    found.sort((a, b) => b.end - b.start - (a.end - a.start))
    const kept = []
    for (const f of found) if (!kept.some((k) => f.start < k.end && k.start < f.end)) kept.push(f)
    kept.sort((a, b) => a.start - b.start)

    for (const f of kept) {
      const boxes = rangeRects(index, items, f.start, f.end).map((r) => toViewBox(viewport, r))
      if (!boxes.length) continue
      results.push({
        id: `${page}-${f.start}-${f.category}`,
        page,
        category: f.category,
        text: originalText(index, items, f.start, f.end).trim(),
        context: {
          before: originalText(index, items, Math.max(0, f.start - 28), f.start),
          after: originalText(index, items, f.end, f.end + 28),
        },
        boxes,
      })
    }
  }
  return results
}

/** Texte situé sous des zones tracées à la main (pour l'audit de fuite). */
export function textUnderBoxes(pageData, boxes) {
  const out = []
  for (const item of pageData.items) {
    if (!item.str?.trim()) continue
    const [, , c, d, e, f] = item.transform
    const h = Math.hypot(c, d) || item.height || 10
    const v = toViewBox(pageData.viewport, [e, f - h * 0.22, e + item.width, f + h * 0.88])
    for (const b of boxes) {
      const ix0 = Math.max(v.x, b.x)
      const ix1 = Math.min(v.x + v.w, b.x + b.w)
      const iy = Math.min(v.y + v.h, b.y + b.h) - Math.max(v.y, b.y)
      if (ix1 <= ix0 || iy <= v.h * 0.3 || v.w <= 0) continue
      const len = item.str.length
      const s = Math.max(0, Math.floor(((ix0 - v.x) / v.w) * len))
      const t = Math.min(len, Math.ceil(((ix1 - v.x) / v.w) * len))
      const piece = item.str.slice(s, t).trim()
      if (piece) out.push(piece)
    }
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Purge structurelle                                                         */
/* -------------------------------------------------------------------------- */

const SCRIPT_ACTIONS = new Set(['JavaScript', 'Launch', 'ImportData', 'SubmitForm', 'ResetForm', 'Rendition', 'Sound', 'Movie'])
const EXTERNAL_ACTIONS = new Set(['URI', 'Launch', 'GoToR', 'GoToE', 'SubmitForm'])

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Purge des données cachées. `opts` : { metadata, annotations, attachments,
 * javascript, externalLinks, outlines, layers }. Renvoie { bytes, report }.
 */
export async function sanitizeStructure(bytes, opts) {
  const report = { metadataFields: [], xmp: false, annotations: 0, attachments: 0, scripts: 0, links: 0, outlines: false, layers: 0, orphans: 0 }
  let input = bytes

  if (opts.layers) {
    const info = await readLayers(input.slice())
    const hidden = info.layers.filter((l) => !l.defaultVisible)
    if (hidden.length) {
      input = (await writeLayers(input.slice(), { layers: info.layers, purgeHidden: true })).bytes
      report.layers = hidden.length
    }
  }

  const doc = await PDFDocument.load(input, { updateMetadata: false })
  const context = doc.context
  const catalog = doc.catalog
  const names = context.lookup(catalog.get(N('Names')))

  if (opts.metadata) {
    const info = context.lookup(context.trailerInfo.Info)
    if (info instanceof PDFDict) report.metadataFields = info.keys().map((k) => k.decodeText())
    context.trailerInfo.Info = undefined
    report.xmp = catalog.has(N('Metadata'))
    // XMP et données d'application (PieceInfo) partout : catalogue, pages, images, polices.
    for (const [, obj] of context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null
      if (!dict) continue
      dict.delete(N('Metadata'))
      dict.delete(N('PieceInfo'))
      dict.delete(N('LastModified'))
    }
    catalog.delete(N('Metadata'))
    catalog.delete(N('PieceInfo'))
    // Identifiant de fichier renouvelé : il ne relie plus la copie à l'original.
    const id = PDFHexString.of(randomHex(16))
    context.trailerInfo.ID = context.obj([id, id])
  }

  if (opts.attachments) {
    if (names instanceof PDFDict && names.has(N('EmbeddedFiles'))) {
      names.delete(N('EmbeddedFiles'))
      report.attachments += 1
    }
    catalog.delete(N('AF'))
  }

  if (opts.javascript) {
    if (names instanceof PDFDict && names.has(N('JavaScript'))) {
      names.delete(N('JavaScript'))
      report.scripts += 1
    }
    for (const key of ['AA']) {
      if (catalog.has(N(key))) {
        catalog.delete(N(key))
        report.scripts += 1
      }
    }
    const open = context.lookup(catalog.get(N('OpenAction')))
    if (open instanceof PDFDict && SCRIPT_ACTIONS.has(nameOf(open.get(N('S'))))) {
      catalog.delete(N('OpenAction'))
      report.scripts += 1
    }
    const acroForm = context.lookup(catalog.get(N('AcroForm')))
    if (acroForm instanceof PDFDict) acroForm.delete(N('XFA'))
  }

  if (opts.outlines && catalog.has(N('Outlines'))) {
    catalog.delete(N('Outlines'))
    if (nameOf(catalog.get(N('PageMode'))) === 'UseOutlines') catalog.delete(N('PageMode'))
    report.outlines = true
  }

  for (const page of doc.getPages()) {
    if (opts.javascript && page.node.has(N('AA'))) {
      page.node.delete(N('AA'))
      report.scripts += 1
    }
    const annots = page.node.Annots()
    if (!annots) continue
    const kept = []
    for (const ref of annots.asArray()) {
      const annot = context.lookup(ref)
      if (!(annot instanceof PDFDict)) continue
      const subtype = nameOf(annot.get(N('Subtype')))
      const action = context.lookup(annot.get(N('A')))
      const actionType = action instanceof PDFDict ? nameOf(action.get(N('S'))) : null

      if (opts.attachments && subtype === 'FileAttachment') {
        report.attachments += 1
        continue
      }
      if (opts.annotations && subtype !== 'Widget' && subtype !== 'Link') {
        report.annotations += 1
        continue
      }
      if (opts.externalLinks && subtype === 'Link' && actionType && EXTERNAL_ACTIONS.has(actionType)) {
        report.links += 1
        continue
      }
      if (opts.javascript) {
        if (annot.has(N('AA'))) {
          annot.delete(N('AA'))
          report.scripts += 1
        }
        if (actionType && SCRIPT_ACTIONS.has(actionType)) {
          annot.delete(N('A'))
          report.scripts += 1
        }
      }
      kept.push(ref)
    }
    if (kept.length) page.node.set(N('Annots'), context.obj(kept))
    else page.node.delete(N('Annots'))
  }

  // Les éléments retirés ne doivent pas subsister en objets orphelins.
  report.orphans = collectGarbage(context)
  return { bytes: await doc.save(), report }
}

/* -------------------------------------------------------------------------- */
/* Biffure irréversible                                                       */
/* -------------------------------------------------------------------------- */

export const MASK_COLORS = { black: '#000000', white: '#ffffff', gray: '#6b7280' }

/** Remplace toutes les références à une page par une autre, dans tout le document. */
function replaceRefs(context, mapping) {
  if (!mapping.size) return
  const swap = (value) => (value instanceof PDFRef && mapping.has(value.toString()) ? mapping.get(value.toString()) : value)
  const visit = (obj) => {
    if (obj instanceof PDFStream) visit(obj.dict)
    else if (obj instanceof PDFDict) {
      for (const [key, value] of obj.entries()) {
        const next = swap(value)
        if (next !== value) obj.set(key, next)
        else if (value instanceof PDFDict || value instanceof PDFArray) visit(value)
      }
    } else if (obj instanceof PDFArray) {
      for (let i = 0; i < obj.size(); i++) {
        const value = obj.get(i)
        const next = swap(value)
        if (next !== value) obj.set(i, next)
        else if (value instanceof PDFDict || value instanceof PDFArray) visit(value)
      }
    }
  }
  for (const [, obj] of context.enumerateIndirectObjects()) visit(obj)
}

function drawMask(ctx, box, scale, { color, label }) {
  const x = box.x * scale
  const y = box.y * scale
  const w = box.w * scale
  const h = box.h * scale
  ctx.fillStyle = MASK_COLORS[color]
  ctx.fillRect(x, y, w, h)
  const text = label.trim()
  if (!text) return
  let size = Math.min(h * 0.62, 48 * scale)
  ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`
  const width = ctx.measureText(text).width
  if (width > w * 0.92) {
    size *= (w * 0.92) / width
    ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`
  }
  if (size < 4) return
  ctx.fillStyle = color === 'white' ? '#111111' : '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2)
}

/**
 * Applique les zones de biffure. `boxesByPage` : Map numéro de page ->
 * zones. Chaque page concernée est rendue à `dpi` avec ses masques, puis
 * remplace l'originale, dont le contenu est effacé du fichier.
 */
export async function applyRedactions(bytes, boxesByPage, { dpi = 200, color = 'black', label = '', onProgress = () => {} }) {
  const pdf = await loadPdfDocument(bytes)
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const context = doc.context
  const pageNumbers = [...boxesByPage.keys()].sort((a, b) => a - b)
  const report = { pages: pageNumbers.length, boxes: 0, fields: 0, tags: false }

  // Champs de formulaire dont un widget est sur une page biffée : leur
  // valeur reste sinon lisible dans /AcroForm.
  const redactedRefs = new Set(pageNumbers.map((n) => doc.getPage(n - 1).ref.toString()))
  const widgetPage = new Map()
  pageNumbers.forEach((n) => doc.getPage(n - 1).node.Annots()?.asArray().forEach((r) => widgetPage.set(context.lookup(r), n)))
  try {
    const form = doc.getForm()
    for (const field of form.getFields()) {
      const onRedacted = field.acroField.getWidgets().some((w) => redactedRefs.has(w.P()?.toString()) || widgetPage.has(w.dict))
      if (onRedacted) {
        form.removeField(field)
        report.fields += 1
      }
    }
  } catch {
    // pas de formulaire exploitable
  }

  const mapping = new Map()
  try {
    for (let i = 0; i < pageNumbers.length; i++) {
      const n = pageNumbers[i]
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      const scale = Math.min(dpi / 72, 7000 / Math.max(base.width, base.height))
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvas, canvasContext: ctx, viewport }).promise
      for (const box of boxesByPage.get(n)) {
        drawMask(ctx, box, scale, { color, label })
        report.boxes += 1
      }
      const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.92))
      canvas.width = 0
      canvas.height = 0
      const image = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()))

      const oldRef = doc.getPage(n - 1).ref
      const fresh = doc.insertPage(n - 1, [base.width, base.height])
      fresh.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height })
      doc.removePage(n)
      mapping.set(oldRef.toString(), fresh.ref)
      onProgress((i + 1) / pageNumbers.length)
    }
  } finally {
    destroyPdfDocument(pdf)
  }

  // Liens et signets redirigés vers les nouvelles pages ; balisage retiré.
  replaceRefs(context, mapping)
  if (doc.catalog.has(N('StructTreeRoot'))) {
    doc.catalog.delete(N('StructTreeRoot'))
    doc.catalog.delete(N('MarkInfo'))
    report.tags = true
  }
  collectGarbage(context)

  // Sécurité : aucune ancienne page ne doit subsister dans le fichier.
  for (const ref of mapping.keys()) {
    const [num, gen] = ref.split(' ')
    if (context.lookup(PDFRef.of(Number(num), Number(gen)))) throw new Error('OLD_PAGE_STILL_PRESENT')
  }
  return { bytes: await doc.save(), report }
}

/* -------------------------------------------------------------------------- */
/* Audit de confidentialité                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Vérifie le fichier produit : texte extractible page par page (pdf.js),
 * chaînes et flux décodés de tous les objets (pdf-lib), métadonnées et
 * éléments restants. `secrets` : textes biffés à rechercher.
 */
export async function auditOutput(bytes, secrets, redactedPages) {
  const targets = [...new Set(secrets.map(strip).filter((s) => s.length >= 4))]
  const leaks = new Map(targets.map((s) => [s, { pages: [], redactedPage: false, hiddenData: false }]))

  const pdf = await loadPdfDocument(bytes)
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      const text = strip((await (await pdf.getPage(n)).getTextContent()).items.map((i) => i.str ?? '').join(''))
      for (const s of targets) {
        if (text.includes(s)) {
          const leak = leaks.get(s)
          leak.pages.push(n)
          if (redactedPages.has(n)) leak.redactedPage = true
        }
      }
    }
  } finally {
    destroyPdfDocument(pdf)
  }

  // Chaînes et flux textuels hors contenu des pages (métadonnées, signets…).
  const doc = await PDFDocument.load(bytes, { updateMetadata: false })
  const context = doc.context
  const contentRefs = new Set()
  for (const page of doc.getPages()) {
    const contents = context.lookup(page.node.get(N('Contents')))
    const refs = contents instanceof PDFArray ? contents.asArray() : [page.node.get(N('Contents'))]
    refs.forEach((r) => r instanceof PDFRef && contentRefs.add(r.toString()))
  }
  let hidden = ''
  const collect = (value) => {
    if (value instanceof PDFString || value instanceof PDFHexString) hidden += `${value.decodeText()}\n`
    else if (value instanceof PDFDict) for (const [, v] of value.entries()) collect(v)
    else if (value instanceof PDFArray) value.asArray().forEach(collect)
  }
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (obj instanceof PDFStream) {
      collect(obj.dict)
      const subtype = nameOf(obj.dict.get(N('Subtype')))
      // Contenus de page et XObjects formulaires : déjà couverts par l'extraction
      // pdf.js ci-dessus. Images et programmes de police : binaires.
      const isFontProgram = ['Length1', 'Length2', 'Length3'].some((k) => obj.dict.has(N(k))) || ['Type1C', 'CIDFontType0C', 'OpenType'].includes(subtype)
      if (contentRefs.has(ref.toString()) || subtype === 'Image' || subtype === 'Form' || isFontProgram) continue
      try {
        const data = obj instanceof PDFRawStream ? decodePDFRawStream(obj).decode() : obj.getContents()
        hidden += new TextDecoder('latin1').decode(data.subarray(0, 2_000_000))
      } catch {
        // flux non décodable
      }
    } else collect(obj)
  }
  const hiddenNorm = strip(hidden)
  for (const s of targets) if (hiddenNorm.includes(s)) leaks.get(s).hiddenData = true

  const info = context.lookup(context.trailerInfo.Info)
  let annotations = 0
  doc.getPages().forEach((p) => (annotations += p.node.Annots()?.size() ?? 0))
  const names = context.lookup(doc.catalog.get(N('Names')))

  const found = [...leaks.entries()].filter(([, l]) => l.pages.length || l.hiddenData)
  return {
    checked: targets.length,
    criticalLeaks: found.filter(([, l]) => l.redactedPage || l.hiddenData).length,
    elsewhere: found.filter(([, l]) => !l.redactedPage && !l.hiddenData).map(([s, l]) => ({ text: s, pages: l.pages })),
    metadataLeft: info instanceof PDFDict ? info.keys().length : 0,
    xmpLeft: doc.catalog.has(N('Metadata')),
    annotationsLeft: annotations,
    attachmentsLeft: names instanceof PDFDict && names.has(N('EmbeddedFiles')),
    pageCount: doc.getPageCount(),
    size: bytes.length,
    // Nombre de pages restées vectorielles (texte encore sélectionnable).
    vectorPages: doc.getPageCount() - redactedPages.size,
  }
}
