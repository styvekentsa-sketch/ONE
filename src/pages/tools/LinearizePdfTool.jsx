import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Download,
  FileCode,
  Gauge,
  Globe,
  LoaderCircle,
  Lock,
  Sliders,
  X,
  Zap,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { diagnosePdf, linearizePdf, transferSeconds, verifyLinearization } from '../../utils/linearizeWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'
import { saveFile } from '../../utils/download'

const STEPS = { UPLOAD: 'upload', CONFIGURE: 'configure', PROCESSING: 'processing', DONE: 'done' }
const uid = () => Math.random().toString(36).slice(2, 10)
const isPdf = (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

function downloadBlob(blob, name) {
  saveFile(blob, name)
}

/** Octets à télécharger avant le premier affichage. */
function bytesBeforeFirstRender(diag) {
  return diag.linearization.present && diag.linearization.valid ? diag.linearization.E : diag.size
}

function StatusBadge({ diag, l }) {
  const lin = diag.linearization
  if (lin.present && lin.valid) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-semibold text-brand-800 dark:bg-brand-500/15 dark:text-brand-300">
        <Zap size={13} /> {l('status.linearized')}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
      <AlertCircle size={13} /> {lin.present ? l('status.broken') : l('status.notOptimized')}
    </span>
  )
}

function Metric({ label, value, hint }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-stone-900 dark:text-white">{value}</p>
      {hint && <p className="text-[11px] text-stone-500 dark:text-stone-400">{hint}</p>}
    </div>
  )
}

