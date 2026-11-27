import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PDFDateString, TextLayer } from 'pdfjs-dist'
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  Eraser,
  File as FileIcon,
  Highlighter,
  Info,
  ListTree,
  LoaderCircle,
  Maximize2,
  Minimize2,
  Moon,
  MousePointer2,
  MoveHorizontal,
  PanelLeft,
  PenLine,
  RotateCcw,
  RotateCw,
  Rows3,
  Scan,
  Search,
  StickyNote,
  Sun,
  Trash,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import Modal from '../../components/Modal'
import { loadPdfDocument } from '../../utils/pdfRender'
import {
  buildPageSearchIndex,
  exportAnnotatedPdf,
  findMatchesInPage,
  normalizeQuery,
  pdfRectToViewport,
} from '../../utils/pdfReader'
import { addHistoryEntry } from '../../utils/historyStorage'
import { formatBytes } from '../../utils/formatBytes'
import './pdfReader.css'

// 100 % = taille réelle à l'écran (96 dpi CSS), comme les lecteurs PDF de
// bureau : pdf.js travaille en points PDF (72 par pouce), d'où ce facteur.
const CSS_UNITS = 96 / 72
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4]
const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const MAX_MATCHES = 5000
const PEN_WIDTH = 2 // en points PDF
const EMPTY = []

const HIGHLIGHT_COLORS = [
  { id: 'yellow', value: '#facc15' },
  { id: 'emerald', value: '#10b981' },
  { id: 'blue', value: '#3b82f6' },
]
const PEN_COLORS = [
  ...HIGHLIGHT_COLORS,
  { id: 'red', value: '#ef4444' },
  { id: 'black', value: '#18181b' },
]

