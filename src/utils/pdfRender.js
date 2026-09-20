import * as pdfjsLib from 'pdfjs-dist'
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

/**
 * Charge un PDF avec pdf.js pour la lecture (extraction de texte, rendu).
 * pdf.js peut transférer/consommer le buffer qu'on lui donne : on lui passe
 * toujours une copie indépendante pour ne jamais impacter un éventuel usage
 * en parallèle du même fichier par pdf-lib (ex: l'outil de censure).
 */
export async function loadPdfDocument(pdfBuffer) {
  const copy = new Uint8Array(pdfBuffer).slice()
  const loadingTask = pdfjsLib.getDocument({ data: copy })
  return loadingTask.promise
}

/**
 * Texte d'une page avec la position brute de chaque fragment (repère PDF,
 * origine en bas à gauche, échelle 1) — directement compatible avec les
 * coordonnées utilisées par pdf-lib pour dessiner sur la même page.
 */
export async function extractPageTextItems(pdfDoc, pageNumber) {
  const page = await pdfDoc.getPage(pageNumber)
  const textContent = await page.getTextContent()
  return textContent.items.filter((item) => item.str && item.str.trim().length > 0)
}

/** Rendu d'une page en <canvas>, pour l'aperçu visuel (comparateur, signature). */
export async function renderPageToCanvas(pdfDoc, pageNumber, scale = 1.1) {
  const page = await pdfDoc.getPage(pageNumber)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height

  const context = canvas.getContext('2d')
  await page.render({ canvasContext: context, viewport }).promise

  return canvas
}

/**
 * Texte brut de tout le document, page par page. Reconstruit des sauts de
 * ligne à partir de la position verticale de chaque fragment (heuristique
 * simple : un écart de coordonnée Y notable = nouvelle ligne) — ce n'est
 * pas une reconstruction fidèle de mise en page complexe (colonnes,
 * tableaux), mais un résultat lisible pour un usage courant.
 */
export async function extractAllText(pdfBuffer) {
  const pdfDoc = await loadPdfDocument(pdfBuffer)
  const pages = []

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const items = await extractPageTextItems(pdfDoc, i)
    let pageText = ''
    let lastY = null

    for (const item of items) {
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        pageText += '\n'
      } else if (pageText && !pageText.endsWith('\n')) {
        pageText += ' '
      }
      pageText += item.str
      lastY = y
    }

    pages.push(pageText.trim())
  }

  return pages
}
