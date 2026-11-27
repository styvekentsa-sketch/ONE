import {
  BlendMode,
  LineCapStyle,
  LineJoinStyle,
  PDFDocument,
  StandardFonts,
  concatTransformationMatrix,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setLineJoin,
} from 'pdf-lib'
import {
  BASELINE,
  LINE_HEIGHT,
  TEXT_PADDING,
  arrowPaths,
  ellipsePath,
  polylinePath,
  rectPath,
  stampLayout,
} from './annotateGeometry'

const PDF_FONTS = {
  helvetica: StandardFonts.Helvetica,
  times: StandardFonts.TimesRoman,
  courier: StandardFonts.Courier,
  stamp: StandardFonts.HelveticaBold,
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

/** Composition affine : applique m1 puis m2 (convention des matrices PDF). */
function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1
  const [a2, b2, c2, d2, e2, f2] = m2
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ]
}

function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Remplace les caractères que la police standard (WinAnsi) ne sait pas encoder. */
function sanitize(font, text) {
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

/**
 * Applique les annotations sur le PDF d'origine.
 *
 * `pages[i]` = { w, h, transform } : dimensions et matrice du viewport pdf.js
 * (échelle 1) de la page i. Pour chaque page annotée, on installe une
 * matrice qui ramène le repère « page affichée, y vers le haut » vers
 * l'espace utilisateur PDF : rotation /Rotate et décalage de la CropBox sont
 * ainsi pris en charge une fois pour toutes, et chaque objet se dessine avec
 * les primitives standard de pdf-lib.
 */
export async function exportAnnotatedPdf(originalBytes, pages, objects) {
  const doc = await PDFDocument.load(originalBytes, { ignoreEncryption: true })
  const fontCache = new Map()
  const getFont = async (key) => {
    if (!fontCache.has(key)) fontCache.set(key, await doc.embedFont(PDF_FONTS[key]))
    return fontCache.get(key)
  }
  const imageCache = new Map()
  const getImage = async (dataUrl) => {
    if (!imageCache.has(dataUrl)) imageCache.set(dataUrl, await doc.embedPng(dataUrlToBytes(dataUrl)))
    return imageCache.get(dataUrl)
  }

  const byPage = new Map()
  for (const obj of objects) {
    if (!byPage.has(obj.page)) byPage.set(obj.page, [])
    byPage.get(obj.page).push(obj)
  }

  for (const [pageNumber, list] of byPage) {
    const page = doc.getPage(pageNumber - 1)
    const { h: H, transform } = pages[pageNumber - 1]
    const flip = [1, 0, 0, -1, 0, H]
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...multiply(flip, invert(transform))),
      setLineJoin(LineJoinStyle.Round),
    )

    // Chemins SVG exprimés en repère « y vers le bas » : drawSvgPath les
    // retourne lui-même autour de y = H.
    const path = (d, options) => page.drawSvgPath(d, { x: 0, y: H, ...options })

    for (const obj of list) {
      switch (obj.type) {
        case 'rect':
        case 'ellipse': {
          const d = obj.type === 'rect' ? rectPath(obj.x, obj.y, obj.w, obj.h) : ellipsePath(obj.x, obj.y, obj.w, obj.h)
          path(d, {
            ...(obj.fill ? { color: hexToRgb(obj.fill), opacity: obj.fillOpacity ?? 1 } : {}),
            borderColor: hexToRgb(obj.stroke),
            borderWidth: obj.width,
          })
          break
        }
        case 'line':
          path(`M${obj.x1} ${obj.y1}L${obj.x2} ${obj.y2}`, {
            borderColor: hexToRgb(obj.stroke),
            borderWidth: obj.width,
            borderLineCap: LineCapStyle.Round,
          })
          break
        case 'arrow': {
          const { shaft, head } = arrowPaths(obj.x1, obj.y1, obj.x2, obj.y2, obj.width)
          path(shaft, { borderColor: hexToRgb(obj.stroke), borderWidth: obj.width, borderLineCap: LineCapStyle.Round })
          path(head, { color: hexToRgb(obj.stroke), borderColor: hexToRgb(obj.stroke), borderWidth: obj.width * 0.5 })
          break
        }
        case 'pen':
          path(polylinePath(obj.points), {
            borderColor: hexToRgb(obj.color),
            borderWidth: obj.width,
            borderLineCap: LineCapStyle.Round,
          })
          break
        case 'highlight':
          if (obj.points) {
            path(polylinePath(obj.points), {
              borderColor: hexToRgb(obj.color),
              borderWidth: obj.width,
              borderOpacity: obj.opacity,
              borderLineCap: LineCapStyle.Round,
              blendMode: BlendMode.Multiply,
            })
          } else {
            path(rectPath(obj.x, obj.y, obj.w, obj.h), {
              color: hexToRgb(obj.color),
              opacity: obj.opacity,
              blendMode: BlendMode.Multiply,
            })
          }
          break
        case 'text': {
          const font = await getFont(obj.fontFamily)
          if (obj.background) {
            path(rectPath(obj.x, obj.y, obj.w, obj.h), { color: hexToRgb(obj.background) })
          }
          obj.text.split('\n').forEach((line, i) => {
            if (!line) return
            const baseline = obj.y + TEXT_PADDING + i * obj.fontSize * LINE_HEIGHT + obj.fontSize * BASELINE
            page.drawText(sanitize(font, line), {
              x: obj.x + TEXT_PADDING,
              y: H - baseline,
              size: obj.fontSize,
              font,
              color: hexToRgb(obj.color),
            })
          })
          break
        }
        case 'stamp': {
          const font = await getFont('stamp')
          const layout = stampLayout(obj.fontSize, Boolean(obj.date))
          const color = hexToRgb(obj.color)
          const inset = layout.border / 2
          path(rectPath(obj.x + inset, obj.y + inset, obj.w - layout.border, obj.h - layout.border), {
            borderColor: color,
            borderWidth: layout.border,
            borderOpacity: 0.9,
          })
          const label = sanitize(font, obj.label)
          page.drawText(label, {
            x: obj.x + obj.w / 2 - font.widthOfTextAtSize(label, obj.fontSize) / 2,
            y: H - (obj.y + layout.labelBaseline),
            size: obj.fontSize,
            font,
            color,
            opacity: 0.9,
          })
          if (obj.date) {
            const date = sanitize(font, obj.date)
            page.drawText(date, {
              x: obj.x + obj.w / 2 - font.widthOfTextAtSize(date, layout.dateSize) / 2,
              y: H - (obj.y + layout.dateBaseline),
              size: layout.dateSize,
              font,
              color,
              opacity: 0.9,
            })
          }
          break
        }
        case 'signature': {
          const image = await getImage(obj.dataUrl)
          page.drawImage(image, { x: obj.x, y: H - (obj.y + obj.h), width: obj.w, height: obj.h })
          break
        }
        default:
          break
      }
    }

    page.pushOperators(popGraphicsState())
  }

  return doc.save()
}
