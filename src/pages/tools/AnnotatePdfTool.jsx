import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ArrowUpRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  Circle,
  Copy,
  Download,
  Eraser,
  FileCheck,
  Highlighter,
  LoaderCircle,
  Minus,
  MousePointer2,
  PanelLeft,
  PenTool,
  Redo2,
  Signature,
  Square,
  Stamp,
  Trash,
  Type,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import Modal from '../../components/Modal'
import { loadPdfDocument, destroyPdfDocument } from '../../utils/pdfRender'
import {
  BASELINE,
  FONT_FAMILIES,
  LINE_HEIGHT,
  STAMP_KINDS,
  TEXT_PADDING,
  arrowPaths,
  ellipsePath,
  getBBox,
  isLineType,
  polylinePath,
  rectPath,
  resizeObject,
  stampLayout,
  translateObject,
  withMetrics,
} from '../../utils/annotateGeometry'
import { exportAnnotatedPdf } from '../../utils/annotateExport'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'

const CSS_UNITS = 96 / 72
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const EMPTY = []

const HIGHLIGHT_COLORS = [
  { id: 'yellow', value: '#facc15' },
  { id: 'emerald', value: '#10b981' },
  { id: 'cyan', value: '#06b6d4' },
  { id: 'pink', value: '#ec4899' },
  { id: 'orange', value: '#f97316' },
]
const INK_COLORS = [
  { id: 'black', value: '#18181b' },
  { id: 'red', value: '#dc2626' },
  { id: 'blue', value: '#2563eb' },
  { id: 'emerald', value: '#059669' },
  { id: 'orange', value: '#ea580c' },
  { id: 'white', value: '#ffffff' },
]
const BACKGROUND_COLORS = [
  { id: 'white', value: '#ffffff' },
  { id: 'yellow', value: '#fef9c3' },
  { id: 'emerald', value: '#d1fae5' },
  { id: 'cyan', value: '#cffafe' },
  { id: 'pink', value: '#fce7f3' },
]

const TOOLS = [
  { id: 'select', icon: MousePointer2 },
  { id: 'text', icon: Type },
  { id: 'highlight', icon: Highlighter },
  { id: 'pen', icon: PenTool },
  { id: 'rect', icon: Square },
  { id: 'ellipse', icon: Circle },
  { id: 'line', icon: Minus },
  { id: 'arrow', icon: ArrowUpRight },
  { id: 'stamp', icon: Stamp },
  { id: 'signature', icon: Signature },
]

const DRAG_TOOLS = new Set(['highlight', 'pen', 'rect', 'ellipse', 'line', 'arrow'])

const DEFAULT_STYLES = {
  shape: { stroke: '#dc2626', width: 3, fill: null },
  pen: { color: '#18181b', width: 3 },
  highlight: { color: '#facc15', opacity: 0.4, width: 14, mode: 'free' },
  text: { fontFamily: 'helvetica', fontSize: 16, color: '#18181b', background: null },
  stamp: { kind: 'approved', withDate: true },
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

/** Groupe du style à éditer pour un type d'objet. */
function styleGroupOf(type) {
  if (type === 'rect' || type === 'ellipse' || type === 'line' || type === 'arrow') return 'shape'
  return type
}

/* -------------------------------------------------------------------------- */
/* Petits composants d'interface                                              */
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

function Swatches({ colors, value, onChange, label, allowNone = false, noneLabel }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" role="radiogroup" aria-label={label}>
      <span className="mr-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={value === null}
          title={noneLabel}
          aria-label={noneLabel}
          onClick={() => onChange(null)}
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-white text-zinc-400 ring-offset-2 ring-offset-white dark:bg-zinc-950 dark:ring-offset-zinc-900 ${
            value === null ? 'ring-2 ring-zinc-900 dark:ring-white' : 'ring-1 ring-zinc-300 dark:ring-zinc-700'
          }`}
        >
          <Ban size={13} />
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c.value}
          type="button"
          role="radio"
          aria-checked={value === c.value}
          title={c.label}
          aria-label={c.label}
          onClick={() => onChange(c.value)}
          className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-white transition-transform hover:scale-110 dark:ring-offset-zinc-900 ${
            value === c.value ? 'ring-2 ring-zinc-900 dark:ring-white' : 'ring-1 ring-black/15 dark:ring-white/20'
          }`}
          style={{ backgroundColor: c.value }}
        />
      ))}
    </div>
  )
}

function RangeControl({ label, value, min, max, step = 1, onChange, format = (v) => v }) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
      {label}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-24 accent-emerald-600"
      />
      <span className="w-10 tabular-nums text-zinc-700 dark:text-zinc-300">{format(value)}</span>
    </label>
  )
}

/* -------------------------------------------------------------------------- */
/* Rendu SVG d'un objet                                                       */
/* -------------------------------------------------------------------------- */

