import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFRef,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib'

/**
 * Calques PDF (Optional Content Groups), 100 % en local.
 *
 * - `readLayers`  : lit /OCProperties (groupes, configuration par défaut /D,
 *                   arborescence /Order, verrous, intentions).
 * - `writeLayers` : applique renommages, états par défaut et verrous, et
 *                   peut purger réellement les calques masqués : sections
 *                   marquées supprimées des flux de contenu, XObjects et
 *                   annotations rattachés retirés, puis objets devenus
 *                   orphelins effacés du fichier (sinon pdf-lib les
 *                   réécrirait tels quels et le contenu « supprimé »
 *                   resterait lisible dans le PDF).
 * - `createBaseLayer` : place tout le contenu existant dans un calque.
 *
 * Identifiant d'un calque = format de pdf.js (« 12R », ou « 12R1 » si la
 * génération n'est pas 0), pour piloter l'aperçu sans table de conversion.
 */

const N = (name) => PDFName.of(name)
const nameOf = (v) => (v instanceof PDFName ? v.decodeText() : null)
const textOf = (v) => (v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : '')

export const layerId = (ref) => (ref.generationNumber === 0 ? `${ref.objectNumber}R` : `${ref.objectNumber}R${ref.generationNumber}`)

function refsOf(context, value) {
  const arr = context.lookup(value)
  if (!(arr instanceof PDFArray)) return []
  return arr.asArray().filter((v) => v instanceof PDFRef)
}

/* -------------------------------------------------------------------------- */
/* Lecture                                                                    */
/* -------------------------------------------------------------------------- */

function parseOrder(context, array, known) {
  const nodes = []
  const items = array.asArray()
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item instanceof PDFRef && known.has(layerId(item))) {
      const node = { type: 'layer', id: layerId(item), children: [] }
      const next = context.lookup(items[i + 1])
      if (next instanceof PDFArray && !(next.get(0) instanceof PDFString || next.get(0) instanceof PDFHexString)) {
        node.children = parseOrder(context, next, known)
        i += 1
      }
      nodes.push(node)
    } else {
      const sub = context.lookup(item)
      if (sub instanceof PDFArray) {
        const first = sub.get(0)
        const labelled = first instanceof PDFString || first instanceof PDFHexString
        const children = parseOrder(context, labelled ? PDFArray.withContext(context) : sub, known)
        if (labelled) {
          const rest = PDFArray.withContext(context)
          sub.asArray().slice(1).forEach((v) => rest.push(v))
          nodes.push({ type: 'label', label: textOf(first), children: parseOrder(context, rest, known) })
        } else {
          nodes.push(...children)
        }
      }
    }
  }
  return nodes
}

export async function readLayers(buffer) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })
  const context = doc.context
  const props = context.lookup(doc.catalog.get(N('OCProperties')))
  const base = { pageCount: doc.getPageCount(), encrypted: doc.isEncrypted, layers: [], tree: [] }
  if (!(props instanceof PDFDict)) return base

  const d = context.lookup(props.get(N('D')))
  const config = d instanceof PDFDict ? d : null
  const baseState = nameOf(config?.get(N('BaseState'))) ?? 'ON'
  const on = new Set(refsOf(context, config?.get(N('ON'))).map(layerId))
  const off = new Set(refsOf(context, config?.get(N('OFF'))).map(layerId))
  const locked = new Set(refsOf(context, config?.get(N('Locked'))).map(layerId))

  const layers = refsOf(context, props.get(N('OCGs'))).map((ref) => {
    const id = layerId(ref)
    const dict = context.lookup(ref)
    const intentRaw = dict instanceof PDFDict ? context.lookup(dict.get(N('Intent'))) : null
    const intent = intentRaw instanceof PDFArray ? intentRaw.asArray().map(nameOf).filter(Boolean) : intentRaw ? [nameOf(intentRaw)] : ['View']
    return {
      id,
      name: dict instanceof PDFDict ? textOf(context.lookup(dict.get(N('Name')))) || id : id,
      defaultVisible: baseState === 'OFF' ? on.has(id) : !off.has(id),
      locked: locked.has(id),
      intent,
    }
  })

  const known = new Set(layers.map((l) => l.id))
  const orderRaw = context.lookup(config?.get(N('Order')))
  const tree = orderRaw instanceof PDFArray ? parseOrder(context, orderRaw, known) : []
  const placed = new Set()
  const walk = (nodes) => nodes.forEach((n) => (n.type === 'layer' ? placed.add(n.id) : null, walk(n.children)))
  walk(tree)
  for (const l of layers) if (!placed.has(l.id)) tree.push({ type: 'layer', id: l.id, children: [] })

  return { ...base, layers, tree }
}

