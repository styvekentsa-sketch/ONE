import { Document, Packer, Paragraph, PageBreak } from 'docx'
import { extractAllText } from './pdfRender'

/**
 * Convertit un PDF en document .docx éditable : extrait le texte page par
 * page (via pdf.js, cf. `extractAllText`) puis reconstruit un document Word
 * avec un saut de page entre chaque page source. Comme pour PDF → Texte,
 * la mise en page d'origine (colonnes, tableaux) n'est pas reconstruite —
 * seul le contenu textuel, dans l'ordre de lecture, est restitué.
 */
export async function convertPdfToWord(pdfBuffer) {
  const pages = await extractAllText(pdfBuffer)
  const hasText = pages.some((page) => page.trim().length > 0)

  if (!hasText) {
    throw new Error('NO_TEXT_FOUND')
  }

  const children = []

  pages.forEach((pageText, pageIndex) => {
    const lines = pageText.split('\n')
    lines.forEach((line) => {
      children.push(new Paragraph({ text: line }))
    })

    if (pageIndex < pages.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }
  })

  const doc = new Document({ sections: [{ children }] })
  return Packer.toBlob(doc)
}
