import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnnotationMode } from 'pdfjs-dist'
import {
  ArrowLeft,
  Asterisk,
  Check,
  CheckCircle2,
  CircleDot,
  Download,
  Eye,
  FileJson,
  FileSpreadsheet,
  FormInput,
  List,
  LoaderCircle,
  LocateFixed,
  Lock,
  MousePointer2,
  PencilRuler,
  Plus,
  RotateCcw,
  SquareCheck,
  TextCursorInput,
  Trash,
  TriangleAlert,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import Modal from '../../components/Modal'
import { loadPdfDocument, destroyPdfDocument } from '../../utils/pdfRender'
import {
  applyImportedData,
  emptyValue,
  formDataCsv,
  formDataObject,
  readForm,
  writeForm,
} from '../../utils/pdfFormsWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'

const CSS_UNITS = 96 / 72
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const FONT_SIZES = [0, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24]

const TYPE_ICONS = {
  text: TextCursorInput,
  checkbox: SquareCheck,
  radio: CircleDot,
  dropdown: List,
  optionlist: List,
  other: FormInput,
}

const BUILDER_TOOLS = [
  { id: 'select', icon: MousePointer2 },
  { id: 'text', icon: TextCursorInput },
  { id: 'checkbox', icon: SquareCheck },
  { id: 'radio', icon: CircleDot },
  { id: 'dropdown', icon: List },
]

// Taille par défaut d'un champ posé d'un simple clic (points PDF).
const DEFAULT_SIZES = {
  text: { w: 160, h: 22 },
  checkbox: { w: 14, h: 14 },
  radio: { w: 14, h: 14 },
  dropdown: { w: 140, h: 22 },
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const uid = () => Math.random().toString(36).slice(2, 10)

function isEmpty(field) {
  if (field.type === 'checkbox') return !field.value
  if (field.type === 'optionlist') return !field.value?.length
  return field.value === null || field.value === ''
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* -------------------------------------------------------------------------- */
/* Petits composants                                                          */
/* -------------------------------------------------------------------------- */

function IconButton({ icon: Icon, label, onClick, active = false, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'
      } ${className}`}
    >
      <Icon size={18} />
    </button>
  )
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-800" />

function Toggle({ checked, onChange, label, icon: Icon }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
      {Icon && <Icon size={15} className="text-zinc-400" />}
      {label}
    </label>
  )
}

const inputClass =
  'w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

/** Contrôle de saisie d'une valeur de champ (panneau latéral / inspecteur). */
function FieldControl({ field, onChange, disabled, f }) {
  const radioOptions = [...new Set(field.widgets.map((w) => w.option).filter(Boolean))]
  switch (field.type) {
    case 'text':
      return field.multiline ? (
        <textarea
          rows={3}
          value={field.value}
          maxLength={field.maxLength ?? undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} resize-y`}
        />
      ) : (
        <input
          value={field.value}
          maxLength={field.maxLength ?? undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      )
    case 'checkbox':
      return <Toggle checked={field.value} onChange={(v) => !disabled && onChange(v)} label={field.value ? f('checked') : f('unchecked')} />
    case 'radio':
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {radioOptions.map((option) => (
            <label key={option} className="flex items-center gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="radio"
                checked={field.value === option}
                disabled={disabled}
                onChange={() => onChange(option)}
                className="accent-emerald-600"
              />
              {option}
            </label>
          ))}
          {field.value && !disabled && (
            <button type="button" onClick={() => onChange(null)} className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400">
              {f('clearChoice')}
            </button>
          )}
        </div>
      )
    case 'dropdown':
      return (
        <select value={field.value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={inputClass}>
          <option value="">{f('noSelection')}</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'optionlist':
      return (
        <select
          multiple
          value={field.value}
          disabled={disabled}
          onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
          className={`${inputClass} min-h-20`}
        >
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    default:
      return <p className="text-xs italic text-zinc-500 dark:text-zinc-400">{f('notEditable')}</p>
  }
}

/** Renommage avec validation (non vide, unique). */
function NameInput({ field, isTaken, onRename, f }) {
  const [draft, setDraft] = useState(field.name)
  const trimmed = draft.trim()
  const error = !trimmed ? f('inspector.nameEmpty') : trimmed !== field.name && isTaken(trimmed) ? f('inspector.nameTaken') : null
  return (
    <div>
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          const next = e.target.value.trim()
          if (next && (next === field.name || !isTaken(next))) onRename(next)
        }}
        className={`${inputClass} font-mono ${error ? 'border-red-400 dark:border-red-500/60' : ''}`}
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page avec ses champs                                                       */
/* -------------------------------------------------------------------------- */

const PageView = memo(function PageView({
  pdf,
  pageNumber,
  info,
  scale,
  widgets,
  mode,
  tool,
  activeKey,
  scrollRoot,
  registerRef,
  onValue,
  onFocusField,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}) {
  const wrapperRef = useRef(null)
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const width = Math.floor(info.w * scale)
  const height = Math.floor(info.h * scale)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: scrollRoot,
      rootMargin: '100% 0px',
    })
    observer.observe(wrapperRef.current)
    return () => observer.disconnect()
  }, [scrollRoot])

  // Rendu sans les widgets de formulaire (ENABLE_FORMS) : ce sont nos
  // contrôles HTML superposés qui les affichent.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!visible) {
      canvas.width = 0
      canvas.height = 0
      return undefined
    }
    let cancelled = false
    let task = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      task = page.render({
        canvas,
        canvasContext: canvas.getContext('2d'),
        viewport,
        annotationMode: AnnotationMode.ENABLE_FORMS,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
      })
      await task.promise
    })().catch((err) => {
      if (err?.name !== 'RenderingCancelledException') console.error(err)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber, scale, visible])

  const building = mode === 'build'

  const renderFillControl = ({ field, widget }) => {
    const style = { fontSize: (field.fontSize || clamp(widget.rect.h * 0.62, 7, 13)) * scale }
    const ring = activeKey === field.key ? 'ring-2 ring-emerald-500' : field.required && isEmpty(field) ? 'ring-1 ring-red-400' : 'ring-1 ring-sky-400/50'
    const base = `h-full w-full bg-sky-100/40 text-zinc-900 outline-none transition-shadow hover:bg-sky-100/70 focus:bg-white disabled:cursor-not-allowed disabled:bg-zinc-200/40 ${ring}`
    const common = { disabled: field.readOnly, onFocus: () => onFocusField(field.key), 'aria-label': field.name, title: field.name }

    switch (field.type) {
      case 'text':
        return field.multiline ? (
          <textarea {...common} value={field.value} maxLength={field.maxLength ?? undefined} onChange={(e) => onValue(field.key, e.target.value)} className={`${base} resize-none px-1`} style={style} />
        ) : (
          <input {...common} value={field.value} maxLength={field.maxLength ?? undefined} onChange={(e) => onValue(field.key, e.target.value)} className={`${base} px-1`} style={style} />
        )
      case 'checkbox':
        return (
          <button {...common} type="button" role="checkbox" aria-checked={field.value} onClick={() => onValue(field.key, !field.value)} className={`${base} flex items-center justify-center`}>
            {field.value && <Check style={{ width: '85%', height: '85%' }} strokeWidth={3} />}
          </button>
        )
      case 'radio': {
        const selected = field.value === widget.option
        return (
          <button
            {...common}
            type="button"
            role="radio"
            aria-checked={selected}
            title={`${field.name} : ${widget.option}`}
            onClick={() => onValue(field.key, widget.option)}
            className={`${base} flex items-center justify-center rounded-full`}
          >
            {selected && <span className="block h-1/2 w-1/2 rounded-full bg-zinc-900" />}
          </button>
        )
      }
      case 'dropdown':
        return (
          <select {...common} value={field.value} onChange={(e) => onValue(field.key, e.target.value)} className={`${base} px-0.5`} style={style}>
            <option value="" />
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )
      case 'optionlist':
        return (
          <select
            {...common}
            multiple
            value={field.value}
            onChange={(e) => onValue(field.key, Array.from(e.target.selectedOptions).map((o) => o.value))}
            className={base}
            style={style}
          >
            {field.options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )
      default:
        return <div className="h-full w-full border border-dashed border-zinc-400/70" title={field.name} />
    }
  }

  return (
    <div
      ref={(el) => {
        wrapperRef.current = el
        registerRef(pageNumber, el)
      }}
      className="relative shrink-0 bg-white shadow-md ring-1 ring-zinc-200 dark:ring-zinc-800"
      style={{ width, height }}
    >
      <canvas ref={canvasRef} className="absolute left-0 top-0" style={{ width, height }} />
      <div
        className="absolute inset-0"
        style={{ cursor: building && tool !== 'select' ? 'crosshair' : undefined, touchAction: building && tool !== 'select' ? 'none' : undefined }}
        onPointerDown={building ? (e) => onPointerDown(e, pageNumber, info, scale) : undefined}
        onPointerMove={building ? (e) => onPointerMove(e, scale) : undefined}
        onPointerUp={building ? onPointerUp : undefined}
        onPointerCancel={building ? onPointerUp : undefined}
      >
        {widgets.map((entry) => {
          const { field, widget, rect } = entry
          const Icon = TYPE_ICONS[field.type]
          const active = activeKey === field.key
          return (
            <div
              key={widget.id}
              className="absolute"
              style={{ left: rect.x * scale, top: rect.y * scale, width: rect.w * scale, height: rect.h * scale }}
            >
              {building ? (
                <div
                  data-field={field.key}
                  data-widget={widget.id}
                  className={`group relative h-full w-full cursor-move border ${
                    active ? 'border-emerald-500 bg-emerald-500/15' : 'border-sky-500/70 bg-sky-500/10 hover:bg-sky-500/20'
                  } ${field.type === 'radio' ? 'rounded-full' : 'rounded-sm'}`}
                  style={{ touchAction: 'none' }}
                >
                  {rect.w * scale > 48 && rect.h * scale > 14 && (
                    <span className="pointer-events-none absolute inset-x-1 top-1/2 flex -translate-y-1/2 items-center gap-1 truncate text-[10px] font-medium text-sky-900">
                      <Icon size={11} className="shrink-0" />
                      <span className="truncate">{field.name}</span>
                    </span>
                  )}
                  {active && (
                    <span
                      data-field={field.key}
                      data-widget={widget.id}
                      data-handle="se"
                      className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-emerald-600 bg-white"
                    />
                  )}
                </div>
              ) : (
                renderFillControl(entry)
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
})

/* -------------------------------------------------------------------------- */
/* Espace de travail                                                          */
/* -------------------------------------------------------------------------- */

function Workspace({ doc, onClose }) {
  const { t } = useTranslation()
  const f = useCallback((key, opts) => t(`tools.pdf-forms.${key}`, opts), [t])
  const { pdf, pages, file, bytes, analysis } = doc

  const scrollRef = useRef(null)
  const pageRefs = useRef([])
  const importRef = useRef(null)
  const dragRef = useRef(null)

  const [scrollRoot, setScrollRoot] = useState(null)
  const [fields, setFields] = useState(analysis.fields)
  const [deletedNames, setDeletedNames] = useState([])
  const [mode, setMode] = useState(analysis.fields.length ? 'fill' : 'build')
  const [tool, setTool] = useState('select')
  const [activeKey, setActiveKey] = useState(null)
  const [mobileTab, setMobileTab] = useState('preview')
  const [dirty, setDirty] = useState(false)
  const [notice, setNotice] = useState(null)
  const [dataMenuOpen, setDataMenuOpen] = useState(false)
  const [flattenOnExport, setFlattenOnExport] = useState(false)
  const [exportState, setExportState] = useState(null)
  const [dragPreview, setDragPreview] = useState(null)
  const [zoom, setZoom] = useState(() => {
    const mobile = window.matchMedia('(max-width: 1023px)').matches
    const available = window.innerWidth - (mobile ? 40 : 320 + 120)
    return clamp(available / (pages[0].w * CSS_UNITS), MIN_ZOOM, 1.25)
  })
  const scale = zoom * CSS_UNITS

  useEffect(() => {
    if (!notice) return undefined
    const timer = setTimeout(() => setNotice(null), 4500)
    return () => clearTimeout(timer)
  }, [notice])

  const activeField = fields.find((fl) => fl.key === activeKey) ?? null

  /* ---- Mise à jour du modèle --------------------------------------------- */
  const updateField = useCallback((key, patch) => {
    setFields((list) => list.map((fl) => (fl.key === key ? { ...fl, ...patch } : fl)))
    setDirty(true)
  }, [])

  const setValue = useCallback((key, value) => updateField(key, { value }), [updateField])

  const isTaken = useCallback((name) => fields.some((fl) => fl.name === name), [fields])

  const uniqueName = (base) => {
    let n = 1
    while (fields.some((fl) => fl.name === `${base}_${n}`)) n += 1
    return `${base}_${n}`
  }

  const deleteField = (field) => {
    if (field.origin === 'existing') setDeletedNames((list) => [...list, field.originalName])
    setFields((list) => list.filter((fl) => fl.key !== field.key))
    setActiveKey(null)
    setDirty(true)
  }

  const clearForm = () => {
    if (!window.confirm(f('confirmClear'))) return
    setFields((list) => list.map((fl) => (fl.readOnly ? fl : { ...fl, value: emptyValue(fl) })))
    setDirty(true)
    setNotice({ type: 'success', text: f('notices.cleared') })
  }

  /* ---- Navigation -------------------------------------------------------- */
  const registerRef = useCallback((n, el) => {
    pageRefs.current[n - 1] = el
  }, [])

  const revealField = useCallback(
    (field) => {
      const widget = field.widgets[0]
      const container = scrollRef.current
      const pageEl = widget && pageRefs.current[widget.page - 1]
      if (!container || !pageEl) return
      container.scrollTo({
        top: pageEl.offsetTop + widget.rect.y * scale - container.clientHeight / 3,
        left: Math.max(0, pageEl.offsetLeft + widget.rect.x * scale - 40),
        behavior: 'smooth',
      })
    },
    [scale],
  )

  const focusFromPanel = useCallback(
    (field) => {
      setActiveKey(field.key)
      if (window.matchMedia('(min-width: 1024px)').matches) revealField(field)
    },
    [revealField],
  )

  const locateField = useCallback(
    (field) => {
      setActiveKey(field.key)
      setMobileTab('preview')
      requestAnimationFrame(() => revealField(field))
    },
    [revealField],
  )

  const zoomIn = () => setZoom((z) => clamp(ZOOM_PRESETS.find((p) => p > z + 0.001) ?? MAX_ZOOM, MIN_ZOOM, MAX_ZOOM))
  const zoomOut = () => setZoom((z) => clamp([...ZOOM_PRESETS].reverse().find((p) => p < z - 0.001) ?? MIN_ZOOM, MIN_ZOOM, MAX_ZOOM))

  /* ---- Mode création : pointeur ----------------------------------------- */
  const toPoint = (e, scaleNow) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return [(e.clientX - rect.left) / scaleNow, (e.clientY - rect.top) / scaleNow]
  }

  const createField = (type, page, rect) => {
    const key = `n${uid()}`
    const base = {
      key,
      origin: 'new',
      type,
      required: false,
      readOnly: false,
      fontSize: type === 'text' || type === 'dropdown' ? 12 : 0,
      options: [],
      geometryChanged: false,
    }
    let field
    if (type === 'text') field = { ...base, name: uniqueName(f('defaults.text')), value: '', multiline: false, maxLength: null }
    else if (type === 'checkbox') field = { ...base, name: uniqueName(f('defaults.checkbox')), value: false }
    else if (type === 'radio') field = { ...base, name: uniqueName(f('defaults.radio')), value: null }
    else field = { ...base, name: uniqueName(f('defaults.dropdown')), value: '', options: ['Option 1', 'Option 2'], editable: false }
    field.widgets = [{ id: `${key}w0`, page, rect, option: type === 'radio' ? 'Option 1' : null }]
    setFields((list) => [...list, field])
    setActiveKey(key)
    setTool('select')
    setDirty(true)
  }

  const handlePointerDown = (e, page, info, scaleNow) => {
    if (e.button > 0) return
    const point = toPoint(e, scaleNow)
    const hit = e.target.closest?.('[data-widget]')

    if (tool === 'select') {
      if (!hit) {
        setActiveKey(null)
        return
      }
      const field = fields.find((fl) => fl.key === hit.dataset.field)
      const widget = field?.widgets.find((w) => w.id === hit.dataset.widget)
      if (!widget) return
      e.preventDefault()
      setActiveKey(field.key)
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { kind: hit.dataset.handle ? 'resize' : 'move', field, widget, start: point, info, moved: false }
      return
    }

    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind: 'create', type: tool, page, start: point, info }
    setDragPreview({ page, rect: { x: point[0], y: point[1], w: 0, h: 0 } })
  }

  const handlePointerMove = (e, scaleNow) => {
    const drag = dragRef.current
    if (!drag) return
    const [px, py] = toPoint(e, scaleNow)
    const { w: pw, h: ph } = drag.info
    if (drag.kind === 'create') {
      const [sx, sy] = drag.start
      setDragPreview({ page: drag.page, rect: { x: Math.min(sx, px), y: Math.min(sy, py), w: Math.abs(px - sx), h: Math.abs(py - sy) } })
      return
    }
    const r = drag.widget.rect
    let rect
    if (drag.kind === 'move') {
      rect = { ...r, x: clamp(r.x + px - drag.start[0], 0, pw - r.w), y: clamp(r.y + py - drag.start[1], 0, ph - r.h) }
    } else {
      const minSize = drag.field.type === 'checkbox' || drag.field.type === 'radio' ? 8 : 12
      rect = { ...r, w: clamp(px - r.x, minSize, pw - r.x), h: clamp(py - r.y, minSize, ph - r.y) }
    }
    drag.moved = true
    setDragPreview({ widgetId: drag.widget.id, rect })
  }

  const handlePointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    const preview = dragPreview
    setDragPreview(null)
    if (!drag) return

    if (drag.kind === 'create') {
      const size = DEFAULT_SIZES[drag.type]
      const [sx, sy] = drag.start
      const fixed = drag.type === 'checkbox' || drag.type === 'radio'
      const drawn = preview?.rect
      const rect =
        !fixed && drawn && drawn.w > 8 && drawn.h > 8
          ? drawn
          : { x: clamp(sx - (fixed ? size.w / 2 : 0), 0, drag.info.w - size.w), y: clamp(sy - size.h / 2, 0, drag.info.h - size.h), ...size }
      createField(drag.type, drag.page, rect)
      return
    }
    if (drag.moved && preview?.rect) {
      setFields((list) =>
        list.map((fl) =>
          fl.key === drag.field.key
            ? { ...fl, geometryChanged: true, widgets: fl.widgets.map((w) => (w.id === drag.widget.id ? { ...w, rect: preview.rect } : w)) }
            : fl,
        ),
      )
      setDirty(true)
    }
  }

  /* ---- Widgets par page -------------------------------------------------- */
  const widgetsByPage = useMemo(() => {
    const map = new Map()
    for (const field of fields) {
      for (const widget of field.widgets) {
        const rect = dragPreview?.widgetId === widget.id ? dragPreview.rect : widget.rect
        if (!map.has(widget.page)) map.set(widget.page, [])
        map.get(widget.page).push({ field, widget, rect })
      }
    }
    if (dragPreview?.page && dragPreview.rect.w > 0) {
      const ghost = { key: 'ghost', name: '', type: tool === 'select' ? 'text' : tool, widgets: [] }
      if (!map.has(dragPreview.page)) map.set(dragPreview.page, [])
      map.get(dragPreview.page).push({ field: ghost, widget: { id: 'ghost' }, rect: dragPreview.rect })
    }
    return map
  }, [fields, dragPreview, tool])

  /* ---- Import / export des données --------------------------------------- */
  const exportData = (format) => {
    setDataMenuOpen(false)
    const base = file.name.replace(/\.pdf$/i, '')
    if (format === 'json') {
      downloadBlob(new Blob([JSON.stringify(formDataObject(fields), null, 2)], { type: 'application/json' }), `${base}_donnees.json`)
    } else {
      downloadBlob(new Blob([formDataCsv(fields)], { type: 'text/csv;charset=utf-8' }), `${base}_donnees.csv`)
    }
  }

  const importData = async (e) => {
    const [jsonFile] = e.target.files ?? []
    e.target.value = ''
    if (!jsonFile) return
    try {
      const data = JSON.parse(await jsonFile.text())
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('format')
      const result = applyImportedData(fields, data)
      setFields(result.fields)
      setDirty(true)
      setNotice({ type: 'success', text: f('notices.imported', { applied: result.applied, ignored: result.ignored }) })
    } catch (err) {
      console.error(err)
      setNotice({ type: 'error', text: f('notices.importError') })
    }
  }

  /* ---- Génération du PDF -------------------------------------------------- */
  const generate = async () => {
    setExportState({ status: 'working' })
    try {
      const output = await writeForm(bytes, pages, fields, deletedNames, { flatten: flattenOnExport })
      const blob = new Blob([output], { type: 'application/pdf' })
      setExportState({ status: 'done', blob })
      setDirty(false)
      addHistoryEntry({
        toolId: 'pdf-forms',
        toolName: f('name'),
        message: f('historyMessage', { name: file.name, count: fields.length }),
      })
    } catch (err) {
      console.error(err)
      setExportState({ status: 'error' })
    }
  }

  const handleClose = () => {
    if (dirty && !window.confirm(f('confirmClose'))) return
    onClose()
  }

  const filledCount = fields.filter((fl) => fl.type !== 'other' && !isEmpty(fl)).length
  const zoomIsPreset = ZOOM_PRESETS.some((p) => Math.abs(p - zoom) < 0.001)

  /* ---- Panneau latéral --------------------------------------------------- */
  const fieldsByPage = useMemo(() => {
    const groups = new Map()
    for (const field of fields) {
      const page = field.widgets[0]?.page ?? 0
      if (!groups.has(page)) groups.set(page, [])
      groups.get(page).push(field)
    }
    return [...groups.entries()].sort((x, y) => x[0] - y[0])
  }, [fields])

  const renderFieldList = (onPick) =>
    fields.length === 0 ? (
      <p className="px-2 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{f('noFields')}</p>
    ) : (
      fieldsByPage.map(([page, list]) => (
        <div key={page} className="mb-4">
          <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {page ? f('pageLabel', { n: page }) : f('noPage')}
          </p>
          <ul className="flex flex-col gap-2">
            {list.map((field) => {
              const Icon = TYPE_ICONS[field.type]
              const active = activeKey === field.key
              return (
                <li
                  key={field.key}
                  onFocusCapture={() => onPick(field)}
                  onClick={() => onPick(field)}
                  className={`rounded-xl border p-3 transition-colors ${
                    active ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-500/5' : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <Icon size={15} className="shrink-0 text-zinc-400" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-zinc-800 dark:text-zinc-200" title={field.name}>
                      {field.name}
                    </span>
                    {field.required && <Asterisk size={13} className="shrink-0 text-red-500" aria-label={f('required')} />}
                    {field.readOnly && <Lock size={13} className="shrink-0 text-zinc-400" aria-label={f('readOnly')} />}
                    <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {f(`types.${field.type}`)}
                    </span>
                    {field.widgets.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          locateField(field)
                        }}
                        title={f('locate')}
                        aria-label={f('locate')}
                        className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-emerald-600 lg:hidden"
                      >
                        <LocateFixed size={15} />
                      </button>
                    )}
                  </div>
                  {mode === 'fill' && <FieldControl field={field} disabled={field.readOnly} onChange={(v) => setValue(field.key, v)} f={f} />}
                </li>
              )
            })}
          </ul>
        </div>
      ))
    )

  const renderInspector = () => {
    if (!activeField) {
      return (
        <div className="flex flex-col gap-4">
          <p className="rounded-xl bg-zinc-100 px-3 py-2.5 text-sm text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">{f('inspector.hint')}</p>
          {renderFieldList((field) => focusFromPanel(field))}
        </div>
      )
    }
    const field = activeField
    const editable = field.type !== 'other'
    const canEditRadioOptions = field.type === 'radio' && field.origin === 'new'
    const radioWidgets = field.widgets

    return (
      <div key={field.key} className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            {(() => {
              const Icon = TYPE_ICONS[field.type]
              return <Icon size={14} />
            })()}
            {f(`types.${field.type}`)}
          </span>
          <button type="button" onClick={() => setActiveKey(null)} className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
            {f('inspector.backToList')}
          </button>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{f('inspector.name')}</p>
          {editable ? (
            <NameInput field={field} isTaken={isTaken} onRename={(name) => updateField(field.key, { name })} f={f} />
          ) : (
            <p className="font-mono text-sm text-zinc-800 dark:text-zinc-200">{field.name}</p>
          )}
        </div>

        {editable && (
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{f('inspector.defaultValue')}</p>
            <FieldControl field={field} onChange={(v) => setValue(field.key, v)} f={f} />
          </div>
        )}

        {(field.type === 'dropdown' || field.type === 'optionlist') && (
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{f('inspector.options')}</p>
            <textarea
              rows={4}
              value={field.options.join('\n')}
              onChange={(e) => {
                const options = e.target.value.split('\n')
                const clean = options.map((o) => o.trim()).filter(Boolean)
                const value = field.type === 'dropdown' ? (clean.includes(field.value) ? field.value : '') : field.value.filter((v) => clean.includes(v))
                updateField(field.key, { options, value })
              }}
              onBlur={() => updateField(field.key, { options: [...new Set(field.options.map((o) => o.trim()).filter(Boolean))] })}
              className={`${inputClass} resize-y font-mono`}
            />
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{f('inspector.optionsHint')}</p>
          </div>
        )}

        {canEditRadioOptions && (
          <div>
            <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">{f('inspector.radioOptions')}</p>
            <ul className="flex flex-col gap-1.5">
              {radioWidgets.map((w) => (
                <li key={w.id} className="flex items-center gap-1.5">
                  <CircleDot size={14} className="shrink-0 text-zinc-400" />
                  <input
                    value={w.option}
                    onChange={(e) => {
                      const option = e.target.value
                      updateField(field.key, {
                        value: field.value === w.option ? option : field.value,
                        widgets: field.widgets.map((x) => (x.id === w.id ? { ...x, option } : x)),
                      })
                    }}
                    className={inputClass}
                  />
                  <IconButton
                    icon={Trash}
                    label={f('inspector.removeOption')}
                    disabled={radioWidgets.length <= 1}
                    onClick={() =>
                      updateField(field.key, {
                        value: field.value === w.option ? null : field.value,
                        widgets: field.widgets.filter((x) => x.id !== w.id),
                      })
                    }
                  />
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                const last = radioWidgets[radioWidgets.length - 1]
                const pageInfo = pages[last.page - 1]
                let n = radioWidgets.length + 1
                while (radioWidgets.some((x) => x.option === `Option ${n}`)) n += 1
                updateField(field.key, {
                  widgets: [
                    ...field.widgets,
                    {
                      id: `${field.key}w${uid()}`,
                      page: last.page,
                      option: `Option ${n}`,
                      rect: { ...last.rect, y: clamp(last.rect.y + last.rect.h + 8, 0, pageInfo.h - last.rect.h) },
                    },
                  ],
                })
              }}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
            >
              <Plus size={15} /> {f('inspector.addOption')}
            </button>
          </div>
        )}

        {(field.type === 'text' || field.type === 'dropdown' || field.type === 'optionlist') && (
          <label className="flex items-center justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            {f('inspector.fontSize')}
            <select
              value={field.fontSize}
              onChange={(e) => updateField(field.key, { fontSize: Number(e.target.value) })}
              className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {(FONT_SIZES.includes(field.fontSize) ? FONT_SIZES : [...FONT_SIZES, field.fontSize]).map((s) => (
                <option key={s} value={s}>
                  {s === 0 ? f('inspector.auto') : `${s} pt`}
                </option>
              ))}
            </select>
          </label>
        )}

        {editable && (
          <div className="flex flex-col gap-2.5 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            {field.type === 'text' && (
              <Toggle checked={field.multiline} onChange={(v) => updateField(field.key, { multiline: v })} label={f('inspector.multiline')} />
            )}
            <Toggle checked={field.required} onChange={(v) => updateField(field.key, { required: v })} label={f('required')} icon={Asterisk} />
            <Toggle checked={field.readOnly} onChange={(v) => updateField(field.key, { readOnly: v })} label={f('readOnly')} icon={Lock} />
          </div>
        )}

        <button
          type="button"
          onClick={() => deleteField(field)}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <Trash size={15} /> {f('inspector.delete')}
        </button>
      </div>
    )
  }

  /* ---- Rendu ------------------------------------------------------------- */
  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-104 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:h-[calc(100dvh-9rem)] dark:border-zinc-800 dark:bg-zinc-950">
      {/* Barre d'outils */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-white px-1.5 py-1.5 scrollbar-none dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex shrink-0 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800" role="tablist" aria-label={f('modeLabel')}>
          {[
            { id: 'fill', icon: Eye },
            { id: 'build', icon: PencilRuler },
          ].map(({ id, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => {
                setMode(id)
                setTool('select')
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                mode === id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
              }`}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{f(`modes.${id}`)}</span>
            </button>
          ))}
        </div>

        {mode === 'build' && (
          <>
            <Divider />
            {BUILDER_TOOLS.map(({ id, icon }) => (
              <IconButton key={id} icon={icon} label={f(`builderTools.${id}`)} onClick={() => setTool(id)} active={tool === id} />
            ))}
          </>
        )}

        <Divider />
        <IconButton icon={ZoomOut} label={f('zoomOut')} onClick={zoomOut} disabled={zoom <= MIN_ZOOM} />
        <select
          value={zoomIsPreset ? String(zoom) : 'custom'}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={f('zoom')}
          className="h-8 shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
        >
          {!zoomIsPreset && <option value="custom">{Math.round(zoom * 100)} %</option>}
          {ZOOM_PRESETS.map((p) => (
            <option key={p} value={String(p)}>
              {Math.round(p * 100)} %
            </option>
          ))}
        </select>
        <IconButton icon={ZoomIn} label={f('zoomIn')} onClick={zoomIn} disabled={zoom >= MAX_ZOOM} />

        <div className="flex-1" />

        <IconButton icon={RotateCcw} label={f('actions.clear')} onClick={clearForm} disabled={!fields.length} />
        <div className="relative shrink-0">
          <IconButton icon={FileJson} label={f('actions.exportData')} onClick={() => setDataMenuOpen((v) => !v)} active={dataMenuOpen} disabled={!fields.length} />
        </div>
        <IconButton icon={Upload} label={f('actions.importData')} onClick={() => importRef.current?.click()} disabled={!fields.length} />
        <input ref={importRef} type="file" accept="application/json,.json" className="hidden" onChange={importData} />
        <button
          type="button"
          onClick={() => setExportState({ status: 'idle' })}
          className="ml-1 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
        >
          <Download size={16} />
          <span className="hidden sm:inline">{f('actions.download')}</span>
        </button>
        <IconButton icon={X} label={f('actions.close')} onClick={handleClose} />
      </div>

      {/* Menu d'export des données (hors de la barre défilante pour ne pas être rogné) */}
      {dataMenuOpen && (
        <div className="relative z-30">
          <div className="absolute right-2 top-1 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            {[
              { id: 'json', icon: FileJson },
              { id: 'csv', icon: FileSpreadsheet },
            ].map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => exportData(id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                <Icon size={16} className="text-zinc-400" /> {f(`actions.export_${id}`)}
              </button>
            ))}
          </div>
        </div>
      )}

      {analysis.hasXfa && (
        <p className="flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
          <TriangleAlert size={17} className="mt-0.5 shrink-0" /> {f('xfaWarning')}
        </p>
      )}
      {mode === 'build' && !fields.length && (
        <p className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-300">
          {f('builderHint')}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${
            notice.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300'
          }`}
        >
          {notice.type === 'error' ? <TriangleAlert size={16} /> : <CheckCircle2 size={16} />} {notice.text}
        </p>
      )}

      {/* Onglets mobiles */}
      <div className="flex border-b border-zinc-200 lg:hidden dark:border-zinc-800" role="tablist">
        {['preview', 'fields'].map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobileTab === id}
            onClick={() => setMobileTab(id)}
            className={`flex-1 border-b-2 py-2 text-sm font-medium ${
              mobileTab === id ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400' : 'border-transparent text-zinc-500 dark:text-zinc-400'
            }`}
          >
            {id === 'preview' ? f('tabs.preview') : f('tabs.fields', { count: fields.length })}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Aperçu */}
        <div
          ref={(el) => {
            scrollRef.current = el
            if (el && el !== scrollRoot) setScrollRoot(el)
          }}
          className={`relative min-w-0 flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950 ${mobileTab === 'preview' ? '' : 'hidden lg:block'}`}
        >
          <div className="flex w-max min-w-full flex-col items-center gap-4 px-2 py-4 sm:px-6">
            {scrollRoot &&
              pages.map((info, i) => (
                <PageView
                  key={i}
                  pdf={pdf}
                  pageNumber={i + 1}
                  info={info}
                  scale={scale}
                  widgets={widgetsByPage.get(i + 1) ?? []}
                  mode={mode}
                  tool={tool}
                  activeKey={activeKey}
                  scrollRoot={scrollRoot}
                  registerRef={registerRef}
                  onValue={setValue}
                  onFocusField={setActiveKey}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                />
              ))}
          </div>
        </div>

        {/* Panneau latéral : liste des champs (remplissage) ou inspecteur (création) */}
        <aside
          className={`min-h-0 w-full flex-col border-zinc-200 bg-zinc-50 lg:flex lg:w-80 lg:border-l dark:border-zinc-800 dark:bg-zinc-900 ${
            mobileTab === 'fields' ? 'flex' : 'hidden'
          }`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">
              {mode === 'fill' ? f('panel.fillTitle') : f('panel.buildTitle')}
            </p>
            <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{f('panel.filled', { filled: filledCount, total: fields.length })}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">{mode === 'fill' ? renderFieldList(focusFromPanel) : renderInspector()}</div>
          <div className="flex flex-col gap-2.5 border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <Toggle checked={flattenOnExport} onChange={setFlattenOnExport} label={f('flattenOnExport')} icon={Lock} />
            <button
              type="button"
              onClick={() => setExportState({ status: 'idle' })}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500"
            >
              <Download size={16} /> {f('actions.download')}
            </button>
          </div>
        </aside>
      </div>

      <Modal open={Boolean(exportState)} onClose={() => setExportState(null)} icon={Download} title={f('export.title')} subtitle={file.name}>
        {exportState?.status === 'idle' && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                [f('export.fields'), fields.length],
                [f('export.filled'), filledCount],
                [f('export.originalSize'), formatBytes(file.size)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{value}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <Toggle checked={flattenOnExport} onChange={setFlattenOnExport} label={f('flattenOnExport')} icon={Lock} />
              <p className="mt-1.5 pl-6 text-xs text-zinc-500 dark:text-zinc-400">{f('flattenHint')}</p>
            </div>
            <button
              type="button"
              onClick={generate}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500"
            >
              <Download size={18} /> {f('export.generate')}
            </button>
          </div>
        )}
        {exportState?.status === 'working' && (
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            <LoaderCircle size={28} className="animate-spin text-emerald-600" /> {f('export.working')}
          </div>
        )}
        {exportState?.status === 'error' && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {flattenOnExport ? f('export.errorFlatten') : f('export.error')}
          </p>
        )}
        {exportState?.status === 'done' && (
          <div className="flex flex-col items-center gap-4 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 size={26} />
            </span>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {f('export.sizes', { original: formatBytes(file.size), final: formatBytes(exportState.blob.size) })}
              {flattenOnExport && <span className="block text-xs text-zinc-500 dark:text-zinc-400">{f('export.flattened')}</span>}
            </p>
            <button
              type="button"
              onClick={() => downloadBlob(exportState.blob, `${file.name.replace(/\.pdf$/i, '')}_formulaire.pdf`)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 sm:w-auto"
            >
              <Download size={18} /> {f('export.download')}
            </button>
          </div>
        )}
      </Modal>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Page de l'outil                                                            */
/* -------------------------------------------------------------------------- */

export default function PdfFormsTool() {
  const { t } = useTranslation()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const docRef = useRef(null)

  useEffect(() => {
    docRef.current = doc
  }, [doc])
  useEffect(() => () => destroyPdfDocument(docRef.current?.pdf), [])

  const handleFiles = async (files) => {
    const [file] = files
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const pdf = await loadPdfDocument(bytes)
      const pages = await Promise.all(
        Array.from({ length: pdf.numPages }, (_, i) =>
          pdf.getPage(i + 1).then((page) => {
            const vp = page.getViewport({ scale: 1 })
            return { w: vp.width, h: vp.height, transform: vp.transform }
          }),
        ),
      )
      const analysis = await readForm(bytes, pages)
      setDoc({ pdf, pages, file, bytes, analysis })
    } catch (err) {
      console.error(err)
      setError(t('tools.pdf-forms.errorOpen'))
    } finally {
      setLoading(false)
    }
  }

  if (doc) {
    return (
      <div className="mx-auto max-w-400 px-2 py-3 sm:px-4 lg:px-6">
        <div className="mb-2 flex items-center gap-3">
          <Link
            to="/pdf"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">{t('common.backToTools')}</span>
          </Link>
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
            <FormInput size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">{doc.file.name}</span>
          </span>
          <span className="ml-auto hidden shrink-0 text-xs text-zinc-500 sm:inline dark:text-zinc-400">
            {t('tools.pdf-forms.detected', { count: doc.analysis.fields.length })}
          </span>
        </div>
        <Workspace
          key={doc.file.name + doc.file.lastModified}
          doc={doc}
          onClose={() => {
            destroyPdfDocument(doc.pdf)
            setDoc(null)
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        to="/pdf"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 sm:mb-8 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm sm:h-14 sm:w-14 dark:bg-zinc-800/80 dark:text-white">
          <FormInput size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t('categories.Outils Avancés')}</p>
          <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-white">{t('tools.pdf-forms.name')}</h1>
          <p className="text-sm text-zinc-500 sm:text-base dark:text-zinc-400">{t('tools.pdf-forms.subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        {error && <p className="mb-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
        {loading ? (
          <ProcessingState icon={FormInput} title={t('tools.pdf-forms.loading')} description={t('tools.pdf-forms.loadingDescription')} />
        ) : (
          <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf" hint={t('tools.pdf-forms.dropHint')} />
        )}
      </div>
    </div>
  )
}
