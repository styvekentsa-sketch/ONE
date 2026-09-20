const MIME_BY_FORMAT = {
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

/** Devine le format "natif" d'un fichier pour préserver son type par défaut
 * dans les outils qui ne changent pas explicitement de format (conversion/
 * redimensionnement — pas la compression, qui a sa propre logique). */
function guessFormat(file) {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpeg'
}

function bitmapToCanvas(bitmap, width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  return canvas
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('CANVAS_EXPORT_FAILED'))),
      mime,
      quality,
    )
  })
}

/**
 * Compresse une image. Deux corrections par rapport à une simple ré-encodage
 * "au format d'origine, qualité X" :
 *
 * 1. Le PNG est un format SANS PERTE : `canvas.toBlob` ignore le paramètre
 *    de qualité pour ce format (limite native de l'API Canvas, pas un bug
 *    de ce code) — le réencoder en PNG ne réduit donc quasiment jamais son
 *    poids. On convertit automatiquement les PNG vers WebP (qui supporte la
 *    transparence, contrairement au JPEG, et compresse nettement mieux
 *    qu'un PNG relancé tel quel) sauf si l'appelant impose explicitement un
 *    `format`.
 * 2. La résolution est le levier principal du poids d'une image : à qualité
 *    égale, diviser chaque dimension par deux divise le nombre de pixels
 *    (donc le poids) par quatre. `maxDimension` (limite la plus grande
 *    dimension) et `scalePercent` (pourcentage direct, ex: 75/50) sont tous
 *    deux pris en charge et se combinent si les deux sont fournis.
 *
 * Garde-fou : si le résultat final est plus lourd que l'original (arrive
 * surtout sur de petites images déjà très compressées), la fonction renvoie
 * l'image d'origine inchangée plutôt qu'un "gain" négatif.
 */
export async function compressImage(file, { quality = 0.75, maxDimension = null, scalePercent = null, format = 'auto' } = {}) {
  const bitmap = await createImageBitmap(file)

  const sourceFormat = guessFormat(file)
  const targetFormat = format === 'auto' ? (sourceFormat === 'png' ? 'webp' : sourceFormat) : format
  const mime = MIME_BY_FORMAT[targetFormat]
  const qualityApplies = targetFormat !== 'png'

  let targetWidth = bitmap.width
  let targetHeight = bitmap.height
  if (scalePercent && scalePercent < 100) {
    targetWidth = Math.max(1, Math.round((bitmap.width * scalePercent) / 100))
    targetHeight = Math.max(1, Math.round((bitmap.height * scalePercent) / 100))
  }
  if (maxDimension) {
    const scale = Math.min(1, maxDimension / Math.max(targetWidth, targetHeight))
    targetWidth = Math.max(1, Math.round(targetWidth * scale))
    targetHeight = Math.max(1, Math.round(targetHeight * scale))
  }

  const canvas = bitmapToCanvas(bitmap, targetWidth, targetHeight)
  const blob = await canvasToBlob(canvas, mime, qualityApplies ? quality : undefined)

  // Garde-fou : ne jamais renvoyer un fichier plus lourd que l'original.
  if (blob.size >= file.size) {
    return {
      blob: file,
      format: sourceFormat,
      qualityApplies,
      width: bitmap.width,
      height: bitmap.height,
      originalSize: file.size,
      compressedSize: file.size,
      keptOriginal: true,
    }
  }

  return {
    blob,
    format: targetFormat,
    qualityApplies,
    width: targetWidth,
    height: targetHeight,
    originalSize: file.size,
    compressedSize: blob.size,
    keptOriginal: false,
  }
}

/** Compresse selon un palier prédéfini (voir data/imageCompressionLevels.js). */
export async function compressImageWithLevel(file, level, overrides = {}) {
  return compressImage(file, {
    quality: level.quality,
    maxDimension: level.maxDimension,
    ...overrides,
  })
}

/** Convertit une image vers un autre format (jpeg/png/webp), dimensions inchangées. */
export async function convertImageFormat(file, targetFormat, quality = 0.92) {
  const mime = MIME_BY_FORMAT[targetFormat]
  if (!mime) throw new Error('UNSUPPORTED_FORMAT')

  const bitmap = await createImageBitmap(file)
  const canvas = bitmapToCanvas(bitmap, bitmap.width, bitmap.height)
  const blob = await canvasToBlob(canvas, mime, targetFormat === 'png' ? undefined : quality)

  return { blob, format: targetFormat, width: bitmap.width, height: bitmap.height }
}

/**
 * Redimensionne une image. Fournir soit `percentage` (1-100, appliqué aux
 * deux dimensions), soit `width` et/ou `height` en pixels. Quand une seule
 * dimension est donnée et `maintainAspectRatio` est vrai (par défaut),
 * l'autre est recalculée depuis le ratio source.
 */
export async function resizeImage(
  file,
  { width, height, percentage, maintainAspectRatio = true, quality = 0.92 } = {},
) {
  const bitmap = await createImageBitmap(file)
  const ratio = bitmap.width / bitmap.height

  let targetWidth
  let targetHeight

  if (percentage) {
    targetWidth = Math.max(1, Math.round((bitmap.width * percentage) / 100))
    targetHeight = Math.max(1, Math.round((bitmap.height * percentage) / 100))
  } else if (width && height && !maintainAspectRatio) {
    targetWidth = Math.round(width)
    targetHeight = Math.round(height)
  } else if (width) {
    targetWidth = Math.round(width)
    targetHeight = Math.round(maintainAspectRatio ? width / ratio : height || width / ratio)
  } else if (height) {
    targetHeight = Math.round(height)
    targetWidth = Math.round(maintainAspectRatio ? height * ratio : width || height * ratio)
  } else {
    throw new Error('DIMENSIONS_REQUIRED')
  }

  targetWidth = Math.max(1, targetWidth)
  targetHeight = Math.max(1, targetHeight)

  const format = guessFormat(file)
  const mime = MIME_BY_FORMAT[format]
  const canvas = bitmapToCanvas(bitmap, targetWidth, targetHeight)
  const blob = await canvasToBlob(canvas, mime, format === 'png' ? undefined : quality)

  return { blob, format, width: targetWidth, height: targetHeight }
}