/* -------------------------------------------------------------------------- */
/* Analyse des flux de contenu                                                */
/* -------------------------------------------------------------------------- */

const WS = new Set([0, 9, 10, 12, 13, 32])
const DELIM = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37])
const ascii = (bytes, s, e) => String.fromCharCode(...bytes.subarray(s, e))

/**
 * Parcourt un flux de contenu et en retire :
 *   - les sections `/OC /Nom BDC … EMC` dont le contenu optionnel est masqué ;
 *   - seulement les marqueurs BDC/EMC des calques fusionnés (contenu conservé) ;
 *   - les appels `/Nom Do` vers un XObject rattaché à un calque masqué.
 * Gère chaînes, chaînes hexadécimales, dictionnaires, commentaires et images
 * en ligne (BI … ID <binaire> EI). Renvoie les octets filtrés et les noms
 * d'XObjects encore utilisés par le contenu conservé.
 */
export function filterContent(bytes, { isHiddenProperty, isHiddenXObject, isMergedProperty = () => false }) {
  const removals = []
  const usedXObjects = new Set()
  let operands = []
  let operandStart = null
  let skipDepth = 0
  let skipStart = 0
  const markStack = [] // pour chaque BMC/BDC ouvert : faut-il retirer son EMC ?
  let i = 0
  const len = bytes.length

  const pushOperand = (value, start) => {
    if (operandStart === null) operandStart = start
    operands.push(value)
  }

  while (i < len) {
    const c = bytes[i]
    if (WS.has(c)) {
      i += 1
      continue
    }
    const start = i
    if (c === 37) {
      // commentaire
      while (i < len && bytes[i] !== 10 && bytes[i] !== 13) i += 1
      continue
    }
    if (c === 40) {
      // chaîne littérale (parenthèses imbriquées, échappements)
      let depth = 0
      for (; i < len; i++) {
        if (bytes[i] === 92) i += 1
        else if (bytes[i] === 40) depth += 1
        else if (bytes[i] === 41 && --depth === 0) break
      }
      i += 1
      pushOperand({ type: 'string' }, start)
      continue
    }
    if (c === 60 && bytes[i + 1] === 60) {
      // dictionnaire en ligne : on saute jusqu'au >> correspondant
      let depth = 0
      while (i < len) {
        if (bytes[i] === 60 && bytes[i + 1] === 60) {
          depth += 1
          i += 2
        } else if (bytes[i] === 62 && bytes[i + 1] === 62) {
          depth -= 1
          i += 2
          if (depth === 0) break
        } else if (bytes[i] === 40) {
          let d = 0
          for (; i < len; i++) {
            if (bytes[i] === 92) i += 1
            else if (bytes[i] === 40) d += 1
            else if (bytes[i] === 41 && --d === 0) break
          }
          i += 1
        } else i += 1
      }
      pushOperand({ type: 'dict' }, start)
      continue
    }
    if (c === 60) {
      while (i < len && bytes[i] !== 62) i += 1
      i += 1
      pushOperand({ type: 'hex' }, start)
      continue
    }
    if (c === 91 || c === 93 || c === 123 || c === 125) {
      i += 1
      pushOperand({ type: 'punct' }, start)
      continue
    }
    if (c === 47) {
      i += 1
      while (i < len && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) i += 1
      pushOperand({ type: 'name', value: ascii(bytes, start + 1, i) }, start)
      continue
    }

    // mot : nombre, booléen ou opérateur
    while (i < len && !WS.has(bytes[i]) && !DELIM.has(bytes[i])) i += 1
    const word = ascii(bytes, start, i)
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word) || word === 'true' || word === 'false' || word === 'null') {
      pushOperand({ type: 'value' }, start)
      continue
    }

    let opEnd = i
    if (word === 'BI') {
      // image en ligne : on saute les données binaires jusqu'à « EI »
      let j = i
      while (j < len) {
        if (bytes[j] === 73 && bytes[j + 1] === 68 && WS.has(bytes[j - 1] ?? 32) && WS.has(bytes[j + 2] ?? 32)) break // ID
        j += 1
      }
      j += 3
      while (j < len && !(bytes[j] === 69 && bytes[j + 1] === 73 && WS.has(bytes[j - 1]) && (j + 2 >= len || WS.has(bytes[j + 2])))) j += 1
      opEnd = Math.min(len, j + 2)
      i = opEnd
    }

    const groupStart = operandStart ?? start
    if (skipDepth > 0) {
      if (word === 'BMC' || word === 'BDC') skipDepth += 1
      else if (word === 'EMC') {
        skipDepth -= 1
        if (skipDepth === 0) removals.push([skipStart, opEnd])
      }
    } else if (word === 'BDC' && operands[0]?.value === 'OC' && operands[1]?.type === 'name' && isHiddenProperty(operands[1].value)) {
      skipDepth = 1
      skipStart = groupStart
    } else if (word === 'BDC' && operands[0]?.value === 'OC' && operands[1]?.type === 'name' && isMergedProperty(operands[1].value)) {
      removals.push([groupStart, opEnd])
      markStack.push(true)
    } else if (word === 'BDC' || word === 'BMC') {
      markStack.push(false)
    } else if (word === 'EMC') {
      if (markStack.pop()) removals.push([start, opEnd])
    } else if (word === 'Do' && operands[0]?.type === 'name') {
      if (isHiddenXObject(operands[0].value)) removals.push([groupStart, opEnd])
      else usedXObjects.add(operands[0].value)
    }
    operands = []
    operandStart = null
  }
  if (skipDepth > 0) removals.push([skipStart, len])

  if (!removals.length) return { bytes, changed: false, usedXObjects }
  const parts = []
  let pos = 0
  for (const [s, e] of removals) {
    parts.push(bytes.subarray(pos, s), new Uint8Array([32]))
    pos = e
  }
  parts.push(bytes.subarray(pos))
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return { bytes: out, changed: true, usedXObjects }
}