function ObjectShape({ obj }) {
  switch (obj.type) {
    case 'rect':
    case 'ellipse':
      return (
        <path
          d={obj.type === 'rect' ? rectPath(obj.x, obj.y, obj.w, obj.h) : ellipsePath(obj.x, obj.y, obj.w, obj.h)}
          fill={obj.fill ?? 'none'}
          stroke={obj.stroke}
          strokeWidth={obj.width}
          strokeLinejoin="round"
        />
      )
    case 'line':
      return (
        <path d={`M${obj.x1} ${obj.y1}L${obj.x2} ${obj.y2}`} stroke={obj.stroke} strokeWidth={obj.width} strokeLinecap="round" />
      )
    case 'arrow': {
      const { shaft, head } = arrowPaths(obj.x1, obj.y1, obj.x2, obj.y2, obj.width)
      return (
        <g>
          <path d={shaft} stroke={obj.stroke} strokeWidth={obj.width} strokeLinecap="round" />
          <path d={head} fill={obj.stroke} stroke={obj.stroke} strokeWidth={obj.width * 0.5} strokeLinejoin="round" />
        </g>
      )
    }
    case 'pen':
      return (
        <path
          d={polylinePath(obj.points)}
          fill="none"
          stroke={obj.color}
          strokeWidth={obj.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
    case 'highlight':
      return obj.points ? (
        <path
          d={polylinePath(obj.points)}
          fill="none"
          stroke={obj.color}
          strokeOpacity={obj.opacity}
          strokeWidth={obj.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ mixBlendMode: 'multiply' }}
        />
      ) : (
        <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} fill={obj.color} fillOpacity={obj.opacity} style={{ mixBlendMode: 'multiply' }} />
      )
    case 'text':
      return (
        <g>
          {obj.background && <rect x={obj.x} y={obj.y} width={obj.w} height={obj.h} fill={obj.background} />}
          <text
            fontFamily={FONT_FAMILIES[obj.fontFamily].css}
            fontSize={obj.fontSize}
            fill={obj.color}
            style={{ whiteSpace: 'pre' }}
          >
            {obj.text.split('\n').map((line, i) => (
              <tspan
                key={i}
                x={obj.x + TEXT_PADDING}
                y={obj.y + TEXT_PADDING + i * obj.fontSize * LINE_HEIGHT + obj.fontSize * BASELINE}
              >
                {line || ' '}
              </tspan>
            ))}
          </text>
        </g>
      )
    case 'stamp': {
      const layout = stampLayout(obj.fontSize, Boolean(obj.date))
      const inset = layout.border / 2
      return (
        <g opacity={0.9} fontFamily={FONT_FAMILIES.helvetica.css} fontWeight="bold" fill={obj.color} textAnchor="middle">
          <rect
            x={obj.x + inset}
            y={obj.y + inset}
            width={obj.w - layout.border}
            height={obj.h - layout.border}
            fill="none"
            stroke={obj.color}
            strokeWidth={layout.border}
          />
          <text x={obj.x + obj.w / 2} y={obj.y + layout.labelBaseline} fontSize={obj.fontSize}>
            {obj.label}
          </text>
          {obj.date && (
            <text x={obj.x + obj.w / 2} y={obj.y + layout.dateBaseline} fontSize={layout.dateSize}>
              {obj.date}
            </text>
          )}
        </g>
      )
    }
    case 'signature':
      return <image href={obj.dataUrl} x={obj.x} y={obj.y} width={obj.w} height={obj.h} preserveAspectRatio="none" />
    default:
      return null
  }
}

/** Zone de clic invisible (plus large que le trait pour les objets fins). */
function HitArea({ obj, scale }) {
  const minStroke = 14 / scale
  const common = { 'data-hit': '', 'data-id': obj.id, style: { cursor: 'move', touchAction: 'none' } }
  if (obj.type === 'line' || obj.type === 'arrow') {
    return (
      <path
        {...common}
        d={`M${obj.x1} ${obj.y1}L${obj.x2} ${obj.y2}`}
        stroke="transparent"
        strokeWidth={Math.max(obj.width, minStroke)}
        strokeLinecap="round"
        pointerEvents="stroke"
      />
    )
  }
  if (obj.points) {
    return (
      <path
        {...common}
        d={polylinePath(obj.points)}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(obj.width, minStroke)}
        strokeLinecap="round"
        strokeLinejoin="round"
        pointerEvents="stroke"
      />
    )
  }
  const b = getBBox(obj)
  return <rect {...common} x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" pointerEvents="all" />
}

