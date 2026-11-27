import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileText,
  GripVertical,
  ListOrdered,
  LoaderCircle,
  Sliders,
  TriangleAlert,
  Type,
  X,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { loadPdfDocument, destroyPdfDocument } from '../../utils/pdfRender'
import {
  COLORS,
  FONTS,
  MM_TO_PT,
  POSITIONS,
  computePlan,
  countPages,
  formatBates,
  loadMeasureFonts,
  secondaryText,
  stampDocument,
  stampLayout,
} from '../../utils/batesWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = { UPLOAD: 'upload', CONFIGURE: 'configure', PROCESSING: 'processing', DONE: 'done' }
const DIGIT_OPTIONS = [3, 4, 5, 6, 7, 8]
const uid = () => Math.random().toString(36).slice(2, 10)
const baseName = (name) => name.replace(/\.pdf$/i, '')

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/* -------------------------------------------------------------------------- */
/* Éléments d'interface                                                       */
/* -------------------------------------------------------------------------- */

function Section({ icon: Icon, title, children, aside }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
          <Icon size={16} className="text-emerald-600 dark:text-emerald-400" /> {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Field({ label, children, hint }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</span>
      {children}
      {hint && <span className="text-xs text-zinc-500 dark:text-zinc-400">{hint}</span>}
    </label>
  )
}

const inputClass =
  'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === o.value ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Aperçu en direct                                                           */
/* -------------------------------------------------------------------------- */

function LivePreview({ doc, pageNumber, number, config, fonts, dateText, b }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [pdf, setPdf] = useState(null)
  const [pageSize, setPageSize] = useState(null)
  const [width, setWidth] = useState(320)

  // Un seul document pdf.js ouvert à la fois : celui de l'aperçu.
  useEffect(() => {
    if (!doc?.bytes) return undefined
    let current = null
    let cancelled = false
    loadPdfDocument(doc.bytes)
      .then((loaded) => {
        if (cancelled) destroyPdfDocument(loaded)
        else {
          current = loaded
          setPdf(loaded)
        }
      })
      .catch((err) => console.error(err))
    return () => {
      cancelled = true
      destroyPdfDocument(current)
    }
  }, [doc])

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(160, Math.floor(entry.contentRect.width))))
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!pdf || pageNumber > pdf.numPages) return undefined
    let cancelled = false
    let task = null
    ;(async () => {
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: width / base.width })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      setPageSize({ w: base.width, h: base.height })
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
  }, [pdf, pageNumber, width])

  const layout = useMemo(() => {
    if (!pageSize || number === undefined || !fonts) return null
    const font = fonts[config.font]
    const safe = (text) => (text ? Array.from(text).map((ch) => { try { font.encodeText(ch); return ch } catch { return '?' } }).join('') : text)
    return stampLayout({
      pageW: pageSize.w,
      pageH: pageSize.h,
      main: safe(formatBates(number, config)),
      secondary: safe(secondaryText(config, { pageNumber, pageCount: doc.pageCount, dateText })),
      fontSize: config.fontSize,
      position: config.position,
      marginX: config.marginX,
      marginY: config.marginY,
      background: config.background,
      measure: (text, size) => font.widthOfTextAtSize(text, size),
    })
  }, [pageSize, number, fonts, config, pageNumber, doc, dateText])

  const height = pageSize ? Math.round((width * pageSize.h) / pageSize.w) : Math.round(width * 1.414)

  return (
    <div ref={containerRef} className="w-full">
      <div className="relative mx-auto overflow-hidden bg-white shadow-md ring-1 ring-zinc-200 dark:ring-zinc-800" style={{ width, height }}>
        <canvas ref={canvasRef} className="absolute inset-0" style={{ width, height }} />
        {!pdf && <LoaderCircle size={22} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 animate-spin text-zinc-400" />}
        {pageSize && layout && (
          <svg className="absolute inset-0" width={width} height={height} viewBox={`0 0 ${pageSize.w} ${pageSize.h}`}>
            {config.background && (
              <rect x={layout.box.x} y={layout.box.y} width={layout.box.w} height={layout.box.h} fill="#ffffff" stroke="#cbd5e1" strokeWidth={0.5} />
            )}
            {layout.lines.map((line, i) => (
              <text key={i} x={line.x} y={line.baseline} fontSize={line.size} fontFamily={FONTS[config.font].css} fill={COLORS[config.color]} style={{ whiteSpace: 'pre' }}>
                {line.text}
              </text>
            ))}
            <rect
              x={layout.box.x - 2}
              y={layout.box.y - 2}
              width={layout.box.w + 4}
              height={layout.box.h + 4}
              fill="none"
              stroke="#10b981"
              strokeWidth={0.8}
              strokeDasharray="3 2"
            />
          </svg>
        )}
        {pageSize && number === undefined && (
          <span className="absolute inset-x-0 top-2 mx-auto w-fit rounded-full bg-zinc-900/80 px-2.5 py-1 text-[11px] font-medium text-white">
            {b('preview.excluded')}
          </span>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Outil                                                                      */
/* -------------------------------------------------------------------------- */

export default function BatesNumberingTool() {
  const { t, i18n } = useTranslation()
  const b = (key, opts) => t(`tools.bates.${key}`, opts)

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [docs, setDocs] = useState([])
  const [error, setError] = useState(null)
  const [fonts, setFonts] = useState(null)
  const [unit, setUnit] = useState('mm')
  const [previewId, setPreviewId] = useState(null)
  const [previewPage, setPreviewPage] = useState(1)
  const [dragId, setDragId] = useState(null)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [config, setConfig] = useState(() => ({
    prefix: 'DOC-',
    start: 1,
    digits: 4,
    suffix: '',
    secondary: 'none',
    pageOfTemplate: t('tools.bates.pageOfTemplate'),
    secondaryCustom: '',
    font: 'helvetica',
    fontSize: 10,
    color: 'black',
    background: false,
    position: 'br',
    marginX: 24,
    marginY: 24,
    range: { mode: 'all', custom: '' },
  }))

  const dateText = useMemo(() => new Date().toLocaleDateString(i18n.language), [i18n.language])
  const set = (patch) => setConfig((c) => ({ ...c, ...patch }))

  useEffect(() => {
    let cancelled = false
    loadMeasureFonts().then((loaded) => !cancelled && setFonts(loaded))
    return () => {
      cancelled = true
    }
  }, [])

  /* ---- File d'attente ---------------------------------------------------- */
  const addFiles = async (files) => {
    const pdfs = files.filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
    if (!pdfs.length) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(pdfs.length < files.length ? b('errors.someIgnored') : null)
    const entries = pdfs.map((file) => ({ id: uid(), file, bytes: null, pageCount: null, failed: false }))
    setDocs((list) => [...list, ...entries])
    setPreviewId((id) => id ?? entries[0].id)
    setStep(STEPS.CONFIGURE)

    for (const entry of entries) {
      try {
        const bytes = new Uint8Array(await entry.file.arrayBuffer())
        const pageCount = await countPages(bytes.slice())
        setDocs((list) => list.map((d) => (d.id === entry.id ? { ...d, bytes, pageCount } : d)))
      } catch (err) {
        console.error(err)
        setDocs((list) => list.map((d) => (d.id === entry.id ? { ...d, failed: true } : d)))
      }
    }
  }

  const move = (id, delta) =>
    setDocs((list) => {
      const index = list.findIndex((d) => d.id === id)
      const target = index + delta
      if (target < 0 || target >= list.length) return list
      const next = [...list]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  const moveTo = (id, targetId) =>
    setDocs((list) => {
      if (id === targetId) return list
      const from = list.findIndex((d) => d.id === id)
      const to = list.findIndex((d) => d.id === targetId)
      const next = [...list]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })

  const remove = (id) => {
    const next = docs.filter((d) => d.id !== id)
    setDocs(next)
    if (previewId === id) {
      setPreviewId(next[0]?.id ?? null)
      setPreviewPage(1)
    }
    if (!next.length) setStep(STEPS.UPLOAD)
  }

  /* ---- Plan de numérotation ---------------------------------------------- */
  const readyDocs = useMemo(() => docs.filter((d) => d.pageCount !== null && !d.failed), [docs])
  const loadingDocs = docs.some((d) => d.pageCount === null && !d.failed)
  const startValid = Number.isInteger(config.start) && config.start >= 0
  // Champ « départ » vidé pendant la saisie : on calcule le plan à partir de 0.
  const plan = useMemo(() => computePlan(readyDocs, startValid ? config : { ...config, start: 0 }), [readyDocs, config, startValid])
  const planById = new Map(readyDocs.map((d, i) => [d.id, plan.items[i]]))

  const previewDoc = readyDocs.find((d) => d.id === previewId) ?? readyDocs[0] ?? null
  const previewItem = previewDoc ? planById.get(previewDoc.id) : null
  const safePreviewPage = previewDoc ? Math.min(previewPage, previewDoc.pageCount) : 1
  const previewNumber = previewItem?.numbers.get(safePreviewPage)

  const overflow = plan.lastNumber !== null && String(plan.lastNumber).length > config.digits
  const canProcess = readyDocs.length > 0 && !loadingDocs && !plan.invalid && startValid && plan.total > 0

  /* ---- Traitement --------------------------------------------------------- */
  const handleProcess = async () => {
    setStep(STEPS.PROCESSING)
    setProgress(0)
    setError(null)
    const output = []
    try {
      for (let i = 0; i < readyDocs.length; i++) {
        const doc = readyDocs[i]
        const item = plan.items[i]
        const bytes = await stampDocument(doc.bytes.slice(), config, item.numbers, { dateText })
        output.push({
          id: doc.id,
          name: `${baseName(doc.file.name)}_bates.pdf`,
          blob: new Blob([bytes], { type: 'application/pdf' }),
          first: item.first,
          last: item.last,
        })
        setProgress((i + 1) / readyDocs.length)
      }
      setResults(output)
      addHistoryEntry({
        toolId: 'bates',
        toolName: b('name'),
        message: b('historyMessage', {
          count: output.length,
          first: formatBates(plan.firstNumber, config),
          last: formatBates(plan.lastNumber, config),
        }),
      })
      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(b('errors.processing'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const downloadZip = async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const used = new Map()
    for (const r of results) {
      const n = used.get(r.name) ?? 0
      used.set(r.name, n + 1)
      zip.file(n ? r.name.replace(/\.pdf$/, `_${n + 1}.pdf`) : r.name, r.blob)
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'ONE_bates.zip')
  }

  // Téléchargements espacés : certains navigateurs bloquent les rafales.
  const downloadAll = () => results.forEach((r, i) => setTimeout(() => downloadBlob(r.blob, r.name), i * 400))

  const restart = () => {
    setDocs([])
    setResults([])
    setPreviewId(null)
    setPreviewPage(1)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  /* ---- Rendu ------------------------------------------------------------- */
  const marginValue = (pt) => (unit === 'mm' ? Math.round((pt / MM_TO_PT) * 10) / 10 : Math.round(pt))
  const setMargin = (key, value) => {
    const n = Math.max(0, Number(value) || 0)
    set({ [key]: unit === 'mm' ? n * MM_TO_PT : n })
  }

  const exampleRange =
    plan.firstNumber !== null ? `${formatBates(plan.firstNumber, config)} → ${formatBates(plan.lastNumber, config)}` : formatBates(startValid ? config.start : 0, config)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        to="/pdf"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm sm:h-14 sm:w-14 dark:bg-zinc-800/80 dark:text-white">
          <ListOrdered size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t('categories.Outils Avancés')}</p>
          <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-white">{b('name')}</h1>
          <p className="text-sm text-zinc-500 sm:text-base dark:text-zinc-400">{b('subtitle')}</p>
        </div>
      </div>

      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <TriangleAlert size={16} className="shrink-0" /> {error}
        </p>
      )}

      {step === STEPS.UPLOAD && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={addFiles} multiple accept="application/pdf" hint={b('dropHint')} />
        </div>
      )}

      {step === STEPS.CONFIGURE && (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-5">
            {/* Documents */}
            <Section
              icon={FileText}
              title={b('sections.files', { count: docs.length })}
              aside={<span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{b('totalPages', { count: plan.total })}</span>}
            >
              <ul className="flex flex-col gap-2">
                {docs.map((doc, index) => {
                  const item = planById.get(doc.id)
                  return (
                    <li
                      key={doc.id}
                      draggable
                      onDragStart={() => setDragId(doc.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (dragId) moveTo(dragId, doc.id)
                        setDragId(null)
                      }}
                      onDragEnd={() => setDragId(null)}
                      className={`flex items-center gap-2 rounded-xl border p-2.5 transition-colors sm:gap-3 ${
                        dragId === doc.id ? 'border-emerald-400 opacity-60' : 'border-zinc-200 dark:border-zinc-800'
                      } ${previewDoc?.id === doc.id ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : 'bg-white dark:bg-zinc-950'}`}
                    >
                      <GripVertical size={16} className="hidden shrink-0 cursor-grab text-zinc-400 sm:block" />
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-xs font-semibold tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {index + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewId(doc.id)
                          setPreviewPage(1)
                        }}
                        className="min-w-0 flex-1 text-left"
                        title={b('showPreview')}
                      >
                        <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{doc.file.name}</p>
                        <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                          {doc.failed ? (
                            <span className="text-red-600 dark:text-red-400">{b('errors.unreadable')}</span>
                          ) : doc.pageCount === null ? (
                            b('counting')
                          ) : (
                            <>
                              {b('pages', { count: doc.pageCount })} ·{' '}
                              <span className="font-mono text-emerald-700 dark:text-emerald-400">
                                {item?.first !== null && item?.first !== undefined
                                  ? `${formatBates(item.first, config)} → ${formatBates(item.last, config)}`
                                  : b('noPagesNumbered')}
                              </span>
                            </>
                          )}
                        </p>
                      </button>
                      <div className="flex shrink-0 items-center">
                        <button type="button" onClick={() => move(doc.id, -1)} disabled={index === 0} aria-label={b('moveUp')} title={b('moveUp')} className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800">
                          <ArrowUp size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(doc.id, 1)}
                          disabled={index === docs.length - 1}
                          aria-label={b('moveDown')}
                          title={b('moveDown')}
                          className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button type="button" onClick={() => remove(doc.id)} aria-label={b('remove')} title={b('remove')} className="rounded-md p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                          <X size={16} />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <DragDropZone onFiles={addFiles} multiple accept="application/pdf" label={b('addMore')} hint=" " className="mt-3 p-4! md:p-5!" />
            </Section>

            {/* Format */}
            <Section icon={ListOrdered} title={b('sections.format')}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label={b('format.prefix')}>
                  <input value={config.prefix} onChange={(e) => set({ prefix: e.target.value })} className={`${inputClass} font-mono`} placeholder="DOC-" />
                </Field>
                <Field label={b('format.start')}>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={Number.isNaN(config.start) ? '' : config.start}
                    onChange={(e) => set({ start: e.target.value === '' ? NaN : Math.floor(Number(e.target.value)) })}
                    className={`${inputClass} font-mono ${startValid ? '' : 'border-red-400'}`}
                  />
                </Field>
                <Field label={b('format.digits')}>
                  <select value={config.digits} onChange={(e) => set({ digits: Number(e.target.value) })} className={inputClass}>
                    {DIGIT_OPTIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} ({String(1).padStart(d, '0')})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={b('format.suffix')}>
                  <input value={config.suffix} onChange={(e) => set({ suffix: e.target.value })} className={`${inputClass} font-mono`} placeholder="-2026" />
                </Field>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label={b('format.secondary')}>
                  <select value={config.secondary} onChange={(e) => set({ secondary: e.target.value })} className={inputClass}>
                    {['none', 'date', 'pageOf', 'custom'].map((id) => (
                      <option key={id} value={id}>
                        {b(`secondary.${id}`, { date: dateText })}
                      </option>
                    ))}
                  </select>
                </Field>
                {config.secondary === 'custom' && (
                  <Field label={b('format.secondaryText')}>
                    <input value={config.secondaryCustom} onChange={(e) => set({ secondaryCustom: e.target.value })} className={inputClass} placeholder={b('format.secondaryPlaceholder')} />
                  </Field>
                )}
              </div>

              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">{b('format.example')}</p>
                <p className="mt-0.5 break-all font-mono text-sm font-semibold text-zinc-900 dark:text-white">{exampleRange}</p>
              </div>
              {overflow && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <TriangleAlert size={14} /> {b('format.overflow', { digits: config.digits })}
                </p>
              )}
            </Section>

            {/* Position & style */}
            <Section icon={Sliders} title={b('sections.position')}>
              <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{b('position.label')}</p>
                  <div className="grid w-44 grid-cols-3 gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950" role="radiogroup" aria-label={b('position.label')}>
                    {POSITIONS.map((pos, i) => (
                      <button
                        key={pos}
                        type="button"
                        role="radio"
                        aria-checked={config.position === pos}
                        title={b(`position.${pos}`)}
                        aria-label={b(`position.${pos}`)}
                        onClick={() => set({ position: pos })}
                        className={`flex h-9 items-center rounded-md border transition-colors ${i < 3 ? 'items-start' : 'items-end'} ${
                          pos[1] === 'l' ? 'justify-start' : pos[1] === 'c' ? 'justify-center' : 'justify-end'
                        } p-1 ${config.position === pos ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900'}`}
                      >
                        <span className={`h-1.5 w-5 rounded-full ${config.position === pos ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
                      </button>
                    ))}
                    <span className="col-span-3 text-center text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{b(`position.${config.position}`)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{b('position.margins')}</span>
                    <Segmented label={b('position.unit')} value={unit} onChange={setUnit} options={[{ value: 'mm', label: 'mm' }, { value: 'pt', label: 'pt' }]} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={b('position.marginX')}>
                      <input type="number" min={0} step={unit === 'mm' ? 0.5 : 1} value={marginValue(config.marginX)} onChange={(e) => setMargin('marginX', e.target.value)} className={inputClass} />
                    </Field>
                    <Field label={b('position.marginY')}>
                      <input type="number" min={0} step={unit === 'mm' ? 0.5 : 1} value={marginValue(config.marginY)} onChange={(e) => setMargin('marginY', e.target.value)} className={inputClass} />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 border-t border-zinc-200 pt-4 sm:grid-cols-2 dark:border-zinc-800">
                <Field label={b('style.font')}>
                  <select value={config.font} onChange={(e) => set({ font: e.target.value })} className={inputClass}>
                    {Object.entries(FONTS).map(([id, f]) => (
                      <option key={id} value={id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`${b('style.size')} · ${config.fontSize} pt`}>
                  <input type="range" min={8} max={18} value={config.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} className="h-10 accent-emerald-600" />
                </Field>
                <div>
                  <p className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{b('style.color')}</p>
                  <div className="flex gap-2" role="radiogroup" aria-label={b('style.color')}>
                    {Object.entries(COLORS).map(([id, hex]) => (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={config.color === id}
                        title={b(`colors.${id}`)}
                        aria-label={b(`colors.${id}`)}
                        onClick={() => set({ color: id })}
                        className={`h-8 w-8 rounded-full ring-offset-2 ring-offset-white dark:ring-offset-zinc-900 ${config.color === id ? 'ring-2 ring-emerald-500' : 'ring-1 ring-black/10 dark:ring-white/20'}`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                  </div>
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 self-end text-sm text-zinc-700 dark:text-zinc-300">
                  <input type="checkbox" checked={config.background} onChange={(e) => set({ background: e.target.checked })} className="mt-0.5 h-4 w-4 accent-emerald-600" />
                  <span>
                    {b('style.background')}
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">{b('style.backgroundHint')}</span>
                  </span>
                </label>
              </div>
            </Section>

            {/* Pages */}
            <Section icon={Type} title={b('sections.pages')}>
              <Segmented
                label={b('sections.pages')}
                value={config.range.mode}
                onChange={(mode) => set({ range: { ...config.range, mode } })}
                options={['all', 'skipFirst', 'custom'].map((id) => ({ value: id, label: b(`range.${id}`) }))}
              />
              {config.range.mode === 'custom' && (
                <div className="mt-3">
                  <Field label={b('range.customLabel')} hint={b('range.customHint')}>
                    <input
                      value={config.range.custom}
                      onChange={(e) => set({ range: { ...config.range, custom: e.target.value } })}
                      placeholder="1-3, 5, 8-"
                      className={`${inputClass} font-mono ${plan.invalid ? 'border-red-400 dark:border-red-500/60' : ''}`}
                    />
                  </Field>
                  {plan.invalid && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{b('range.invalid')}</p>}
                </div>
              )}
              <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">{b('range.note')}</p>
            </Section>
          </div>

          {/* Aperçu */}
          <div className="lg:sticky lg:top-24">
            <Section
              icon={Eye}
              title={b('sections.preview')}
              aside={
                previewDoc && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPreviewPage(Math.max(1, safePreviewPage - 1))}
                      disabled={safePreviewPage <= 1}
                      aria-label={b('preview.prev')}
                      className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <span className="text-xs tabular-nums text-zinc-600 dark:text-zinc-300">
                      {safePreviewPage} / {previewDoc.pageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPreviewPage(Math.min(previewDoc.pageCount, safePreviewPage + 1))}
                      disabled={safePreviewPage >= previewDoc.pageCount}
                      aria-label={b('preview.next')}
                      className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )
              }
            >
              <div className="rounded-xl bg-zinc-100 p-3 sm:p-4 dark:bg-zinc-950">
                {previewDoc ? (
                  <div className="mx-auto max-w-70 sm:max-w-80 lg:max-w-none">
                    <LivePreview key={previewDoc.id} doc={previewDoc} pageNumber={safePreviewPage} number={previewNumber} config={config} fonts={fonts} dateText={dateText} b={b} />
                  </div>
                ) : (
                  <LoaderCircle size={22} className="mx-auto my-16 animate-spin text-zinc-400" />
                )}
              </div>
              {previewDoc && <p className="mt-2 truncate text-center text-xs text-zinc-500 dark:text-zinc-400">{previewDoc.file.name}</p>}

              <button
                type="button"
                onClick={handleProcess}
                disabled={!canProcess}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-40"
              >
                <ListOrdered size={18} /> {b('process', { count: plan.total })}
              </button>
            </Section>
          </div>
        </div>
      )}

      {step === STEPS.PROCESSING && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-10 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <LoaderCircle size={32} className="animate-spin text-emerald-600" />
          <p className="font-semibold text-zinc-900 dark:text-white">{b('processing')}</p>
          <div className="w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-center text-xs tabular-nums text-zinc-500 dark:text-zinc-400">{Math.round(progress * 100)} %</p>
          </div>
        </div>
      )}

      {step === STEPS.DONE && (
        <div className="mx-auto mt-6 flex max-w-2xl flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 size={28} />
            </span>
            <p className="text-lg font-semibold text-zinc-900 dark:text-white">{b('done.title', { count: plan.total })}</p>
            <p className="font-mono text-sm text-emerald-700 dark:text-emerald-400">{exampleRange}</p>
          </div>

          <ul className="flex flex-col gap-2">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                <FileText size={18} className="shrink-0 text-zinc-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{r.name}</p>
                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {r.first !== null ? `${formatBates(r.first, config)} → ${formatBates(r.last, config)}` : b('noPagesNumbered')} · {formatBytes(r.blob.size)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => downloadBlob(r.blob, r.name)}
                  aria-label={b('done.downloadOne', { name: r.name })}
                  title={b('done.downloadOne', { name: r.name })}
                  className="shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-emerald-600 dark:hover:bg-zinc-800"
                >
                  <Download size={18} />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            {results.length === 1 ? (
              <button
                type="button"
                onClick={() => downloadBlob(results[0].blob, results[0].name)}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500"
              >
                <Download size={18} /> {b('done.download')}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={downloadZip}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 hover:bg-emerald-500"
                >
                  <Archive size={18} /> {b('done.zip')}
                </button>
                <button
                  type="button"
                  onClick={downloadAll}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Download size={18} /> {b('done.separately')}
                </button>
              </>
            )}
          </div>

          <div className="flex justify-center gap-5 text-sm font-medium">
            <button type="button" onClick={() => setStep(STEPS.CONFIGURE)} className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
              {b('done.adjust')}
            </button>
            <button type="button" onClick={restart} className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200">
              {b('done.restart')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