/* -------------------------------------------------------------------------- */
/* Écriture                                                                   */
/* -------------------------------------------------------------------------- */

function decodeStream(stream) {
  if (stream instanceof PDFRawStream) return decodePDFRawStream(stream).decode()
  return stream.getContents()
}

function concatBytes(chunks) {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length + 1, 0))
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    out[offset + c.length] = 10
    offset += c.length + 1
  }
  return out
}

/** Supprime tous les objets qui ne sont plus atteignables depuis le catalogue et /Info. */
function collectGarbage(context) {
  const seen = new Set()
  const stack = [context.trailerInfo.Root, context.trailerInfo.Info]
  while (stack.length) {
    const item = stack.pop()
    if (!item) continue
    if (item instanceof PDFRef) {
      const key = item.toString()
      if (seen.has(key)) continue
      seen.add(key)
      stack.push(context.lookup(item))
    } else if (item instanceof PDFStream) stack.push(item.dict)
    else if (item instanceof PDFDict) for (const [, v] of item.entries()) stack.push(v)
    else if (item instanceof PDFArray) item.asArray().forEach((v) => stack.push(v))
  }
  let removed = 0
  for (const [ref] of context.enumerateIndirectObjects()) {
    if (!seen.has(ref.toString())) {
      context.delete(ref)
      removed += 1
    }
  }
  return removed
}

