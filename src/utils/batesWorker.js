import {
  PDFDocument,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
} from 'pdf-lib'

/**
 * Numérotation Bates, 100 % locale.
 *
 * Les identifiants se suivent sans interruption d'un document à l'autre de
 * la file (ex. DOC-0001 → DOC-0145). Une page exclue (page de garde, plage
 * personnalisée) n'est ni tamponnée ni comptée : la séquence reste continue
 * sur les pages réellement indexées.
 *
 * La mise en page du tampon est calculée une seule fois (`stampLayout`) dans
 * le repère de la page telle qu'elle s'affiche (origine en haut à gauche,
 * rotation /Rotate appliquée) et sert à la fois à l'aperçu SVG et à l'export
 * pdf-lib : ce que l'on voit est exactement ce qui est incrusté.
 */

export const FONTS = {
  helvetica: { pdf: StandardFonts.Helvetica, css: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
  times: { pdf: StandardFonts.TimesRoman, css: '"Times New Roman", Times, serif', label: 'Times-Roman' },
  courier: { pdf: StandardFonts.Courier, css: '"Courier New", Courier, monospace', label: 'Courier' },
}

export const COLORS = {
  black: '#000000',
  darkGray: '#3f3f46',
  red: '#b91c1c',
  navy: '#1e3a8a',
}

export const POSITIONS = ['tl', 'tc', 'tr', 'bl', 'bc', 'br']

export const MM_TO_PT = 72 / 25.4

/* ---- Identifiants et plages ---------------------------------------------- */

export function formatBates(n, { prefix, digits, suffix }) {
  return `${prefix}${String(n).padStart(digits, '0')}${suffix}`
}

/**
 * Plage personnalisée « 1-3, 5, 8- » -> ensemble de numéros de page (base 1).
 * Renvoie null si la saisie est invalide.
 */
export function parseRange(input, pageCount) {
  const pages = new Set()
  const parts = input.split(/[,;]/).map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null
  for (const part of parts) {
    const match = /^(\d*)\s*(-?)\s*(\d*)$/.exec(part)
    if (!match || (!match[1] && !match[3])) return null
    const from = match[1] ? Number(match[1]) : 1
    const to = match[2] ? (match[3] ? Number(match[3]) : pageCount) : from
    if (from < 1 || to < from) return null
    for (let p = from; p <= Math.min(to, pageCount); p++) pages.add(p)
  }
  return pages
}

/** Pages numérotées d'un document (numéros base 1, triés), ou null si plage invalide. */
export function includedPages(pageCount, range) {
  if (range.mode === 'skipFirst') return Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => i + 2)
  if (range.mode === 'custom') {
    const set = parseRange(range.custom, pageCount)
    return set ? [...set].sort((a, b) => a - b) : null
  }
  return Array.from({ length: pageCount }, (_, i) => i + 1)
}

/**
 * Plan de numérotation de la file : pour chaque document, premier et dernier
 * numéro, et la correspondance page -> numéro.
 */
export function computePlan(documents, config) {
  let next = config.start
  let invalid = false
  const items = documents.map((doc) => {
    const pages = includedPages(doc.pageCount, config.range)
    if (!pages) {
      invalid = true
      return { first: null, last: null, count: 0, numbers: new Map() }
    }
    const numbers = new Map(pages.map((p, i) => [p, next + i]))
    const item = { first: pages.length ? next : null, last: pages.length ? next + pages.length - 1 : null, count: pages.length, numbers }
    next += pages.length
    return item
  })
  const firstNumber = items.find((i) => i.first !== null)?.first ?? null
  const lastNumber = [...items].reverse().find((i) => i.last !== null)?.last ?? null
  return { items, invalid, firstNumber, lastNumber, total: next - config.start }
}

/** Texte de la ligne secondaire pour une page donnée. */
export function secondaryText(config, { pageNumber, pageCount, dateText }) {
  switch (config.secondary) {
    case 'date':
      return dateText
    case 'pageOf':
      return config.pageOfTemplate.replace('{x}', pageNumber).replace('{y}', pageCount)
    case 'custom':
      return config.secondaryCustom.trim() || null
    default:
      return null
  }
}

/* ---- Mise en page du tampon ---------------------------------------------- */

const LINE_FACTOR = 1.15
const BASELINE_FACTOR = 0.86
export const SECONDARY_RATIO = 0.8

/**
 * `measure(text, size)` = largeur en points (métriques pdf-lib de la police).
 * Renvoie la boîte et la position de chaque ligne, repère y vers le bas.
 */
