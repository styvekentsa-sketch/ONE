import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFHexString,
  PDFName,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib'

/**
 * Gestion des formulaires PDF (AcroForm), 100 % local.
 *
 * Le composant travaille sur un modèle JS simple (liste de champs, chacun
 * avec ses widgets positionnés dans le repère « page affichée » : origine
 * en haut à gauche, y vers le bas, points PDF, rotation de la page
 * appliquée). Ce module fait l'aller-retour avec le vrai PDF :
 * `readForm` construit le modèle, `writeForm` réapplique le modèle complet
 * (valeurs, renommages, déplacements, nouveaux champs, suppressions).
 *
 * `pages[i]` = { w, h, transform } : viewport pdf.js de la page i à
 * l'échelle 1, dont la matrice relie espace PDF et repère d'affichage.
 */

const apply = ([a, b, c, d, e, f], x, y) => [a * x + c * y + e, b * x + d * y + f]

function invert([a, b, c, d, e, f]) {
  const det = a * d - b * c
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}

/** Rectangle PDF {x, y, width, height} -> rectangle d'affichage {x, y, w, h}. */
function toViewRect(transform, { x, y, width, height }) {
  const pts = [apply(transform, x, y), apply(transform, x + width, y + height)]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.abs(xs[1] - xs[0]), h: Math.abs(ys[1] - ys[0]) }
}

/** Rectangle d'affichage -> rectangle PDF pour pdf-lib. */
function toPdfRect(transform, { x, y, w, h }) {
  const inv = invert(transform)
  const pts = [apply(inv, x, y), apply(inv, x + w, y + h)]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.abs(xs[1] - xs[0]), height: Math.abs(ys[1] - ys[0]) }
}

function fieldType(field) {
  if (field instanceof PDFTextField) return 'text'
  if (field instanceof PDFCheckBox) return 'checkbox'
  if (field instanceof PDFRadioGroup) return 'radio'
  if (field instanceof PDFDropdown) return 'dropdown'
  if (field instanceof PDFOptionList) return 'optionlist'
  return 'other'
}

/** Taille de police déclarée dans /DA (0 = automatique). */
function fontSizeOf(field) {
  const da = field.acroField.getDefaultAppearance?.() ?? ''
  const match = /(\d+(?:\.\d+)?)\s+Tf/.exec(da)
  return match ? Number(match[1]) : 0
}

export async function readForm(buffer, pages) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })
  const form = doc.getForm()

  // Page de chaque widget : via /P quand il existe, sinon via les /Annots.
  const pageByRef = new Map(doc.getPages().map((p, i) => [p.ref.toString(), i]))
  const pageByDict = new Map()
  doc.getPages().forEach((page, i) => {
    const annots = page.node.Annots()
    if (!annots) return
    for (const ref of annots.asArray()) {
      const dict = doc.context.lookup(ref)
      if (dict) pageByDict.set(dict, i)
    }
  })

  const fields = form.getFields().map((field, index) => {
    const type = fieldType(field)
    const widgets = field.acroField.getWidgets()
    const options = type === 'radio' || type === 'dropdown' || type === 'optionlist' ? field.getOptions() : []

    const model = {
      key: `f${index}`,
      origin: 'existing',
      originalName: field.getName(),
      name: field.getName(),
      type,
      required: field.isRequired(),
      readOnly: field.isReadOnly(),
      fontSize: type === 'text' || type === 'dropdown' || type === 'optionlist' ? fontSizeOf(field) : 0,
      options,
      geometryChanged: false,
      widgets: widgets
        .map((widget, i) => {
          const pageIndex = pageByRef.get(widget.P()?.toString()) ?? pageByDict.get(widget.dict)
          if (pageIndex === undefined) return null
          let option = null
          if (type === 'radio') {
            option = options.length === widgets.length ? options[i] : widget.getOnValue()?.decodeText() ?? null
          }
          return {
            id: `f${index}w${i}`,
            index: i,
            page: pageIndex + 1,
            rect: toViewRect(pages[pageIndex].transform, widget.getRectangle()),
            option,
          }
        })
        .filter(Boolean),
    }

    switch (type) {
      case 'text':
        model.value = field.getText() ?? ''
        model.multiline = field.isMultiline()
        model.maxLength = field.getMaxLength() ?? null
        break
      case 'checkbox':
        model.value = field.isChecked()
        break
      case 'radio':
        model.value = field.getSelected() ?? null
        break
      case 'dropdown':
        model.value = field.getSelected()[0] ?? ''
        model.editable = field.isEditable()
        break
      case 'optionlist':
        model.value = field.getSelected()
        break
      default:
        model.value = null
    }
    return model
  })

  return { fields, hasXfa: form.hasXFA(), isEncrypted: doc.isEncrypted }
}

/** Valeur « vide » d'un champ, pour la réinitialisation. */
export function emptyValue(field) {
  switch (field.type) {
    case 'text':
    case 'dropdown':
      return ''
    case 'checkbox':
      return false
    case 'radio':
      return null
    case 'optionlist':
      return []
    default:
      return field.value
  }
}

function lastSegment(name) {
  const parts = name.split('.')
  return parts[parts.length - 1]
}

function setValue(field, model) {
  switch (model.type) {
    case 'text': {
      const value = model.maxLength ? model.value.slice(0, model.maxLength) : model.value
      field.setText(value || undefined)
      break
    }
    case 'checkbox':
      if (model.value) field.check()
      else field.uncheck()
      break
    case 'radio':
      if (model.value && field.getOptions().includes(model.value)) field.select(model.value)
      else field.clear()
      break
    case 'dropdown':
      if (!model.value) field.clear()
      else if (field.getOptions().includes(model.value) || field.isEditable()) field.select(model.value)
      break
    case 'optionlist': {
      const valid = model.value.filter((v) => field.getOptions().includes(v))
      if (valid.length) field.select(valid)
      else field.clear()
      break
    }
    default:
      break
  }
}

