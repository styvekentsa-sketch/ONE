import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  Download,
  FileText,
  FileWarning,
  Hammer,
  LoaderCircle,
  Lock,
  RefreshCw,
  ScanLine,
  ShieldAlert,
  Terminal,
  Wrench,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { destroyPdfDocument, loadPdfDocument } from '../../utils/pdfRender'
import { diagnosePdf, repairRebuild, repairStructural, salvageVisual, verifyRepaired } from '../../utils/repairWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'

const STEPS = { UPLOAD: 'upload', ANALYZING: 'analyzing', REPORT: 'report', PROCESSING: 'processing', DONE: 'done' }
const MODES = [
  { id: 'structural', icon: Hammer },
  { id: 'rebuild', icon: Boxes },
  { id: 'visual', icon: ScanLine },
]
const DPI_OPTIONS = [150, 200]

const SEVERITY_STYLES = {
  healthy: 'bg-brand-100 text-brand-800 dark:bg-brand-500/15 dark:text-brand-300',
  minor: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  major: 'bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300',
  critical: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  locked: 'bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200',
}

function Card({ icon: Icon, title, children, aside }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-5 dark:border-stone-800 dark:bg-stone-900">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-white">
          <Icon size={16} className="text-brand-600 dark:text-brand-400" /> {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
      <p className="text-[11px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">{label}</p>
      <p className="mt-0.5 text-base font-semibold tabular-nums text-stone-900 dark:text-white">{value}</p>
    </div>
  )
}

