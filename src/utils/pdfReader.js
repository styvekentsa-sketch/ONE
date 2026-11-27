import { BlendMode, LineCapStyle, PDFDocument, StandardFonts, rgb } from 'pdf-lib'

/**
 * Utilitaires du Lecteur PDF Avancé : recherche plein texte (avec position
 * des correspondances dans le repère PDF) et export des annotations dans
 * le fichier final via pdf-lib. Tout reste local au navigateur.
 *
 * Convention de coordonnées : toutes les annotations et tous les rectangles
 * de recherche sont stockés dans l'espace utilisateur PDF brut (origine en
 * bas à gauche, unité = point PDF). C'est exactement ce que renvoie
 * `viewport.convertToPdfPoint` côté pdf.js et ce qu'attend pdf-lib pour
 * dessiner : zoom et rotation de la vue n'ont donc aucun impact sur les
 * données, seule la conversion d'affichage change.
 */

/** Normalise un caractère pour une recherche insensible à la casse et aux accents. */
function normalizeChar(ch) {
  return ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/**
 * Construit l'index de recherche d'une page : une chaîne normalisée et, pour
 * chaque caractère de cette chaîne, le fragment de texte (item) et la
 * position d'origine dont il provient. La table de correspondance garantit
 * des rectangles justes même si la normalisation change la longueur.
 */
export function buildPageSearchIndex(items) {
  let text = ''
  const map = []

  items.forEach((item, itemIdx) => {
    const str = item.str ?? ''
    for (let i = 0; i < str.length; i++) {
      const norm = normalizeChar(str[i])
      for (const c of norm) {
        text += c
        map.push([itemIdx, i])
      }
    }
    if (item.hasEOL) {
      text += ' '
      map.push([-1, -1])
    }
  })

  return { text, map }
}

export function normalizeQuery(query) {
  return Array.from(query.trim()).map(normalizeChar).join('').replace(/\s+/g, ' ')
}

/** Rectangle PDF [x0, y0, x1, y1] couvrant les caractères [start, end[ d'un item. */
function itemSegmentRect(item, start, end) {
  const [, , c, d, e, f] = item.transform
  const fontHeight = Math.hypot(c, d) || item.height || 10
  const len = Math.max(item.str.length, 1)
  const x0 = e + (item.width * start) / len
  const x1 = e + (item.width * end) / len
  return [x0, f - fontHeight * 0.22, x1, f + fontHeight * 0.88]
}

/**
 * Toutes les correspondances de `normQuery` dans une page. Chaque
 * correspondance peut chevaucher plusieurs fragments : elle produit alors
 * un rectangle par fragment.
 */
export function findMatchesInPage(index, items, normQuery, pageNumber) {
  const matches = []
  if (!normQuery) return matches

  let from = 0
  while (from <= index.text.length - normQuery.length) {
    const pos = index.text.indexOf(normQuery, from)
    if (pos === -1) break

    const segments = new Map()
    for (let k = pos; k < pos + normQuery.length; k++) {
      const [itemIdx, charIdx] = index.map[k]
      if (itemIdx < 0) continue
      const seg = segments.get(itemIdx)
      if (seg) {
        seg.start = Math.min(seg.start, charIdx)
        seg.end = Math.max(seg.end, charIdx + 1)
      } else {
        segments.set(itemIdx, { start: charIdx, end: charIdx + 1 })
      }
    }

    const rects = [...segments.entries()].map(([itemIdx, { start, end }]) =>
      itemSegmentRect(items[itemIdx], start, end),
    )
    if (rects.length) matches.push({ page: pageNumber, rects })
    from = pos + Math.max(normQuery.length, 1)
  }

  return matches
}

/** Convertit un rectangle PDF en rectangle d'affichage {left, top, width, height}. */
export function pdfRectToViewport(viewport, rect) {
  const [x1, y1, x2, y2] = viewport.convertToViewportRectangle(rect)
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  }
}

function hexToRgb(hex) {
  const value = hex.replace('#', '')
  const n = parseInt(value.length === 3 ? value.replace(/./g, '$&$&') : value, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Remplace les caractères non encodables en WinAnsi (police standard Helvetica). */
function sanitizeForFont(font, text, size) {
  return Array.from(text)
    .map((ch) => {
      try {
        font.widthOfTextAtSize(ch, size)
        return ch
      } catch {
        return '?'
      }
    })
    .join('')
}

/** Découpe un texte en lignes tenant dans `maxWidth`. */
function wrapText(font, text, size, maxWidth) {
  const lines = []
  for (const paragraph of text.split(/\r?\n/)) {
    let line = ''
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
        line = candidate
      } else {
        lines.push(line)
        line = word
      }
    }
    lines.push(line)
  }
  return lines
}

/**
 * Fusionne les annotations dans le PDF d'origine et renvoie les octets du
 * nouveau fichier. Surlignages = rectangles semi-transparents en mode
 * Multiply (le texte reste lisible), stylo = segments à bouts ronds,
 * notes = pastille + encadré de texte.
 */
export async function exportAnnotatedPdf(originalBytes, annotations) {
  const doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pages = doc.getPages()

  for (const annotation of annotations) {
    const page = pages[annotation.page - 1]
    if (!page) continue
    const color = hexToRgb(annotation.color)

    if (annotation.type === 'highlight') {
      const [x0, y0, x1, y1] = annotation.rect
      page.drawRectangle({
        x: Math.min(x0, x1),
        y: Math.min(y0, y1),
        width: Math.abs(x1 - x0),
        height: Math.abs(y1 - y0),
        color,
        opacity: 0.35,
        blendMode: BlendMode.Multiply,
      })
    } else if (annotation.type === 'pen') {
      const pts = annotation.points
      if (pts.length === 1) {
        page.drawCircle({ x: pts[0][0], y: pts[0][1], size: annotation.width / 2, color })
      }
      for (let i = 1; i < pts.length; i++) {
        page.drawLine({
          start: { x: pts[i - 1][0], y: pts[i - 1][1] },
          end: { x: pts[i][0], y: pts[i][1] },
          thickness: annotation.width,
          color,
          lineCap: LineCapStyle.Round,
        })
      }
    } else if (annotation.type === 'note') {
      const [x, y] = annotation.at
      const size = 9
      const padding = 5
      const maxWidth = 180
      const text = sanitizeForFont(font, annotation.text || '', size)
      const lines = text.trim() ? wrapText(font, text, size, maxWidth) : []
      const marker = 12

      page.drawRectangle({
        x: x - marker / 2,
        y: y - marker / 2,
        width: marker,
        height: marker,
        color,
        borderColor: rgb(0.1, 0.1, 0.1),
        borderWidth: 0.5,
      })

      if (lines.length) {
        const lineHeight = size * 1.25
        const boxWidth =
          Math.max(...lines.map((l) => font.widthOfTextAtSize(l, size))) + padding * 2
        const boxHeight = lines.length * lineHeight + padding * 2
        const boxX = x + marker
        const boxTop = y + marker / 2

        page.drawRectangle({
          x: boxX,
          y: boxTop - boxHeight,
          width: boxWidth,
          height: boxHeight,
          color: rgb(1, 0.99, 0.9),
          borderColor: color,
          borderWidth: 1,
          opacity: 0.95,
        })
        lines.forEach((line, i) => {
          page.drawText(line, {
            x: boxX + padding,
            y: boxTop - padding - size - i * lineHeight + 1,
            size,
            font,
            color: rgb(0.1, 0.1, 0.12),
          })
        })
      }
    }
  }

  return doc.save()
}