function filterRefArray(context, dict, key, drop) {
  const arr = context.lookup(dict.get(N(key)))
  if (!(arr instanceof PDFArray)) return
  const kept = arr.asArray().filter((v) => !(v instanceof PDFRef && drop.has(layerId(v))))
  dict.set(N(key), context.obj(kept))
}

/** Retire récursivement les calques purgés de /Order (et les groupes devenus vides). */
function filterOrder(context, array, drop) {
  const out = []
  for (const item of array.asArray()) {
    if (item instanceof PDFRef && drop.has(layerId(item))) continue
    const sub = context.lookup(item)
    if (sub instanceof PDFArray && !(item instanceof PDFRef)) {
      const filtered = filterOrder(context, sub, drop)
      const first = filtered[0]
      const onlyLabel = filtered.length === 1 && (first instanceof PDFString || first instanceof PDFHexString)
      if (filtered.length && !onlyLabel) out.push(context.obj(filtered))
      continue
    }
    out.push(item)
  }
  return out
}

/**
 * Applique les modifications. `edits.layers` : [{ id, name, defaultVisible,
 * locked, merge }] ; `merge` fusionne le calque dans le contenu de base
 * (toujours visible, plus de calque) ; `edits.purgeHidden` supprime
 * définitivement les calques dont l'état par défaut est « masqué ».
 * Renvoie { bytes, purged, merged, removedObjects }.
 */
export async function writeLayers(buffer, edits) {
  const doc = await PDFDocument.load(buffer, { updateMetadata: false })
  const context = doc.context
  const props = context.lookup(doc.catalog.get(N('OCProperties')))
  if (!(props instanceof PDFDict)) return { bytes: await doc.save(), purged: 0, removedObjects: 0 }

  const ocgRefs = refsOf(context, props.get(N('OCGs')))
  const refById = new Map(ocgRefs.map((r) => [layerId(r), r]))
  const byId = new Map(edits.layers.map((l) => [l.id, l]))

  // Renommage.
  for (const [id, ref] of refById) {
    const edit = byId.get(id)
    const dict = context.lookup(ref)
    if (edit && dict instanceof PDFDict) dict.set(N('Name'), PDFHexString.fromText(edit.name))
  }

  // Configuration par défaut /D : base ON, liste OFF explicite, verrous.
  let d = context.lookup(props.get(N('D')))
  if (!(d instanceof PDFDict)) {
    d = context.obj({})
    props.set(N('D'), d)
  }
  const pick = (fn) => ocgRefs.filter((r) => fn(byId.get(layerId(r))))
  d.set(N('BaseState'), N('ON'))
  d.set(N('ON'), context.obj(pick((l) => l?.defaultVisible !== false)))
  d.set(N('OFF'), context.obj(pick((l) => l?.defaultVisible === false)))
  const lockedRefs = pick((l) => l?.locked)
  if (lockedRefs.length) d.set(N('Locked'), context.obj(lockedRefs))
  else d.delete(N('Locked'))

  let purged = 0
  let removedObjects = 0
  const merged = new Set(edits.layers.filter((l) => l.merge).map((l) => l.id))
  const hidden = new Set(edits.purgeHidden ? edits.layers.filter((l) => !l.defaultVisible && !l.merge).map((l) => l.id) : [])

  if (hidden.size || merged.size) {
    purged = hidden.size
    processLayers(doc, hidden, merged)
    const drop = new Set([...hidden, ...merged])

    // Nettoyage de /OCProperties (configuration par défaut et alternatives).
    filterRefArray(context, props, 'OCGs', drop)
    const configs = [d, ...refsOf(context, props.get(N('Configs'))).map((r) => context.lookup(r))]
    const altConfigs = context.lookup(props.get(N('Configs')))
    if (altConfigs instanceof PDFArray) altConfigs.asArray().forEach((c) => !(c instanceof PDFRef) && configs.push(c))
    for (const cfg of configs) {
      if (!(cfg instanceof PDFDict)) continue
      for (const key of ['ON', 'OFF', 'Locked']) filterRefArray(context, cfg, key, drop)
      const order = context.lookup(cfg.get(N('Order')))
      if (order instanceof PDFArray) cfg.set(N('Order'), context.obj(filterOrder(context, order, drop)))
      const rb = context.lookup(cfg.get(N('RBGroups')))
      if (rb instanceof PDFArray) {
        const groups = rb.asArray().map((g) => context.lookup(g)).filter((g) => g instanceof PDFArray)
        cfg.set(N('RBGroups'), context.obj(groups.map((g) => g.asArray().filter((v) => !(v instanceof PDFRef && drop.has(layerId(v)))))))
      }
      cfg.delete(N('AS'))
    }
    if (!refsOf(context, props.get(N('OCGs'))).length) doc.catalog.delete(N('OCProperties'))
    removedObjects = collectGarbage(context)
  }

  return { bytes: await doc.save(), purged, merged: merged.size, removedObjects }
}

