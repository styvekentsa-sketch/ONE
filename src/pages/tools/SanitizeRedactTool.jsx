import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  EyeOff,
  FileX,
  LoaderCircle,
  MousePointer2,
  ScanSearch,
  Search,
  ShieldCheck,
  Square,
  Trash,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { destroyPdfDocument, loadPdfDocument } from '../../utils/pdfRender'
import { MASK_COLORS, applyRedactions, auditOutput, detectSensitive, extractPages, sanitizeStructure, textUnderBoxes } from '../../utils/sanitizeWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'

const CATEGORIES = ['email', 'phone', 'bank', 'dates']
const PURGE_KEYS = ['metadata', 'annotations', 'attachments', 'javascript', 'externalLinks', 'outlines', 'layers']
const LABEL_PRESETS = ['', '[CONFIDENTIEL]', '[CENSURÉ]', '[PII]']
const ZOOMS = [0.75, 1, 1.25, 1.5, 2]
const uid = () => Math.random().toString(36).slice(2, 10)
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function IconButton({ icon: Icon, label, onClick, active = false, disabled = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400'
          : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white'
      }`}
    >
      <Icon size={18} />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Aperçu interactif                                                          */
/* -------------------------------------------------------------------------- */

function PagePreview({ pdf, pageNumber, size, zoom, boxes, draft, selectedId, tool, color, label, onPointerDown, onPointerMove, onPointerUp }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [width, setWidth] = useState(600)

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.floor(entry.contentRect.width))))
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  const scale = ((width - 24) / size.w) * zoom

  useEffect(() => {
    let cancelled = false
    let task = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      task = page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null })
      await task.promise
    })().catch((err) => {
      if (err?.name !== 'RenderingCancelledException') console.error(err)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, pageNumber, scale])

  const w = Math.floor(size.w * scale)
  const h = Math.floor(size.h * scale)
  const fill = MASK_COLORS[color]
  const textColor = color === 'white' ? '#111111' : '#ffffff'

  const renderBox = (box, isDraft = false) => {
    const selected = box.id === selectedId
    return (
      <div
        key={box.id ?? 'draft'}
        data-box={box.id}
        className={`absolute flex items-center justify-center overflow-hidden ${box.kind === 'auto' ? 'ring-2 ring-amber-400' : ''} ${selected ? 'outline outline-2 outline-offset-2 outline-emerald-500' : ''}`}
        style={{
          left: box.x * scale,
          top: box.y * scale,
          width: box.w * scale,
          height: box.h * scale,
          backgroundColor: fill,
          opacity: isDraft ? 0.6 : 0.88,
          cursor: tool === 'select' && box.kind === 'manual' ? 'move' : undefined,
          touchAction: 'none',
        }}
      >
        {label && !isDraft && (
          <span className="pointer-events-none truncate px-0.5 font-bold" style={{ color: textColor, fontSize: Math.max(6, Math.min(box.h * scale * 0.6, 18)) }}>
            {label}
          </span>
        )}
        {selected && box.kind === 'manual' && (
          <span data-box={box.id} data-handle="se" className="absolute -bottom-1 -right-1 h-3 w-3 cursor-nwse-resize rounded-sm border border-emerald-600 bg-white" />
        )}
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full">
      <div className="relative mx-auto bg-white shadow-md ring-1 ring-zinc-200 dark:ring-zinc-800" style={{ width: w, height: h }}>
        <canvas ref={canvasRef} className="absolute inset-0" style={{ width: w, height: h }} />
        <div
          className="absolute inset-0"
          style={{ cursor: tool === 'draw' ? 'crosshair' : 'default', touchAction: tool === 'draw' ? 'none' : 'pan-x pan-y' }}
          onPointerDown={(e) => onPointerDown(e, scale)}
          onPointerMove={(e) => onPointerMove(e, scale)}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {boxes.map((b) => renderBox(b))}
          {draft && renderBox(draft, true)}
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Outil                                                                      */
/* -------------------------------------------------------------------------- */

export default function SanitizeRedactTool() {
  const { t } = useTranslation()
  const s = (key, opts) => t(`tools.sanitize.${key}`, opts)

  const [file, setFile] = useState(null)
  const [bytes, setBytes] = useState(null)
  const [pdf, setPdf] = useState(null)
  const [sizes, setSizes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [tool, setTool] = useState('draw')
  const [manualBoxes, setManualBoxes] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(null)
  const dragRef = useRef(null)
  const [color, setColor] = useState('black')
  const [label, setLabel] = useState('')

  const [pageData, setPageData] = useState(null)
  const [scanOptions, setScanOptions] = useState({ email: true, phone: true, bank: true, dates: false })
  const [keywords, setKeywords] = useState('')
  const [scanning, setScanning] = useState(null)
  const [matches, setMatches] = useState(null)
  const [enabled, setEnabled] = useState(new Set())

  const [purge, setPurge] = useState({ metadata: true, annotations: true, attachments: true, javascript: true, externalLinks: false, outlines: false, layers: true })
  const [dpi, setDpi] = useState(200)
  const [panelTab, setPanelTab] = useState('detect')
  const [mobileTab, setMobileTab] = useState('preview')
  const [exportState, setExportState] = useState(null)
  const pdfRef = useRef(null)

  useEffect(() => {
    pdfRef.current = pdf
  }, [pdf])
  useEffect(() => () => destroyPdfDocument(pdfRef.current), [])

  const handleFiles = async (files) => {
    const [pdfFile] = files
    if (!(pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf'))) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      const data = new Uint8Array(await pdfFile.arrayBuffer())
      const doc = await loadPdfDocument(data)
      const pageSizes = []
      for (let n = 1; n <= doc.numPages; n++) {
        const vp = (await doc.getPage(n)).getViewport({ scale: 1 })
        pageSizes.push({ w: vp.width, h: vp.height })
      }
      destroyPdfDocument(pdfRef.current)
      setPdf(doc)
      setSizes(pageSizes)
      setBytes(data)
      setFile(pdfFile)
      setPage(1)
      setManualBoxes([])
      setMatches(null)
      setEnabled(new Set())
      setPageData(null)
      setExportState(null)
    } catch (err) {
      console.error(err)
      setError(err?.name === 'PasswordException' ? s('errors.password') : s('errors.open'))
    } finally {
      setLoading(false)
    }
  }

  /* ---- Zones de biffure ------------------------------------------------- */
  const autoBoxes = useMemo(
    () => (matches ?? []).filter((m) => enabled.has(m.id)).flatMap((m) => m.boxes.map((b, i) => ({ ...b, id: `${m.id}#${i}`, matchId: m.id, page: m.page, kind: 'auto' }))),
    [matches, enabled],
  )
  const allBoxes = useMemo(() => [...manualBoxes.map((b) => ({ ...b, kind: 'manual' })), ...autoBoxes], [manualBoxes, autoBoxes])
  const pageBoxes = allBoxes.filter((b) => b.page === page)
  const selected = allBoxes.find((b) => b.id === selectedId) ?? null

  const removeSelected = () => {
    if (!selected) return
    if (selected.kind === 'manual') setManualBoxes((list) => list.filter((b) => b.id !== selected.id))
    else setEnabled((set) => new Set([...set].filter((id) => id !== selected.matchId)))
    setSelectedId(null)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        e.preventDefault()
        removeSelected()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const toPoint = (e, scale) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return [(e.clientX - rect.left) / scale, (e.clientY - rect.top) / scale]
  }

  const handlePointerDown = (e, scale) => {
    if (e.button > 0) return
    const [x, y] = toPoint(e, scale)
    const hit = e.target.closest?.('[data-box]')
    const box = hit && allBoxes.find((b) => b.id === hit.dataset.box)
    if (box) {
      setSelectedId(box.id)
      if (box.kind === 'manual') {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { kind: hit.dataset.handle ? 'resize' : 'move', orig: box, start: [x, y] }
      }
      return
    }
    setSelectedId(null)
    if (tool !== 'draw') return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { kind: 'draw', start: [x, y] }
    setDraft({ x, y, w: 0, h: 0 })
  }

  const handlePointerMove = (e, scale) => {
    const drag = dragRef.current
    if (!drag) return
    const [x, y] = toPoint(e, scale)
    const { w: pw, h: ph } = sizes[page - 1]
    if (drag.kind === 'draw') {
      const [sx, sy] = drag.start
      setDraft({ x: clamp(Math.min(sx, x), 0, pw), y: clamp(Math.min(sy, y), 0, ph), w: Math.abs(x - sx), h: Math.abs(y - sy) })
      return
    }
    const o = drag.orig
    const next =
      drag.kind === 'move'
        ? { ...o, x: clamp(o.x + x - drag.start[0], 0, pw - o.w), y: clamp(o.y + y - drag.start[1], 0, ph - o.h) }
        : { ...o, w: clamp(x - o.x, 4, pw - o.x), h: clamp(y - o.y, 4, ph - o.y) }
    setManualBoxes((list) => list.map((b) => (b.id === o.id ? { id: b.id, page: b.page, x: next.x, y: next.y, w: next.w, h: next.h } : b)))
  }

  const handlePointerUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag?.kind === 'draw' && draft) {
      if (draft.w > 3 && draft.h > 3) {
        const id = uid()
        setManualBoxes((list) => [...list, { id, page, ...draft }])
        setSelectedId(id)
      }
      setDraft(null)
    }
  }

  /* ---- Détection --------------------------------------------------------- */
  const ensurePageData = async () => {
    if (pageData) return pageData
    setScanning(0)
    const data = await extractPages(pdf, (p) => setScanning(p))
    setPageData(data)
    return data
  }

  const runScan = async () => {
    try {
      const data = await ensurePageData()
      const list = detectSensitive(data, {
        ...scanOptions,
        keywords: keywords.split(/[\n,;]/).map((k) => k.trim()).filter(Boolean),
      })
      setMatches(list)
      setEnabled(new Set(list.map((m) => m.id)))
    } catch (err) {
      console.error(err)
      setError(s('errors.scan'))
    } finally {
      setScanning(null)
    }
  }

  const matchesByCategory = useMemo(() => {
    const groups = new Map()
    for (const m of matches ?? []) {
      if (!groups.has(m.category)) groups.set(m.category, [])
      groups.get(m.category).push(m)
    }
    return [...groups.entries()]
  }, [matches])

  /* ---- Export ------------------------------------------------------------ */
  const purgeActive = PURGE_KEYS.some((k) => purge[k])
  const canExport = allBoxes.length > 0 || purgeActive

  const handleExport = async () => {
    setExportState({ status: 'working', progress: 0 })
    setError(null)
    try {
      const boxesByPage = new Map()
      for (const b of allBoxes) boxesByPage.set(b.page, [...(boxesByPage.get(b.page) ?? []), b])

      // Textes biffés à rechercher ensuite dans le fichier produit.
      const data = allBoxes.length ? await ensurePageData() : null
      const secrets = []
      for (const m of matches ?? []) if (enabled.has(m.id)) secrets.push(m.text)
      for (const [n, boxes] of boxesByPage) {
        const manual = boxes.filter((b) => b.kind === 'manual')
        if (manual.length && data) secrets.push(...textUnderBoxes(data[n - 1], manual))
      }

      const clean = await sanitizeStructure(bytes.slice(), purge)
      let output = clean.bytes
      let redaction = { pages: 0, boxes: 0, fields: 0, tags: false }
      if (boxesByPage.size) {
        const result = await applyRedactions(output, boxesByPage, { dpi, color, label, onProgress: (p) => setExportState({ status: 'working', progress: p }) })
        output = result.bytes
        redaction = result.report
      }
      const audit = await auditOutput(output.slice(), secrets, new Set(boxesByPage.keys()))
      const blob = new Blob([output], { type: 'application/pdf' })
      setExportState({ status: 'done', blob, purgeReport: clean.report, redaction, audit })
      if (!audit.criticalLeaks) {
        addHistoryEntry({
          toolId: 'sanitize',
          toolName: s('name'),
          message: s('historyMessage', { name: file.name, boxes: redaction.boxes, pages: redaction.pages }),
        })
      }
    } catch (err) {
      console.error(err)
      setExportState({ status: 'error', message: err?.message?.includes('encrypted') ? s('errors.encrypted') : s('errors.export') })
    }
  }

  const download = () => {
    const url = URL.createObjectURL(exportState.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.pdf$/i, '')}_anonymise.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const restart = () => {
    destroyPdfDocument(pdf)
    setPdf(null)
    setFile(null)
    setBytes(null)
    setManualBoxes([])
    setMatches(null)
    setPageData(null)
    setExportState(null)
  }

  /* ---- Rendu ------------------------------------------------------------- */
  const header = (
    <>
      <Link
        to="/pdf"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm sm:h-14 sm:w-14 dark:bg-zinc-800/80 dark:text-white">
          <EyeOff size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t('categories.Outils Avancés')}</p>
          <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-white">{s('name')}</h1>
          <p className="text-sm text-zinc-500 sm:text-base dark:text-zinc-400">{s('subtitle')}</p>
        </div>
      </div>
      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </p>
      )}
    </>
  )

  if (!pdf) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        {header}
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <LoaderCircle size={28} className="animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{s('loading')}</p>
            </div>
          ) : (
            <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf" hint={s('dropHint')} />
          )}
        </div>
      </div>
    )
  }

  const detectPanel = (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
            <input type="checkbox" checked={scanOptions[c]} onChange={(e) => setScanOptions((o) => ({ ...o, [c]: e.target.checked }))} className="h-4 w-4 accent-emerald-600" />
            {s(`categories.${c}`)}
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{s('detect.keywords')}</span>
        <textarea
          rows={2}
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          placeholder={s('detect.keywordsPlaceholder')}
          className="resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
      <button
        type="button"
        onClick={runScan}
        disabled={scanning !== null}
        className="inline-flex items-center justify-center gap-2 rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {scanning !== null ? <LoaderCircle size={16} className="animate-spin" /> : <ScanSearch size={16} />}
        {scanning !== null ? s('detect.scanning', { percent: Math.round(scanning * 100) }) : s('detect.scan')}
      </button>

      {matches && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{s('detect.found', { count: matches.length })}</p>
            {matches.length > 0 && (
              <div className="flex gap-1.5 text-xs font-medium">
                <button type="button" onClick={() => setEnabled(new Set(matches.map((m) => m.id)))} className="rounded-md px-2 py-1 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10">
                  {s('detect.redactAll')}
                </button>
                <button type="button" onClick={() => setEnabled(new Set())} className="rounded-md px-2 py-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
                  {s('detect.clearAll')}
                </button>
              </div>
            )}
          </div>
          {matches.length === 0 && <p className="text-sm text-zinc-500 dark:text-zinc-400">{s('detect.none')}</p>}
          {matchesByCategory.map(([category, list]) => (
            <div key={category}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {s(`categories.${category}`)} · {list.length}
              </p>
              <ul className="flex flex-col gap-1.5">
                {list.map((m) => (
                  <li key={m.id} className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
                    <input
                      type="checkbox"
                      checked={enabled.has(m.id)}
                      onChange={(e) =>
                        setEnabled((set) => {
                          const next = new Set(set)
                          if (e.target.checked) next.add(m.id)
                          else next.delete(m.id)
                          return next
                        })
                      }
                      aria-label={m.text}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-600"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPage(m.page)
                        setMobileTab('preview')
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="truncate font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">{m.text}</p>
                      <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                        {s('detect.page', { n: m.page })} · …{m.context.before}
                        <span className="rounded bg-amber-100 px-0.5 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">{m.text}</span>
                        {m.context.after}…
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const cleanPanel = (
    <div className="flex flex-col gap-2">
      <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">{s('clean.intro')}</p>
      {PURGE_KEYS.map((key) => (
        <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <input type="checkbox" checked={purge[key]} onChange={(e) => setPurge((p) => ({ ...p, [key]: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-emerald-600" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{s(`clean.${key}.title`)}</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">{s(`clean.${key}.description`)}</span>
          </span>
        </label>
      ))}
    </div>
  )

  const redactedPages = new Set(allBoxes.map((b) => b.page))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      {header}

      {/* Onglets mobiles */}
      <div className="mt-6 flex rounded-xl bg-zinc-100 p-1 lg:hidden dark:bg-zinc-900" role="tablist">
        {['preview', 'detect', 'clean'].map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mobileTab === id}
            onClick={() => setMobileTab(id)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${mobileTab === id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'}`}
          >
            {s(`tabs.${id}`)}
            {id === 'detect' && matches?.length ? ` (${matches.length})` : ''}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        {/* Aperçu + outils de biffure */}
        <section className={`min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${mobileTab === 'preview' ? '' : 'hidden lg:block'}`}>
          <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
            <IconButton icon={Square} label={s('toolbar.draw')} onClick={() => setTool('draw')} active={tool === 'draw'} />
            <IconButton icon={MousePointer2} label={s('toolbar.select')} onClick={() => setTool('select')} active={tool === 'select'} />
            <IconButton icon={Trash} label={s('toolbar.delete')} onClick={removeSelected} disabled={!selected} />
            <span className="mx-1 h-6 w-px bg-zinc-200 dark:bg-zinc-800" />
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label={s('toolbar.color')}>
              {Object.entries(MASK_COLORS).map(([id, hex]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={color === id}
                  title={s(`colors.${id}`)}
                  aria-label={s(`colors.${id}`)}
                  onClick={() => setColor(id)}
                  className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ${color === id ? 'ring-2 ring-emerald-500' : 'ring-1 ring-zinc-300 dark:ring-zinc-600'}`}
                  style={{ backgroundColor: hex }}
                />
              ))}
            </div>
            <select
              value={LABEL_PRESETS.includes(label) ? label : '__custom'}
              onChange={(e) => setLabel(e.target.value === '__custom' ? label || ' ' : e.target.value)}
              aria-label={s('toolbar.label')}
              className="h-8 rounded-md border border-zinc-200 bg-white px-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-950"
            >
              {LABEL_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {p || s('toolbar.noLabel')}
                </option>
              ))}
              <option value="__custom">{s('toolbar.customLabel')}</option>
            </select>
            {!LABEL_PRESETS.includes(label) && (
              <input
                value={label.trimStart()}
                onChange={(e) => setLabel(e.target.value)}
                aria-label={s('toolbar.customLabel')}
                className="h-8 w-28 rounded-md border border-zinc-200 bg-white px-2 text-xs dark:border-zinc-700 dark:bg-zinc-950"
              />
            )}
            <div className="flex-1" />
            <IconButton icon={ChevronLeft} label={s('toolbar.prev')} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} />
            <span className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
              {page} / {sizes.length}
            </span>
            <IconButton icon={ChevronRight} label={s('toolbar.next')} onClick={() => setPage((p) => Math.min(sizes.length, p + 1))} disabled={page >= sizes.length} />
            <IconButton icon={ZoomOut} label={s('toolbar.zoomOut')} onClick={() => setZoom((z) => [...ZOOMS].reverse().find((v) => v < z) ?? z)} disabled={zoom <= ZOOMS[0]} />
            <IconButton icon={ZoomIn} label={s('toolbar.zoomIn')} onClick={() => setZoom((z) => ZOOMS.find((v) => v > z) ?? z)} disabled={zoom >= ZOOMS[ZOOMS.length - 1]} />
          </div>
          <div className="max-h-[75vh] overflow-auto bg-zinc-100 p-3 dark:bg-zinc-950">
            <PagePreview
              pdf={pdf}
              pageNumber={page}
              size={sizes[page - 1]}
              zoom={zoom}
              boxes={pageBoxes}
              draft={draft}
              selectedId={selectedId}
              tool={tool}
              color={color}
              label={label.trim()}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          </div>
          <p className="border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {selected?.kind === 'auto' ? s('preview.autoSelected') : s('preview.hint')}
          </p>
        </section>

        {/* Panneau latéral */}
        <aside className="flex flex-col gap-4">
          <section className={`rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 ${mobileTab === 'preview' ? 'hidden lg:block' : ''}`}>
            <div className="mb-4 hidden rounded-lg bg-zinc-100 p-1 lg:flex dark:bg-zinc-800" role="tablist">
              {['detect', 'clean'].map((id) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={panelTab === id}
                  onClick={() => setPanelTab(id)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium ${
                    panelTab === id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  {id === 'detect' ? <Search size={14} /> : <Eraser size={14} />} {s(`tabs.${id}`)}
                </button>
              ))}
            </div>
            <div className="lg:hidden">{mobileTab === 'detect' ? detectPanel : cleanPanel}</div>
            <div className="hidden lg:block">{panelTab === 'detect' ? detectPanel : cleanPanel}</div>
          </section>

          {/* Export */}
          <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{s('export.summary', { boxes: allBoxes.length, pages: redactedPages.size })}</p>
            {allBoxes.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{s('export.dpi')}</span>
                {[200, 300].map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={dpi === v}
                    onClick={() => setDpi(v)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${dpi === v ? 'bg-emerald-600 text-white' : 'border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300'}`}
                  >
                    {v} DPI
                  </button>
                ))}
                <span className="w-full text-xs text-zinc-500 dark:text-zinc-400">{s('export.rasterNote')}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={!canExport || exportState?.status === 'working'}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 disabled:opacity-40"
            >
              {exportState?.status === 'working' ? <LoaderCircle size={17} className="animate-spin" /> : <ShieldCheck size={17} />}
              {exportState?.status === 'working' ? s('export.working', { percent: Math.round(exportState.progress * 100) }) : s('export.button')}
            </button>
            <button type="button" onClick={restart} className="mt-3 w-full text-center text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
              {s('export.changeFile')}
            </button>
          </section>
        </aside>
      </div>

      {/* Rapport de sécurité */}
      {exportState?.status === 'error' && (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={16} className="shrink-0" /> {exportState.message}
        </p>
      )}
      {exportState?.status === 'done' && (
        <section className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-zinc-900 dark:text-white">
              {exportState.audit.criticalLeaks ? <AlertTriangle size={19} className="text-red-600" /> : <ShieldCheck size={19} className="text-emerald-600 dark:text-emerald-400" />}
              {s('report.title')}
            </h2>
            <IconButton icon={X} label={s('report.close')} onClick={() => setExportState(null)} />
          </div>

          {exportState.audit.criticalLeaks ? (
            <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">{s('report.leakBlocked')}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              {exportState.redaction.boxes > 0 && (
                <>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {s('report.redacted', { boxes: exportState.redaction.boxes, pages: exportState.redaction.pages })}
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {s('report.destroyed', { count: exportState.audit.checked })}
                  </li>
                </>
              )}
              {exportState.redaction.fields > 0 && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {s('report.fields', { count: exportState.redaction.fields })}
                </li>
              )}
              {exportState.redaction.tags && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {s('report.tags')}
                </li>
              )}
              {exportState.purgeReport.metadataFields.length > 0 && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {s('report.metadata', { fields: exportState.purgeReport.metadataFields.join(', ') })}
                  {exportState.purgeReport.xmp ? ` ${s('report.xmp')}` : ''}
                </li>
              )}
              {[
                ['annotations', exportState.purgeReport.annotations],
                ['attachments', exportState.purgeReport.attachments],
                ['scripts', exportState.purgeReport.scripts],
                ['links', exportState.purgeReport.links],
                ['layers', exportState.purgeReport.layers],
                ['orphans', exportState.purgeReport.orphans],
              ]
                .filter(([, count]) => count > 0)
                .map(([key, count]) => (
                  <li key={key} className="flex items-start gap-2">
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    {s(`report.${key}`, { count })}
                  </li>
                ))}
              {exportState.purgeReport.outlines && (
                <li className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  {s('report.outlines')}
                </li>
              )}
              {exportState.audit.elsewhere.length > 0 && (
                <li className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  {s('report.elsewhere', { pages: [...new Set(exportState.audit.elsewhere.flatMap((e) => e.pages))].join(', ') })}
                </li>
              )}
              {exportState.redaction.boxes === 0 && (
                <li className="flex items-start gap-2 text-zinc-500 dark:text-zinc-400">
                  <FileX size={16} className="mt-0.5 shrink-0" />
                  {s('report.vectorKept')}
                </li>
              )}
            </ul>
          )}

          <div className="mt-5 flex flex-col items-center gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:justify-between dark:border-zinc-800">
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{s('report.sizes', { original: formatBytes(file.size), final: formatBytes(exportState.blob.size) })}</p>
            {!exportState.audit.criticalLeaks && (
              <button
                type="button"
                onClick={download}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500 sm:w-auto"
              >
                <Download size={18} /> {s('report.download')}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  )
}