const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function useIsMobile() {
  const query = '(max-width: 767px)'
  const [isMobile, setIsMobile] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setIsMobile(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return isMobile
}

function ToolButton({ icon: Icon, label, onClick, active = false, disabled = false, className = '' }) {
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

const Separator = () => <span className="mx-1 h-6 w-px shrink-0 bg-zinc-200 dark:bg-zinc-800" />

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

const PageView = memo(function PageView({
  pdf,
  pageNumber,
  renderScale,
  rotation,
  width,
  height,
  shouldRender,
  nightMode,
  annotations,
  matches,
  tool,
  toolColor,
  openNoteId,
  onAdd,
  onUpdate,
  onRemove,
  onOpenNote,
  onCloseNote,
  registerRef,
  r,
}) {
  const canvasRef = useRef(null)
  const textLayerRef = useRef(null)
  const overlayRef = useRef(null)
  const lastPointRef = useRef(null)
  const [viewport, setViewport] = useState(null)
  const [draft, setDraft] = useState(null)

  // Rendu canvas + couche de texte, uniquement pour les pages proches de la
  // zone visible : une page éloignée libère sa mémoire (canvas vidé).
  useEffect(() => {
    const canvas = canvasRef.current
    const textLayerDiv = textLayerRef.current
    if (!shouldRender) {
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
      textLayerDiv?.replaceChildren()
      return undefined
    }

    let cancelled = false
    let renderTask = null
    let textLayer = null

    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const vp = page.getViewport({ scale: renderScale, rotation: (page.rotate + rotation) % 360 })
      setViewport(vp)

      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(vp.width * ratio)
      canvas.height = Math.floor(vp.height * ratio)
      renderTask = page.render({
        canvas,
        canvasContext: canvas.getContext('2d'),
        viewport: vp,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null,
      })
      await renderTask.promise
      if (cancelled) return

      const textContent = await page.getTextContent()
      if (cancelled) return
      textLayerDiv.replaceChildren()
      textLayer = new TextLayer({ textContentSource: textContent, container: textLayerDiv, viewport: vp })
      await textLayer.render()
    })().catch((err) => {
      if (err?.name !== 'RenderingCancelledException' && err?.name !== 'AbortException') {
        console.error(err)
      }
    })

    return () => {
      cancelled = true
      renderTask?.cancel()
      textLayer?.cancel()
    }
  }, [pdf, pageNumber, renderScale, rotation, shouldRender])

  const isDrawingTool = tool === 'highlight' || tool === 'pen' || tool === 'note'

  const toPdfPoint = (e) => {
    const box = overlayRef.current.getBoundingClientRect()
    return viewport.convertToPdfPoint(e.clientX - box.left, e.clientY - box.top)
  }

  const handlePointerDown = (e) => {
    if (!viewport || !isDrawingTool || e.button > 0) return
    e.preventDefault()
    const point = toPdfPoint(e)
    if (tool === 'note') {
      const id = onAdd({ type: 'note', page: pageNumber, at: point, text: '', color: toolColor })
      onOpenNote(id)
      return
    }
    overlayRef.current.setPointerCapture(e.pointerId)
    lastPointRef.current = [e.clientX, e.clientY]
    setDraft(
      tool === 'highlight'
        ? { type: 'highlight', start: point, end: point, color: toolColor }
        : { type: 'pen', points: [point], color: toolColor },
    )
  }

  const handlePointerMove = (e) => {
    if (!draft || !viewport) return
    if (draft.type === 'highlight') {
      setDraft({ ...draft, end: toPdfPoint(e) })
      return
    }
    const [lx, ly] = lastPointRef.current
    if (Math.hypot(e.clientX - lx, e.clientY - ly) < 2) return
    lastPointRef.current = [e.clientX, e.clientY]
    setDraft({ ...draft, points: [...draft.points, toPdfPoint(e)] })
  }

  const handlePointerUp = () => {
    if (!draft) return
    if (draft.type === 'highlight') {
      const [x0, y0] = draft.start
      const [x1, y1] = draft.end
      if (Math.abs(x1 - x0) > 2 && Math.abs(y1 - y0) > 2) {
        onAdd({
          type: 'highlight',
          page: pageNumber,
          color: draft.color,
          rect: [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
        })
      }
    } else {
      onAdd({ type: 'pen', page: pageNumber, color: draft.color, points: draft.points, width: PEN_WIDTH })
    }
    setDraft(null)
  }

  const shapePointer = tool === 'eraser' ? 'visiblePainted' : 'none'
  const eraseOnClick = (id) => (tool === 'eraser' ? () => onRemove(id) : undefined)

  const renderHighlight = (rect, color, key, extra = {}) => {
    const box = pdfRectToViewport(viewport, rect)
    return (
      <rect
        key={key}
        x={box.left}
        y={box.top}
        width={box.width}
        height={box.height}
        fill={color}
        fillOpacity={0.35}
        style={{ mixBlendMode: 'multiply', pointerEvents: shapePointer, cursor: tool === 'eraser' ? 'pointer' : undefined }}
        {...extra}
      />
    )
  }

  const renderPen = (points, color, key, extra = {}) => (
    <polyline
      key={key}
      points={points.map((p) => viewport.convertToViewportPoint(p[0], p[1]).join(',')).join(' ')}
      fill="none"
      stroke={color}
      strokeWidth={PEN_WIDTH * renderScale}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ pointerEvents: shapePointer, cursor: tool === 'eraser' ? 'pointer' : undefined }}
      {...extra}
    />
  )

  return (
    <div
      ref={(el) => registerRef(pageNumber, el)}
      data-page={pageNumber}
      className={`one-pdf-page relative shrink-0 shadow-md ring-1 ring-zinc-200 dark:ring-zinc-800 ${
        nightMode ? 'bg-zinc-900' : 'bg-white'
      }`}
      style={{ width, height, '--scale-factor': renderScale, '--total-scale-factor': renderScale }}
    >
      <canvas
        ref={canvasRef}
        className={`absolute left-0 top-0 ${nightMode ? 'one-night-canvas' : ''}`}
        style={{ width, height }}
      />
      <div ref={textLayerRef} className="one-text-layer" />

      <div
        ref={overlayRef}
        className="absolute inset-0"
        style={{
          pointerEvents: isDrawingTool ? 'auto' : 'none',
          touchAction: isDrawingTool ? 'none' : 'auto',
          cursor: isDrawingTool ? 'crosshair' : undefined,
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDraft(null)}
      >
        {viewport && (
          <>
            <svg className="absolute inset-0 overflow-visible" width={width} height={height} style={{ pointerEvents: 'none' }}>
              {matches.map((match, i) =>
                match.rects.map((rect, j) => {
                  const box = pdfRectToViewport(viewport, rect)
                  return (
                    <rect
                      key={`m-${i}-${j}`}
                      x={box.left - 1}
                      y={box.top - 1}
                      width={box.width + 2}
                      height={box.height + 2}
                      rx={2}
                      fill={match.active ? 'rgba(249, 115, 22, 0.5)' : 'rgba(250, 204, 21, 0.4)'}
                      stroke={match.active ? 'rgb(234, 88, 12)' : 'none'}
                      style={{ mixBlendMode: 'multiply' }}
                    />
                  )
                }),
              )}
              {annotations.map((a) => {
                if (a.type === 'highlight') return renderHighlight(a.rect, a.color, a.id, { onClick: eraseOnClick(a.id) })
                if (a.type === 'pen') return renderPen(a.points, a.color, a.id, { onClick: eraseOnClick(a.id) })
                return null
              })}
              {draft?.type === 'highlight' &&
                renderHighlight(
                  [
                    Math.min(draft.start[0], draft.end[0]),
                    Math.min(draft.start[1], draft.end[1]),
                    Math.max(draft.start[0], draft.end[0]),
                    Math.max(draft.start[1], draft.end[1]),
                  ],
                  draft.color,
                  'draft',
                )}
              {draft?.type === 'pen' && renderPen(draft.points, draft.color, 'draft')}
            </svg>

            {annotations
              .filter((a) => a.type === 'note')
              .map((note) => {
                const [x, y] = viewport.convertToViewportPoint(note.at[0], note.at[1])
                const isOpen = openNoteId === note.id
                return (
                  <div key={note.id} className="absolute" style={{ left: x, top: y, zIndex: isOpen ? 20 : 10 }}>
                    <button
                      type="button"
                      title={note.text || r('typeNote')}
                      aria-label={r('typeNote')}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => (tool === 'eraser' ? onRemove(note.id) : isOpen ? onCloseNote(note.id) : onOpenNote(note.id))}
                      className="pointer-events-auto absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-md text-zinc-900 shadow-md ring-1 ring-black/20 transition-transform hover:scale-110"
                      style={{ backgroundColor: note.color }}
                    >
                      <StickyNote size={14} />
                    </button>
                    {isOpen && (
                      <div
                        onPointerDown={(e) => e.stopPropagation()}
                        className="pointer-events-auto absolute left-4 top-0 w-56 rounded-xl border border-zinc-200 bg-white p-2 shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
                      >
                        <textarea
                          autoFocus
                          value={note.text}
                          onChange={(e) => onUpdate(note.id, { text: e.target.value })}
                          placeholder={r('notePlaceholder')}
                          rows={4}
                          className="w-full resize-none rounded-lg border border-zinc-200 bg-white p-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                        />
                        <div className="mt-1.5 flex justify-between">
                          <button
                            type="button"
                            onClick={() => onRemove(note.id)}
                            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                          >
                            <Trash size={13} /> {r('delete')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onCloseNote(note.id)}
                            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
                          >
                            {r('ok')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
          </>
        )}
      </div>
    </div>
  )
})

/* -------------------------------------------------------------------------- */
/* Panneau latéral                                                            */
/* -------------------------------------------------------------------------- */

const THUMB_WIDTH = 112

const Thumbnail = memo(function Thumbnail({ pdf, pageNumber, rotation, base, active, nightMode, onSelect, registerRef }) {
  const buttonRef = useRef(null)
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(false)
  const swap = rotation % 180 !== 0
  const ratio = (swap ? base.w : base.h) / (swap ? base.h : base.w)
  const height = Math.round(THUMB_WIDTH * ratio)

  useEffect(() => {
    const el = buttonRef.current
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    let cancelled = false
    let task = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const raw = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 })
      const vp = page.getViewport({ scale: (THUMB_WIDTH * 2) / raw.width, rotation: (page.rotate + rotation) % 360 })
      const canvas = canvasRef.current
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport: vp })
      await task.promise
    })().catch((err) => {
      if (err?.name !== 'RenderingCancelledException') console.error(err)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber, rotation, visible])

  return (
    <button
      ref={(el) => {
        buttonRef.current = el
        registerRef(pageNumber, el)
      }}
      type="button"
      onClick={() => onSelect(pageNumber)}
      className="group flex w-full flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
    >
      <span
        className={`block overflow-hidden rounded-md bg-white shadow-sm transition-all ${
          active ? 'ring-2 ring-emerald-500' : 'ring-1 ring-zinc-200 group-hover:ring-zinc-300 dark:ring-zinc-700'
        }`}
        style={{ width: THUMB_WIDTH, height }}
      >
        <canvas ref={canvasRef} className={nightMode ? 'one-night-canvas' : ''} style={{ width: THUMB_WIDTH, height }} />
      </span>
      <span
        className={`text-xs font-medium ${active ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}
      >
        {pageNumber}
      </span>
    </button>
  )
})

function OutlineNode({ item, depth, onNavigate }) {
  const [expanded, setExpanded] = useState(depth === 0)
  const hasChildren = item.items?.length > 0
  return (
    <li>
      <div className="flex items-start gap-0.5" style={{ paddingLeft: depth * 12 }}>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={item.title}
            className="mt-1 shrink-0 rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <ChevronRight size={14} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onNavigate(item)}
          className={`min-w-0 flex-1 rounded-md px-1.5 py-1 text-left text-sm leading-snug text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white ${
            item.bold ? 'font-semibold' : ''
          } ${item.italic ? 'italic' : ''}`}
        >
          {item.title}
        </button>
      </div>
      {hasChildren && expanded && (
        <ul>
          {item.items.map((child, i) => (
            <OutlineNode key={i} item={child} depth={depth + 1} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Lecteur                                                                    */
/* -------------------------------------------------------------------------- */

function Reader({ doc, onClose }) {
  const { t } = useTranslation()
  const r = useCallback((key, opts) => t(`tools.pdf-reader.${key}`, opts), [t])
  const { pdf, pages, file, bytes } = doc
  const numPages = pages.length
  const isMobile = useIsMobile()

  const rootRef = useRef(null)
  const scrollRef = useRef(null)
  const sidebarScrollRef = useRef(null)
  const searchInputRef = useRef(null)
  const pageRefs = useRef([])
  const thumbRefs = useRef([])
  const anchorRef = useRef({ page: 1, frac: 0 })
  const lockRef = useRef(null)
  const rafRef = useRef(0)
  const textCacheRef = useRef(new Map())

  const [scale, setScale] = useState(1)
  const [fitMode, setFitMode] = useState('width')
  const [rotation, setRotation] = useState(0)
  const [viewMode, setViewMode] = useState('continuous')
  const [currentPage, setCurrentPage] = useState(1)
  // Saisie en cours dans le champ de page (null = affiche la page courante).
  const [pageDraft, setPageDraft] = useState(null)
  const [visiblePages, setVisiblePages] = useState(() => new Set([1, 2, 3]))
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 767px)').matches)
  const [sidebarTab, setSidebarTab] = useState('thumbs')
  const [outline, setOutline] = useState(null)
  const [nightMode, setNightMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [infoOpen, setInfoOpen] = useState(false)
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState(null)

  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [tool, setTool] = useState('select')
  const [colors, setColors] = useState({ highlight: '#facc15', pen: '#ef4444', note: '#facc15' })
  const [annotations, setAnnotations] = useState([])
  const [openNoteId, setOpenNoteId] = useState(null)
  const [exporting, setExporting] = useState(false)

  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rawMatches, setMatches] = useState([])
  const [activeMatch, setActiveMatch] = useState(0)
  const [searching, setSearching] = useState(false)
  // Requête vide = aucun résultat affiché (dérivé, sans effet de remise à zéro).
  const hasQuery = normalizeQuery(query).length > 0
  const matches = hasQuery ? rawMatches : EMPTY
  const isSearching = hasQuery && searching

  const renderScale = scale * CSS_UNITS
  const currentPageRef = useRef(1)
  const stateRef = useRef({ renderScale, rotation, viewMode })

  // Déclaré avant les autres effets de layout : ceux-ci lisent stateRef et
  // doivent voir les valeurs du rendu courant.
  useLayoutEffect(() => {
    stateRef.current = { renderScale, rotation, viewMode }
    currentPageRef.current = currentPage
  }, [renderScale, rotation, viewMode, currentPage])

  const pageSize = useCallback(
    (n) => {
      const p = pages[n - 1]
      const swap = rotation % 180 !== 0
      return {
        width: Math.floor((swap ? p.h : p.w) * renderScale),
        height: Math.floor((swap ? p.w : p.h) * renderScale),
      }
    },
    [pages, rotation, renderScale],
  )

  const registerPageRef = useCallback((n, el) => {
    pageRefs.current[n - 1] = el
  }, [])
  const registerThumbRef = useCallback((n, el) => {
    thumbRefs.current[n - 1] = el
  }, [])

  /* ---- Suivi du défilement : page courante + pages à rendre ------------- */
  const updateFromScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el || stateRef.current.viewMode !== 'continuous') return
    const refs = pageRefs.current
    const top = el.scrollTop
    const bottom = top + el.clientHeight
    const margin = el.clientHeight

    let lo = 0
    let hi = numPages - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const p = refs[mid]
      if (p && p.offsetTop + p.offsetHeight < top - margin) lo = mid + 1
      else hi = mid
    }

    const visible = []
    let best = null
    let bestArea = -1
    let anchor = null
    for (let i = lo; i < numPages; i++) {
      const p = refs[i]
      if (!p) continue
      const pt = p.offsetTop
      const pb = pt + p.offsetHeight
      if (pt > bottom + margin) break
      visible.push(i + 1)
      const area = Math.min(pb, bottom) - Math.max(pt, top)
      if (area > bestArea + 1) {
        bestArea = area
        best = i + 1
      }
      if (!anchor && pb > top) anchor = { page: i + 1, frac: (top - pt) / p.offsetHeight }
    }

    setVisiblePages((prev) => {
      if (prev.size === visible.length && visible.every((n) => prev.has(n))) return prev
      return new Set(visible)
    })
    if (anchor) anchorRef.current = anchor

    const lock = lockRef.current
    if (lock && Date.now() - lock.time < 400 && visible.includes(lock.page)) best = lock.page
    if (best) setCurrentPage(best)
  }, [numPages])

  const handleScroll = () => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(updateFromScroll)
  }

  // Après un changement de zoom/rotation/mode, on replace la vue sur le même
  // point du document plutôt que de garder une position en pixels périmée.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = anchorRef.current
    if (el && viewMode === 'continuous' && anchor) {
      const p = pageRefs.current[anchor.page - 1]
      if (p) el.scrollTop = p.offsetTop + anchor.frac * p.offsetHeight
    }
    updateFromScroll()
  }, [renderScale, rotation, viewMode, updateFromScroll])

  const goToPage = useCallback(
    (n) => {
      const target = clamp(Math.round(n) || 1, 1, numPages)
      const el = scrollRef.current
      setCurrentPage(target)
      if (stateRef.current.viewMode === 'continuous') {
        const p = pageRefs.current[target - 1]
        lockRef.current = { page: target, time: Date.now() }
        if (el && p) el.scrollTop = p.offsetTop - 12
      } else if (el) {
        el.scrollTop = 0
      }
    },
    [numPages],
  )

  /* ---- Zoom & ajustement ------------------------------------------------- */
  const computeFitScale = useCallback(
    (mode) => {
      const el = scrollRef.current
      if (!el) return null
      const p = pages[currentPageRef.current - 1]
      const swap = rotation % 180 !== 0
      const w = (swap ? p.h : p.w) * CSS_UNITS
      const h = (swap ? p.w : p.h) * CSS_UNITS
      const availW = el.clientWidth - (isMobile ? 16 : 48)
      const availH = el.clientHeight - 32
      const s = mode === 'width' ? availW / w : Math.min(availW / w, availH / h)
      return clamp(s, MIN_ZOOM, MAX_ZOOM)
    },
    [pages, rotation, isMobile],
  )

  useEffect(() => {
    if (!fitMode) return undefined
    const apply = () => {
      const s = computeFitScale(fitMode)
      if (s) setScale((prev) => (Math.abs(prev - s) > 0.002 ? s : prev))
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(scrollRef.current)
    return () => observer.disconnect()
  }, [fitMode, computeFitScale])

  const setZoom = useCallback((value) => {
    setFitMode(null)
    setScale(clamp(value, MIN_ZOOM, MAX_ZOOM))
  }, [])
  const zoomIn = useCallback(() => {
    setFitMode(null)
    setScale((s) => ZOOM_STEPS.find((z) => z > s + 0.001) ?? MAX_ZOOM)
  }, [])
  const zoomOut = useCallback(() => {
    setFitMode(null)
    setScale((s) => [...ZOOM_STEPS].reverse().find((z) => z < s - 0.001) ?? MIN_ZOOM)
  }, [])

  // Ctrl + molette = zoom (listener non passif pour bloquer le zoom navigateur).
  useEffect(() => {
    const el = scrollRef.current
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      setFitMode(null)
      setScale((s) => clamp(s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), MIN_ZOOM, MAX_ZOOM))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const rotate = (delta) => setRotation((rot) => (rot + delta + 360) % 360)

  const toggleViewMode = () => {
    anchorRef.current = { page: currentPageRef.current, frac: 0 }
    setViewMode((m) => (m === 'continuous' ? 'single' : 'continuous'))
  }

  /* ---- Sommaire, métadonnées, plein écran -------------------------------- */
  useEffect(() => {
    let cancelled = false
    pdf
      .getOutline()
      .then((o) => !cancelled && setOutline(o ?? []))
      .catch(() => !cancelled && setOutline([]))
    pdf
      .getMetadata()
      .then(({ info }) => !cancelled && setMeta(info ?? {}))
      .catch(() => !cancelled && setMeta({}))
    return () => {
      cancelled = true
    }
  }, [pdf])

  const navigateOutline = useCallback(
    async (item) => {
      try {
        if (item.url) {
          window.open(item.url, '_blank', 'noopener,noreferrer')
          return
        }
        let dest = item.dest
        if (typeof dest === 'string') dest = await pdf.getDestination(dest)
        if (!Array.isArray(dest)) return
        const ref = dest[0]
        const index = typeof ref === 'object' && ref !== null ? await pdf.getPageIndex(ref) : Number(ref)
        goToPage(index + 1)
        if (isMobile) setSidebarOpen(false)
      } catch (err) {
        console.error(err)
      }
    },
    [pdf, goToPage, isMobile],
  )

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === rootRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    else rootRef.current?.requestFullscreen?.().catch(() => {})
  }

  // Garde la miniature active visible dans le panneau.
  useEffect(() => {
    if (!sidebarOpen || sidebarTab !== 'thumbs') return
    const container = sidebarScrollRef.current
    const thumb = thumbRefs.current[currentPage - 1]
    if (!container || !thumb) return
    const top = thumb.offsetTop
    const bottom = top + thumb.offsetHeight
    if (top < container.scrollTop) container.scrollTop = top - 8
    else if (bottom > container.scrollTop + container.clientHeight) {
      container.scrollTop = bottom - container.clientHeight + 8
    }
  }, [currentPage, sidebarOpen, sidebarTab])

  /* ---- Recherche --------------------------------------------------------- */
  const revealMatch = useCallback(
    async (match) => {
      if (!match) return
      const el = scrollRef.current
      const page = await pdf.getPage(match.page)
      const { renderScale: rs, rotation: rot, viewMode: mode } = stateRef.current
      const vp = page.getViewport({ scale: rs, rotation: (page.rotate + rot) % 360 })
      const box = pdfRectToViewport(vp, match.rects[0])

      const scrollTo = () => {
        const p = pageRefs.current[match.page - 1]
        if (!el || !p) return
        el.scrollTop = p.offsetTop + box.top - el.clientHeight / 3
        const left = p.offsetLeft + box.left
        if (left < el.scrollLeft || left > el.scrollLeft + el.clientWidth - 40) {
          el.scrollLeft = left - el.clientWidth / 2
        }
      }

      setCurrentPage(match.page)
      if (mode === 'continuous') {
        lockRef.current = { page: match.page, time: Date.now() }
        scrollTo()
      } else {
        requestAnimationFrame(scrollTo)
      }
    },
    [pdf],
  )

  useEffect(() => {
    if (!searchOpen) return undefined
    const normQuery = normalizeQuery(query)
    if (!normQuery) return undefined

    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      const found = []
      try {
        for (let n = 1; n <= numPages && found.length < MAX_MATCHES; n++) {
          let entry = textCacheRef.current.get(n)
          if (!entry) {
            const page = await pdf.getPage(n)
            const content = await page.getTextContent()
            const items = content.items.filter((item) => typeof item.str === 'string')
            entry = { items, index: buildPageSearchIndex(items) }
            textCacheRef.current.set(n, entry)
          }
          if (cancelled) return
          found.push(...findMatchesInPage(entry.index, entry.items, normQuery, n))
        }
      } catch (err) {
        console.error(err)
      }
      if (cancelled) return
      const results = found.slice(0, MAX_MATCHES)
      const first = Math.max(0, results.findIndex((m) => m.page >= currentPageRef.current))
      setMatches(results)
      setActiveMatch(first)
      setSearching(false)
      if (results.length) revealMatch(results[first])
    }, 250)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, searchOpen, pdf, numPages, revealMatch])

  const stepMatch = useCallback(
    (delta) => {
      if (!matches.length) return
      const next = (activeMatch + delta + matches.length) % matches.length
      setActiveMatch(next)
      revealMatch(matches[next])
    },
    [matches, activeMatch, revealMatch],
  )

  const openSearch = useCallback(() => {
    setSearchOpen(true)
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setMatches([])
  }, [])

  const matchesByPage = useMemo(() => {
    const map = new Map()
    matches.forEach((m, i) => {
      const list = map.get(m.page) ?? []
      list.push({ rects: m.rects, active: i === activeMatch })
      map.set(m.page, list)
    })
    return map
  }, [matches, activeMatch])

  /* ---- Annotations ------------------------------------------------------- */
  const addAnnotation = useCallback((annotation) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setAnnotations((prev) => [...prev, { ...annotation, id }])
    return id
  }, [])
  const updateAnnotation = useCallback((id, patch) => {
    setAnnotations((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  }, [])
  const removeAnnotation = useCallback((id) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id))
    setOpenNoteId((open) => (open === id ? null : open))
  }, [])
  // Une note refermée sans texte n'a aucun intérêt : on la retire.
  const closeNote = useCallback((id) => {
    setAnnotations((prev) => prev.filter((a) => !(a.id === id && a.type === 'note' && !a.text.trim())))
    setOpenNoteId(null)
  }, [])

  const annotationsByPage = useMemo(() => {
    const map = new Map()
    for (const a of annotations) {
      const list = map.get(a.page) ?? []
      list.push(a)
      map.set(a.page, list)
    }
    return map
  }, [annotations])

  const undo = () => setAnnotations((prev) => prev.slice(0, -1))
  const clearAll = () => {
    if (window.confirm(r('confirmClear'))) {
      setAnnotations([])
      setOpenNoteId(null)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    setError(null)
    try {
      const output = await exportAnnotatedPdf(bytes, annotations)
      const blob = new Blob([output], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${file.name.replace(/\.pdf$/i, '')}_annote.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      addHistoryEntry({
        toolId: 'pdf-reader',
        toolName: r('name'),
        message: r('historyMessage', { name: file.name, count: annotations.length }),
      })
    } catch (err) {
      console.error(err)
      setError(r('errorExport'))
    } finally {
      setExporting(false)
    }
  }

  const handleClose = () => {
    if (annotations.length && !window.confirm(r('confirmCloseFile'))) return
    if (document.fullscreenElement) document.exitFullscreen()
    onClose()
  }

  const selectTool = (next) => {
    setTool((current) => (current === next ? 'select' : next))
    setOpenNoteId(null)
  }

  /* ---- Raccourcis clavier ------------------------------------------------ */
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)
      if (mod && key === 'f') {
        e.preventDefault()
        openSearch()
      } else if (mod && (key === '+' || key === '=')) {
        e.preventDefault()
        zoomIn()
      } else if (mod && key === '-') {
        e.preventDefault()
        zoomOut()
      } else if (key === 'escape' && searchOpen) {
        closeSearch()
      } else if (!typing && !mod) {
        if (['arrowright', 'pagedown'].includes(key) && viewMode === 'single') {
          e.preventDefault()
          goToPage(currentPageRef.current + 1)
        } else if (['arrowleft', 'pageup'].includes(key) && viewMode === 'single') {
          e.preventDefault()
          goToPage(currentPageRef.current - 1)
        } else if (key === 'home') {
          goToPage(1)
        } else if (key === 'end') {
          goToPage(numPages)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch, closeSearch, zoomIn, zoomOut, goToPage, searchOpen, viewMode, numPages])

  /* ---- Rendu ------------------------------------------------------------- */
  const pagesToShow = viewMode === 'continuous' ? pages.map((_, i) => i + 1) : [currentPage]
  const zoomValue = fitMode ? `fit-${fitMode}` : String(scale)
  const isPreset = ZOOM_PRESETS.some((z) => Math.abs(z - scale) < 0.001)
  const activeColors = tool === 'pen' ? PEN_COLORS : HIGHLIGHT_COLORS
  const toolColor = colors[tool] ?? colors.highlight

  const sidebarTabs = [
    { id: 'thumbs', label: r('thumbnails'), icon: FileIcon },
    { id: 'outline', label: r('outline'), icon: ListTree },
    { id: 'annotations', label: r('annotations'), icon: StickyNote },
  ]

  const metaRows = meta
    ? [
        ['fileName', file.name],
        ['title', meta.Title],
        ['author', meta.Author],
        ['subject', meta.Subject],
        ['keywords', meta.Keywords],
        ['creator', meta.Creator],
        ['producer', meta.Producer],
        ['created', formatPdfDate(meta.CreationDate)],
        ['modified', formatPdfDate(meta.ModDate)],
        ['version', meta.PDFFormatVersion],
        ['pages', String(numPages)],
        ['size', formatBytes(file.size)],
        [
          'pageSize',
          `${Math.round((pages[0].w * 25.4) / 72)} × ${Math.round((pages[0].h * 25.4) / 72)} mm`,
        ],
      ]
    : []

  return (
    <div
      ref={rootRef}
      className={`one-pdf-reader flex flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 ${
        isFullscreen
          ? 'h-screen'
          : 'h-[calc(100dvh-10.5rem)] min-h-104 rounded-2xl border border-zinc-200 shadow-sm md:h-[calc(100dvh-9rem)] dark:border-zinc-800'
      }`}
    >
      {/* Barre d'outils principale */}
      <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-white px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900 scrollbar-none">
        <ToolButton icon={PanelLeft} label={r('toggleSidebar')} onClick={() => setSidebarOpen((v) => !v)} active={sidebarOpen} />
        <Separator />
        <ToolButton icon={ChevronLeft} label={r('prevPage')} onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} />
        <form
          className="flex shrink-0 items-center gap-1 text-sm"
          onSubmit={(e) => {
            e.preventDefault()
            if (pageDraft) goToPage(Number(pageDraft))
            setPageDraft(null)
          }}
        >
          <input
            value={pageDraft ?? String(currentPage)}
            onChange={(e) => setPageDraft(e.target.value.replace(/\D/g, ''))}
            onBlur={() => setPageDraft(null)}
            inputMode="numeric"
            aria-label={r('pageLabel', { n: currentPage })}
            className="h-8 w-11 rounded-md border border-zinc-200 bg-white text-center text-sm tabular-nums focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
          />
          <span className="whitespace-nowrap tabular-nums text-zinc-500 dark:text-zinc-400">/ {numPages}</span>
        </form>
        <ToolButton icon={ChevronRight} label={r('nextPage')} onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} />
        <Separator />
        <ToolButton icon={ZoomOut} label={r('zoomOut')} onClick={zoomOut} disabled={scale <= MIN_ZOOM} />
        <select
          value={zoomValue}
          aria-label={r('zoomLevel')}
          onChange={(e) => {
            const v = e.target.value
            if (v.startsWith('fit-')) setFitMode(v.slice(4))
            else setZoom(Number(v))
          }}
          className="h-8 shrink-0 rounded-md border border-zinc-200 bg-white px-1.5 text-sm tabular-nums focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
        >
          {fitMode && <option value={`fit-${fitMode}`}>{Math.round(scale * 100)} %</option>}
          {!fitMode && !isPreset && <option value={String(scale)}>{Math.round(scale * 100)} %</option>}
          {ZOOM_PRESETS.map((z) => (
            <option key={z} value={String(z)}>
              {Math.round(z * 100)} %
            </option>
          ))}
          <option value="fit-width">{r('fitWidth')}</option>
          <option value="fit-page">{r('fitPage')}</option>
        </select>
        <ToolButton icon={ZoomIn} label={r('zoomIn')} onClick={zoomIn} disabled={scale >= MAX_ZOOM} />
        <ToolButton icon={MoveHorizontal} label={r('fitWidth')} onClick={() => setFitMode('width')} active={fitMode === 'width'} className="hidden sm:inline-flex" />
        <ToolButton icon={Scan} label={r('fitPage')} onClick={() => setFitMode('page')} active={fitMode === 'page'} className="hidden sm:inline-flex" />
        <Separator />
        <ToolButton icon={RotateCcw} label={r('rotateLeft')} onClick={() => rotate(-90)} />
        <ToolButton icon={RotateCw} label={r('rotateRight')} onClick={() => rotate(90)} />
        <ToolButton
          icon={viewMode === 'continuous' ? Rows3 : FileIcon}
          label={viewMode === 'continuous' ? r('switchToSingle') : r('switchToContinuous')}
          onClick={toggleViewMode}
        />

        <div className="flex-1" />

        <ToolButton icon={Search} label={r('search')} onClick={() => (searchOpen ? closeSearch() : openSearch())} active={searchOpen} />
        <ToolButton icon={Highlighter} label={r('annotate')} onClick={() => setAnnotateOpen((v) => !v)} active={annotateOpen} />
        <ToolButton icon={nightMode ? Sun : Moon} label={r('nightMode')} onClick={() => setNightMode((v) => !v)} active={nightMode} />
        <ToolButton icon={Info} label={r('properties')} onClick={() => setInfoOpen(true)} />
        {document.fullscreenEnabled && (
          <ToolButton
            icon={isFullscreen ? Minimize2 : Maximize2}
            label={isFullscreen ? r('exitFullscreen') : r('fullscreen')}
            onClick={toggleFullscreen}
          />
        )}
        <ToolButton icon={X} label={r('closeFile')} onClick={handleClose} />
      </div>

      {/* Barre d'annotation */}
      {annotateOpen && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-white px-1.5 py-1.5 dark:border-zinc-800 dark:bg-zinc-900 scrollbar-none">
          <ToolButton icon={MousePointer2} label={r('toolSelect')} onClick={() => setTool('select')} active={tool === 'select'} />
          <ToolButton icon={Highlighter} label={r('toolHighlight')} onClick={() => selectTool('highlight')} active={tool === 'highlight'} />
          <ToolButton icon={PenLine} label={r('toolPen')} onClick={() => selectTool('pen')} active={tool === 'pen'} />
          <ToolButton icon={StickyNote} label={r('toolNote')} onClick={() => selectTool('note')} active={tool === 'note'} />
          <ToolButton icon={Eraser} label={r('toolEraser')} onClick={() => selectTool('eraser')} active={tool === 'eraser'} />
          {['highlight', 'pen', 'note'].includes(tool) && (
            <>
              <Separator />
              <div className="flex shrink-0 items-center gap-1.5 px-1" role="radiogroup" aria-label={r('color')}>
                {activeColors.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={toolColor === c.value}
                    title={r(`colors.${c.id}`)}
                    aria-label={r(`colors.${c.id}`)}
                    onClick={() => setColors((prev) => ({ ...prev, [tool]: c.value }))}
                    className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-white transition-transform hover:scale-110 dark:ring-offset-zinc-900 ${
                      toolColor === c.value ? 'ring-2 ring-zinc-900 dark:ring-white' : 'ring-1 ring-black/10'
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </>
          )}
          <Separator />
          <ToolButton icon={Undo2} label={r('undo')} onClick={undo} disabled={!annotations.length} />
          <ToolButton icon={Trash} label={r('clearAll')} onClick={clearAll} disabled={!annotations.length} />
          <div className="flex-1" />
          <span className="hidden shrink-0 px-2 text-xs text-zinc-500 lg:inline dark:text-zinc-400">{r('annotationsHint')}</span>
          <button
            type="button"
            onClick={handleExport}
            disabled={!annotations.length || exporting}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-40"
          >
            {exporting ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />}
            <span className="hidden sm:inline">{exporting ? r('exporting') : r('exportAnnotated')}</span>
          </button>
        </div>
      )}

      {/* Barre de recherche */}
      {searchOpen && (
        <div className="flex items-center gap-1 border-b border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  stepMatch(e.shiftKey ? -1 : 1)
                }
              }}
              placeholder={r('searchPlaceholder')}
              className="h-8 w-full rounded-md border border-zinc-200 bg-white pl-8 pr-2 text-sm focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
          <span className="shrink-0 whitespace-nowrap px-1.5 text-xs tabular-nums text-zinc-500 dark:text-zinc-400" aria-live="polite">
            {isSearching ? (
              <span className="inline-flex items-center gap-1">
                <LoaderCircle size={13} className="animate-spin" /> {r('searching')}
              </span>
            ) : query.trim() ? (
              matches.length ? (
                r('matchCount', {
                  current: activeMatch + 1,
                  total: matches.length >= MAX_MATCHES ? `${MAX_MATCHES}+` : matches.length,
                })
              ) : (
                r('noMatch')
              )
            ) : null}
          </span>
          <ToolButton icon={ChevronUp} label={r('prevMatch')} onClick={() => stepMatch(-1)} disabled={!matches.length} />
          <ToolButton icon={ChevronDown} label={r('nextMatch')} onClick={() => stepMatch(1)} disabled={!matches.length} />
          <ToolButton icon={X} label={r('closeSearch')} onClick={closeSearch} />
        </div>
      )}

      {error && (
        <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="relative flex min-h-0 flex-1">
        {/* Panneau latéral (tiroir sur mobile) */}
        {sidebarOpen && isMobile && (
          <button
            type="button"
            aria-label={r('toggleSidebar')}
            onClick={() => setSidebarOpen(false)}
            className="absolute inset-0 z-20 bg-zinc-950/40 backdrop-blur-[1px]"
          />
        )}
        {sidebarOpen && (
          <aside
            className={`flex w-60 shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${
              isMobile ? 'absolute inset-y-0 left-0 z-30 shadow-2xl' : ''
            }`}
          >
            <div className="flex gap-1 border-b border-zinc-200 p-1.5 dark:border-zinc-800" role="tablist">
              {sidebarTabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={sidebarTab === id}
                  title={label}
                  onClick={() => setSidebarTab(id)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium transition-colors ${
                    sidebarTab === id
                      ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
                  }`}
                >
                  <Icon size={14} />
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>

            <div ref={sidebarScrollRef} className="relative min-h-0 flex-1 overflow-y-auto p-2">
              {sidebarTab === 'thumbs' && (
                <div className="flex flex-col gap-1">
                  {pages.map((base, i) => (
                    <Thumbnail
                      key={i}
                      pdf={pdf}
                      pageNumber={i + 1}
                      rotation={rotation}
                      base={base}
                      active={currentPage === i + 1}
                      nightMode={nightMode}
                      registerRef={registerThumbRef}
                      onSelect={(n) => {
                        goToPage(n)
                        if (isMobile) setSidebarOpen(false)
                      }}
                    />
                  ))}
                </div>
              )}

              {sidebarTab === 'outline' &&
                (outline === null ? (
                  <LoaderCircle size={18} className="mx-auto mt-6 animate-spin text-zinc-400" />
                ) : outline.length ? (
                  <ul className="flex flex-col gap-0.5">
                    {outline.map((item, i) => (
                      <OutlineNode key={i} item={item} depth={0} onNavigate={navigateOutline} />
                    ))}
                  </ul>
                ) : (
                  <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{r('noOutline')}</p>
                ))}

              {sidebarTab === 'annotations' &&
                (annotations.length ? (
                  <ul className="flex flex-col gap-1">
                    {annotations.map((a) => {
                      const Icon = a.type === 'highlight' ? Highlighter : a.type === 'pen' ? PenLine : StickyNote
                      const typeKey = a.type === 'highlight' ? 'typeHighlight' : a.type === 'pen' ? 'typePen' : 'typeNote'
                      return (
                        <li key={a.id} className="group flex items-center gap-2 rounded-lg p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800/60">
                          <button
                            type="button"
                            onClick={() => {
                              goToPage(a.page)
                              if (a.type === 'note') setOpenNoteId(a.id)
                              if (isMobile) setSidebarOpen(false)
                            }}
                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          >
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-900"
                              style={{ backgroundColor: `${a.color}55` }}
                            >
                              <Icon size={14} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                {r(typeKey)} · {r('pageLabel', { n: a.page })}
                              </span>
                              {a.type === 'note' && a.text && (
                                <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{a.text}</span>
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAnnotation(a.id)}
                            title={r('delete')}
                            aria-label={r('delete')}
                            className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                          >
                            <Trash size={14} />
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="px-2 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">{r('noAnnotations')}</p>
                ))}
            </div>
          </aside>
        )}

        {/* Zone de lecture */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`relative min-w-0 flex-1 overflow-auto ${nightMode ? 'bg-zinc-950' : 'bg-zinc-100 dark:bg-zinc-950'}`}
        >
          <div className="flex w-max min-w-full flex-col items-center gap-4 px-2 py-4 sm:px-6">
            {pagesToShow.map((n) => {
              const { width, height } = pageSize(n)
              return (
                <PageView
                  key={n}
                  pdf={pdf}
                  pageNumber={n}
                  renderScale={renderScale}
                  rotation={rotation}
                  width={width}
                  height={height}
                  shouldRender={viewMode === 'single' || visiblePages.has(n)}
                  nightMode={nightMode}
                  annotations={annotationsByPage.get(n) ?? EMPTY}
                  matches={matchesByPage.get(n) ?? EMPTY}
                  tool={tool}
                  toolColor={toolColor}
                  openNoteId={openNoteId}
                  onAdd={addAnnotation}
                  onUpdate={updateAnnotation}
                  onRemove={removeAnnotation}
                  onOpenNote={setOpenNoteId}
                  onCloseNote={closeNote}
                  registerRef={registerPageRef}
                  r={r}
                />
              )
            })}
          </div>
        </div>
      </div>

      <Modal open={infoOpen} onClose={() => setInfoOpen(false)} icon={Info} title={r('properties')} subtitle={file.name}>
        <dl className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {metaRows.map(([key, value]) => (
            <div key={key} className="grid grid-cols-[9rem_1fr] gap-3 py-2">
              <dt className="text-zinc-500 dark:text-zinc-400">{r(`meta.${key}`)}</dt>
              <dd className={`wrap-break-word ${value ? 'text-zinc-900 dark:text-zinc-100' : 'italic text-zinc-400 dark:text-zinc-500'}`}>
                {value || r('unknown')}
              </dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  )
}

function formatPdfDate(raw) {
  if (!raw) return null
  try {
    const date = PDFDateString.toDateObject(raw)
    return date ? date.toLocaleString() : raw
  } catch {
    return raw
  }
}

/* -------------------------------------------------------------------------- */
/* Page de l'outil                                                            */
/* -------------------------------------------------------------------------- */

export default function PdfReaderTool() {
  const { t } = useTranslation()
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const docRef = useRef(null)

  useEffect(() => {
    docRef.current = doc
  }, [doc])
  useEffect(() => () => docRef.current?.pdf.destroy(), [])

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
            return { w: vp.width, h: vp.height }
          }),
        ),
      )
      setDoc({ pdf, pages, file, bytes })
    } catch (err) {
      console.error(err)
      setError(t('tools.pdf-reader.errorOpen'))
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    doc?.pdf.destroy()
    setDoc(null)
  }

  if (doc) {
    return (
      <div className="mx-auto max-w-[1600px] px-2 py-3 sm:px-4 lg:px-6">
        <div className="mb-2 flex items-center gap-3">
          <Link
            to="/pdf"
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft size={16} /> <span className="hidden sm:inline">{t('common.backToTools')}</span>
          </Link>
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
            <BookOpen size={16} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="truncate">{doc.file.name}</span>
          </span>
        </div>
        <Reader key={doc.file.name + doc.file.lastModified} doc={doc} onClose={handleClose} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors duration-200 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <BookOpen size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.pdf-reader.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.pdf-reader.subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {error && (
          <p className="mb-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}
        {loading ? (
          <ProcessingState
            icon={BookOpen}
            title={t('tools.pdf-reader.loading')}
            description={t('tools.pdf-reader.loadingDescription')}
          />
        ) : (
          <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf" hint={t('tools.pdf-reader.dropHint')} />
        )}
      </div>
    </div>
  )
}
