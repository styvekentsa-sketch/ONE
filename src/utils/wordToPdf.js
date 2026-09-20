import mammoth from 'mammoth'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE = { width: 595.28, height: 841.89 } // A4 portrait, en points
const MARGIN = 56
const LINE_GAP = 1.35

const BLOCK_STYLES = {
  h1: { size: 22, bold: true, spaceBefore: 18, spaceAfter: 10 },
  h2: { size: 18, bold: true, spaceBefore: 16, spaceAfter: 8 },
  h3: { size: 15, bold: true, spaceBefore: 14, spaceAfter: 6 },
  h4: { size: 13, bold: true, spaceBefore: 12, spaceAfter: 6 },
  h5: { size: 12, bold: true, spaceBefore: 10, spaceAfter: 4 },
  h6: { size: 11, bold: true, spaceBefore: 10, spaceAfter: 4 },
  p: { size: 11, bold: false, spaceBefore: 0, spaceAfter: 8 },
  li: { size: 11, bold: false, spaceBefore: 0, spaceAfter: 4, indent: 16 },
  blockquote: { size: 11, bold: false, spaceBefore: 4, spaceAfter: 8, indent: 16 },
}

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * Convertit le HTML produit par mammoth en une liste de blocs (titre,
 * paragraphe, item de liste, ligne de tableau aplatie) avec leur texte brut
 * uniquement — la mise en forme fine (gras localisé, tableaux réels, images)
 * n'est pas reconstruite : mammoth restitue surtout la structure logique du
 * document, pas sa mise en page exacte, donc reproduire un rendu pixel-perfect
 * serait trompeur. On préserve honnêtement ce que l'on sait reproduire : la
 * hiérarchie des titres, les paragraphes et les listes, dans l'ordre.
 */
function extractBlocks(html) {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const blocks = []

  const pushText = (tag, rawText) => {
    const text = rawText.replace(/\s+/g, ' ').trim()
    if (text) blocks.push({ tag, text })
  }

  const walk = (el) => {
    for (const node of Array.from(el.children)) {
      const tag = node.tagName.toLowerCase()

      if (HEADING_TAGS.has(tag)) {
        pushText(tag, node.textContent)
      } else if (tag === 'p' || tag === 'blockquote') {
        pushText(tag, node.textContent)
      } else if (tag === 'ul' || tag === 'ol') {
        for (const li of Array.from(node.children)) {
          pushText('li', `•  ${li.textContent}`)
        }
      } else if (tag === 'table') {
        for (const row of node.querySelectorAll('tr')) {
          const cells = Array.from(row.querySelectorAll('td,th')).map((c) => c.textContent.trim())
          pushText('p', cells.join('   |   '))
        }
      } else {
        walk(node)
      }
    }
  }

  walk(parsed.body)
  return blocks
}

function wrapLines(text, font, size, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let current = ''

  for (const word of words) {
    const attempt = current ? `${current} ${word}` : word
    if (current && font.widthOfTextAtSize(attempt, size) > maxWidth) {
      lines.push(current)
      current = word
    } else {
      current = attempt
    }
  }
  if (current) lines.push(current)
  return lines
}

/**
 * Convertit un fichier .docx en PDF : extraction de la structure via
 * mammoth, puis mise en page du texte (retour à la ligne automatique,
 * pagination) directement avec pdf-lib. Le texte reste sélectionnable dans
 * le PDF final (contrairement à une capture d'écran rasterisée).
 */
export async function convertWordToPdf(docxFile) {
  const arrayBuffer = await docxFile.arrayBuffer()
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer })
  const blocks = extractBlocks(html)

  if (blocks.length === 0) {
    throw new Error('EMPTY_DOCUMENT')
  }

  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const maxWidth = PAGE.width - MARGIN * 2

  let page = pdfDoc.addPage([PAGE.width, PAGE.height])
  let y = PAGE.height - MARGIN

  const newPage = () => {
    page = pdfDoc.addPage([PAGE.width, PAGE.height])
    y = PAGE.height - MARGIN
  }

  for (const block of blocks) {
    const style = BLOCK_STYLES[block.tag] || BLOCK_STYLES.p
    const font = style.bold ? bold : regular
    const indent = style.indent || 0
    const lineHeight = style.size * LINE_GAP
    const lines = wrapLines(block.text, font, style.size, maxWidth - indent)

    if (y - style.spaceBefore - lineHeight < MARGIN) newPage()
    else y -= style.spaceBefore

    for (const line of lines) {
      if (y - lineHeight < MARGIN) newPage()
      page.drawText(line, { x: MARGIN + indent, y, size: style.size, font, color: rgb(0.1, 0.1, 0.1) })
      y -= lineHeight
    }
    y -= style.spaceAfter
  }

  return pdfDoc.save({ useObjectStreams: true })
}
