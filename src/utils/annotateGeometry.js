/**
 * Géométrie partagée par le studio d'annotation (affichage SVG) et l'export
 * pdf-lib. Toutes les coordonnées sont en points PDF dans le repère de la
 * page affichée : origine en haut à gauche, y vers le bas, rotation propre
 * de la page déjà appliquée (viewport pdf.js à l'échelle 1).
 *
 * Les tracés sont produits en chaînes de chemin SVG : le navigateur les
 * dessine tels quels et pdf-lib (drawSvgPath) les rejoue à l'identique dans
 * le PDF, ce qui garantit un rendu exporté fidèle à l'écran.
 */

export const TEXT_PADDING = 4
export const LINE_HEIGHT = 1.2
export const BASELINE = 0.9 // position de la ligne de base dans une ligne (× taille)

export const FONT_FAMILIES = {
  helvetica: { label: 'Helvetica', css: 'Helvetica, Arial, sans-serif' },
  times: { label: 'Times', css: '"Times New Roman", Times, serif' },
  courier: { label: 'Courier', css: '"Courier New", Courier, monospace' },
}

export const STAMP_KINDS = [
  { id: 'approved', color: '#059669' },
  { id: 'confidential', color: '#dc2626' },
  { id: 'draft', color: '#52525b' },
  { id: 'urgent', color: '#ea580c' },
  { id: 'signed', color: '#2563eb' },
]

const round = (n) => Math.round(n * 100) / 100

export function rectPath(x, y, w, h) {
  return `M${round(x)} ${round(y)}H${round(x + w)}V${round(y + h)}H${round(x)}Z`
}

export function ellipsePath(x, y, w, h) {
  const rx = w / 2
  const ry = h / 2
  const cx = x + rx
  const cy = y + ry
  return `M${round(cx - rx)} ${round(cy)}A${round(rx)} ${round(ry)} 0 1 0 ${round(cx + rx)} ${round(cy)}A${round(rx)} ${round(ry)} 0 1 0 ${round(cx - rx)} ${round(cy)}Z`
}

export function polylinePath(points) {
  if (!points.length) return ''
  const [first, ...rest] = points
  // Un simple clic doit laisser un point visible : segment de longueur nulle.
  if (!rest.length) return `M${round(first[0])} ${round(first[1])}L${round(first[0] + 0.01)} ${round(first[1])}`
  return `M${round(first[0])} ${round(first[1])}${rest.map((p) => `L${round(p[0])} ${round(p[1])}`).join('')}`
}

/** Flèche : tige (s'arrêtant à la base de la pointe) + pointe triangulaire pleine. */
export function arrowPaths(x1, y1, x2, y2, width) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const headLen = Math.min(Math.max(10, width * 4), len * 0.6)
  const headHalf = headLen * 0.5
  const bx = x2 - ux * headLen
  const by = y2 - uy * headLen
  return {
    shaft: `M${round(x1)} ${round(y1)}L${round(bx + ux * 0.5)} ${round(by + uy * 0.5)}`,
    head: `M${round(x2)} ${round(y2)}L${round(bx - uy * headHalf)} ${round(by + ux * headHalf)}L${round(bx + uy * headHalf)} ${round(by - ux * headHalf)}Z`,
  }
}

const isPointsType = (obj) => obj.type === 'pen' || (obj.type === 'highlight' && obj.points)
const isLineType = (obj) => obj.type === 'line' || obj.type === 'arrow'
export const isUniformType = (obj) => obj.type === 'text' || obj.type === 'stamp' || obj.type === 'signature'
export { isLineType }

export function getBBox(obj) {
  if (isPointsType(obj)) {
    const xs = obj.points.map((p) => p[0])
    const ys = obj.points.map((p) => p[1])
    const pad = obj.width / 2
    const x = Math.min(...xs) - pad
    const y = Math.min(...ys) - pad
    return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y }
  }
  if (isLineType(obj)) {
    const x = Math.min(obj.x1, obj.x2)
    const y = Math.min(obj.y1, obj.y2)
    return { x, y, w: Math.abs(obj.x2 - obj.x1), h: Math.abs(obj.y2 - obj.y1) }
  }
  return { x: obj.x, y: obj.y, w: obj.w, h: obj.h }
}

