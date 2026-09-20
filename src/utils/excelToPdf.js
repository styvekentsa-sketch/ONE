import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const PAGE = { width: 841.89, height: 595.28 } // A4 paysage : plus adapté aux tableaux larges
const MARGIN = 30
const FONT_SIZE = 8
const ROW_HEIGHT = 16
const MAX_COLS = 10 // au-delà, les colonnes en trop sont tronquées (limite honnête, signalée à l'utilisateur)

function truncateToWidth(text, font, size, maxWidth) {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let truncated = text
  while (truncated.length > 1 && font.widthOfTextAtSize(`${truncated}…`, size) > maxWidth) {
    truncated = truncated.slice(0, -1)
  }
  return `${truncated}…`
}

/**
 * Convertit un classeur (xlsx/xls/csv) en PDF : chaque feuille devient une
 * ou plusieurs pages, ses lignes/colonnes dessinées comme un tableau simple
 * (texte tronqué par cellule, ligne de séparation). Limite honnête : au-delà
 * de MAX_COLS colonnes ou pour des feuilles avec mise en forme avancée
 * (fusions, formules calculées non résolues), seul le contenu texte brut des
 * premières colonnes est restitué — pas une reproduction pixel-perfect.
 */
export async function convertExcelToPdf(file) {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('EMPTY_WORKBOOK')
  }

  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  let truncatedColumns = false
  let sheetsRendered = 0

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
    if (rows.length === 0) continue

    const totalCols = Math.max(...rows.map((r) => r.length))
    if (totalCols === 0) continue
    const colCount = Math.min(MAX_COLS, totalCols)
    if (totalCols > MAX_COLS) truncatedColumns = true

    const usableWidth = PAGE.width - MARGIN * 2
    const colWidth = usableWidth / colCount

    let page = pdfDoc.addPage([PAGE.width, PAGE.height])
    let y = PAGE.height - MARGIN
    sheetsRendered++

    page.drawText(sheetName, { x: MARGIN, y, size: 13, font: boldFont, color: rgb(0.1, 0.1, 0.1) })
    y -= 26

    rows.forEach((row, rowIndex) => {
      if (y - ROW_HEIGHT < MARGIN) {
        page = pdfDoc.addPage([PAGE.width, PAGE.height])
        y = PAGE.height - MARGIN
      }

      const rowFont = rowIndex === 0 ? boldFont : font

      for (let c = 0; c < colCount; c++) {
        const raw = row[c]
        const text = raw === undefined || raw === null ? '' : String(raw)
        if (!text) continue
        const truncated = truncateToWidth(text, rowFont, FONT_SIZE, colWidth - 6)
        page.drawText(truncated, {
          x: MARGIN + c * colWidth + 3,
          y: y - FONT_SIZE,
          size: FONT_SIZE,
          font: rowFont,
          color: rgb(0.15, 0.15, 0.15),
        })
      }

      page.drawLine({
        start: { x: MARGIN, y: y - ROW_HEIGHT + 4 },
        end: { x: MARGIN + colWidth * colCount, y: y - ROW_HEIGHT + 4 },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.85),
      })

      y -= ROW_HEIGHT
    })
  }

  if (sheetsRendered === 0) {
    throw new Error('EMPTY_WORKBOOK')
  }

  const bytes = await pdfDoc.save({ useObjectStreams: true })
  return { bytes, truncatedColumns }
}
