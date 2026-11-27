import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream } from 'pdf-lib'
import { loadPdfDocument, destroyPdfDocument } from './pdfRender'
import { QPDF_PATHS, runQpdfLogged } from './qpdf'

/**
 * Réparation de PDF endommagés, 100 % locale.
 *
 * Constat de départ (testé) : le build qpdf-wasm du projet corrige les
 * défauts légers (octets parasites avant l'en-tête, %%EOF manquant) mais
 * abandonne dès que la table de références croisées est fausse ou absente,
 * sans tenter de la reconstruire ; pdf.js et pdf-lib, eux, échouent sur un
 * fichier tronqué au milieu d'un objet. D'où une étape maison :
 * `rebuildContainer` relit les octets bruts, ne garde que les objets
 * complets et réécrit un conteneur propre (nouvelle table XREF, catalogue
 * retrouvé ou recréé). Les trois modes s'appuient dessus en secours.
 */

const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes)
const encode = (text) => new TextEncoder().encode(text)
const N = (name) => PDFName.of(name)

function concat(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}

/* -------------------------------------------------------------------------- */
/* Lecture bas niveau                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Objets indirects complets trouvés dans les octets bruts. Les flux sont
 * suivis jusqu'à « endstream » pour ne pas confondre un « endobj » contenu
 * dans des données binaires. Une définition tardive (mise à jour
 * incrémentale) remplace la précédente.
 */
export function scanObjects(bytes) {
  const text = latin1(bytes)
  const objects = new Map()
  let truncated = 0
  const re = /(\d+)\s+(\d+)\s+obj\b/g
  let match
  while ((match = re.exec(text))) {
    const start = match.index
    const bodyStart = re.lastIndex
    let end = text.indexOf('endobj', bodyStart)
    const streamAt = text.indexOf('stream', bodyStart)
    if (streamAt !== -1 && (end === -1 || streamAt < end) && /^\s*\r?\n/.test(text.slice(streamAt + 6, streamAt + 8))) {
      const endStream = text.indexOf('endstream', streamAt + 6)
      end = endStream === -1 ? -1 : text.indexOf('endobj', endStream)
    }
    if (end === -1) {
      truncated += 1
      break
    }
    end += 6
    const body = text.slice(bodyStart, end - 6)
    objects.set(Number(match[1]), { gen: Number(match[2]), start, end, body })
    re.lastIndex = end
  }
  return { objects, truncated, text }
}

const refIn = (source, key) => {
  const m = new RegExp(`/${key}\\s+(\\d+)\\s+(\\d+)\\s+R`).exec(source)
  return m ? { num: Number(m[1]), gen: Number(m[2]) } : null
}

/** Racine (/Root) et /Info : dernier trailer classique, sinon flux XRef. */
function findTrailerRefs(text, objects) {
  const trailerAt = text.lastIndexOf('trailer')
  let source = trailerAt !== -1 ? text.slice(trailerAt, trailerAt + 2000) : ''
  if (!refIn(source, 'Root')) {
    const xrefStream = [...objects.values()].reverse().find((o) => /\/Type\s*\/XRef\b/.test(o.body))
    source = xrefStream?.body ?? ''
  }
  return { root: refIn(source, 'Root'), info: refIn(source, 'Info'), encrypted: /\/Encrypt\s+\d+\s+\d+\s+R/.test(source) }
}

/** Nombre de pages annoncé par l'arbre des pages (plus grand /Count trouvé). */
function declaredPageCount(objects) {
  let max = 0
  for (const o of objects.values()) {
    if (/\/Type\s*\/Pages\b/.test(o.body)) {
      const count = /\/Count\s+(\d+)/.exec(o.body)
      if (count) max = Math.max(max, Number(count[1]))
    }
  }
  return max
}

const isPageBody = (body) => /\/Type\s*\/Page(?![s\w])/.test(body)

/* -------------------------------------------------------------------------- */
/* Diagnostic                                                                 */
/* -------------------------------------------------------------------------- */