function processLayers(doc, hidden, merged) {
  const context = doc.context
  const isMergedRef = (value) => value instanceof PDFRef && merged.has(layerId(value))

  // Visibilité d'une entrée /OC : OCG direct ou dictionnaire d'appartenance (OCMD).
  const isHiddenOc = (value) => {
    if (value instanceof PDFRef && hidden.has(layerId(value))) return true
    const dict = context.lookup(value)
    if (!(dict instanceof PDFDict) || nameOf(dict.get(N('Type'))) !== 'OCMD' || dict.has(N('VE'))) return false
    const members = context.lookup(dict.get(N('OCGs')))
    const refs = members instanceof PDFArray ? members.asArray().filter((v) => v instanceof PDFRef) : members ? [dict.get(N('OCGs'))] : []
    if (!refs.length) return false
    const states = refs.map((r) => !hidden.has(layerId(r)))
    switch (nameOf(dict.get(N('P'))) ?? 'AnyOn') {
      case 'AllOn':
        return !states.every(Boolean)
      case 'AnyOff':
        return !states.some((s) => !s)
      case 'AllOff':
        return !states.every((s) => !s)
      default:
        return !states.some(Boolean)
    }
  }

  const usage = new Map() // dictionnaire de ressources -> noms d'XObjects utilisés
  const processedForms = new Set()

  const processStream = (bytes, resources) => {
    const lookupSub = (key) => {
      const sub = resources ? context.lookup(resources.get(N(key))) : null
      return sub instanceof PDFDict ? sub : null
    }
    const properties = lookupSub('Properties')
    const xobjects = lookupSub('XObject')
    const result = filterContent(bytes, {
      isHiddenProperty: (name) => Boolean(properties) && isHiddenOc(properties.get(N(name))),
      isMergedProperty: (name) => Boolean(properties) && isMergedRef(properties.get(N(name))),
      isHiddenXObject: (name) => {
        const xo = xobjects ? context.lookup(xobjects.get(N(name))) : null
        return xo instanceof PDFStream && xo.dict.has(N('OC')) && isHiddenOc(xo.dict.get(N('OC')))
      },
    })
    if (resources) {
      if (!usage.has(resources)) usage.set(resources, new Set())
      result.usedXObjects.forEach((n) => usage.get(resources).add(n))
    }
    // XObjects formulaires conservés : traités récursivement (une seule fois).
    for (const name of result.usedXObjects) {
      const ref = xobjects?.get(N(name))
      if (!(ref instanceof PDFRef) || processedForms.has(ref.toString())) continue
      const form = context.lookup(ref)
      if (!(form instanceof PDFStream) || nameOf(form.dict.get(N('Subtype'))) !== 'Form') continue
      processedForms.add(ref.toString())
      const formResources = context.lookup(form.dict.get(N('Resources')))
      const inner = processStream(decodeStream(form), formResources instanceof PDFDict ? formResources : resources)
      if (inner.changed) {
        const replacement = context.flateStream(inner.bytes)
        for (const [key, value] of form.dict.entries()) {
          if (!['Filter', 'DecodeParms', 'Length'].includes(key.decodeText())) replacement.dict.set(key, value)
        }
        context.assign(ref, replacement)
      }
    }
    return result
  }

  for (const page of doc.getPages()) {
    const resources = page.node.Resources()
    const contentsValue = page.node.get(N('Contents'))
    const contents = context.lookup(contentsValue)
    const refs = contents instanceof PDFArray ? contents.asArray().filter((v) => v instanceof PDFRef) : contentsValue instanceof PDFRef ? [contentsValue] : []
    if (refs.length) {
      const bytes = concatBytes(refs.map((r) => decodeStream(context.lookup(r))))
      const result = processStream(bytes, resources)
      if (result.changed) {
        // Réécriture en place : l'ancien flux ne doit pas subsister.
        context.assign(refs[0], context.flateStream(result.bytes))
        page.node.set(N('Contents'), refs[0])
      }
    }

    // Annotations rattachées à un calque masqué.
    const annots = page.node.Annots()
    if (annots) {
      const kept = annots.asArray().filter((ref) => {
        const annot = context.lookup(ref)
        if (annot instanceof PDFDict && isMergedRef(annot.get(N('OC')))) annot.delete(N('OC'))
        return !(annot instanceof PDFDict && annot.has(N('OC')) && isHiddenOc(annot.get(N('OC'))))
      })
      if (kept.length) page.node.set(N('Annots'), context.obj(kept))
      else page.node.delete(N('Annots'))
    }
  }

  // Ressources : XObjects plus utilisés et propriétés pointant vers un calque purgé.
  for (const [resources, used] of usage) {
    const xobjects = context.lookup(resources.get(N('XObject')))
    if (xobjects instanceof PDFDict) {
      for (const key of xobjects.keys()) {
        if (!used.has(key.decodeText())) {
          xobjects.delete(key)
          continue
        }
        const xo = context.lookup(xobjects.get(key))
        if (xo instanceof PDFStream && isMergedRef(xo.dict.get(N('OC')))) xo.dict.delete(N('OC'))
      }
    }
    const properties = context.lookup(resources.get(N('Properties')))
    if (properties instanceof PDFDict) {
      for (const key of properties.keys()) {
        if (isHiddenOc(properties.get(key)) || isMergedRef(properties.get(key))) properties.delete(key)
      }
    }
  }
}