export function stampLayout({ pageW, pageH, main, secondary, fontSize, position, marginX, marginY, background, measure }) {
  const size2 = fontSize * SECONDARY_RATIO
  const pad = background ? fontSize * 0.35 : 0
  const lines = [{ text: main, size: fontSize }]
  if (secondary) lines.push({ text: secondary, size: size2 })

  const widths = lines.map((l) => measure(l.text, l.size))
  const textW = Math.max(...widths)
  const boxW = textW + pad * 2
  const boxH = lines.reduce((h, l) => h + l.size * LINE_FACTOR, 0) + pad * 2

  const hAlign = position[1] === 'l' ? 'left' : position[1] === 'c' ? 'center' : 'right'
  const x = hAlign === 'left' ? marginX : hAlign === 'center' ? (pageW - boxW) / 2 : pageW - marginX - boxW
  const y = position[0] === 't' ? marginY : pageH - marginY - boxH

  let cursor = y + pad
  const placed = lines.map((line, i) => {
    const baseline = cursor + line.size * BASELINE_FACTOR
    cursor += line.size * LINE_FACTOR
    const lx = hAlign === 'left' ? x + pad : hAlign === 'center' ? x + (boxW - widths[i]) / 2 : x + boxW - pad - widths[i]
    return { ...line, x: lx, baseline, width: widths[i] }
  })

  return { box: { x, y, w: boxW, h: boxH }, lines: placed }
}

/* ---- Repère d'affichage d'une page (équivalent de PageViewport de pdf.js) */

/** Matrice PDF -> affichage (échelle 1), identique à `viewport.transform` de pdf.js. */
export function viewportTransform([x0, y0, x1, y1], rotation) {
  const r = ((rotation % 360) + 360) % 360
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2
  let a, b, c, d
  if (r === 90) [a, b, c, d] = [0, 1, 1, 0]
  else if (r === 180) [a, b, c, d] = [-1, 0, 0, 1]
  else if (r === 270) [a, b, c, d] = [0, -1, -1, 0]
  else [a, b, c, d] = [1, 0, 0, -1]

  let offsetX, offsetY, width, height
  if (a === 0) {
    offsetX = Math.abs(cy - y0)
    offsetY = Math.abs(cx - x0)
    width = y1 - y0
    height = x1 - x0
  } else {
    offsetX = Math.abs(cx - x0)
    offsetY = Math.abs(cy - y0)
    width = x1 - x0
    height = y1 - y0
  }
  return {
    transform: [a, b, c, d, offsetX - a * cx - c * cy, offsetY - b * cx - d * cy],
    width,
    height,
  }
}

function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [a1 * a2 + b1 * c2, a1 * b2 + b1 * d2, c1 * a2 + d1 * c2, c1 * b2 + d1 * d2, e1 * a2 + f1 * c2 + e2, e1 * b2 + f1 * d2 + f2]
}

function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Remplace les caractères non encodables par la police standard (WinAnsi). */
export function sanitize(font, text) {
  return Array.from(text)
    .map((ch) => {
      try {
        font.encodeText(ch)
        return ch
      } catch {
        return '?'
      }
    })
    .join('')
}

/** Polices standard intégrées dans un document jetable : métriques pour l'aperçu. */
export async function loadMeasureFonts() {
  const doc = await PDFDocument.create()
  const entries = await Promise.all(Object.entries(FONTS).map(async ([id, f]) => [id, await doc.embedFont(f.pdf)]))
  return Object.fromEntries(entries)
}

export async function countPages(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })
  return doc.getPageCount()
}

/**
 * Incruste les identifiants dans un document. `numbers` : Map page (base 1)
 * -> numéro Bates, issue de `computePlan`.
 */
export async function stampDocument(buffer, config, numbers, { dateText }) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const font = await doc.embedFont(FONTS[config.font].pdf)
  const color = hexToRgb(COLORS[config.color])
  const pages = doc.getPages()
  const measure = (text, size) => font.widthOfTextAtSize(text, size)

  pages.forEach((page, index) => {
    const pageNumber = index + 1
    const number = numbers.get(pageNumber)
    if (number === undefined) return

    const crop = page.getCropBox()
    const { transform, width: pageW, height: pageH } = viewportTransform(
      [crop.x, crop.y, crop.x + crop.width, crop.y + crop.height],
      page.getRotation().angle,
    )
    const main = sanitize(font, formatBates(number, config))
    const second = secondaryText(config, { pageNumber, pageCount: pages.length, dateText })
    const layout = stampLayout({
      pageW,
      pageH,
      main,
      secondary: second ? sanitize(font, second) : null,
      fontSize: config.fontSize,
      position: config.position,
      marginX: config.marginX,
      marginY: config.marginY,
      background: config.background,
      measure,
    })

    // Repère « page affichée, y vers le haut » -> espace PDF.
    page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...multiply([1, 0, 0, -1, 0, pageH], invert(transform))))
    if (config.background) {
      const { x, y, w, h } = layout.box
      page.drawRectangle({ x, y: pageH - y - h, width: w, height: h, color: rgb(1, 1, 1), borderColor: rgb(0.8, 0.8, 0.82), borderWidth: 0.5 })
    }
    for (const line of layout.lines) {
      page.drawText(line.text, { x: line.x, y: pageH - line.baseline, size: line.size, font, color })
    }
    page.pushOperators(popGraphicsState())
  })

  return doc.save()
}