export function translateObject(obj, dx, dy) {
  if (isPointsType(obj)) return { ...obj, points: obj.points.map(([x, y]) => [x + dx, y + dy]) }
  if (isLineType(obj)) return { ...obj, x1: obj.x1 + dx, y1: obj.y1 + dy, x2: obj.x2 + dx, y2: obj.y2 + dy }
  return { ...obj, x: obj.x + dx, y: obj.y + dy }
}

/* ---- Mesure du texte (canvas, même police CSS que l'affichage SVG) ------- */

let measureCtx = null
function measure(text, font) {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  measureCtx.font = font
  return measureCtx.measureText(text).width
}

export function stampLayout(fontSize, hasDate) {
  const padY = fontSize * 0.35
  return {
    padX: fontSize * 0.6,
    padY,
    labelBaseline: padY + fontSize * 0.88,
    dateSize: fontSize * 0.42,
    dateBaseline: padY + fontSize * 1.1 + fontSize * 0.42,
    height: padY * 2 + fontSize * 1.1 + (hasDate ? fontSize * 0.55 : 0),
    border: Math.max(1, fontSize * 0.1),
  }
}

/** Recalcule largeur/hauteur des objets dont la taille dépend du texte. */
export function withMetrics(obj) {
  if (obj.type === 'text') {
    const lines = obj.text.split('\n')
    const font = `${obj.fontSize}px ${FONT_FAMILIES[obj.fontFamily].css}`
    const width = Math.max(obj.fontSize * 0.5, ...lines.map((l) => measure(l, font)))
    return {
      ...obj,
      w: width + TEXT_PADDING * 2,
      h: lines.length * obj.fontSize * LINE_HEIGHT + TEXT_PADDING * 2,
    }
  }
  if (obj.type === 'stamp') {
    const layout = stampLayout(obj.fontSize, Boolean(obj.date))
    const labelW = measure(obj.label, `bold ${obj.fontSize}px ${FONT_FAMILIES.helvetica.css}`)
    const dateW = obj.date ? measure(obj.date, `bold ${layout.dateSize}px ${FONT_FAMILIES.helvetica.css}`) : 0
    return { ...obj, w: Math.max(labelW, dateW) + layout.padX * 2, h: layout.height }
  }
  return obj
}

/**
 * Redimensionnement par poignée. Poignées d'angle (nw, ne, sw, se) pour les
 * objets à boîte, extrémités (p1, p2) pour les lignes et flèches. Texte,
 * tampons et signatures gardent leurs proportions.
 */
export function resizeObject(orig, handle, [px, py]) {
  if (handle === 'p1') return { ...orig, x1: px, y1: py }
  if (handle === 'p2') return { ...orig, x2: px, y2: py }

  const b = getBBox(orig)
  const ax = handle.includes('w') ? b.x + b.w : b.x
  const ay = handle.includes('n') ? b.y + b.h : b.y
  const minSize = 4

  if (isUniformType(orig)) {
    const s = Math.max(0.15, Math.max(Math.abs(px - ax) / (b.w || 1), Math.abs(py - ay) / (b.h || 1)))
    let next
    if (orig.type === 'signature') next = { ...orig, w: b.w * s, h: b.h * s }
    else next = withMetrics({ ...orig, fontSize: Math.max(4, orig.fontSize * s) })
    return {
      ...next,
      x: handle.includes('w') ? ax - next.w : ax,
      y: handle.includes('n') ? ay - next.h : ay,
    }
  }

  const nx = Math.min(ax, px)
  const ny = Math.min(ay, py)
  const nw = Math.max(minSize, Math.abs(px - ax))
  const nh = Math.max(minSize, Math.abs(py - ay))

  if (isPointsType(orig)) {
    const sx = nw / (b.w || 1)
    const sy = nh / (b.h || 1)
    return {
      ...orig,
      points: orig.points.map(([x, y]) => [nx + (x - b.x) * sx, ny + (y - b.y) * sy]),
    }
  }
  return { ...orig, x: nx, y: ny, w: nw, h: nh }
}
