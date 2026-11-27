import {
  AFRelationship,
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib'
import { flattenInteractive, flattenRaster } from './flattenWorker'

/**
 * Conversion PDF/A (ISO 19005) côté navigateur.
 *
 * Ce module applique les corrections structurelles réalisables avec pdf-lib
 * (XMP pdfaid, OutputIntent sRGB, suppression du JavaScript et des actions
 * interdites, aplatissement des formulaires et annotations, identifiant de
 * fichier, version d'en-tête...) et audite le document avant ET après
 * conversion. Certains défauts ne peuvent pas être corrigés sans
 * rastérisation (polices non incorporées, transparence en PDF/A-1,
 * compression LZW) : l'audit les signale honnêtement plutôt que de
 * prétendre à une conformité non garantie. Une validation officielle reste
 * l'affaire d'un validateur dédié (veraPDF).
 */

export const LEVELS = {
  '1b': { part: 1, conformance: 'B', version: [1, 4] },
  '2b': { part: 2, conformance: 'B', version: [1, 7] },
  '3b': { part: 3, conformance: 'B', version: [1, 7] },
}

const FORBIDDEN_ACTIONS = new Set(['JavaScript', 'Launch', 'Sound', 'Movie', 'ResetForm', 'ImportData', 'Hide', 'SetOCGState', 'Rendition', 'Trans', 'GoTo3DView'])
const MULTIMEDIA_ANNOTS = new Set(['Movie', 'Sound', 'Screen', 'RichMedia', '3D'])

/* -------------------------------------------------------------------------- */
/* Profil ICC sRGB (v2, matrice + courbes)                                    */
/* -------------------------------------------------------------------------- */

/**
 * Construit un profil ICC v2 « display RGB » sRGB IEC 61966-2.1 : primaires
 * adaptées D50 (valeurs de référence du profil sRGB de l'ICC), point blanc
 * D50 et courbe de transfert sRGB exacte échantillonnée sur 1024 points.
 */
export function buildSrgbIccProfile() {
  const enc = new TextEncoder()
  const s15 = (v) => Math.round(v * 65536)

  const xyz = (x, y, z) => {
    const b = new DataView(new ArrayBuffer(20))
    b.setUint32(0, 0x58595a20) // 'XYZ '
    b.setInt32(8, s15(x))
    b.setInt32(12, s15(y))
    b.setInt32(16, s15(z))
    return new Uint8Array(b.buffer)
  }
  const curve = () => {
    const n = 1024
    const b = new DataView(new ArrayBuffer(12 + n * 2))
    b.setUint32(0, 0x63757276) // 'curv'
    b.setUint32(8, n)
    for (let i = 0; i < n; i++) {
      const v = i / (n - 1)
      const lin = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      b.setUint16(12 + i * 2, Math.round(lin * 65535))
    }
    return new Uint8Array(b.buffer)
  }
  const desc = (text) => {
    const ascii = enc.encode(`${text}\0`)
    // textDescriptionType : ASCII + champs Unicode et ScriptCode vides.
    const b = new Uint8Array(12 + ascii.length + 4 + 4 + 2 + 1 + 67)
    const dv = new DataView(b.buffer)
    dv.setUint32(0, 0x64657363) // 'desc'
    dv.setUint32(8, ascii.length)
    b.set(ascii, 12)
    return b
  }
  const text = (value) => {
    const ascii = enc.encode(`${value}\0`)
    const b = new Uint8Array(8 + ascii.length)
    new DataView(b.buffer).setUint32(0, 0x74657874) // 'text'
    b.set(ascii, 8)
    return b
  }

  const trc = curve()
  const tags = [
    ['desc', desc('sRGB IEC61966-2.1')],
    ['cprt', text('No copyright, use freely')],
    ['wtpt', xyz(0.9642, 1.0, 0.8249)],
    ['rXYZ', xyz(0.4361, 0.2225, 0.0139)],
    ['gXYZ', xyz(0.3851, 0.7169, 0.0971)],
    ['bXYZ', xyz(0.1431, 0.0606, 0.7141)],
    ['rTRC', trc],
    ['gTRC', trc],
    ['bTRC', trc],
  ]

  const align = (n) => (n + 3) & ~3
  const tableSize = 4 + tags.length * 12
  let offset = 128 + tableSize
  const placed = new Map()
  const entries = tags.map(([sig, data]) => {
    if (!placed.has(data)) {
      placed.set(data, offset)
      offset = align(offset + data.length)
    }
    return { sig, offset: placed.get(data), size: data.length }
  })
  const size = offset

  const out = new Uint8Array(size)
  const dv = new DataView(out.buffer)
  const sig = (pos, s) => out.set(enc.encode(s), pos)
  dv.setUint32(0, size)
  dv.setUint32(8, 0x02100000) // version 2.1
  sig(12, 'mntr')
  sig(16, 'RGB ')
  sig(20, 'XYZ ')
  const now = new Date()
  ;[now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()].forEach((v, i) =>
    dv.setUint16(24 + i * 2, v),
  )
  sig(36, 'acsp')
  dv.setInt32(68, s15(0.9642)) // illuminant D50
  dv.setInt32(72, s15(1.0))
  dv.setInt32(76, s15(0.8249))

  dv.setUint32(128, tags.length)
  entries.forEach((e, i) => {
    sig(132 + i * 12, e.sig)
    dv.setUint32(136 + i * 12, e.offset)
    dv.setUint32(140 + i * 12, e.size)
  })
  for (const [data, pos] of placed) out.set(data, pos)
  return out
}

/* -------------------------------------------------------------------------- */
/* Lecture utilitaire                                                         */
/* -------------------------------------------------------------------------- */

const resolve = (context, v) => (v instanceof PDFRef ? context.lookup(v) : v)
const nameOf = (v) => (v instanceof PDFName ? v.decodeText() : null)

function streamText(stream) {
  try {
    const bytes = stream instanceof PDFRawStream ? decodePDFRawStream(stream).decode() : stream.getContents()
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

function filtersOf(context, dict) {
  const f = resolve(context, dict.get(PDFName.of('Filter')))
  if (f instanceof PDFName) return [f.decodeText()]
  if (f instanceof PDFArray) return f.asArray().map((x) => nameOf(resolve(context, x))).filter(Boolean)
  return []
}

/** Déclaration PDF/A présente dans le XMP du catalogue : { part, conformance } ou null. */
function declaredPdfa(doc) {
  const meta = resolve(doc.context, doc.catalog.get(PDFName.of('Metadata')))
  if (!(meta instanceof PDFStream)) return { xmp: false, pdfa: null }
  const xml = streamText(meta)
  const part = /pdfaid:part(?:="|>)\s*(\d)/.exec(xml)?.[1]
  const conformance = /pdfaid:conformance(?:="|>)\s*([ABUabu])/.exec(xml)?.[1]
  return { xmp: true, pdfa: part ? { part: Number(part), conformance: (conformance ?? '').toUpperCase() } : null }
}

/**
 * Objets réellement atteignables depuis le catalogue et /Info : les objets
 * orphelins (supprimés logiquement mais encore présents dans le fichier) ne
 * doivent pas fausser l'audit.
 */
function reachableObjects(context) {
  const seen = new Set()
  const result = []
  const stack = [context.trailerInfo.Root, context.trailerInfo.Info]
  while (stack.length) {
    const item = stack.pop()
    if (!item) continue
    if (item instanceof PDFRef) {
      const key = item.toString()
      if (seen.has(key)) continue
      seen.add(key)
      const obj = context.lookup(item)
      if (obj) {
        result.push(obj)
        stack.push(obj)
      }
    } else if (item instanceof PDFStream) {
      stack.push(item.dict)
    } else if (item instanceof PDFDict) {
      for (const [, value] of item.entries()) stack.push(value)
    } else if (item instanceof PDFArray) {
      for (const value of item.asArray()) stack.push(value)
    }
  }
  return result
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Inspecte le document. Chaque contrôle : { id, status: 'ok'|'warn'|'fail',
 * fix: 'auto'|'raster'|null, count? }. `fix` indique comment la conversion
 * le corrige (automatiquement, ou seulement via le mode rastérisé).
 */
export async function auditPdf(buffer, levelId = '2b') {
  const level = LEVELS[levelId]
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })
  const context = doc.context
  const catalog = doc.catalog

  let javascript = 0
  let forbiddenActions = 0
  let transparency = 0
  let lzw = 0
  let nonEmbeddedFonts = new Set()
  let embeddedFiles = 0
  let multimedia = 0
  let annotationsToFix = 0
  let formFields = 0

  for (const obj of reachableObjects(context)) {
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : null
    if (!dict) continue
    const type = nameOf(dict.get(PDFName.of('Type')))
    const subtype = nameOf(dict.get(PDFName.of('Subtype')))
    const action = nameOf(dict.get(PDFName.of('S')))

    if (action === 'JavaScript') javascript += 1
    else if (action && FORBIDDEN_ACTIONS.has(action)) forbiddenActions += 1

    if (obj instanceof PDFStream && filtersOf(context, dict).includes('LZWDecode')) lzw += 1

    if (type === 'ExtGState') {
      const ca = resolve(context, dict.get(PDFName.of('ca')))
      const CA = resolve(context, dict.get(PDFName.of('CA')))
      const smask = resolve(context, dict.get(PDFName.of('SMask')))
      const blend = nameOf(resolve(context, dict.get(PDFName.of('BM'))))
      if ((ca instanceof PDFNumber && ca.asNumber() < 1) || (CA instanceof PDFNumber && CA.asNumber() < 1) || (smask && nameOf(smask) !== 'None') || (blend && !['Normal', 'Compatible'].includes(blend))) {
        transparency += 1
      }
    }
    if (subtype === 'Image' && dict.get(PDFName.of('SMask'))) transparency += 1
    const group = resolve(context, dict.get(PDFName.of('Group')))
    if (group instanceof PDFDict && nameOf(group.get(PDFName.of('S'))) === 'Transparency') transparency += 1

    if (type === 'Font' && ['Type1', 'TrueType', 'MMType1', 'CIDFontType0', 'CIDFontType2'].includes(subtype)) {
      const descriptor = resolve(context, dict.get(PDFName.of('FontDescriptor')))
      const embedded =
        descriptor instanceof PDFDict &&
        ['FontFile', 'FontFile2', 'FontFile3'].some((k) => descriptor.has(PDFName.of(k)))
      if (!embedded) nonEmbeddedFonts.add(nameOf(dict.get(PDFName.of('BaseFont'))) ?? '?')
    }
    if (type === 'Filespec' && dict.has(PDFName.of('EF'))) embeddedFiles += 1

    if (type === 'Annot' || subtype === 'Widget' || subtype === 'Link') {
      if (subtype && MULTIMEDIA_ANNOTS.has(subtype)) multimedia += 1
      if (subtype && subtype !== 'Link' && subtype !== 'Popup') annotationsToFix += 1
    }
  }

  try {
    formFields = doc.getForm().getFields().length
  } catch {
    formFields = 0
  }
  const names = resolve(context, catalog.get(PDFName.of('Names')))
  if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) javascript += 1
  if (catalog.has(PDFName.of('AA'))) forbiddenActions += 1

  const outputIntents = resolve(context, catalog.get(PDFName.of('OutputIntents')))
  const hasOutputIntent = outputIntents instanceof PDFArray && outputIntents.size() > 0
  const hasOcg = catalog.has(PDFName.of('OCProperties'))
  const { xmp, pdfa } = declaredPdfa(doc)
  const hasId = Boolean(context.trailerInfo.ID)

  const filesAllowed = level.part === 3
  const checks = [
    { id: 'encryption', status: doc.isEncrypted ? 'fail' : 'ok', fix: doc.isEncrypted ? 'raster' : null },
    { id: 'xmp', status: pdfa ? 'ok' : 'warn', fix: pdfa ? null : 'auto', detail: pdfa ? `PDF/A-${pdfa.part}${pdfa.conformance}` : xmp ? 'noPdfaid' : 'none' },
    { id: 'outputIntent', status: hasOutputIntent ? 'ok' : 'warn', fix: hasOutputIntent ? null : 'auto' },
    { id: 'javascript', status: javascript + forbiddenActions ? 'warn' : 'ok', fix: javascript + forbiddenActions ? 'auto' : null, count: javascript + forbiddenActions },
    { id: 'forms', status: formFields ? 'warn' : 'ok', fix: formFields ? 'auto' : null, count: formFields },
    { id: 'annotations', status: annotationsToFix ? 'warn' : 'ok', fix: annotationsToFix ? 'auto' : null, count: annotationsToFix },
    { id: 'multimedia', status: multimedia ? 'warn' : 'ok', fix: multimedia ? 'auto' : null, count: multimedia },
    {
      id: 'embeddedFiles',
      status: embeddedFiles && !filesAllowed ? 'warn' : 'ok',
      fix: embeddedFiles && !filesAllowed ? 'auto' : null,
      count: embeddedFiles,
    },
    { id: 'fonts', status: nonEmbeddedFonts.size ? 'fail' : 'ok', fix: nonEmbeddedFonts.size ? 'raster' : null, count: nonEmbeddedFonts.size, detail: [...nonEmbeddedFonts].slice(0, 6).join(', ') },
    {
      id: 'transparency',
      status: transparency && level.part === 1 ? 'fail' : 'ok',
      fix: transparency && level.part === 1 ? 'raster' : null,
      count: transparency,
    },
    { id: 'lzw', status: lzw ? 'fail' : 'ok', fix: lzw ? 'raster' : null, count: lzw },
    { id: 'optionalContent', status: hasOcg && level.part === 1 ? 'warn' : 'ok', fix: hasOcg && level.part === 1 ? 'auto' : null },
    { id: 'fileId', status: hasId ? 'ok' : 'warn', fix: hasId ? null : 'auto' },
  ]

  const blocking = checks.some((c) => c.status === 'fail')
  const declaredMatches = pdfa && pdfa.part === level.part
  return {
    checks,
    declared: pdfa,
    pageCount: doc.getPageCount(),
    isEncrypted: doc.isEncrypted,
    needsRaster: checks.some((c) => c.fix === 'raster'),
    status: declaredMatches && !checks.some((c) => c.status !== 'ok') ? 'declared' : blocking ? 'blocking' : 'fixable',
    info: {
      title: doc.getTitle() ?? '',
      author: doc.getAuthor() ?? '',
      subject: doc.getSubject() ?? '',
      keywords: doc.getKeywords() ?? '',
      creator: doc.getCreator() ?? '',
      creationDate: doc.getCreationDate() ?? null,
    },
  }
}

/* -------------------------------------------------------------------------- */
/* Conversion                                                                 */
/* -------------------------------------------------------------------------- */

const xmlEscape = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c])

/** Date ISO-8601 sans millisecondes, en UTC (identique à la date /Info de pdf-lib). */
const isoDate = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z')

function buildXmp({ part, conformance }, meta) {
  const alt = (v) => `<rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(v)}</rdf:li></rdf:Alt>`
  const lines = [
    `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>`,
    `<x:xmpmeta xmlns:x="adobe:ns:meta/">`,
    `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`,
    `<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">`,
    `<pdfaid:part>${part}</pdfaid:part>`,
    `<pdfaid:conformance>${conformance}</pdfaid:conformance>`,
    `</rdf:Description>`,
    `<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">`,
    `<dc:format>application/pdf</dc:format>`,
    meta.title ? `<dc:title>${alt(meta.title)}</dc:title>` : '',
    meta.author ? `<dc:creator><rdf:Seq><rdf:li>${xmlEscape(meta.author)}</rdf:li></rdf:Seq></dc:creator>` : '',
    meta.subject ? `<dc:description>${alt(meta.subject)}</dc:description>` : '',
    `</rdf:Description>`,
    `<rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/">`,
    `<xmp:CreateDate>${isoDate(meta.creationDate)}</xmp:CreateDate>`,
    `<xmp:ModifyDate>${isoDate(meta.modDate)}</xmp:ModifyDate>`,
    `<xmp:MetadataDate>${isoDate(meta.modDate)}</xmp:MetadataDate>`,
    meta.creator ? `<xmp:CreatorTool>${xmlEscape(meta.creator)}</xmp:CreatorTool>` : '',
    `</rdf:Description>`,
    `<rdf:Description rdf:about="" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">`,
    `<pdf:Producer>${xmlEscape(meta.producer)}</pdf:Producer>`,
    meta.keywords ? `<pdf:Keywords>${xmlEscape(meta.keywords)}</pdf:Keywords>` : '',
    `</rdf:Description>`,
    `</rdf:RDF>`,
    `</x:xmpmeta>`,
  ].filter(Boolean)
  // Remplissage recommandé pour permettre une édition ultérieure sur place.
  const padding = `${' '.repeat(99)}\n`.repeat(20)
  return `${lines.join('\n')}\n${padding}<?xpacket end="w"?>`
}

function randomHex(bytes) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('')
}