export async function diagnosePdf(bytes) {
  const issues = []
  const head = latin1(bytes.subarray(0, 1024))
  const headerOffset = head.indexOf('%PDF-')
  const version = headerOffset >= 0 ? /%PDF-(\d\.\d)/.exec(head.slice(headerOffset))?.[1] ?? null : null
  if (headerOffset === -1) issues.push({ id: 'headerMissing', level: 'error' })
  else if (headerOffset > 0) issues.push({ id: 'headerGarbage', level: 'warn', count: headerOffset })

  const tail = latin1(bytes.subarray(Math.max(0, bytes.length - 2048)))
  const eofPresent = tail.includes('%%EOF')
  if (!eofPresent) issues.push({ id: 'eofMissing', level: 'warn' })

  const sxAll = [...tail.matchAll(/startxref\s+(\d+)/g)]
  const startxref = sxAll.length ? Number(sxAll[sxAll.length - 1][1]) : null
  let startxrefValid = false
  if (startxref === null) issues.push({ id: 'startxrefMissing', level: 'error' })
  else {
    // Avec des octets parasites en tête, les décalages se comptent depuis
    // « %PDF- » : on accepte les deux origines (le préfixe est déjà signalé).
    const pointsToXref = (offset) => {
      const at = latin1(bytes.subarray(offset, offset + 32))
      return /^\s*xref\b/.test(at) || /^\s*\d+\s+\d+\s+obj\b/.test(at)
    }
    startxrefValid = pointsToXref(startxref) || (headerOffset > 0 && pointsToXref(startxref + headerOffset))
    if (!startxrefValid) issues.push({ id: 'startxrefInvalid', level: 'error', detail: String(startxref) })
  }

  const scan = scanObjects(bytes)
  if (scan.truncated) issues.push({ id: 'truncatedObject', level: 'error' })
  const eofCount = (scan.text.match(/%%EOF/g) ?? []).length
  if (eofCount > 1) issues.push({ id: 'incremental', level: 'info', count: eofCount - 1 })
  const trailer = findTrailerRefs(scan.text, scan.objects)
  if (trailer.encrypted) issues.push({ id: 'encrypted', level: 'warn' })
  if (!trailer.root) issues.push({ id: 'trailerMissing', level: 'error' })
  else if (!scan.objects.has(trailer.root.num)) issues.push({ id: 'catalogMissing', level: 'error' })

  const pageObjects = [...scan.objects.values()].filter((o) => isPageBody(o.body)).length

  // Contrôle structurel qpdf, journal capturé.
  const qpdf = await runQpdfLogged(bytes, ['--check', QPDF_PATHS.input])
  if (qpdf.exitCode === 2) issues.push({ id: 'qpdfErrors', level: 'error' })
  else if (qpdf.exitCode === 3) issues.push({ id: 'qpdfWarnings', level: 'warn', count: qpdf.log.filter((l) => /^WARNING/i.test(l)).length })

  // Ouverture directe par pdf.js (lecteur tolérant).
  let pdfjs = { ok: false, numPages: 0, error: null }
  try {
    const doc = await loadPdfDocument(bytes)
    pdfjs = { ok: true, numPages: doc.numPages, error: null }
    destroyPdfDocument(doc)
  } catch (err) {
    pdfjs = { ok: false, numPages: 0, error: err?.name === 'PasswordException' ? 'password' : 'invalid' }
  }
  if (pdfjs.error === 'password') issues.push({ id: 'passwordRequired', level: 'error' })

  const expectedPages = Math.max(declaredPageCount(scan.objects), pageObjects, pdfjs.numPages)
  const errors = issues.filter((i) => i.level === 'error').length
  const severity =
    pdfjs.error === 'password'
      ? 'locked'
      : errors === 0 && qpdf.exitCode === 0 && issues.every((i) => i.level === 'info')
        ? 'healthy'
        : errors === 0 && qpdf.exitCode !== 2
          ? 'minor'
          : scan.truncated || !pdfjs.ok
            ? 'critical'
            : 'major'

  return {
    size: bytes.length,
    version,
    headerOffset,
    eofPresent,
    startxref,
    startxrefValid,
    objectCount: scan.objects.size,
    pageObjects,
    expectedPages,
    issues,
    qpdf: { exitCode: qpdf.exitCode, log: qpdf.log },
    pdfjs,
    severity,
    // Mode conseillé : structurel sauf si le fichier ne s'ouvre plus du tout.
    recommended: severity === 'critical' && !pageObjects ? 'visual' : 'structural',
  }
}

/* -------------------------------------------------------------------------- */
/* Reconstruction du conteneur                                                */
/* -------------------------------------------------------------------------- */

/**
 * Réécrit un fichier propre à partir des seuls objets complets : en-tête
 * standard, objets, nouvelle table XREF aux décalages exacts et trailer.
 * Les anciens flux XRef (décalages périmés) sont écartés.
 */