function SelectionHandles({ obj, scale }) {
  const size = 10 / scale
  const stroke = 1.5 / scale
  const handle = (key, x, y, cursor) => (
    <rect
      key={key}
      data-hit=""
      data-id={obj.id}
      data-handle={key}
      x={x - size / 2}
      y={y - size / 2}
      width={size}
      height={size}
      rx={2 / scale}
      fill="#ffffff"
      stroke="#059669"
      strokeWidth={stroke}
      style={{ cursor, touchAction: 'none' }}
    />
  )

  if (isLineType(obj)) {
    return (
      <g>
        {handle('p1', obj.x1, obj.y1, 'crosshair')}
        {handle('p2', obj.x2, obj.y2, 'crosshair')}
      </g>
    )
  }
  const b = getBBox(obj)
  const pad = 3 / scale
  return (
    <g>
      <rect
        x={b.x - pad}
        y={b.y - pad}
        width={b.w + pad * 2}
        height={b.h + pad * 2}
        fill="none"
        stroke="#059669"
        strokeWidth={stroke}
        strokeDasharray={`${4 / scale} ${3 / scale}`}
        pointerEvents="none"
      />
      {handle('nw', b.x - pad, b.y - pad, 'nwse-resize')}
      {handle('ne', b.x + b.w + pad, b.y - pad, 'nesw-resize')}
      {handle('sw', b.x - pad, b.y + b.h + pad, 'nesw-resize')}
      {handle('se', b.x + b.w + pad, b.y + b.h + pad, 'nwse-resize')}
    </g>
  )
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

function PageViewInner({
  pdf,
  pageNumber,
  info,
  displayScale,
  objects,
  selectedId,
  tool,
  scrollRoot,
  handlers,
  registerRef,
}) {
  const wrapperRef = useRef(null)
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const width = Math.floor(info.w * displayScale)
  const height = Math.floor(info.h * displayScale)

  useEffect(() => {
    const el = wrapperRef.current
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: scrollRoot,
      rootMargin: '100% 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRoot])

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
      const viewport = page.getViewport({ scale: displayScale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      task = page.render({
        canvas,
        canvasContext: canvas.getContext('2d'),
        viewport,
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
  }, [pdf, pageNumber, displayScale, visible])

  const selected = selectedId ? objects.find((o) => o.id === selectedId) : null
  const drawing = tool !== 'select'

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
      <svg
        className="absolute inset-0 select-none"
        width={width}
        height={height}
        viewBox={`0 0 ${info.w} ${info.h}`}
        style={{ touchAction: drawing ? 'none' : 'pan-x pan-y', cursor: drawing ? 'crosshair' : 'default' }}
        onPointerDown={(e) => handlers.down(e, pageNumber, info)}
        onPointerMove={(e) => handlers.move(e, info)}
        onPointerUp={(e) => handlers.up(e)}
        onPointerCancel={(e) => handlers.up(e)}
        onDoubleClick={(e) => handlers.dblClick(e)}
      >
        {objects.map((obj) => (
          <ObjectShape key={obj.id} obj={obj} />
        ))}
        {!drawing && objects.map((obj) => <HitArea key={`hit-${obj.id}`} obj={obj} scale={displayScale} />)}
        {selected && <SelectionHandles obj={selected} scale={displayScale} />}
      </svg>
    </div>
  )
}

/** Compare les objets de la page élément par élément (les autres props par identité). */
function samePageProps(prev, next) {
  for (const key of Object.keys(next)) {
    if (key === 'objects') {
      const a = prev.objects
      const b = next.objects
      if (a.length !== b.length || a.some((o, i) => o !== b[i])) return false
    } else if (prev[key] !== next[key]) {
      return false
    }
  }
  return true
}

const PageView = memo(PageViewInner, samePageProps)

const THUMB_WIDTH = 104

const Thumbnail = memo(function Thumbnail({ pdf, pageNumber, info, active, count, onSelect, registerRef, countLabel }) {
  const buttonRef = useRef(null)
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const height = Math.round((THUMB_WIDTH * info.h) / info.w)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    })
    observer.observe(buttonRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    let cancelled = false
    let task = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: (THUMB_WIDTH * 2) / info.w })
      const canvas = canvasRef.current
      canvas.width = Math.floor(viewport.width)
      canvas.height = Math.floor(viewport.height)
      task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport })
      await task.promise
    })().catch((err) => {
      if (err?.name !== 'RenderingCancelledException') console.error(err)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber, info, visible])

  return (
    <button
      ref={(el) => {
        buttonRef.current = el
        registerRef(pageNumber, el)
      }}
      type="button"
      onClick={() => onSelect(pageNumber)}
      className="group relative flex w-full flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
    >
      <span
        className={`relative block overflow-hidden rounded-md bg-white shadow-sm ${
          active ? 'ring-2 ring-emerald-500' : 'ring-1 ring-zinc-200 group-hover:ring-zinc-300 dark:ring-zinc-700'
        }`}
        style={{ width: THUMB_WIDTH, height }}
      >
        <canvas ref={canvasRef} style={{ width: THUMB_WIDTH, height }} />
        {count > 0 && (
          <span
            title={countLabel}
            className="absolute right-1 top-1 min-w-5 rounded-full bg-emerald-600 px-1.5 text-center text-[11px] font-semibold leading-5 text-white shadow"
          >
            {count}
          </span>
        )}
      </span>
      <span className={`text-xs font-medium ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
        {pageNumber}
      </span>
    </button>
  )
})

/* -------------------------------------------------------------------------- */
/* Pad de signature                                                           */
/* -------------------------------------------------------------------------- */

function SignaturePad({ open, onClose, onSave, a }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(null)
  const [color, setColor] = useState('#18181b')
  const [isEmpty, setIsEmpty] = useState(true)

  const setupCanvas = useCallback((canvas) => {
    canvasRef.current = canvas
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(canvas.offsetWidth * ratio)
    canvas.height = Math.floor(canvas.offsetHeight * ratio)
    const ctx = canvas.getContext('2d')
    ctx.scale(ratio, ratio)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const point = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return [
      ((e.clientX - rect.left) * canvas.offsetWidth) / rect.width,
      ((e.clientY - rect.top) * canvas.offsetHeight) / rect.height,
    ]
  }

  const handleDown = (e) => {
    e.preventDefault()
    canvasRef.current.setPointerCapture(e.pointerId)
    const p = point(e)
    drawingRef.current = { last: p, mid: p }
    const ctx = canvasRef.current.getContext('2d')
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2)
    ctx.fill()
    setIsEmpty(false)
  }

  // Lissage : courbes quadratiques passant par les milieux des segments.
  const handleMove = (e) => {
    const state = drawingRef.current
    if (!state) return
    const p = point(e)
    const mid = [(state.last[0] + p[0]) / 2, (state.last[1] + p[1]) / 2]
    const ctx = canvasRef.current.getContext('2d')
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(state.mid[0], state.mid[1])
    ctx.quadraticCurveTo(state.last[0], state.last[1], mid[0], mid[1])
    ctx.stroke()
    drawingRef.current = { last: p, mid }
  }

  const handleUp = () => {
    drawingRef.current = null
  }

  const clear = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  // Recadre la signature sur sa zone dessinée avant de l'enregistrer.
  const save = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { width, height } = canvas
    const data = ctx.getImageData(0, 0, width, height).data
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 10) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) return
    const pad = 6
    minX = Math.max(0, minX - pad)
    minY = Math.max(0, minY - pad)
    maxX = Math.min(width - 1, maxX + pad)
    maxY = Math.min(height - 1, maxY + pad)
    const out = document.createElement('canvas')
    out.width = maxX - minX + 1
    out.height = maxY - minY + 1
    out.getContext('2d').drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
    onSave({ dataUrl: out.toDataURL('image/png'), ratio: out.height / out.width })
    setIsEmpty(true)
  }

  return (
    <Modal open={open} onClose={onClose} icon={Signature} title={a('signature.title')} subtitle={a('signature.subtitle')}>
      <div className="flex flex-col gap-4">
        {open && (
          <canvas
            ref={setupCanvas}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerCancel={handleUp}
            className="h-48 w-full cursor-crosshair rounded-xl border border-dashed border-zinc-300 bg-white dark:border-zinc-700"
            style={{ touchAction: 'none' }}
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Swatches
            label={a('props.color')}
            value={color}
            onChange={setColor}
            colors={[
              { value: '#18181b', label: a('colors.black') },
              { value: '#1d4ed8', label: a('colors.blue') },
            ]}
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={clear}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Eraser size={15} /> {a('signature.clear')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isEmpty}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              <CheckCircle2 size={15} /> {a('signature.save')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- */
/* Studio                                                                     */
/* -------------------------------------------------------------------------- */

function Studio({ doc, onClose }) {
  const { t, i18n } = useTranslation()
  const a = useCallback((key, opts) => t(`tools.annotate.${key}`, opts), [t])
  const { pdf, pages, file, bytes } = doc
  const numPages = pages.length

  const scrollRef = useRef(null)
  const [scrollRoot, setScrollRoot] = useState(null)
  const pageRefs = useRef([])
  const thumbRefs = useRef([])
  const textInputRef = useRef(null)
  const focusTextRef = useRef(false)
  const dragRef = useRef(null)
  const lastCommitRef = useRef({ key: null, time: 0 })

  // Zoom initial : largeur de fenêtre disponible, sans dépasser 100 %.
  const [zoom, setZoom] = useState(() => {
    const mobile = window.matchMedia('(max-width: 767px)').matches
    const available = window.innerWidth - (mobile ? 40 : 160 + 120)
    return clamp(available / (pages[0].w * CSS_UNITS), MIN_ZOOM, 1)
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 767px)').matches)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 767px)').matches)
  const [tool, setTool] = useState('select')
  const [styles, setStyles] = useState(DEFAULT_STYLES)
  const [history, setHistory] = useState({ past: [], present: [], future: [] })
  const [live, setLive] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [signature, setSignature] = useState(null)
  const [signaturePadOpen, setSignaturePadOpen] = useState(false)
  const [exportState, setExportState] = useState(null) // null | { status, ... }

  const displayScale = zoom * CSS_UNITS
  const objects = live ?? history.present
  const selected = selectedId ? objects.find((o) => o.id === selectedId) ?? null : null

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])


  /* ---- Historique -------------------------------------------------------- */
  // `key` regroupe en une seule étape les modifications rapprochées d'un
  // même réglage (glisser un curseur, taper du texte).
  const commit = useCallback((updater, key = null) => {
    const now = Date.now()
    const last = lastCommitRef.current
    const coalesce = Boolean(key) && last.key === key && now - last.time < 1200
    lastCommitRef.current = { key, time: now }
    setHistory((h) => {
      const next = typeof updater === 'function' ? updater(h.present) : updater
      if (next === h.present) return h
      if (coalesce) return { ...h, present: next, future: [] }
      return { past: [...h.past.slice(-99), h.present], present: next, future: [] }
    })
  }, [])

  const undo = useCallback(() => {
    lastCommitRef.current = { key: null, time: 0 }
    setHistory((h) =>
      h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h,
    )
  }, [])
  const redo = useCallback(() => {
    lastCommitRef.current = { key: null, time: 0 }
    setHistory((h) => (h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h))
  }, [])

  const updateObject = useCallback(
    (id, patch, key) => {
      commit((list) =>
        list.map((o) => {
          if (o.id !== id) return o
          const next = { ...o, ...patch }
          return next.type === 'text' || next.type === 'stamp' ? withMetrics(next) : next
        }),
      key)
    },
    [commit],
  )

  const deleteSelected = useCallback(() => {
    if (!selectedId) return
    commit((list) => list.filter((o) => o.id !== selectedId))
    setSelectedId(null)
  }, [selectedId, commit])

  const duplicateSelected = useCallback(() => {
    if (!selected) return
    const copy = { ...translateObject(selected, 12, 12), id: newId() }
    commit((list) => [...list, copy])
    setSelectedId(copy.id)
  }, [selected, commit])

  /* ---- Navigation -------------------------------------------------------- */
  const registerPageRef = useCallback((n, el) => {
    pageRefs.current[n - 1] = el
  }, [])
  const registerThumbRef = useCallback((n, el) => {
    thumbRefs.current[n - 1] = el
  }, [])

  const goToPage = useCallback((n) => {
    const target = clamp(n, 1, numPages)
    const el = scrollRef.current
    const page = pageRefs.current[target - 1]
    if (el && page) el.scrollTop = page.offsetTop - 12
    setCurrentPage(target)
  }, [numPages])

  const handleScroll = () => {
    const el = scrollRef.current
    const top = el.scrollTop
    const bottom = top + el.clientHeight
    let best = 1
    let bestArea = -1
    pageRefs.current.forEach((p, i) => {
      if (!p) return
      const area = Math.min(p.offsetTop + p.offsetHeight, bottom) - Math.max(p.offsetTop, top)
      if (area > bestArea + 1) {
        bestArea = area
        best = i + 1
      }
    })
    setCurrentPage(best)
  }

  useEffect(() => {
    const thumb = thumbRefs.current[currentPage - 1]
    const container = thumb?.parentElement?.parentElement
    if (!thumb || !container) return
    if (thumb.offsetTop < container.scrollTop) container.scrollTo({ top: thumb.offsetTop - 8 })
    else if (thumb.offsetTop + thumb.offsetHeight > container.scrollTop + container.clientHeight) {
      container.scrollTo({ top: thumb.offsetTop + thumb.offsetHeight - container.clientHeight + 8 })
    }
  }, [currentPage, sidebarOpen])

  const zoomIn = () => setZoom((z) => clamp(ZOOM_PRESETS.find((p) => p > z + 0.001) ?? MAX_ZOOM, MIN_ZOOM, MAX_ZOOM))
  const zoomOut = () => setZoom((z) => clamp([...ZOOM_PRESETS].reverse().find((p) => p < z - 0.001) ?? MIN_ZOOM, MIN_ZOOM, MAX_ZOOM))

  /* ---- Création d'objets -------------------------------------------------- */
  const createObject = useCallback(
    (type, page, [x, y]) => {
      const base = { id: newId(), page }
      switch (type) {
        case 'text':
          return withMetrics({ ...base, type: 'text', x, y, text: a('defaultText'), ...styles.text })
        case 'stamp': {
          const kind = STAMP_KINDS.find((k) => k.id === styles.stamp.kind)
          const obj = withMetrics({
            ...base,
            type: 'stamp',
            x,
            y,
            kind: kind.id,
            label: a(`stamps.${kind.id}`),
            color: kind.color,
            fontSize: 22,
            date: styles.stamp.withDate ? new Date().toLocaleDateString(i18n.language) : null,
          })
          return { ...obj, x: x - obj.w / 2, y: y - obj.h / 2 }
        }
        case 'signature': {
          const w = 150
          const h = w * signature.ratio
          return { ...base, type: 'signature', x: x - w / 2, y: y - h / 2, w, h, dataUrl: signature.dataUrl }
        }
        case 'pen':
          return { ...base, type: 'pen', points: [[x, y]], color: styles.pen.color, width: styles.pen.width }
        case 'highlight':
          return styles.highlight.mode === 'free'
            ? { ...base, type: 'highlight', points: [[x, y]], color: styles.highlight.color, opacity: styles.highlight.opacity, width: styles.highlight.width }
            : { ...base, type: 'highlight', x, y, w: 0, h: 0, color: styles.highlight.color, opacity: styles.highlight.opacity }
        case 'rect':
        case 'ellipse':
          return { ...base, type, x, y, w: 0, h: 0, ...styles.shape }
        case 'line':
        case 'arrow':
          return { ...base, type, x1: x, y1: y, x2: x, y2: y, stroke: styles.shape.stroke, width: styles.shape.width }
        default:
          return null
      }
    },
    [styles, signature, a, i18n.language],
  )

  /* ---- Gestion du pointeur (commune à toutes les pages) ------------------ */
  const toPoint = (e, info) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return [((e.clientX - rect.left) / rect.width) * info.w, ((e.clientY - rect.top) / rect.height) * info.h]
  }

  const handlersRef = useRef(null)
  useLayoutEffect(() => {
  handlersRef.current = {
    down: (e, page, info) => {
      if (e.button > 0) return
      const point = toPoint(e, info)
      const hit = e.target.closest?.('[data-hit]')

      if (tool === 'select') {
        if (!hit) {
          setSelectedId(null)
          return
        }
        const obj = history.present.find((o) => o.id === hit.dataset.id)
        if (!obj) return
        e.preventDefault()
        setSelectedId(obj.id)
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = hit.dataset.handle
          ? { kind: 'resize', handle: hit.dataset.handle, orig: obj, start: point }
          : { kind: 'move', orig: obj, start: point }
        return
      }

      if (tool === 'signature' && !signature) {
        setSignaturePadOpen(true)
        return
      }

      e.preventDefault()
      const obj = createObject(tool, page, point)
      if (!obj) return

      if (!DRAG_TOOLS.has(tool)) {
        commit((list) => [...list, obj])
        setSelectedId(obj.id)
        setTool('select')
        if (obj.type === 'text') focusTextRef.current = true
        return
      }
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = { kind: 'create', obj, start: point, lastScreen: [e.clientX, e.clientY] }
      setLive([...history.present, obj])
    },

    move: (e, info) => {
      const drag = dragRef.current
      if (!drag) return
      const point = toPoint(e, info)
      let next

      if (drag.kind === 'create') {
        const o = drag.obj
        if (o.points) {
          const [lx, ly] = drag.lastScreen
          if (Math.hypot(e.clientX - lx, e.clientY - ly) < 2) return
          drag.lastScreen = [e.clientX, e.clientY]
          next = { ...o, points: [...o.points, point] }
        } else if (o.type === 'line' || o.type === 'arrow') {
          next = { ...o, x2: point[0], y2: point[1] }
        } else {
          const [sx, sy] = drag.start
          next = { ...o, x: Math.min(sx, point[0]), y: Math.min(sy, point[1]), w: Math.abs(point[0] - sx), h: Math.abs(point[1] - sy) }
        }
        drag.obj = next
        setLive([...history.present, next])
        return
      }

      if (drag.kind === 'move') {
        next = translateObject(drag.orig, point[0] - drag.start[0], point[1] - drag.start[1])
      } else {
        next = resizeObject(drag.orig, drag.handle, point)
      }
      drag.current = next
      setLive(history.present.map((o) => (o.id === next.id ? next : o)))
    },

    up: () => {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return
      setLive(null)

      if (drag.kind === 'create') {
        const o = drag.obj
        const b = getBBox(o)
        const tooSmall = !o.points && Math.max(b.w, b.h) < 3
        if (tooSmall) return
        commit((list) => [...list, o])
        if (!o.points) {
          setSelectedId(o.id)
          setTool('select')
        }
        return
      }
      if (drag.current) commit((list) => list.map((o) => (o.id === drag.current.id ? drag.current : o)))
    },

    dblClick: (e) => {
      const hit = e.target.closest?.('[data-hit]')
      const obj = hit && history.present.find((o) => o.id === hit.dataset.id)
      if (obj?.type === 'text') textInputRef.current?.focus()
    },
  }
  })

  const stableHandlers = useMemo(
    () => ({
      down: (...args) => handlersRef.current.down(...args),
      move: (...args) => handlersRef.current.move(...args),
      up: (...args) => handlersRef.current.up(...args),
      dblClick: (...args) => handlersRef.current.dblClick(...args),
    }),
    [],
  )

  // Focus du champ de texte juste après la création d'un bloc de texte.
  useEffect(() => {
    if (focusTextRef.current && selected?.type === 'text') {
      focusTextRef.current = false
      textInputRef.current?.focus()
      textInputRef.current?.select()
    }
  }, [selected])

  const objectsByPage = useMemo(() => {
    const groups = new Map()
    for (const o of objects) {
      if (!groups.has(o.page)) groups.set(o.page, [])
      groups.get(o.page).push(o)
    }
    return groups
  }, [objects])

  /* ---- Clavier ------------------------------------------------------------ */
  useEffect(() => {
    const onKey = (e) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'z' && !e.shiftKey && !typing) {
        e.preventDefault()
        undo()
      } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey)) && !typing) {
        e.preventDefault()
        redo()
      } else if (mod && key === 'd' && !typing && selectedId) {
        e.preventDefault()
        duplicateSelected()
      } else if ((key === 'delete' || key === 'backspace') && !typing && selectedId) {
        e.preventDefault()
        deleteSelected()
      } else if (key === 'escape' && !typing) {
        setSelectedId(null)
        setTool('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, deleteSelected, duplicateSelected, selectedId])

  /* ---- Propriétés contextuelles ------------------------------------------ */
  // Objet sélectionné : on édite l'objet. Sinon : les réglages de l'outil actif.
  const editingGroup = selected ? styleGroupOf(selected.type) : styleGroupOf(tool)
  const editValues = selected ?? styles[editingGroup]

  const setProp = (prop, value) => {
    if (selected) {
      updateObject(selected.id, { [prop]: value }, `${selected.id}:${prop}`)
      if (prop in (styles[editingGroup] ?? {})) {
        setStyles((s) => ({ ...s, [editingGroup]: { ...s[editingGroup], [prop]: value } }))
      }
    } else {
      setStyles((s) => ({ ...s, [editingGroup]: { ...s[editingGroup], [prop]: value } }))
    }
  }

  const withLabels = (list) => list.map((c) => ({ ...c, label: a(`colors.${c.id}`) }))

  const renderProperties = () => {
    switch (editingGroup) {
      case 'shape': {
        const isClosed = selected ? selected.type === 'rect' || selected.type === 'ellipse' : tool === 'rect' || tool === 'ellipse'
        return (
          <>
            <Swatches label={a('props.stroke')} colors={withLabels(INK_COLORS)} value={editValues.stroke} onChange={(v) => setProp('stroke', v)} />
            <RangeControl label={a('props.width')} min={1} max={12} value={editValues.width} onChange={(v) => setProp('width', v)} format={(v) => `${v} px`} />
            {isClosed && (
              <Swatches
                label={a('props.fill')}
                colors={withLabels([...HIGHLIGHT_COLORS, ...INK_COLORS.slice(0, 3)])}
                value={editValues.fill ?? null}
                onChange={(v) => setProp('fill', v)}
                allowNone
                noneLabel={a('props.none')}
              />
            )}
          </>
        )
      }
      case 'pen':
        return (
          <>
            <Swatches label={a('props.color')} colors={withLabels(INK_COLORS)} value={editValues.color} onChange={(v) => setProp('color', v)} />
            <RangeControl label={a('props.width')} min={1} max={12} value={editValues.width} onChange={(v) => setProp('width', v)} format={(v) => `${v} px`} />
          </>
        )
      case 'highlight':
        return (
          <>
            {!selected && (
              <div className="flex shrink-0 rounded-lg bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800">
                {['free', 'rect'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProp('mode', mode)}
                    className={`rounded-md px-2.5 py-1 ${
                      styles.highlight.mode === mode ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {a(`props.highlightMode.${mode}`)}
                  </button>
                ))}
              </div>
            )}
            <Swatches label={a('props.color')} colors={withLabels(HIGHLIGHT_COLORS)} value={editValues.color} onChange={(v) => setProp('color', v)} />
            <RangeControl
              label={a('props.opacity')}
              min={0.15}
              max={0.8}
              step={0.05}
              value={editValues.opacity}
              onChange={(v) => setProp('opacity', v)}
              format={(v) => `${Math.round(v * 100)} %`}
            />
            {(selected ? Boolean(selected.points) : styles.highlight.mode === 'free') && (
              <RangeControl label={a('props.width')} min={6} max={30} value={editValues.width} onChange={(v) => setProp('width', v)} format={(v) => `${v} px`} />
            )}
          </>
        )
      case 'text':
        return (
          <>
            {selected && (
              <textarea
                ref={textInputRef}
                value={selected.text}
                rows={1}
                onChange={(e) => setProp('text', e.target.value)}
                placeholder={a('defaultText')}
                aria-label={a('props.content')}
                className="h-9 min-w-40 flex-1 resize-y rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none sm:max-w-xs dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            )}
            <select
              value={editValues.fontFamily}
              onChange={(e) => setProp('fontFamily', e.target.value)}
              aria-label={a('props.font')}
              className="h-9 shrink-0 rounded-lg border border-zinc-200 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              {Object.entries(FONT_FAMILIES).map(([id, f]) => (
                <option key={id} value={id}>
                  {f.label}
                </option>
              ))}
            </select>
            <RangeControl
              label={a('props.size')}
              min={8}
              max={72}
              value={Math.round(editValues.fontSize)}
              onChange={(v) => setProp('fontSize', v)}
              format={(v) => `${v} pt`}
            />
            <Swatches label={a('props.color')} colors={withLabels(INK_COLORS)} value={editValues.color} onChange={(v) => setProp('color', v)} />
            <Swatches
              label={a('props.background')}
              colors={withLabels(BACKGROUND_COLORS)}
              value={editValues.background ?? null}
              onChange={(v) => setProp('background', v)}
              allowNone
              noneLabel={a('props.transparent')}
            />
          </>
        )
      case 'stamp':
        return (
          <>
            {!selected && (
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {STAMP_KINDS.map((kind) => (
                  <button
                    key={kind.id}
                    type="button"
                    onClick={() => setStyles((s) => ({ ...s, stamp: { ...s.stamp, kind: kind.id } }))}
                    aria-pressed={styles.stamp.kind === kind.id}
                    className={`rounded-md border-2 px-2 py-0.5 text-xs font-bold tracking-wide transition-opacity ${
                      styles.stamp.kind === kind.id ? 'opacity-100 shadow-sm' : 'opacity-50 hover:opacity-80'
                    }`}
                    style={{ borderColor: kind.color, color: kind.color }}
                  >
                    {a(`stamps.${kind.id}`)}
                  </button>
                ))}
              </div>
            )}
            <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              <input
                type="checkbox"
                className="accent-emerald-600"
                checked={selected ? Boolean(selected.date) : styles.stamp.withDate}
                onChange={(e) => {
                  if (selected) {
                    updateObject(selected.id, { date: e.target.checked ? new Date().toLocaleDateString(i18n.language) : null })
                  } else {
                    setStyles((s) => ({ ...s, stamp: { ...s.stamp, withDate: e.target.checked } }))
                  }
                }}
              />
              <CalendarDays size={14} /> {a('props.withDate')}
            </label>
            {!selected && <span className="text-xs text-zinc-500 dark:text-zinc-400">{a('hints.stamp')}</span>}
          </>
        )
      case 'signature':
        return (
          <>
            {signature && (
              <img src={signature.dataUrl} alt="" className="h-9 shrink-0 rounded-md border border-zinc-200 bg-white px-1 dark:border-zinc-700" />
            )}
            <button
              type="button"
              onClick={() => setSignaturePadOpen(true)}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Signature size={15} /> {signature ? a('signature.redraw') : a('signature.draw')}
            </button>
            {!selected && signature && <span className="text-xs text-zinc-500 dark:text-zinc-400">{a('hints.signature')}</span>}
          </>
        )
      default:
        return <span className="text-xs text-zinc-500 dark:text-zinc-400">{a('hints.select')}</span>
    }
  }

  /* ---- Export ------------------------------------------------------------- */
  const startExport = async () => {
    setSelectedId(null)
    setExportState({ status: 'working' })
    try {
      const output = await exportAnnotatedPdf(bytes, pages, history.present)
      const blob = new Blob([output], { type: 'application/pdf' })
      const pagesTouched = new Set(history.present.map((o) => o.page)).size
      setExportState({ status: 'done', url: URL.createObjectURL(blob), size: blob.size, count: history.present.length, pagesTouched })
      addHistoryEntry({
        toolId: 'annotate',
        toolName: a('name'),
        message: a('historyMessage', { name: file.name, count: history.present.length }),
      })
    } catch (err) {
      console.error(err)
      setExportState({ status: 'error' })
    }
  }

  const closeExport = () => {
    if (exportState?.url) URL.revokeObjectURL(exportState.url)
    setExportState(null)
  }

  const download = () => {
    const link = document.createElement('a')
    link.href = exportState.url
    link.download = `${file.name.replace(/\.pdf$/i, '')}_annote.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleClose = () => {
    if (history.present.length && !window.confirm(a('confirmClose'))) return
    onClose()
  }

  const selectTool = (id) => {
    setTool(id)
    if (id !== 'select') setSelectedId(null)
    if (id === 'signature' && !signature) setSignaturePadOpen(true)
  }

  const zoomPercent = Math.round(zoom * 100)
  const isPreset = ZOOM_PRESETS.some((p) => Math.abs(p - zoom) < 0.001)

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-104 flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:h-[calc(100dvh-9rem)] dark:border-zinc-800 dark:bg-zinc-950">
      {/* Palette d'outils */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-white px-1.5 py-1.5 scrollbar-none dark:border-zinc-800 dark:bg-zinc-900">
        <IconButton icon={PanelLeft} label={a('toolbar.pages')} onClick={() => setSidebarOpen((v) => !v)} active={sidebarOpen} />
        <Divider />
        {TOOLS.map(({ id, icon }) => (
          <IconButton key={id} icon={icon} label={a(`tools.${id}`)} onClick={() => selectTool(id)} active={tool === id} />
        ))}
        <Divider />
        <IconButton icon={Undo2} label={a('toolbar.undo')} onClick={undo} disabled={!history.past.length} />
        <IconButton icon={Redo2} label={a('toolbar.redo')} onClick={redo} disabled={!history.future.length} />
        <Divider />
        <IconButton icon={ZoomOut} label={a('toolbar.zoomOut')} onClick={zoomOut} disabled={zoom <= MIN_ZOOM} />
        <select
          value={isPreset ? String(zoom) : 'custom'}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={a('toolbar.zoom')}
          className="h-8 shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
        >
          {!isPreset && <option value="custom">{zoomPercent} %</option>}
          {ZOOM_PRESETS.map((p) => (
            <option key={p} value={String(p)}>
              {Math.round(p * 100)} %
            </option>
          ))}
        </select>
        <IconButton icon={ZoomIn} label={a('toolbar.zoomIn')} onClick={zoomIn} disabled={zoom >= MAX_ZOOM} />
        <div className="flex-1" />
        <button
          type="button"
          onClick={startExport}
          disabled={!history.present.length}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-40"
        >
          <Download size={16} />
          <span className="hidden sm:inline">{a('toolbar.export')}</span>
        </button>
        <IconButton icon={X} label={a('toolbar.close')} onClick={handleClose} />
      </div>

      {/* Propriétés contextuelles */}
      <div className="flex min-h-12 items-center gap-3 overflow-x-auto border-b border-zinc-200 bg-white px-3 py-1.5 scrollbar-none dark:border-zinc-800 dark:bg-zinc-900">
        <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
          {selected ? a(`types.${selected.type}`) : a(`tools.${tool}`)}
        </span>
        {renderProperties()}
        {selected && (
          <>
            <div className="flex-1" />
            <IconButton icon={Copy} label={a('toolbar.duplicate')} onClick={duplicateSelected} />
            <IconButton
              icon={Trash}
              label={a('toolbar.delete')}
              onClick={deleteSelected}
              className="hover:bg-red-50! hover:text-red-600! dark:hover:bg-red-500/10! dark:hover:text-red-400!"
            />
          </>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1">
        {sidebarOpen && isMobile && (
          <button
            type="button"
            aria-label={a('toolbar.pages')}
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-20 bg-zinc-950/40"
          />
        )}
        {sidebarOpen && (
          <aside
            className={`flex w-40 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
              isMobile ? 'absolute inset-y-0 left-0 z-30 shadow-2xl' : ''
            }`}
          >
            <p className="border-b border-zinc-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {a('toolbar.pages')} · {numPages}
            </p>
            <div className="relative min-h-0 flex-1 overflow-y-auto p-1.5">
              <div>
                {pages.map((info, i) => {
                  const count = objectsByPage.get(i + 1)?.length ?? 0
                  return (
                    <Thumbnail
                      key={i}
                      pdf={pdf}
                      pageNumber={i + 1}
                      info={info}
                      active={currentPage === i + 1}
                      count={count}
                      countLabel={a('annotationCount', { count })}
                      registerRef={registerThumbRef}
                      onSelect={(n) => {
                        goToPage(n)
                        if (isMobile) setSidebarOpen(false)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </aside>
        )}

        <div
          ref={(el) => {
            scrollRef.current = el
            if (el && el !== scrollRoot) setScrollRoot(el)
          }}
          onScroll={handleScroll} className="relative min-w-0 flex-1 overflow-auto bg-zinc-100 dark:bg-zinc-950">
          <div className="flex w-max min-w-full flex-col items-center gap-4 px-2 py-4 sm:px-6">
            {scrollRoot &&
              pages.map((info, i) => (
                <PageView
                  key={i}
                  pdf={pdf}
                  pageNumber={i + 1}
                  info={info}
                  displayScale={displayScale}
                  objects={objectsByPage.get(i + 1) ?? EMPTY}
                  selectedId={selectedId}
                  tool={tool}
                  scrollRoot={scrollRoot}
                  handlers={stableHandlers}
                  registerRef={registerPageRef}
                />
              ))}
          </div>
        </div>
      </div>

      <SignaturePad
        open={signaturePadOpen}
        onClose={() => setSignaturePadOpen(false)}
        a={a}
        onSave={(sig) => {
          setSignature(sig)
          setSignaturePadOpen(false)
          setTool('signature')
          setSelectedId(null)
        }}
      />

      <Modal open={Boolean(exportState)} onClose={closeExport} icon={FileCheck} title={a('export.title')} subtitle={file.name}>
        {exportState?.status === 'working' && (
          <div className="flex flex-col items-center gap-3 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            <LoaderCircle size={28} className="animate-spin text-emerald-600" />
            {a('export.working')}
          </div>
        )}
        {exportState?.status === 'error' && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{a('export.error')}</p>
        )}
        {exportState?.status === 'done' && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                [a('export.annotations'), exportState.count],
                [a('export.pages'), exportState.pagesTouched],
                [a('export.finalSize'), formatBytes(exportState.size)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">{value}</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
              {a('export.originalSize', { size: formatBytes(file.size) })}
            </p>
            <button
              type="button"
              onClick={download}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500"
            >
              <Download size={18} /> {a('export.download')}
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

export default function AnnotatePdfTool() {
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
      setDoc({ pdf, pages, file, bytes })
    } catch (err) {
      console.error(err)
      setError(t('tools.annotate.errorOpen'))
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
            <PenTool size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">{doc.file.name}</span>
          </span>
        </div>
        <Studio
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
          <PenTool size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            {t('categories.Outils Avancés')}
          </p>
          <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-white">{t('tools.annotate.name')}</h1>
          <p className="text-sm text-zinc-500 sm:text-base dark:text-zinc-400">{t('tools.annotate.subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        {error && (
          <p className="mb-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
        )}
        {loading ? (
          <ProcessingState icon={PenTool} title={t('tools.annotate.loading')} description={t('tools.annotate.loadingDescription')} />
        ) : (
          <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf" hint={t('tools.annotate.dropHint')} />
        )}
      </div>
    </div>
  )
}