function stripActions(doc, log) {
  const context = doc.context
  const catalog = doc.catalog
  let removed = 0

  const names = resolve(context, catalog.get(PDFName.of('Names')))
  if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
    names.delete(PDFName.of('JavaScript'))
    removed += 1
  }
  if (catalog.has(PDFName.of('AA'))) {
    catalog.delete(PDFName.of('AA'))
    removed += 1
  }
  const open = resolve(context, catalog.get(PDFName.of('OpenAction')))
  if (open instanceof PDFDict && FORBIDDEN_ACTIONS.has(nameOf(open.get(PDFName.of('S'))))) {
    catalog.delete(PDFName.of('OpenAction'))
    removed += 1
  }

  for (const page of doc.getPages()) {
    if (page.node.has(PDFName.of('AA'))) {
      page.node.delete(PDFName.of('AA'))
      removed += 1
    }
    const annots = page.node.Annots()
    if (!annots) continue
    const kept = []
    for (const ref of annots.asArray()) {
      const annot = resolve(context, ref)
      if (!(annot instanceof PDFDict)) continue
      const subtype = nameOf(annot.get(PDFName.of('Subtype')))
      if (subtype && MULTIMEDIA_ANNOTS.has(subtype)) {
        removed += 1
        continue
      }
      if (annot.has(PDFName.of('AA'))) {
        annot.delete(PDFName.of('AA'))
        removed += 1
      }
      const action = resolve(context, annot.get(PDFName.of('A')))
      if (action instanceof PDFDict && FORBIDDEN_ACTIONS.has(nameOf(action.get(PDFName.of('S'))))) {
        annot.delete(PDFName.of('A'))
        removed += 1
      }
      // PDF/A : annotations imprimables, jamais masquées.
      annot.set(PDFName.of('F'), PDFNumber.of(4))
      kept.push(ref)
    }
    if (kept.length) page.node.set(PDFName.of('Annots'), context.obj(kept))
    else page.node.delete(PDFName.of('Annots'))
  }
  if (removed) log.push({ id: 'actionsRemoved', count: removed })
}