export function rebuildContainer(bytes) {
  const scan = scanObjects(bytes)
  const trailer = findTrailerRefs(scan.text, scan.objects)
  const kept = [...scan.objects.entries()].filter(([, o]) => !/\/Type\s*\/XRef\b/.test(o.body)).sort((a, b) => a[0] - b[0])

  let root = trailer.root && scan.objects.has(trailer.root.num) ? trailer.root : null
  if (!root) {
    const catalog = kept.find(([, o]) => /\/Type\s*\/Catalog\b/.test(o.body))
    if (catalog) root = { num: catalog[0], gen: catalog[1].gen }
  }

  // En-tête standard suivi de la ligne binaire recommandée (4 octets > 127).
  const chunks = [concat([encode('%PDF-1.7\n%'), new Uint8Array([0xe2, 0xe3, 0xcf, 0xd3]), encode('\n')])]
  let offset = chunks[0].length
  const offsets = new Map()
  for (const [num, o] of kept) {
    const body = bytes.subarray(o.start, o.end)
    offsets.set(num, { offset, gen: o.gen })
    chunks.push(body, encode('\n'))
    offset += body.length + 1
  }

  const size = (kept.length ? kept[kept.length - 1][0] : 0) + 1
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let n = 1; n < size; n++) {
    const entry = offsets.get(n)
    xref += entry ? `${String(entry.offset).padStart(10, '0')} ${String(entry.gen).padStart(5, '0')} n \n` : '0000000000 65535 f \n'
  }
  const info = trailer.info && offsets.has(trailer.info.num) ? ` /Info ${trailer.info.num} ${trailer.info.gen} R` : ''
  const rootEntry = root ? ` /Root ${root.num} ${root.gen} R` : ''
  chunks.push(encode(`${xref}trailer\n<< /Size ${size}${rootEntry}${info} >>\nstartxref\n${offset}\n%%EOF\n`))

  return {
    bytes: concat(chunks),
    stats: {
      objects: kept.length,
      truncatedDropped: scan.truncated,
      rootFound: Boolean(root),
    },
  }
}

/**
 * Charge un conteneur avec pdf-lib et garantit un catalogue et un arbre de
 * pages exploitables (recréés à partir des pages retrouvées si besoin).
 */
async function loadWithPageTree(bytes, log) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false })
  const context = doc.context

  let catalog = context.lookup(context.trailerInfo.Root)
  if (!(catalog instanceof PDFDict)) {
    catalog = context.obj({ Type: 'Catalog' })
    context.trailerInfo.Root = context.register(catalog)
    log.push({ id: 'catalogCreated' })
  }

  let pagesOk = false
  try {
    pagesOk = doc.getPageCount() > 0
  } catch {
    pagesOk = false
  }
  if (!pagesOk) {
    const pageRefs = []
    for (const [ref, obj] of context.enumerateIndirectObjects()) {
      if (obj instanceof PDFDict && obj.get(N('Type')) === N('Page')) pageRefs.push(ref)
    }
    pageRefs.sort((a, b) => a.objectNumber - b.objectNumber)
    if (!pageRefs.length) throw new Error('NO_PAGES')
    const pagesRef = context.nextRef()
    for (const ref of pageRefs) {
      const page = context.lookup(ref)
      page.set(N('Parent'), pagesRef)
      // Attributs hérités perdus avec l'ancien arbre : valeurs de secours.
      if (!page.has(N('MediaBox'))) page.set(N('MediaBox'), context.obj([0, 0, 595.28, 841.89]))
      if (!page.has(N('Resources'))) page.set(N('Resources'), context.obj({}))
    }
    context.assign(pagesRef, context.obj({ Type: 'Pages', Kids: pageRefs, Count: PDFNumber.of(pageRefs.length) }))
    catalog.set(N('Pages'), pagesRef)
    log.push({ id: 'pageTreeRebuilt', count: pageRefs.length })
    // Rechargement : pdf-lib met l'arbre des pages en cache au chargement.
    return PDFDocument.load(await doc.save({ useObjectStreams: false }), { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false })
  }
  return doc
}

/** Une page est exploitable si son dictionnaire et tous ses flux de contenu existent. */
function pageContentPresent(context, page) {
  const value = page.node.get(N('Contents'))
  if (!value) return true // page vierge légitime
  const contents = context.lookup(value)
  const refs = contents instanceof PDFArray ? contents.asArray() : [value]
  return refs.every((r) => !(r instanceof PDFRef) || context.lookup(r) instanceof PDFStream)
}

const stripPrefix = (bytes, offset) => (offset > 0 ? bytes.slice(offset) : bytes)

/* -------------------------------------------------------------------------- */
/* Modes de réparation                                                        */
/* -------------------------------------------------------------------------- */