function setFlags(field, model) {
  if (model.type === 'text') {
    if (model.multiline) field.enableMultiline()
    else field.disableMultiline()
  }
  if (model.fontSize > 0 && typeof field.setFontSize === 'function') field.setFontSize(model.fontSize)
  if (model.required) field.enableRequired()
  else field.disableRequired()
  if (model.readOnly) field.enableReadOnly()
  else field.disableReadOnly()
}

const NEW_FIELD_STYLE = {
  borderColor: rgb(0.45, 0.45, 0.5),
  borderWidth: 1,
  backgroundColor: rgb(1, 1, 1),
}

/**
 * Réapplique le modèle au PDF et renvoie les nouveaux octets.
 * `deletedNames` : noms d'origine des champs existants supprimés.
 */
export async function writeForm(buffer, pages, fields, deletedNames, { flatten = false } = {}) {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const form = doc.getForm()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const pdfPages = doc.getPages()
  const existing = new Map(form.getFields().map((f) => [f.getName(), f]))

  for (const name of deletedNames) {
    const field = existing.get(name)
    if (field) form.removeField(field)
  }

  const widgetOptions = (w) => {
    const page = pdfPages[w.page - 1]
    return {
      page,
      options: {
        ...toPdfRect(pages[w.page - 1].transform, w.rect),
        ...NEW_FIELD_STYLE,
        rotate: degrees(page.getRotation().angle),
      },
    }
  }

  for (const model of fields) {
    let field

    if (model.origin === 'existing') {
      field = existing.get(model.originalName)
      if (!field || model.type === 'other') continue

      if (model.name !== model.originalName) {
        field.acroField.setPartialName(lastSegment(model.name))
      }
      if (model.geometryChanged) {
        const widgets = field.acroField.getWidgets()
        for (const w of model.widgets) {
          widgets[w.index]?.setRectangle(toPdfRect(pages[w.page - 1].transform, w.rect))
        }
      }
      if (model.type === 'dropdown' || model.type === 'optionlist') {
        const current = field.getOptions()
        if (current.join('\u0000') !== model.options.join('\u0000')) field.setOptions(model.options)
      }
    } else {
      switch (model.type) {
        case 'text':
          field = form.createTextField(model.name)
          break
        case 'checkbox':
          field = form.createCheckBox(model.name)
          break
        case 'radio':
          field = form.createRadioGroup(model.name)
          break
        case 'dropdown':
          field = form.createDropdown(model.name)
          field.setOptions(model.options)
          break
        default:
          continue
      }
      for (const w of model.widgets) {
        const { page, options } = widgetOptions(w)
        if (model.type === 'radio') field.addOptionToPage(w.option, page, options)
        else field.addToPage(page, { ...options, font })
      }
      // Valeur par défaut (/DV) pour les nouveaux champs texte.
      if (model.type === 'text' && model.value) {
        field.acroField.dict.set(PDFName.of('DV'), PDFHexString.fromText(model.value))
      }
    }

    setValue(field, model)
    setFlags(field, model)
    form.markFieldAsDirty(field.ref)
  }

  // Les apparences échouent si une valeur contient un caractère hors
  // WinAnsi : on laisse alors le lecteur PDF les régénérer à l'ouverture.
  try {
    form.updateFieldAppearances(font)
  } catch (err) {
    if (flatten) throw err
    console.warn('Apparences non régénérées :', err)
    form.acroForm.dict.set(PDFName.of('NeedAppearances'), doc.context.obj(true))
  }

  if (flatten) form.flatten({ updateFieldAppearances: false })
  return doc.save()
}

/* ---- Import / export des données ---------------------------------------- */

export function formDataObject(fields) {
  const data = {}
  for (const f of fields) {
    if (f.type !== 'other') data[f.name] = f.value
  }
  return data
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join('; ') : value === null || value === undefined ? '' : String(value)
  return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function formDataCsv(fields) {
  const rows = [['champ', 'type', 'valeur']]
  for (const f of fields) {
    if (f.type !== 'other') rows.push([f.name, f.type, f.value])
  }
  // BOM : Excel lit alors correctement les accents.
  return `﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/**
 * Applique un objet { nom: valeur } au modèle, avec conversion de type.
 * Renvoie le nouveau modèle et le nombre de champs remplis / ignorés.
 */
export function applyImportedData(fields, data) {
  let applied = 0
  const known = new Set()
  const next = fields.map((f) => {
    if (!(f.name in data) || f.type === 'other') return f
    known.add(f.name)
    const raw = data[f.name]
    let value
    switch (f.type) {
      case 'text':
        value = raw === null || raw === undefined ? '' : String(raw)
        if (f.maxLength) value = value.slice(0, f.maxLength)
        break
      case 'checkbox':
        value = raw === true || ['true', 'oui', 'yes', 'si', 'sí', '1', 'on', 'x'].includes(String(raw).toLowerCase())
        break
      case 'radio': {
        const options = [...new Set(f.widgets.map((w) => w.option))]
        value = options.includes(String(raw)) ? String(raw) : null
        break
      }
      case 'dropdown':
        value = f.options.includes(String(raw)) || f.editable ? String(raw ?? '') : f.value
        break
      case 'optionlist': {
        const list = Array.isArray(raw) ? raw.map(String) : String(raw ?? '').split(/;\s*/)
        value = list.filter((v) => f.options.includes(v))
        break
      }
      default:
        value = f.value
    }
    applied += 1
    return { ...f, value }
  })
  const ignored = Object.keys(data).filter((k) => !known.has(k)).length
  return { fields: next, applied, ignored }
}