/** Place tout le contenu existant de chaque page dans un nouveau calque. */
export async function createBaseLayer(buffer, name) {
  const doc = await PDFDocument.load(buffer, { updateMetadata: false })
  const context = doc.context
  const ocg = context.register(context.obj({ Type: 'OCG', Name: PDFHexString.fromText(name) }))
  doc.catalog.set(
    N('OCProperties'),
    context.obj({ OCGs: [ocg], D: { Name: PDFHexString.fromText('ONE'), BaseState: 'ON', ON: [ocg], OFF: [], Order: [ocg] } }),
  )

  const start = context.register(context.stream('/OC /OC_ONE_1 BDC\n'))
  const end = context.register(context.stream('\nEMC\n'))
  for (const page of doc.getPages()) {
    let resources = page.node.Resources()
    if (!resources) {
      resources = context.obj({})
      page.node.set(N('Resources'), resources)
    }
    let properties = context.lookup(resources.get(N('Properties')))
    if (!(properties instanceof PDFDict)) {
      properties = context.obj({})
      resources.set(N('Properties'), properties)
    }
    properties.set(N('OC_ONE_1'), ocg)

    const contentsValue = page.node.get(N('Contents'))
    const contents = context.lookup(contentsValue)
    const existing = contents instanceof PDFArray ? contents.asArray() : contentsValue ? [contentsValue] : []
    page.node.set(N('Contents'), context.obj([start, ...existing, end]))
  }
  return doc.save()
}