function handleEmbeddedFiles(doc, level, log) {
  const context = doc.context
  const names = resolve(context, doc.catalog.get(PDFName.of('Names')))
  if (!(names instanceof PDFDict) || !names.has(PDFName.of('EmbeddedFiles'))) return

  if (level.part !== 3) {
    names.delete(PDFName.of('EmbeddedFiles'))
    doc.catalog.delete(PDFName.of('AF'))
    log.push({ id: 'embeddedRemoved' })
    return
  }
  // PDF/A-3 : chaque fichier doit déclarer sa relation et figurer dans /AF.
  let af = resolve(context, doc.catalog.get(PDFName.of('AF')))
  if (!(af instanceof PDFArray)) {
    af = context.obj([])
    doc.catalog.set(PDFName.of('AF'), af)
  }
  const listed = new Set(af.asArray().map((r) => r.toString()))
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict) || nameOf(obj.get(PDFName.of('Type'))) !== 'Filespec' || !obj.has(PDFName.of('EF'))) continue
    if (!obj.has(PDFName.of('AFRelationship'))) obj.set(PDFName.of('AFRelationship'), PDFName.of('Unspecified'))
    if (!listed.has(ref.toString())) af.push(ref)
  }
  log.push({ id: 'embeddedKept' })
}

/**
 * Convertit le document. `options` :
 *   level ('1b'|'2b'|'3b'), mode ('structural'|'raster'), dpi,
 *   meta { title, author, subject, keywords, creator },
 *   attachments [{ name, bytes, mimeType, relationship }] (PDF/A-3),
 *   onProgress(0-1).
 * Renvoie { bytes, log }.
 */