/** Mode 1 : qpdf, avec reconstruction XREF en secours. Conserve tous les objets. */
export async function repairStructural(bytes, diag) {
  const log = []
  let input = bytes
  if (diag.headerOffset > 0) {
    input = stripPrefix(bytes, diag.headerOffset)
    log.push({ id: 'headerFixed', count: diag.headerOffset })
  }

  let attempt = await runQpdfLogged(input, [QPDF_PATHS.input, QPDF_PATHS.output])
  const qpdfLog = [...attempt.log]
  if (attempt.exitCode === 2 || !attempt.bytes) {
    const rebuilt = rebuildContainer(input)
    log.push({ id: 'xrefRebuilt', count: rebuilt.stats.objects })
    if (rebuilt.stats.truncatedDropped) log.push({ id: 'truncatedDropped' })
    const doc = await loadWithPageTree(rebuilt.bytes, log)
    const normalized = await doc.save({ useObjectStreams: false })
    attempt = await runQpdfLogged(normalized, [QPDF_PATHS.input, QPDF_PATHS.output])
    qpdfLog.push(...attempt.log)
    if (attempt.exitCode === 2 || !attempt.bytes) {
      log.push({ id: 'qpdfFallback' })
      return { bytes: normalized, log, qpdfLog }
    }
  } else if (!diag.eofPresent || !diag.startxrefValid) {
    log.push({ id: 'xrefRewritten' })
  }
  if (!diag.eofPresent) log.push({ id: 'eofRestored' })
  const warnings = qpdfLog.filter((l) => /^WARNING/i.test(l)).length
  if (warnings) log.push({ id: 'qpdfWarnings', count: warnings })
  log.push({ id: 'rewritten' })
  return { bytes: attempt.bytes, log, qpdfLog }
}

/** Mode 2 : pdf-lib, copie des pages valides une à une dans un document neuf. */
export async function repairRebuild(bytes, diag) {
  const log = []
  const input = stripPrefix(bytes, Math.max(0, diag.headerOffset))
  let source
  try {
    source = await loadWithPageTree(input, log)
  } catch {
    const rebuilt = rebuildContainer(input)
    log.push({ id: 'xrefRebuilt', count: rebuilt.stats.objects })
    if (rebuilt.stats.truncatedDropped) log.push({ id: 'truncatedDropped' })
    source = await loadWithPageTree(rebuilt.bytes, log)
  }

  const output = await PDFDocument.create()
  const failed = []
  const pages = source.getPages()
  for (let i = 0; i < pages.length; i++) {
    try {
      if (!pageContentPresent(source.context, pages[i])) throw new Error('MISSING_CONTENT')
      const [copy] = await output.copyPages(source, [i])
      output.addPage(copy)
    } catch {
      failed.push(i + 1)
    }
  }
  if (!output.getPageCount()) throw new Error('NO_PAGES')
  log.push({ id: 'pagesCopied', count: output.getPageCount() })
  if (failed.length) log.push({ id: 'pagesSkipped', count: failed.length, pages: failed.join(', ') })
  return { bytes: await output.save(), log, failedPages: failed }
}

/** Mode 3 : rendu page par page via pdf.js (pages irrécupérables listées). */
export async function salvageVisual(bytes, diag, { dpi = 150, onProgress = () => {} } = {}) {
  const log = []
  const input = stripPrefix(bytes, Math.max(0, diag.headerOffset))
  let pdf
  try {
    pdf = await loadPdfDocument(input)
  } catch {
    const rebuilt = rebuildContainer(input)
    log.push({ id: 'xrefRebuilt', count: rebuilt.stats.objects })
    const doc = await loadWithPageTree(rebuilt.bytes, log)
    pdf = await loadPdfDocument(await doc.save({ useObjectStreams: false }))
  }

  const output = await PDFDocument.create()
  const failed = []
  try {
    for (let n = 1; n <= pdf.numPages; n++) {
      try {
        const page = await pdf.getPage(n)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: Math.min(dpi / 72, 6000 / Math.max(base.width, base.height)) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvas, canvasContext: ctx, viewport }).promise
        const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', 0.9))
        const image = await output.embedJpg(new Uint8Array(await blob.arrayBuffer()))
        output.addPage([base.width, base.height]).drawImage(image, { x: 0, y: 0, width: base.width, height: base.height })
        canvas.width = 0
        canvas.height = 0
      } catch {
        failed.push(n)
      }
      onProgress(n / pdf.numPages)
    }
  } finally {
    destroyPdfDocument(pdf)
  }
  if (!output.getPageCount()) throw new Error('NO_PAGES')
  log.push({ id: 'pagesRendered', count: output.getPageCount(), dpi })
  if (failed.length) log.push({ id: 'pagesSkipped', count: failed.length, pages: failed.join(', ') })
  return { bytes: await output.save(), log, failedPages: failed }
}

/** Vérification du fichier produit : ouverture pdf.js et contrôle qpdf. */
export async function verifyRepaired(bytes) {
  let numPages = 0
  let readable = 0
  try {
    const doc = await loadPdfDocument(bytes)
    numPages = doc.numPages
    for (let n = 1; n <= numPages; n++) {
      try {
        await (await doc.getPage(n)).getOperatorList()
        readable += 1
      } catch {
        // page présente mais non interprétable
      }
    }
    destroyPdfDocument(doc)
  } catch {
    numPages = 0
  }
  const check = await runQpdfLogged(bytes, ['--check', QPDF_PATHS.input])
  return { numPages, readable, qpdfOk: check.exitCode !== 2, qpdfLog: check.log }
}
