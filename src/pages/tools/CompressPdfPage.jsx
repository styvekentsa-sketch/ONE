import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, FileText, Minimize2 } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import CompressionLevelSelector from '../../components/CompressionLevelSelector'
import { compressionLevels, DEFAULT_COMPRESSION_LEVEL } from '../../data/compressionLevels'
import { compressPdf } from '../../utils/pdfWorker'
import { formatBytes } from '../../utils/formatBytes'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function CompressPdfPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [level, setLevel] = useState(DEFAULT_COMPRESSION_LEVEL)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const downloadUrlRef = useRef(null)

  // Libère l'URL de téléchargement générée quand on quitte la page.
  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
  }, [])

  const handleFiles = (files) => {
    const [pdfFile] = files
    const isPdf = pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setFile(pdfFile)
    setStep(STEPS.CONFIGURE)
  }

  const handleCompress = async () => {
    setStep(STEPS.PROCESSING)
    try {
      const buffer = await file.arrayBuffer()
      const compressedBytes = await compressPdf(buffer, level)
      const blob = new Blob([compressedBytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)

      setResult({
        url: downloadUrlRef.current,
        originalSize: file.size,
        compressedSize: blob.size,
      })

      const reduction = Math.max(0, Math.round((1 - blob.size / file.size) * 100))
      addHistoryEntry({
        toolId: 'compress',
        toolName: t('tools.compress.name'),
        message: `Compression de ${file.name} (-${reduction}%)`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.compress.errorGeneric'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setLevel(DEFAULT_COMPRESSION_LEVEL)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.url
    link.download = 'ONE_compressed.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const selectedLevel = compressionLevels.find((l) => l.id === level)
  const estimatedSize = file ? file.size * selectedLevel.estimatedRatio : 0
  const reductionPercent = result
    ? Math.max(0, Math.round((1 - result.compressedSize / result.originalSize) * 100))
    : 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Minimize2 size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.compress.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.compress.subtitle')}</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        {error && (
          <p className="mb-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}

        {step === STEPS.UPLOAD && (
          <DragDropZone
            onFiles={handleFiles}
            multiple={false}
            accept="application/pdf"
            hint={t('tools.compress.dropHint')}
          />
        )}

        {step === STEPS.CONFIGURE && file && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-zinc-800/60">
              <FileText size={20} className="shrink-0 text-zinc-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                  {file.name}
                </p>
                <p className="text-xs text-zinc-400">
                  {t('tools.compress.initialSize', { size: formatBytes(file.size) })}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t('tools.compress.compressionLevel')}
              </p>
              <CompressionLevelSelector levels={compressionLevels} value={level} onChange={setLevel} />
            </div>

            <button
              onClick={handleCompress}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <Minimize2 size={18} /> {t('tools.compress.compressButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <div className="flex flex-col items-center gap-3">
            <ProcessingState
              icon={Minimize2}
              title={t('tools.compress.processingTitle')}
              description={t('tools.compress.levelLabel', { level: selectedLevel.label })}
            />
            <p className="text-xs text-zinc-400">
              {t('tools.compress.estimatedSize', { size: formatBytes(estimatedSize) })}
            </p>
          </div>
        )}

        {step === STEPS.DONE && result && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">
                {t('tools.compress.doneTitle', { percent: reductionPercent })}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {t('tools.compress.sizeComparison', {
                  original: formatBytes(result.originalSize),
                  compressed: formatBytes(result.compressedSize),
                })}
              </p>
            </div>
            <DownloadButton fileName="ONE_compressed.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.compress.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