export async function convertToPdfa(buffer, options) {
  const { level: levelId, mode, dpi = 300, meta, attachments = [], onProgress = () => {} } = options
  const level = LEVELS[levelId]
  const log = []
  let source = buffer

  if (mode === 'raster') {
    source = await flattenRaster(buffer, { dpi, onProgress: (p) => onProgress(p * 0.85) })
    log.push({ id: 'rasterized', dpi })
  } else {
    const audit = await auditPdf(buffer, levelId)
    const needsFlatten = audit.checks.some((c) => (c.id === 'forms' || c.id === 'annotations') && c.status !== 'ok')
    if (needsFlatten) {
      source = await flattenInteractive(buffer, (p) => onProgress(p * 0.5))
      log.push({ id: 'flattened' })
    }
  }
  onProgress(0.88)

  const doc = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false })
  const context = doc.context

  if (mode !== 'raster') {
    stripActions(doc, log)
    handleEmbeddedFiles(doc, level, log)
    if (level.part === 1 && doc.catalog.has(PDFName.of('OCProperties'))) {
      doc.catalog.delete(PDFName.of('OCProperties'))
      log.push({ id: 'ocgRemoved' })
    }
  }
  if (doc.catalog.has(PDFName.of('AcroForm'))) doc.catalog.delete(PDFName.of('AcroForm'))
  if (level.part !== 3) doc.catalog.delete(PDFName.of('AF'))

  // Pièces jointes sources (PDF/A-3 uniquement).
  if (level.part === 3) {
    for (const file of attachments) {
      await doc.attach(file.bytes, file.name, {
        mimeType: file.mimeType || 'application/octet-stream',
        afRelationship: AFRelationship[file.relationship] ?? AFRelationship.Source,
        modificationDate: new Date(),
      })
    }
    if (attachments.length) log.push({ id: 'attached', count: attachments.length })
  }

  // Métadonnées : /Info et XMP strictement cohérents.
  const now = new Date()
  const info = {
    title: meta.title.trim(),
    author: meta.author.trim(),
    subject: meta.subject.trim(),
    keywords: meta.keywords.trim(),
    creator: meta.creator.trim() || 'ONE',
    producer: 'ONE (pdf-lib)',
    creationDate: meta.creationDate ?? now,
    modDate: now,
  }
  const infoDict = context.obj({})
  context.trailerInfo.Info = context.register(infoDict)
  if (info.title) doc.setTitle(info.title)
  if (info.author) doc.setAuthor(info.author)
  if (info.subject) doc.setSubject(info.subject)
  if (info.keywords) infoDict.set(PDFName.of('Keywords'), PDFHexString.fromText(info.keywords))
  doc.setCreator(info.creator)
  doc.setProducer(info.producer)
  doc.setCreationDate(info.creationDate)
  doc.setModificationDate(info.modDate)
  log.push({ id: 'metadata' })

  const xmp = context.stream(new TextEncoder().encode(buildXmp(level, info)), { Type: 'Metadata', Subtype: 'XML' })
  doc.catalog.set(PDFName.of('Metadata'), context.register(xmp))
  log.push({ id: 'xmp', part: level.part, conformance: level.conformance })

  // OutputIntent sRGB : interprétation colorimétrique sans ambiguïté.
  const icc = buildSrgbIccProfile()
  const iccRef = context.register(context.flateStream(icc, { N: 3, Alternate: 'DeviceRGB' }))
  const intent = context.obj({
    Type: 'OutputIntent',
    S: 'GTS_PDFA1',
    OutputConditionIdentifier: PDFString.of('sRGB IEC61966-2.1'),
    Info: PDFString.of('sRGB IEC61966-2.1'),
    RegistryName: PDFString.of('http://www.color.org'),
    DestOutputProfile: iccRef,
  })
  doc.catalog.set(PDFName.of('OutputIntents'), context.obj([intent]))
  log.push({ id: 'outputIntent' })

  // Identifiant de fichier et version d'en-tête adaptée au niveau.
  const id = PDFHexString.of(randomHex(16))
  context.trailerInfo.ID = context.obj([id, id])
  log.push({ id: 'header', version: level.version.join('.') })

  // Flux d'objets et de références croisées interdits en PDF/A-1 : on les
  // évite pour tous les niveaux (compatibilité maximale).
  const bytes = await doc.save({ useObjectStreams: false, updateFieldAppearances: false })
  // pdf-lib écrit toujours « %PDF-1.7 » : on remplace la version sur place.
  // Même longueur, donc aucun décalage de la table des références croisées.
  const version = new TextEncoder().encode(`%PDF-${level.version.join('.')}`)
  const current = new TextDecoder().decode(bytes.subarray(0, 5))
  if (current === '%PDF-' && version.length === 8) bytes.set(version, 0)
  onProgress(1)
  return { bytes, log }
}
