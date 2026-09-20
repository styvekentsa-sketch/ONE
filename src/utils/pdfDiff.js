import { loadPdfDocument, renderPageToCanvas } from './pdfRender'

/**
 * Compare deux pages déjà rendues sur <canvas> pixel par pixel. Les canvases
 * peuvent avoir des dimensions légèrement différentes (mise en page qui a
 * bougé) : on compare sur la zone commune et on compte le reste comme du
 * contenu supplémentaire, différence garantie.
 */
export function diffCanvases(canvasA, canvasB, tolerance = 24) {
  const width = Math.max(canvasA.width, canvasB.width)
  const height = Math.max(canvasA.height, canvasB.height)
  const commonWidth = Math.min(canvasA.width, canvasB.width)
  const commonHeight = Math.min(canvasA.height, canvasB.height)

  const ctxA = canvasA.getContext('2d')
  const ctxB = canvasB.getContext('2d')
  const dataA = ctxA.getImageData(0, 0, commonWidth, commonHeight).data
  const dataB = ctxB.getImageData(0, 0, commonWidth, commonHeight).data

  let diffPixels = 0
  for (let i = 0; i < dataA.length; i += 4) {
    const dr = Math.abs(dataA[i] - dataB[i])
    const dg = Math.abs(dataA[i + 1] - dataB[i + 1])
    const db = Math.abs(dataA[i + 2] - dataB[i + 2])
    if (dr + dg + db > tolerance) diffPixels++
  }

  const sizeMismatchPixels = width * height - commonWidth * commonHeight
  const totalDiff = diffPixels + sizeMismatchPixels
  const totalPixels = width * height
  const diffRatio = totalPixels === 0 ? 0 : totalDiff / totalPixels

  return {
    diffRatio,
    isDifferent: diffRatio > 0.001,
  }
}

/**
 * Rendu + comparaison page par page de deux PDF, entièrement en local
 * (pdf.js pour le rendu, comparaison pixel en canvas). Les documents de
 * longueurs différentes sont comparés jusqu'à la plus longue : les pages
 * en trop sont automatiquement comptées comme des différences.
 */
export async function comparePdfs(bufferA, bufferB, scale = 1.1) {
  const [docA, docB] = await Promise.all([loadPdfDocument(bufferA), loadPdfDocument(bufferB)])
  const pageCountA = docA.numPages
  const pageCountB = docB.numPages
  const maxPages = Math.max(pageCountA, pageCountB)

  const pairs = []
  let diffCount = 0

  for (let i = 0; i < maxPages; i++) {
    const pageNumber = i + 1
    const canvasA = pageNumber <= pageCountA ? await renderPageToCanvas(docA, pageNumber, scale) : null
    const canvasB = pageNumber <= pageCountB ? await renderPageToCanvas(docB, pageNumber, scale) : null

    let isDifferent = true
    if (canvasA && canvasB) {
      isDifferent = diffCanvases(canvasA, canvasB).isDifferent
    }
    if (isDifferent) diffCount++

    pairs.push({
      pageNumber,
      imageA: canvasA?.toDataURL('image/png') ?? null,
      imageB: canvasB?.toDataURL('image/png') ?? null,
      isDifferent,
    })
  }

  return { pageCountA, pageCountB, diffCount, pairs }
}
