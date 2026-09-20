import { createWorker } from 'tesseract.js'
import { loadPdfDocument, renderPageToCanvas } from './pdfRender'

const LANG_MAP = { fr: 'fra', en: 'eng', es: 'spa' }

/** Traduit la langue d'interface (fr/en/es) vers le code de langue Tesseract. */
export function mapUiLangToTesseract(uiLang) {
  return LANG_MAP[uiLang] || 'eng'
}

/**
 * Applique une reconnaissance de caractères (OCR) page par page sur un PDF
 * scanné : chaque page est d'abord rendue en image (via pdf.js, à une
 * échelle x2 pour la netteté) puis passée à Tesseract.js, qui exécute la
 * reconnaissance entièrement dans le navigateur (WebAssembly). Seul le
 * modèle de langue (quelques Mo, mis en cache par le navigateur après le
 * premier usage) est téléchargé une fois : le contenu du document, lui,
 * n'est jamais envoyé où que ce soit.
 */
export async function ocrPdf(pdfBuffer, { lang = 'eng', onProgress } = {}) {
  const pdfDoc = await loadPdfDocument(pdfBuffer)
  const worker = await createWorker(lang)
  const pages = []

  try {
    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const canvas = await renderPageToCanvas(pdfDoc, i, 2)
      const { data } = await worker.recognize(canvas)
      pages.push(data.text.trim())
      onProgress?.(i, pdfDoc.numPages)
    }
  } finally {
    await worker.terminate()
  }

  return pages
}