function Toggle({ checked, onChange, title, description, disabled = false, icon: Icon }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border p-4 transition-colors ${
        checked ? 'border-brand-500/60 bg-brand-50/50 dark:bg-brand-500/5' : 'border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-950'
      } ${disabled ? 'cursor-default' : 'cursor-pointer'}`}
    >
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} className="mt-0.5 h-4 w-4 accent-brand-600" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-stone-900 dark:text-white">
          {title}
          {Icon && <Icon size={13} className="text-stone-400" />}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-stone-600 dark:text-stone-400">{description}</span>
      </span>
    </label>
  )
}

/** Barres comparatives du temps de premier affichage simulé. */
function TimeComparison({ before, after, l }) {
  const rows = ['3g', '4g'].map((network) => ({
    network,
    before: transferSeconds(before, network),
    after: transferSeconds(after, network),
  }))
  const max = Math.max(...rows.map((r) => r.before), 0.001)
  const fmt = (s) => `${s < 10 ? s.toFixed(2) : s.toFixed(1)} s`
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.network}>
          <p className="mb-1 text-xs font-semibold text-stone-700 dark:text-stone-300">{l(`networks.${r.network}`)}</p>
          {[
            { key: 'before', value: r.before, className: 'bg-stone-400 dark:bg-stone-600' },
            { key: 'after', value: r.after, className: 'bg-brand-500' },
          ].map((bar) => (
            <div key={bar.key} className="mb-1 flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] text-stone-500 dark:text-stone-400">{l(`compare.${bar.key}`)}</span>
              <div className="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
                <div className={`h-full rounded-full ${bar.className}`} style={{ width: `${Math.max(2, (bar.value / max) * 100)}%` }} />
              </div>
              <span className="w-16 shrink-0 text-right text-xs tabular-nums text-stone-700 dark:text-stone-300">{fmt(bar.value)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export default function LinearizePdfTool() {
  const { t } = useTranslation()
  const l = (key, opts) => t(`tools.linearize.${key}`, opts)

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [items, setItems] = useState([])
  const [compress, setCompress] = useState(true)
  const [cleanup, setCleanup] = useState(true)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)

  const addFiles = async (files) => {
    const pdfs = files.filter(isPdf)
    if (!pdfs.length) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(pdfs.length < files.length ? l('errors.someIgnored') : null)
    const entries = pdfs.map((file) => ({ id: uid(), file, bytes: null, diag: null, failed: false }))
    setItems((list) => [...list, ...entries])
    setStep(STEPS.CONFIGURE)

    for (const entry of entries) {
      try {
        const bytes = new Uint8Array(await entry.file.arrayBuffer())
        const diag = await diagnosePdf(bytes)
        setItems((list) => list.map((it) => (it.id === entry.id ? { ...it, bytes, diag } : it)))
      } catch (err) {
        console.error(err)
        setItems((list) => list.map((it) => (it.id === entry.id ? { ...it, failed: true } : it)))
      }
    }
  }

  const remove = (id) => {
    const next = items.filter((it) => it.id !== id)
    setItems(next)
    if (!next.length) setStep(STEPS.UPLOAD)
  }

  const ready = items.filter((it) => it.diag && !it.failed)
  const pending = items.some((it) => !it.diag && !it.failed)

  const handleProcess = async () => {
    setStep(STEPS.PROCESSING)
    setProgress(0)
    setError(null)
    const output = []
    for (let i = 0; i < ready.length; i++) {
      const item = ready[i]
      const name = `${item.file.name.replace(/\.pdf$/i, '')}_web.pdf`
      try {
        const bytes = await linearizePdf(item.bytes, { compress, cleanup })
        const verify = await verifyLinearization(bytes)
        const after = await diagnosePdf(bytes)
        output.push({ id: item.id, name, before: item.diag, after, verify, blob: new Blob([bytes], { type: 'application/pdf' }) })
      } catch (err) {
        console.error(err)
        output.push({ id: item.id, name: item.file.name, before: item.diag, error: true })
      }
      setProgress((i + 1) / ready.length)
    }
    setResults(output)
    const ok = output.filter((r) => !r.error)
    if (ok.length) {
      addHistoryEntry({
        toolId: 'linearize',
        toolName: l('name'),
        message: l('historyMessage', { count: ok.length, names: ok.map((r) => r.name).join(', ') }),
      })
    }
    setStep(STEPS.DONE)
  }

  const downloadZip = async () => {
    const { default: JSZip } = await import('jszip')
    const zip = new JSZip()
    const used = new Map()
    for (const r of results.filter((x) => !x.error)) {
      const n = used.get(r.name) ?? 0
      used.set(r.name, n + 1)
      zip.file(n ? r.name.replace(/\.pdf$/, `_${n + 1}.pdf`) : r.name, r.blob)
    }
    downloadBlob(await zip.generateAsync({ type: 'blob' }), 'ONE_web.zip')
  }

  const restart = () => {
    setItems([])
    setResults([])
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const successful = results.filter((r) => !r.error)

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm sm:h-14 sm:w-14 dark:bg-stone-800/80 dark:text-white">
          <Zap size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{t('categories.Outils Avancés')}</p>
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl dark:text-white">{l('name')}</h1>
          <p className="text-sm text-stone-500 sm:text-base dark:text-stone-400">{l('subtitle')}</p>
        </div>
      </div>

      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertCircle size={16} className="shrink-0" /> {error}
        </p>
      )}

      {step === STEPS.UPLOAD && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
          <DragDropZone onFiles={addFiles} multiple accept="application/pdf" hint={l('dropHint')} />
        </div>
      )}

      {step === STEPS.CONFIGURE && (
        <div className="mt-6 flex flex-col gap-5">
          {/* Diagnostic par fichier */}
          {items.map((item) => (
            <section key={item.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-stone-800 dark:bg-stone-900">
              <div className="flex items-start gap-3">
                <FileCode size={20} className="mt-0.5 shrink-0 text-stone-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-stone-900 dark:text-white">{item.file.name}</p>
                  <div className="mt-1.5">
                    {item.failed ? (
                      <span className="text-xs text-red-600 dark:text-red-400">{l('errors.unreadable')}</span>
                    ) : item.diag ? (
                      <StatusBadge diag={item.diag} l={l} />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
                        <LoaderCircle size={13} className="animate-spin" /> {l('analyzing')}
                      </span>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => remove(item.id)} aria-label={l('remove')} title={l('remove')} className="shrink-0 rounded-md p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                  <X size={16} />
                </button>
              </div>

              {item.diag && (
                <>
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <Metric label={l('metrics.version')} value={item.diag.version ? `PDF ${item.diag.version}` : '—'} />
                    <Metric label={l('metrics.pages')} value={item.diag.pageCount} />
                    <Metric label={l('metrics.size')} value={formatBytes(item.diag.size)} />
                    <Metric
                      label={l('metrics.firstPage')}
                      value={`${item.diag.firstPageExact ? '' : '≈ '}${formatBytes(item.diag.firstPageBytes)}`}
                      hint={item.diag.firstPageExact ? l('metrics.firstPageExact') : l('metrics.firstPageEstimate')}
                    />
                  </div>
                  <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">
                    {item.diag.linearization.present && item.diag.linearization.valid
                      ? l('explain.linearized')
                      : item.diag.linearization.present
                        ? l('explain.broken')
                        : l('explain.notOptimized', { size: formatBytes(item.diag.size) })}
                    {item.diag.revisions > 0 && ` ${l('explain.revisions', { count: item.diag.revisions })}`}
                    {item.diag.encrypted && ` ${l('explain.encrypted')}`}
                  </p>
                </>
              )}
            </section>
          ))}

          <DragDropZone onFiles={addFiles} multiple accept="application/pdf" label={l('addMore')} hint=" " className="p-4! md:p-5!" />

          {/* Options */}
          <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-white">
              <Sliders size={16} className="text-brand-600 dark:text-brand-400" /> {l('options.title')}
            </h2>
            <div className="flex flex-col gap-3">
              <Toggle checked disabled icon={Lock} title={l('options.linearize.title')} description={l('options.linearize.description')} />
              <Toggle checked={compress} onChange={setCompress} title={l('options.compress.title')} description={l('options.compress.description')} />
              <Toggle checked={cleanup} onChange={setCleanup} title={l('options.cleanup.title')} description={l('options.cleanup.description')} />
            </div>
            <p className="mt-3 text-xs text-stone-500 dark:text-stone-400">{l('options.revisionsNote')}</p>
          </section>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={restart} className="text-sm font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
              {l('clear')}
            </button>
            <button
              type="button"
              onClick={handleProcess}
              disabled={!ready.length || pending}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              <Zap size={18} /> {l('process', { count: ready.length })}
            </button>
          </div>
        </div>
      )}

      {step === STEPS.PROCESSING && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-10 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <LoaderCircle size={30} className="animate-spin text-brand-600" />
          <p className="font-semibold text-stone-900 dark:text-white">{l('processing')}</p>
          <div className="w-full max-w-sm">
            <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="mt-2 text-center text-xs tabular-nums text-stone-500 dark:text-stone-400">{Math.round(progress * 100)} %</p>
          </div>
        </div>
      )}

      {step === STEPS.DONE && (
        <div className="mt-6 flex flex-col gap-5">
          {results.map((r) =>
            r.error ? (
              <section key={r.id} className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold">{r.name}</span> — {r.before?.encrypted ? l('errors.encrypted') : l('errors.processing')}
                </span>
              </section>
            ) : (
              <section key={r.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-stone-800 dark:bg-stone-900">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-stone-900 dark:text-white">{r.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge diag={r.before} l={l} />
                      <ArrowRight size={14} className="text-stone-400" />
                      {r.verify.compliant ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-semibold text-white">
                          <CheckCircle2 size={13} /> {l('status.verified')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/15 dark:text-red-400">
                          <AlertCircle size={13} /> {l('status.verifyFailed')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadBlob(r.blob, r.name)}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600"
                  >
                    <Download size={16} /> {l('done.download')}
                  </button>
                </div>

                <ul className="mt-4 grid gap-1.5 text-xs text-stone-600 sm:grid-cols-3 dark:text-stone-400">
                  {[
                    ['dict', r.verify.present && r.verify.valid],
                    ['hint', r.verify.hintStream],
                    ['qpdf', r.verify.qpdfOk],
                  ].map(([key, ok]) => (
                    <li key={key} className="flex items-center gap-1.5">
                      {ok ? <CheckCircle2 size={14} className="text-brand-600 dark:text-brand-400" /> : <AlertCircle size={14} className="text-red-600" />}
                      {l(`verify.${key}`)}
                    </li>
                  ))}
                </ul>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="grid grid-cols-2 gap-2.5 self-start">
                    <Metric label={l('done.originalSize')} value={formatBytes(r.before.size)} />
                    <Metric
                      label={l('done.finalSize')}
                      value={formatBytes(r.after.size)}
                      hint={`${r.after.size > r.before.size ? '+' : ''}${Math.round((r.after.size / r.before.size - 1) * 100)} %`}
                    />
                    <Metric label={l('done.bytesBefore')} value={formatBytes(bytesBeforeFirstRender(r.before))} />
                    <Metric label={l('done.bytesAfter')} value={formatBytes(r.after.firstPageBytes)} />
                  </div>
                  <div className="rounded-xl border border-stone-200 p-3 dark:border-stone-800">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                      <Gauge size={14} /> {l('done.simulation')}
                    </p>
                    <TimeComparison before={bytesBeforeFirstRender(r.before)} after={r.after.firstPageBytes} l={l} />
                  </div>
                </div>
              </section>
            ),
          )}

          <p className="flex items-start gap-2 rounded-xl bg-stone-50 px-3 py-2.5 text-xs text-stone-600 dark:bg-stone-900 dark:text-stone-400">
            <Globe size={15} className="mt-px shrink-0" /> {l('done.simulationNote')}
          </p>

          <div className="flex flex-col items-center gap-4">
            {successful.length > 1 && (
              <button
                type="button"
                onClick={downloadZip}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-stone-200 px-6 py-3 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <Archive size={18} /> {l('done.zip')}
              </button>
            )}
            <div className="flex gap-5 text-sm font-medium">
              <button type="button" onClick={() => setStep(STEPS.CONFIGURE)} className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
                {l('done.adjust')}
              </button>
              <button type="button" onClick={restart} className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
                {l('done.restart')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
