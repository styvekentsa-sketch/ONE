import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck,
  FileText,
  Info,
  Layers,
  ShieldCheck,
  Sliders,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import { analyzePdf, flattenInteractive, flattenRaster } from '../../utils/flattenWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  ANALYZING: 'analyzing',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

const MODES = [
  { id: 'interactive', icon: Layers },
  { id: 'raster', icon: ShieldCheck },
]

const DPI_OPTIONS = [150, 200, 300]

export default function FlattenTool() {
  const { t } = useTranslation()
  const f = (key, opts) => t(`tools.flatten.${key}`, opts)

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [mode, setMode] = useState('interactive')
  const [dpi, setDpi] = useState(150)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const downloadUrlRef = useRef(null)

  useEffect(
    () => () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    },
    [],
  )

  const handleFiles = async (files) => {
    const [pdfFile] = files
    const isPdf = pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setFile(pdfFile)
    setStep(STEPS.ANALYZING)
    try {
      const stats = await analyzePdf(await pdfFile.arrayBuffer())
      setAnalysis(stats)
      // Un PDF chiffré ne peut pas être réécrit proprement par pdf-lib :
      // seule la rastérisation (lecture via pdf.js) est fiable.
      setMode(stats.isEncrypted ? 'raster' : 'interactive')
      setStep(STEPS.CONFIGURE)
    } catch (err) {
      console.error(err)
      setError(f('errorRead'))
      setFile(null)
      setStep(STEPS.UPLOAD)
    }
  }

  const handleFlatten = async () => {
    setStep(STEPS.PROCESSING)
    setProgress(0)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const bytes =
        mode === 'interactive'
          ? await flattenInteractive(buffer, setProgress)
          : await flattenRaster(buffer, { dpi, onProgress: setProgress })

      const blob = new Blob([bytes], { type: 'application/pdf' })
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)

      const fileName = `${file.name.replace(/\.pdf$/i, '')}_aplati.pdf`
      setResult({ url: downloadUrlRef.current, fileName, originalSize: file.size, finalSize: blob.size })

      addHistoryEntry({
        toolId: 'flatten',
        toolName: f('name'),
        message: f('historyMessage', {
          name: file.name,
          mode: mode === 'interactive' ? f('modes.interactive.title') : `${f('modes.raster.title')} ${dpi} DPI`,
        }),
      })
      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(f('errorGeneric'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleDownload = () => {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.url
    link.download = result.fileName
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleRestart = () => {
    setFile(null)
    setAnalysis(null)
    setResult(null)
    setError(null)
    setProgress(0)
    setStep(STEPS.UPLOAD)
  }

  const sizeDelta = result ? Math.round((result.finalSize / result.originalSize - 1) * 100) : 0
  const hasInteractiveContent = analysis && (analysis.fieldCount > 0 || analysis.annotationCount > 0)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      <Link
        to="/pdf"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors duration-200 hover:text-zinc-700 sm:mb-8 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm sm:h-14 sm:w-14 dark:bg-zinc-800/80 dark:text-white">
          <Layers size={26} />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
            {t('categories.Outils Avancés')}
          </p>
          <h1 className="text-xl font-bold text-zinc-900 sm:text-2xl dark:text-white">{f('name')}</h1>
          <p className="text-sm text-zinc-500 sm:text-base dark:text-zinc-400">{f('subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-900">
        {error && (
          <p className="mb-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}

        {step === STEPS.UPLOAD && (
          <DragDropZone onFiles={handleFiles} multiple={false} accept="application/pdf" hint={f('dropHint')} />
        )}

        {step === STEPS.ANALYZING && (
          <ProcessingState icon={Layers} title={f('analyzingTitle')} description={f('analyzingDescription')} />
        )}

        {step === STEPS.CONFIGURE && file && analysis && (
          <div className="flex flex-col gap-6">
            {/* Fichier */}
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
              <FileText size={20} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{file.name}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {formatBytes(file.size)} · {f('pageCount', { count: analysis.pageCount })}
                </p>
              </div>
            </div>

            {/* Détection */}
            <div className="flex flex-col gap-2">
              {analysis.fieldCount > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <FileCheck size={18} className="mt-0.5 shrink-0" />
                  {f('fieldsDetected', { count: analysis.fieldCount })}
                </p>
              )}
              {analysis.annotationCount > 0 && (
                <p className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300">
                  <FileCheck size={18} className="mt-0.5 shrink-0" />
                  {f('annotationsDetected', { count: analysis.annotationCount })}
                </p>
              )}
              {!hasInteractiveContent && (
                <p className="flex items-start gap-2 rounded-lg bg-zinc-100 px-3 py-2.5 text-sm text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300">
                  <Info size={18} className="mt-0.5 shrink-0" />
                  {f('nothingDetected')}
                </p>
              )}
              {analysis.hasXfa && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  {f('xfaWarning')}
                </p>
              )}
              {analysis.isEncrypted && (
                <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  {f('encryptedWarning')}
                </p>
              )}
            </div>

            {/* Mode */}
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {f('modeLabel')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label={f('modeLabel')}>
                {MODES.map(({ id, icon: Icon }) => {
                  const selected = mode === id
                  const disabled = id === 'interactive' && analysis.isEncrypted
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => setMode(id)}
                      className={`flex flex-col gap-2 rounded-xl border p-4 text-left transition-all duration-200 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 ${
                        selected
                          ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500 dark:border-emerald-500 dark:bg-emerald-500/10'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700'
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 font-semibold text-zinc-900 dark:text-white">
                          <Icon size={18} className={selected ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'} />
                          {f(`modes.${id}.title`)}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                          {f(`modes.${id}.badge`)}
                        </span>
                      </span>
                      <span className="text-sm leading-snug text-zinc-600 dark:text-zinc-400">
                        {f(`modes.${id}.description`)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Résolution (rastérisation) */}
            {mode === 'raster' && (
              <div>
                <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <Sliders size={14} /> {f('dpiLabel')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {DPI_OPTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setDpi(value)}
                      aria-pressed={dpi === value}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                        dpi === value
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {value} DPI
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{f(`dpiHint.${dpi}`)}</p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={handleRestart}
                className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {f('changeFile')}
              </button>
              <button
                type="button"
                onClick={handleFlatten}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all duration-200 hover:bg-emerald-500 active:scale-[0.98]"
              >
                <Layers size={18} /> {f('flattenButton')}
              </button>
            </div>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <div className="flex flex-col items-center gap-4">
            <ProcessingState
              icon={mode === 'interactive' ? Layers : ShieldCheck}
              title={f('processingTitle')}
              description={mode === 'interactive' ? f('modes.interactive.title') : `${f('modes.raster.title')} · ${dpi} DPI`}
            />
            <div className="w-full max-w-sm">
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
                role="progressbar"
                aria-valuenow={Math.round(progress * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-center text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                {Math.round(progress * 100)} %
              </p>
            </div>
          </div>
        )}

        {step === STEPS.DONE && result && (
          <div className="flex flex-col items-center gap-6 py-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-900 dark:text-white">{f('doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {mode === 'interactive' ? f('doneInteractive') : f('doneRaster')}
              </p>
            </div>

            <div className="grid w-full max-w-md grid-cols-2 gap-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{f('originalSize')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">
                  {formatBytes(result.originalSize)}
                </p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
                <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">{f('finalSize')}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-white">
                  {formatBytes(result.finalSize)}
                </p>
                <p className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {sizeDelta > 0 ? '+' : ''}
                  {sizeDelta} %
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleDownload}
              className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition-all duration-200 hover:bg-emerald-500 active:scale-[0.98] sm:w-auto"
            >
              <Download size={18} className="transition-transform group-hover:-translate-y-0.5" />
              {f('downloadButton')}
            </button>
            <button
              type="button"
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              {f('restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
