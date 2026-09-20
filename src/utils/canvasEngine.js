// Moteur de traitement d'image partagé par les outils Image avancés
// (src/pages/tools/Image*.jsx) : uniquement des API natives du navigateur
// (HTMLCanvasElement, CanvasRenderingContext2D, ImageData, Path2D) — rien
// n'est envoyé où que ce soit. Ce fichier ne contient que de la logique
// pure/réutilisable (composition des calques, réglages, sélection,
// historique) ; l'interaction souris/tactile vit dans chaque page appelante.

let layerCounter = 0

/** Crée un calque vide (transparent) ou initialisé depuis une image bitmap. */
export function createLayer({ width, height, name, image = null }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  if (image) canvas.getContext('2d').drawImage(image, 0, 0, width, height)

  layerCounter += 1
  return {
    id: `layer-${Date.now()}-${layerCounter}`,
    name,
    visible: true,
    opacity: 1,
    blendMode: 'source-over',
    locked: false,
    canvas,
    maskCanvas: null,
  }
}

/**
 * Recompose tous les calques visibles sur le contexte cible, dans l'ordre,
 * en respectant opacité, mode de fusion et masque. Le masque est appliqué
 * via la technique standard `destination-in` sur un tampon intermédiaire
 * avant d'être dessiné avec son propre mode de fusion — sans ce tampon, le
 * masque interagirait avec le fond au lieu du calque seul.
 */
export function compositeLayers(doc, targetCtx) {
  targetCtx.clearRect(0, 0, doc.width, doc.height)
  for (const layer of doc.layers) {
    if (!layer.visible || layer.opacity <= 0) continue

    targetCtx.save()
    targetCtx.globalAlpha = layer.opacity
    targetCtx.globalCompositeOperation = layer.blendMode || 'source-over'

    if (layer.maskCanvas) {
      const buffer = document.createElement('canvas')
      buffer.width = doc.width
      buffer.height = doc.height
      const bctx = buffer.getContext('2d')
      bctx.drawImage(layer.canvas, 0, 0)
      bctx.globalCompositeOperation = 'destination-in'
      bctx.drawImage(layer.maskCanvas, 0, 0)
      targetCtx.drawImage(buffer, 0, 0)
    } else {
      targetCtx.drawImage(layer.canvas, 0, 0)
    }

    targetCtx.restore()
  }
}

/** Modes de fusion réellement pris en charge nativement par Canvas2D
 * (`globalCompositeOperation`) — ce sont les mêmes noms que Photoshop pour
 * la plupart, sans approximation. */
export const BLEND_MODES = [
  { id: 'source-over', label: 'Normal' },
  { id: 'multiply', label: 'Multiplier' },
  { id: 'screen', label: 'Écran' },
  { id: 'overlay', label: 'Incrustation' },
  { id: 'darken', label: 'Obscurcir' },
  { id: 'lighten', label: 'Éclaircir' },
  { id: 'color-dodge', label: 'Densité couleur -' },
  { id: 'color-burn', label: 'Densité couleur +' },
  { id: 'hard-light', label: 'Lumière crue' },
  { id: 'soft-light', label: 'Lumière tamisée' },
  { id: 'difference', label: 'Différence' },
  { id: 'exclusion', label: 'Exclusion' },
  { id: 'hue', label: 'Teinte' },
  { id: 'saturation', label: 'Saturation' },
  { id: 'color', label: 'Couleur' },
  { id: 'luminosity', label: 'Luminosité' },
]

/** Chaîne CSS `filter` équivalente aux réglages de base — appliquée en
 * direct pendant l'aperçu (non destructif tant que l'utilisateur n'a pas
 * validé), puis gravée dans les pixels du calque à la validation. */
export function buildCssFilter({ brightness = 100, contrast = 100, saturate = 100, hueRotate = 0, blur = 0 }) {
  return `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%) hue-rotate(${hueRotate}deg) blur(${blur}px)`
}

/** Dessine `sourceCanvas` sur `targetCanvas` en appliquant un filtre CSS —
 * sert à graver un aperçu de réglages dans les pixels réels d'un calque. */
export function bakeFilter(sourceCanvas, targetCanvas, filterString) {
  const ctx = targetCanvas.getContext('2d')
  ctx.clearRect(0, 0, targetCanvas.width, targetCanvas.height)
  ctx.filter = filterString
  ctx.drawImage(sourceCanvas, 0, 0)
  ctx.filter = 'none'
}

/**
 * Netteté (unsharp mask) via un noyau de convolution 3x3 — `ctx.filter` ne
 * propose pas de netteté native, contrairement au flou.
 */
export function sharpenImageData(imageData, amount = 0.5) {
  const { width, height, data } = imageData
  const src = new Uint8ClampedArray(data)
  const center = 1 + 4 * amount
  const side = -amount
  const kernel = [0, side, 0, side, center, side, 0, side, 0]

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0
        let k = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c
            sum += src[idx] * kernel[k]
            k++
          }
        }
        data[(y * width + x) * 4 + c] = sum
      }
    }
  }
  return imageData
}

/** Courbes simplifiées : interpolation par un polynôme du second degré
 * passant par (0, shadows), (128, midtones), (255, highlights) — une vraie
 * courbe à points de contrôle multiples serait un éditeur à part entière,
 * hors de portée ici ; ceci reste un réglage tonal réel, juste simplifié. */
