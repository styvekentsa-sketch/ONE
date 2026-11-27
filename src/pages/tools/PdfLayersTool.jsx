import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Edit3,
  Eye,
  EyeOff,
  Focus,
  Info,
  Layers,
  LoaderCircle,
  Lock,
  Merge,
  PenTool,
  Plus,
  Trash,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { loadPdfDocument } from '../../utils/pdfRender'
import { createBaseLayer, readLayers, writeLayers } from '../../utils/pdfLayersWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'

const CSS_UNITS = 96 / 72
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const clamp = (v, min, max) => Math.min(max, Math.max(min, v))

function IconButton({ icon: Icon, label, onClick, active = false, disabled = false, className = '' }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors disabled:pointer-events-none disabled:opacity-40 ${
        active
          ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-400'
          : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white'
      } ${className}`}
    >
      <Icon size={16} />
    </button>
  )
}

/* -------------------------------------------------------------------------- */
/* Aperçu                                                                     */
/* -------------------------------------------------------------------------- */

function Preview({ pdf, ocConfig, pageNumber, zoom, visibility }) {
  const canvasRef = useRef(null)
  const [size, setSize] = useState(null)

  useEffect(() => {
    let cancelled = false
    let task = null
    ;(async () => {
      // État de l'aperçu appliqué tel quel (sans logique de groupes radio).
      for (const [id, visible] of Object.entries(visibility)) ocConfig.setVisibility(id, visible, false)
      const page = await pdf.getPage(pageNumber)
      if (cancelled) return
      const viewport = page.getViewport({ scale: zoom * CSS_UNITS })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      const canvas = canvasRef.current
      canvas.width = Math.floor(viewport.width * ratio)
      canvas.height = Math.floor(viewport.height * ratio)
      setSize({ w: Math.floor(viewport.width), h: Math.floor(viewport.height) })
      task = page.render({
        canvas,
        canvasContext: canvas.getContext('2d'),
        viewport,
        optionalContentConfigPromise: Promise.resolve(ocConfig),
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
  }, [pdf, ocConfig, pageNumber, zoom, visibility])

  return (
    <div className="mx-auto bg-white shadow-md ring-1 ring-zinc-200 dark:ring-zinc-800" style={size ? { width: size.w, height: size.h } : { width: 300, height: 420 }}>
      <canvas ref={canvasRef} style={size ? { width: size.w, height: size.h } : undefined} className="block" />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Ligne de calque                                                            */
/* -------------------------------------------------------------------------- */

function LayerRow({ layer, depth, visible, onTogglePreview, onIsolate, onChange, y }) {
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState(layer.name)

  const commitName = () => {
    const name = draft.trim()
    if (name) onChange({ name })
    else setDraft(layer.name)
    setRenaming(false)
  }

  return (
    <li className="rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-950" style={{ marginLeft: depth * 16 }}>
      <div className="flex items-center gap-1.5">
        <IconButton icon={visible ? Eye : EyeOff} label={visible ? y('row.hidePreview') : y('row.showPreview')} onClick={onTogglePreview} active={visible} />
        {renaming ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault()
              commitName()
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft(layer.name)
                  setRenaming(false)
                }
              }}
              aria-label={y('row.rename')}
              className="h-8 min-w-0 flex-1 rounded-lg border border-emerald-500 bg-white px-2 text-sm text-zinc-900 focus:outline-none dark:bg-zinc-950 dark:text-zinc-100"
            />
            <IconButton icon={Check} label={y('row.confirm')} onClick={commitName} />
          </form>
        ) : (
          <button
            type="button"
            onDoubleClick={() => setRenaming(true)}
            onClick={onTogglePreview}
            className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${visible ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-400 line-through decoration-zinc-300 dark:text-zinc-500'}`}
            title={layer.name}
          >
            {layer.name}
          </button>
        )}
        {!renaming && <IconButton icon={Edit3} label={y('row.rename')} onClick={() => setRenaming(true)} />}
        <IconButton icon={Focus} label={y('row.isolate')} onClick={onIsolate} />
        <IconButton icon={Merge} label={layer.merge ? y('row.unmerge') : y('row.merge')} onClick={() => onChange({ merge: !layer.merge })} active={layer.merge} />
        {!layer.merge && (
          <IconButton
            icon={layer.locked ? Lock : Unlock}
            label={layer.locked ? y('row.unlock') : y('row.lock')}
            onClick={() => onChange({ locked: !layer.locked })}
            active={layer.locked}
          />
        )}
      </div>

      {layer.merge ? (
        <p className="mt-2 flex items-center gap-1.5 pl-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Merge size={13} /> {y('state.merged')}
        </p>
      ) : (
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-1">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{y('row.defaultState')}</span>
        <div className="flex rounded-md bg-zinc-100 p-0.5 text-xs font-medium dark:bg-zinc-800" role="radiogroup" aria-label={y('row.defaultState')}>
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={layer.defaultVisible === v}
              onClick={() => onChange({ defaultVisible: v })}
              className={`rounded px-2 py-0.5 ${
                layer.defaultVisible === v
                  ? v
                    ? 'bg-white text-emerald-700 shadow-sm dark:bg-zinc-950 dark:text-emerald-400'
                    : 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-white'
                  : 'text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {v ? y('state.visible') : y('state.hidden')}
            </button>
          ))}
        </div>
        {layer.locked && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            <Lock size={11} /> {y('state.locked')}
          </span>
        )}
        {layer.intent.map((intent) => (
          <span key={intent} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
            {intent}
          </span>
        ))}
      </div>
      )}
    </li>
  )
}

/* -------------------------------------------------------------------------- */
/* Outil                                                                      */
/* -------------------------------------------------------------------------- */

export default function PdfLayersTool() {
  const { t } = useTranslation()
  const y = (key, opts) => t(`tools.pdf-layers.${key}`, opts)

  const [file, setFile] = useState(null)
  const [doc, setDoc] = useState(null) // { bytes, pdf, ocConfig, info }
  const [layers, setLayers] = useState([])
  const [visibility, setVisibility] = useState({})
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [purge, setPurge] = useState(false)
  const [loading, setLoading] = useState(false)
  const [exportState, setExportState] = useState(null)
  const [error, setError] = useState(null)
  const docRef = useRef(null)

  useEffect(() => {
    docRef.current = doc
  }, [doc])
  useEffect(() => () => docRef.current?.pdf.destroy(), [])

  /** (Re)charge un document : aperçu pdf.js + structure des calques pdf-lib. */
  const openBytes = async (bytes, sourceFile) => {
    const pdf = await loadPdfDocument(bytes)
    const [ocConfig, info, firstPage] = await Promise.all([pdf.getOptionalContentConfig(), readLayers(bytes.slice()), pdf.getPage(1)])
    docRef.current?.pdf.destroy()
    const pageWidth = firstPage.getViewport({ scale: 1 }).width * CSS_UNITS
    const available = window.matchMedia('(min-width: 1024px)').matches ? window.innerWidth - 560 : window.innerWidth - 64
    setZoom(clamp(Math.round((available / pageWidth) * 4) / 4, 0.5, 1.25))
    setDoc({ bytes, pdf, ocConfig, info })
    setLayers(info.layers.map((l) => ({ ...l, originalName: l.name })))
    setVisibility(Object.fromEntries(info.layers.map((l) => [l.id, l.defaultVisible])))
    setPage(1)
    setFile(sourceFile)
    setExportState(null)
  }

  const handleFiles = async (files) => {
    const [pdfFile] = files
    if (!(pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf'))) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setLoading(true)
    try {
      await openBytes(new Uint8Array(await pdfFile.arrayBuffer()), pdfFile)
    } catch (err) {
      console.error(err)
      setError(y('errors.open'))
    } finally {
      setLoading(false)
    }
  }

  const handleCreateLayer = async () => {
    setLoading(true)
    setError(null)
    try {
      const bytes = await createBaseLayer(doc.bytes.slice(), y('empty.defaultLayerName'))
      await openBytes(new Uint8Array(bytes), file)
    } catch (err) {
      console.error(err)
      setError(y('errors.create'))
    } finally {
      setLoading(false)
    }
  }

  const updateLayer = (id, patch) => setLayers((list) => list.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const setAllPreview = (value) => setVisibility(Object.fromEntries(layers.map((l) => [l.id, value])))
  const isolate = (id) => setVisibility(Object.fromEntries(layers.map((l) => [l.id, l.id === id])))
  const previewAsDefault = () => setLayers((list) => list.map((l) => ({ ...l, defaultVisible: Boolean(visibility[l.id]) })))

  const handleExport = async () => {
    setExportState({ status: 'working' })
    try {
      const result = await writeLayers(doc.bytes.slice(), { layers, purgeHidden: purge })
      const after = await readLayers(result.bytes.slice())
      const blob = new Blob([result.bytes], { type: 'application/pdf' })
      setExportState({ status: 'done', blob, purged: result.purged, merged: result.merged, remaining: after.layers.length })
      addHistoryEntry({
        toolId: 'pdf-layers',
        toolName: y('name'),
        message: y('historyMessage', { name: file.name, count: after.layers.length, purged: result.purged }),
      })
    } catch (err) {
      console.error(err)
      setExportState({ status: 'error' })
    }
  }

  const download = () => {
    const url = URL.createObjectURL(exportState.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.pdf$/i, '')}_calques.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const restart = () => {
    docRef.current?.pdf.destroy()
    setDoc(null)
    setFile(null)
    setLayers([])
    setVisibility({})
    setExportState(null)
    setPurge(false)
    setError(null)
  }

  const layerById = new Map(layers.map((l) => [l.id, l]))
  const toPurge = layers.filter((l) => !l.defaultVisible && !l.merge)
  const dirty = layers.some((l) => l.name !== l.originalName || l.merge) || doc?.info.layers.some((orig) => {
    const cur = layerById.get(orig.id)
    return cur && (cur.defaultVisible !== orig.defaultVisible || cur.locked !== orig.locked)
  })

  const renderTree = (nodes, depth = 0) =>
    nodes.map((node, i) =>
      node.type === 'label' ? (
        <li key={`label-${depth}-${i}`} className="list-none">
          <p className="mb-1.5 mt-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400" style={{ marginLeft: depth * 16 }}>
            {node.label}
          </p>
          <ul className="flex flex-col gap-2">{renderTree(node.children, depth + 1)}</ul>
        </li>
      ) : layerById.has(node.id) ? (
        <li key={node.id} className="list-none">
          <ul className="flex flex-col gap-2">
            <LayerRow
              layer={layerById.get(node.id)}
              depth={depth}
              visible={Boolean(visibility[node.id])}
              onTogglePreview={() => setVisibility((v) => ({ ...v, [node.id]: !v[node.id] }))}
              onIsolate={() => isolate(node.id)}
              onChange={(patch) => updateLayer(node.id, patch)}
              y={y}
            />
            {node.children.length > 0 && renderTree(node.children, depth + 1)}
          </ul>
        </li>
      ) : null,
    )

  const pageCount = doc?.info.pageCount ?? 1
  const zoomIsPreset = ZOOM_PRESETS.includes(zoom)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <Link
        to="/pdf"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm sm:h-14 sm:w-14 dark:bg-zinc-800/80 dark:text-white">
          <Layers size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">{t('categories.Outils Avancés')}</p>
          <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-white">{y('name')}</h1>
          <p className="text-sm text-zinc-500 sm:text-base dark:text-zinc-400">{y('subtitle')}</p>
        </div>
      </div>

      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </p>
      )}

      {!doc && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
          {loading ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <LoaderCircle size={28} className="animate-spin text-emerald-600" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{y('loading')}</p>
            </div>
          ) : (
            <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf" hint={y('dropHint')} />
          )}
        </div>
      )}

      {doc && (
        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
          {/* Aperçu */}
          <section className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 px-2 py-1.5 dark:border-zinc-800">
              <IconButton icon={ChevronLeft} label={y('preview.prev')} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} />
              <span className="px-1 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                {y('preview.page', { page, total: pageCount })}
              </span>
              <IconButton icon={ChevronRight} label={y('preview.next')} onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount} />
              <div className="flex-1" />
              <IconButton icon={ZoomOut} label={y('preview.zoomOut')} onClick={() => setZoom((z) => [...ZOOM_PRESETS].reverse().find((p) => p < z - 0.001) ?? 0.5)} disabled={zoom <= 0.5} />
              <select
                value={zoomIsPreset ? String(zoom) : 'custom'}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label={y('preview.zoom')}
                className="h-8 rounded-md border border-zinc-200 bg-white px-1.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-950"
              >
                {!zoomIsPreset && <option value="custom">{Math.round(zoom * 100)} %</option>}
                {ZOOM_PRESETS.map((p) => (
                  <option key={p} value={String(p)}>
                    {Math.round(p * 100)} %
                  </option>
                ))}
              </select>
              <IconButton icon={ZoomIn} label={y('preview.zoomIn')} onClick={() => setZoom((z) => ZOOM_PRESETS.find((p) => p > z + 0.001) ?? 2)} disabled={zoom >= 2} />
            </div>
            <div className="max-h-[75vh] overflow-auto bg-zinc-100 p-3 sm:p-5 dark:bg-zinc-950">
              <Preview pdf={doc.pdf} ocConfig={doc.ocConfig} pageNumber={page} zoom={zoom} visibility={visibility} />
            </div>
            <p className="truncate border-t border-zinc-200 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">{file.name}</p>
          </section>

          {/* Panneau des calques */}
          <section className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-white">
                <Layers size={16} className="text-emerald-600 dark:text-emerald-400" /> {y('panel.title', { count: layers.length })}
              </h2>
              <button type="button" onClick={restart} className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200">
                {y('panel.changeFile')}
              </button>
            </div>

            {doc.info.encrypted && (
              <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <span>
                  {y('encrypted')}{' '}
                  <Link to="/tool/protect-pdf?tab=unlock" className="font-semibold underline underline-offset-2">
                    {y('unlockLink')}
                  </Link>
                </span>
              </p>
            )}

            {layers.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-xl bg-zinc-50 px-4 py-8 text-center dark:bg-zinc-950">
                <Info size={24} className="text-zinc-400" />
                <p className="font-medium text-zinc-900 dark:text-white">{y('empty.title')}</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{y('empty.text')}</p>
                <div className="mt-1 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleCreateLayer}
                    disabled={loading || doc.info.encrypted}
                    className="inline-flex items-center justify-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {loading ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />} {y('empty.create')}
                  </button>
                  <Link
                    to="/tool/annotate-pdf"
                    className="inline-flex items-center justify-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  >
                    <PenTool size={15} /> {y('empty.annotate')}
                  </Link>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: 'showAll', icon: Eye, onClick: () => setAllPreview(true) },
                    { key: 'hideAll', icon: EyeOff, onClick: () => setAllPreview(false) },
                    { key: 'previewAsDefault', icon: Check, onClick: previewAsDefault },
                  ].map(({ key, icon: Icon, onClick }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={onClick}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <Icon size={14} /> {y(`actions.${key}`)}
                    </button>
                  ))}
                </div>
                <p className="-mt-1 text-xs text-zinc-500 dark:text-zinc-400">{y('panel.hint')}</p>

                <ul className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">{renderTree(doc.info.tree)}</ul>

                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 text-sm ${
                    purge ? 'border-red-300 bg-red-50/60 dark:border-red-500/40 dark:bg-red-500/10' : 'border-zinc-200 dark:border-zinc-800'
                  }`}
                >
                  <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} className="mt-0.5 h-4 w-4 accent-red-600" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                      <Trash size={14} className="text-red-500" /> {y('purge.label')}
                    </span>
                    <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                      {toPurge.length ? y('purge.list', { names: toPurge.map((l) => l.name).join(', ') }) : y('purge.none')}
                    </span>
                    {purge && toPurge.length > 0 && <span className="mt-1 block text-xs font-medium text-red-700 dark:text-red-400">{y('purge.warning')}</span>}
                  </span>
                </label>

                <button
                  type="button"
                  onClick={handleExport}
                  disabled={doc.info.encrypted || (!dirty && !(purge && toPurge.length))}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-colors hover:bg-emerald-500 disabled:opacity-40"
                >
                  <Download size={18} /> {y('export.button')}
                </button>
                {!dirty && !(purge && toPurge.length) && <p className="-mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">{y('export.noChanges')}</p>}
              </>
            )}

            {exportState?.status === 'working' && (
              <p className="flex items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <LoaderCircle size={16} className="animate-spin text-emerald-600" /> {y('export.working')}
              </p>
            )}
            {exportState?.status === 'error' && (
              <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
                <AlertTriangle size={16} /> {y('errors.export')}
              </p>
            )}
            {exportState?.status === 'done' && (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <div className="flex items-start justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 size={17} /> {y('export.done')}
                  </p>
                  <IconButton icon={X} label={y('export.dismiss')} onClick={() => setExportState(null)} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-lg bg-white p-2 dark:bg-zinc-950">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{y('export.originalSize')}</p>
                    <p className="font-semibold tabular-nums text-zinc-900 dark:text-white">{formatBytes(file.size)}</p>
                  </div>
                  <div className="rounded-lg bg-white p-2 dark:bg-zinc-950">
                    <p className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{y('export.finalSize')}</p>
                    <p className="font-semibold tabular-nums text-zinc-900 dark:text-white">{formatBytes(exportState.blob.size)}</p>
                  </div>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {y('export.summary', { remaining: exportState.remaining })}
                  {exportState.merged > 0 && ` ${y('export.merged', { count: exportState.merged })}`}
                  {exportState.purged > 0 && ` ${y('export.purged', { count: exportState.purged })}`}
                </p>
                <button
                  type="button"
                  onClick={download}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                >
                  <Download size={16} /> {y('export.download')}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