/** Journal façon console (messages qpdf). */
function Console({ lines, empty }) {
  return (
    <div className="max-h-56 overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-xs leading-relaxed text-stone-700 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
      {lines.length ? (
        lines.map((line, i) => (
          <p key={i} className={/^WARNING/i.test(line) ? 'text-amber-700 dark:text-amber-400' : /error|can't|expected|invalid/i.test(line) ? 'text-red-700 dark:text-red-400' : ''}>
            <span className="select-none text-stone-400">$ </span>
            {line}
          </p>
        ))
      ) : (
        <p className="text-stone-500">{empty}</p>
      )}
    </div>
  )
}

/** Miniatures des premières pages du fichier réparé. */
function Thumbnails({ blob, label }) {
  const containerRef = useRef(null)
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    let pdf = null
    ;(async () => {
      pdf = await loadPdfDocument(new Uint8Array(await blob.arrayBuffer()))
      if (cancelled) return
      const total = Math.min(4, pdf.numPages)
      setCount(total)
      await new Promise((r) => requestAnimationFrame(r))
      const canvases = containerRef.current?.querySelectorAll('canvas') ?? []
      for (let n = 1; n <= total && !cancelled; n++) {
        const page = await pdf.getPage(n)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: 240 / base.width })
        const canvas = canvases[n - 1]
        if (!canvas) continue
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        await page.render({ canvas, canvasContext: canvas.getContext('2d'), viewport }).promise
      }
    })().catch((err) => console.error(err))
    return () => {
      cancelled = true
      destroyPdfDocument(pdf)
    }
  }, [blob])

  return (
    <div ref={containerRef} className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label={label}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-1">
          <canvas className="w-full rounded-md bg-white shadow-sm ring-1 ring-stone-200 dark:ring-stone-800" />
          <span className="text-[11px] text-stone-500 dark:text-stone-400">{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

export default function RepairPdfTool() {
  const { t } = useTranslation()
  const r = (key, opts) => t(`tools.repair.${key}`, opts)

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [bytes, setBytes] = useState(null)
  const [diag, setDiag] = useState(null)
  const [mode, setMode] = useState('structural')
  const [dpi, setDpi] = useState(150)
  const [progress, setProgress] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleFiles = async (files) => {
    const [pdf] = files
    setError(null)
    setResult(null)
    setStep(STEPS.ANALYZING)
    try {
      // Pas de filtre strict sur le type : un fichier endommagé peut avoir
      // perdu sa signature ou être mal identifié par le navigateur.
      const data = new Uint8Array(await pdf.arrayBuffer())
      const report = await diagnosePdf(data)
      setFile(pdf)
      setBytes(data)
      setDiag(report)
      setMode(report.recommended)
      setStep(STEPS.REPORT)
    } catch (err) {
      console.error(err)
      setError(r('errors.analyze'))
      setStep(STEPS.UPLOAD)
    }
  }

  const handleRepair = async (selectedMode = mode) => {
    setMode(selectedMode)
    setStep(STEPS.PROCESSING)
    setProgress(selectedMode === 'visual' ? 0 : null)
    setError(null)
    try {
      const input = bytes.slice()
      const output =
        selectedMode === 'structural'
          ? await repairStructural(input, diag)
          : selectedMode === 'rebuild'
            ? await repairRebuild(input, diag)
            : await salvageVisual(input, diag, { dpi, onProgress: setProgress })
      const verify = await verifyRepaired(output.bytes.slice())
      const total = Math.max(diag.expectedPages, verify.numPages)
      const status = verify.readable === 0 ? 'failed' : verify.readable >= total ? 'success' : 'partial'
      const blob = new Blob([output.bytes], { type: 'application/pdf' })
      setResult({ mode: selectedMode, status, total, verify, log: output.log, qpdfLog: output.qpdfLog ?? [], blob })
      if (status !== 'failed') {
        addHistoryEntry({
          toolId: 'repair',
          toolName: r('name'),
          message: r('historyMessage', { name: file.name, saved: verify.readable, total }),
        })
      }
    } catch (err) {
      console.error(err)
      setResult({ mode: selectedMode, status: 'failed', total: diag.expectedPages, log: [], qpdfLog: [], blob: null })
    }
    setStep(STEPS.DONE)
  }

  const download = () => {
    const url = URL.createObjectURL(result.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.pdf$/i, '')}_repare.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }

  const restart = () => {
    setFile(null)
    setBytes(null)
    setDiag(null)
    setResult(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  // Lignes de contrôle du diagnostic, chacune avec un état ok / warn / error.
  const checkRows = diag
    ? (() => {
        const has = (id) => diag.issues.find((i) => i.id === id)
        return [
          { id: 'header', issue: has('headerMissing') ?? has('headerGarbage') },
          { id: 'eof', issue: has('eofMissing') },
          { id: 'xref', issue: has('startxrefMissing') ?? has('startxrefInvalid') },
          { id: 'integrity', issue: has('truncatedObject') },
          { id: 'catalog', issue: has('trailerMissing') ?? has('catalogMissing') },
          { id: 'qpdf', issue: has('qpdfErrors') ?? has('qpdfWarnings') },
          { id: 'encryption', issue: has('passwordRequired') ?? has('encrypted') },
          ...(has('incremental') ? [{ id: 'incremental', issue: has('incremental') }] : []),
        ]
      })()
    : []

  const locked = diag?.severity === 'locked'
  const otherModes = result ? MODES.filter((m) => m.id !== result.mode) : []

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm sm:h-14 sm:w-14 dark:bg-stone-800/80 dark:text-white">
          <Wrench size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">{t('categories.Outils Avancés')}</p>
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl dark:text-white">{r('name')}</h1>
          <p className="text-sm text-stone-500 sm:text-base dark:text-stone-400">{r('subtitle')}</p>
        </div>
      </div>

      {error && (
        <p className="mt-6 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle size={16} className="shrink-0" /> {error}
        </p>
      )}

      {step === STEPS.UPLOAD && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf,.pdf" hint={r('dropHint')} />
        </div>
      )}

      {(step === STEPS.ANALYZING || step === STEPS.PROCESSING) && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-stone-200 bg-white p-10 shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <LoaderCircle size={30} className="animate-spin text-brand-600" />
          <p className="font-semibold text-stone-900 dark:text-white">{step === STEPS.ANALYZING ? r('analyzing') : r(`processing.${mode}`)}</p>
          {step === STEPS.PROCESSING && progress !== null && (
            <div className="w-full max-w-sm">
              <div className="h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-brand-500 transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="mt-2 text-center text-xs tabular-nums text-stone-500 dark:text-stone-400">{Math.round(progress * 100)} %</p>
            </div>
          )}
        </div>
      )}

      {step === STEPS.REPORT && diag && (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:flex-row sm:items-center dark:border-stone-800 dark:bg-stone-900">
            <FileWarning size={22} className="hidden shrink-0 text-stone-400 sm:block" />
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-stone-900 dark:text-stone-100">{file.name}</p>
            <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_STYLES[diag.severity]}`}>
              {diag.severity === 'healthy' ? <CheckCircle2 size={14} /> : diag.severity === 'locked' ? <Lock size={14} /> : <ShieldAlert size={14} />}
              {r(`severity.${diag.severity}`)}
            </span>
          </div>

          <Card icon={ShieldAlert} title={r('sections.diagnosis')}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Metric label={r('metrics.version')} value={diag.version ? `PDF ${diag.version}` : '—'} />
              <Metric label={r('metrics.size')} value={formatBytes(diag.size)} />
              <Metric label={r('metrics.objects')} value={diag.objectCount} />
              <Metric label={r('metrics.pages')} value={diag.expectedPages || '—'} />
            </div>
            <ul className="mt-4 divide-y divide-stone-100 dark:divide-stone-800">
              {checkRows.map(({ id, issue }) => {
                const level = issue?.level ?? 'ok'
                const Icon = level === 'ok' || level === 'info' ? CheckCircle2 : AlertTriangle
                const color = level === 'error' ? 'text-red-600 dark:text-red-400' : level === 'warn' ? 'text-amber-600 dark:text-amber-400' : 'text-brand-600 dark:text-brand-400'
                return (
                  <li key={id} className="flex items-start gap-3 py-2.5">
                    <Icon size={17} className={`mt-0.5 shrink-0 ${color}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 dark:text-stone-100">{r(`checks.${id}.label`)}</p>
                      <p className="text-xs text-stone-500 dark:text-stone-400">
                        {issue ? r(`issues.${issue.id}`, { count: issue.count ?? 0, detail: issue.detail ?? '' }) : r(`checks.${id}.ok`)}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{diag.pdfjs.ok ? r('readable.yes', { count: diag.pdfjs.numPages }) : r('readable.no')}</p>
          </Card>

          <Card icon={Terminal} title={r('sections.console')}>
            <Console lines={diag.qpdf.log} empty={diag.qpdf.exitCode === 0 ? r('console.clean') : r('console.empty')} />
          </Card>

          {locked ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-700 sm:flex-row sm:items-center dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">
              <Lock size={20} className="hidden shrink-0 text-stone-400 sm:block" />
              <p className="flex-1">{r('lockedAdvice')}</p>
              <Link to="/tool/protect-pdf?tab=unlock" className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-400">
                {r('unlockLink')}
              </Link>
            </div>
          ) : (
            <Card icon={Wrench} title={r('sections.modes')}>
              <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={r('sections.modes')}>
                {MODES.map(({ id, icon: Icon }) => {
                  const selected = mode === id
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMode(id)}
                      className={`flex flex-col gap-1.5 rounded-xl border p-4 text-left transition-all active:scale-[0.99] ${
                        selected
                          ? 'border-brand-500 bg-brand-50/60 ring-1 ring-brand-500 dark:bg-brand-500/10'
                          : 'border-stone-200 bg-white hover:border-stone-300 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-700'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-semibold text-stone-900 dark:text-white">
                          <Icon size={17} className={selected ? 'text-brand-600 dark:text-brand-400' : 'text-stone-400'} />
                          {r(`modes.${id}.title`)}
                        </span>
                        {diag.recommended === id && (
                          <span className="rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">{r('recommended')}</span>
                        )}
                      </span>
                      <span className="text-xs font-medium text-stone-500 dark:text-stone-400">{r(`modes.${id}.level`)}</span>
                      <span className="text-sm leading-snug text-stone-600 dark:text-stone-400">{r(`modes.${id}.description`)}</span>
                    </button>
                  )
                })}
              </div>
              {mode === 'visual' && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="mr-1 text-xs font-medium text-stone-500 dark:text-stone-400">{r('dpi')}</span>
                  {DPI_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={dpi === value}
                      onClick={() => setDpi(value)}
                      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                        dpi === value ? 'bg-brand-600 text-white' : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300'
                      }`}
                    >
                      {value} DPI
                    </button>
                  ))}
                  <span className="w-full text-xs text-stone-500 dark:text-stone-400">{r('visualNote')}</span>
                </div>
              )}
            </Card>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={restart} className="text-sm font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
              {r('changeFile')}
            </button>
            {!locked && (
              <button
                type="button"
                onClick={() => handleRepair()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
              >
                <Wrench size={18} /> {r('repairButton')}
              </button>
            )}
          </div>
        </div>
      )}

      {step === STEPS.DONE && result && (
        <div className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <span
              className={`flex h-14 w-14 items-center justify-center rounded-full ${
                result.status === 'success'
                  ? 'bg-brand-100 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400'
                  : result.status === 'partial'
                    ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400'
                    : 'bg-red-100 text-red-600 dark:bg-red-500/10 dark:text-red-400'
              }`}
            >
              {result.status === 'success' ? <CheckCircle2 size={28} /> : <AlertTriangle size={28} />}
            </span>
            <p className="text-lg font-semibold text-stone-900 dark:text-white">
              {r(`status.${result.status}`, { saved: result.verify?.readable ?? 0, total: result.total })}
            </p>
            <p className="max-w-xl text-sm text-stone-500 dark:text-stone-400">{r(`status.${result.status}Text`, { mode: r(`modes.${result.mode}.title`) })}</p>

            {result.blob && (
              <>
                <div className="mt-2 grid w-full max-w-md grid-cols-2 gap-3">
                  <Metric label={r('done.originalSize')} value={formatBytes(file.size)} />
                  <Metric label={r('done.finalSize')} value={formatBytes(result.blob.size)} />
                </div>
                <button
                  type="button"
                  onClick={download}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 sm:w-auto"
                >
                  <Download size={18} /> {r('done.download')}
                </button>
              </>
            )}
          </div>

          {result.blob && (
            <Card icon={FileText} title={r('done.preview')}>
              <Thumbnails blob={result.blob} label={r('done.preview')} />
            </Card>
          )}

          {result.log.length > 0 && (
            <Card icon={Wrench} title={r('done.fixes')}>
              <ul className="flex flex-col gap-2">
                {result.log.map((entry, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300">
                    {entry.id === 'pagesSkipped' ? (
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                    )}
                    {r(`log.${entry.id}`, entry)}
                  </li>
                ))}
                {result.verify && (
                  <li className="flex items-start gap-2 text-sm text-stone-700 dark:text-stone-300">
                    {result.verify.qpdfOk ? (
                      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-brand-600 dark:text-brand-400" />
                    ) : (
                      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                    )}
                    {result.verify.qpdfOk ? r('done.verifyOk') : r('done.verifyWarn')}
                  </li>
                )}
              </ul>
            </Card>
          )}

          {result.qpdfLog.length > 0 && (
            <Card icon={Terminal} title={r('sections.repairConsole')}>
              <Console lines={result.qpdfLog} empty="" />
            </Card>
          )}

          <div className="flex flex-col items-center gap-3">
            {result.status !== 'success' && (
              <div className="flex flex-wrap justify-center gap-2">
                {otherModes.map(({ id, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleRepair(id)}
                    className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    <RefreshCw size={15} /> <Icon size={15} /> {r('done.tryMode', { mode: r(`modes.${id}.title`) })}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-5 text-sm font-medium">
              <button type="button" onClick={() => setStep(STEPS.REPORT)} className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
                {r('done.backToReport')}
              </button>
              <button type="button" onClick={restart} className="text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200">
                {r('done.restart')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