export function buildSimplifiedCurveLUT({ shadows = 0, midtones = 128, highlights = 255 }) {
  const lut = new Uint8ClampedArray(256)
  // Résolution du polynôme y = a*x^2 + b*x + c passant par les 3 points.
  const x0 = 0, x1 = 128, x2 = 255
  const y0 = shadows, y1 = midtones, y2 = highlights
  const denom = (x0 - x1) * (x0 - x2) * (x1 - x2)
  const a = (x2 * (y1 - y0) + x1 * (y0 - y2) + x0 * (y2 - y1)) / denom
  const b = (x2 * x2 * (y0 - y1) + x1 * x1 * (y2 - y0) + x0 * x0 * (y1 - y2)) / denom
  const c = (x1 * x2 * (x1 - x2) * y0 + x2 * x0 * (x2 - x0) * y1 + x0 * x1 * (x0 - x1) * y2) / denom
  for (let i = 0; i < 256; i++) {
    lut[i] = a * i * i + b * i + c
  }
  return lut
}

export function applyLUT(imageData, lut, channels = [0, 1, 2]) {
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    for (const c of channels) data[i + c] = lut[data[i + c]]
  }
  return imageData
}

/** Niveaux : remappe [inputMin, inputMax] (+ gamma) vers [outputMin, outputMax]. */
export function buildLevelsLUT({ inputMin = 0, inputMax = 255, gamma = 1, outputMin = 0, outputMax = 255 }) {
  const lut = new Uint8ClampedArray(256)
  const range = Math.max(1, inputMax - inputMin)
  for (let i = 0; i < 256; i++) {
    let v = (i - inputMin) / range
    v = Math.max(0, Math.min(1, v))
    v = Math.pow(v, 1 / gamma)
    lut[i] = outputMin + v * (outputMax - outputMin)
  }
  return lut
}

/** Balance des couleurs simplifiée : décalage additif par canal (pas de
 * séparation ombres/tons moyens/hautes lumières comme dans Photoshop). */
export function applyChannelOffsets(imageData, { r = 0, g = 0, b = 0 }) {
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    data[i] += r
    data[i + 1] += g
    data[i + 2] += b
  }
  return imageData
}

/** Mappage dégradé : remplace chaque pixel par la couleur du dégradé
 * échantillonnée à sa luminance. */
export function applyGradientMap(imageData, stops) {
  const lutCanvas = document.createElement('canvas')
  lutCanvas.width = 256
  lutCanvas.height = 1
  const lutCtx = lutCanvas.getContext('2d')
  const gradient = lutCtx.createLinearGradient(0, 0, 256, 0)
  stops.forEach(({ offset, color }) => gradient.addColorStop(offset, color))
  lutCtx.fillStyle = gradient
  lutCtx.fillRect(0, 0, 256, 1)
  const lut = lutCtx.getImageData(0, 0, 256, 1).data

  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const luminance = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
    const lutIndex = luminance * 4
    data[i] = lut[lutIndex]
    data[i + 1] = lut[lutIndex + 1]
    data[i + 2] = lut[lutIndex + 2]
  }
  return imageData
}

/** Correction simplifiée des yeux rouges : dans la zone donnée, atténue les
 * pixels où le rouge domine nettement le vert et le bleu. */
export function applyRedEyeReduction(imageData) {
  const { data } = imageData
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
    if (r > 90 && r > g * 1.4 && r > b * 1.4) {
      const gray = (g + b) / 2
      data[i] = gray * 0.6
    }
  }
  return imageData
}

/**
 * Baguette magique / graine de sélection rapide : remplissage par
 * propagation (BFS) sur les pixels connectés dont la couleur reste dans la
 * tolérance de la couleur de départ. Renvoie un masque (0/255) de la
 * taille de l'image.
 */
export function floodFillMask(imageData, startX, startY, tolerance = 32) {
  const { width, height, data } = imageData
  const mask = new Uint8ClampedArray(width * height)
  const startIdx = (startY * width + startX) * 4
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return mask

  const sr = data[startIdx]
  const sg = data[startIdx + 1]
  const sb = data[startIdx + 2]
  const tol2 = tolerance * tolerance * 3

  const visited = new Uint8Array(width * height)
  const stack = [[startX, startY]]
  visited[startY * width + startX] = 1

  while (stack.length) {
    const [x, y] = stack.pop()
    const idx = (y * width + x) * 4
    const dr = data[idx] - sr
    const dg = data[idx + 1] - sg
    const db = data[idx + 2] - sb
    if (dr * dr + dg * dg + db * db > tol2) continue

    mask[y * width + x] = 255

    const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
      const nPos = ny * width + nx
      if (visited[nPos]) continue
      visited[nPos] = 1
      stack.push([nx, ny])
    }
  }
  return mask
}

/** Construit un masque (0/255) à partir d'un tracé (lasso/polygone) en
 * remplissant le Path2D sur un canvas tampon. */
export function maskFromPath(path, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fill(path)

  const { data } = ctx.getImageData(0, 0, width, height)
  const mask = new Uint8ClampedArray(width * height)
  for (let i = 0; i < mask.length; i++) {
    mask[i] = data[i * 4 + 3] // canal alpha : 255 = à l'intérieur du tracé, 0 = à l'extérieur
  }
  return mask
}

/** Exporte un canvas en Blob (PNG/JPEG/WebP) avec contrôle de qualité —
 * même approche que le Hub Image simple (`imageWorker.js`). */
export function exportCanvasToBlob(canvas, format = 'png', quality = 0.92) {
  const mime = format === 'jpeg' || format === 'jpg' ? 'image/jpeg' : format === 'webp' ? 'image/webp' : 'image/png'
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('EXPORT_FAILED'))), mime, format === 'png' ? undefined : quality)
  })
}
