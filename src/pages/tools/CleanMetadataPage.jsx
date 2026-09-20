import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, Eraser, Fingerprint } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { readPdfMetadata, cleanMetadata, METADATA_FIELDS } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  REVIEW: 'review',
  PROCESSING: 'processing',
  DONE: 'done',
}

function formatValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '—' : value.toLocaleString()
  }
  return value ? String(value) : '—'
}

export default function CleanMetadataPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const downloadUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
  }, [])

  const handleFiles = async (files) => {
    const [pdfFile] = files
    const isPdf = pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setFile(pdfFile)

    try {
      const buffer = await pdfFile.arrayBuffer()
      const meta = await readPdfMetadata(buffer)
      setMetadata(meta)
      setStep(STEPS.REVIEW)
    } catch (err) {
      console.error(err)
      setError(t('common.corruptedPdf'))
    }
  }

  const handleClean = async () => {
    setStep(STEPS.PROCESSING)
    try {
      const buffer = await file.arrayBuffer()
      const cleanedBytes = await cleanMetadata(buffer)
      const blob = new Blob([cleanedBytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)
      setDownloadUrl(downloadUrlRef.current)

      addHistoryEntry({
        toolId: 'clean-metadata',
        toolName: t('tools.clean-metadata.name'),
        message: `Métadonnées purgées — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.clean-metadata.errorGeneric'))
      setStep(STEPS.REVIEW)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setMetadata(null)
    setError(null)
    setDownloadUrl(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'ONE_cleaned.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const hasAnyMetadata =
    metadata &&
    METADATA_FIELDS.some(({ key }) => {
      const value = metadata[key]
      return value instanceof Date ? !Number.isNaN(value.getTime()) : Boolean(value)
    })

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
          <Fingerprint size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {t('tools.clean-metadata.name')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.clean-metadata.subtitle')}</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
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
            hint={t('tools.clean-metadata.dropHint')}
          />
        )}

        {step === STEPS.REVIEW && metadata && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {t('tools.clean-metadata.detectedMetadata')}
              </p>
              <dl className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 dark:divide-white/5 dark:border-white/10">
                {METADATA_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-4 bg-white px-4 py-2.5 dark:bg-zinc-800/40">
                    <dt className="text-sm text-zinc-500 dark:text-zinc-400">
                      {t(`tools.clean-metadata.fields.${key}`, label)}
                    </dt>
                    <dd className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {formatValue(metadata[key])}
                    </dd>
                  </div>
                ))}
              </dl>
              {!hasAnyMetadata && (
                <p className="mt-3 text-xs text-zinc-400">{t('tools.clean-metadata.noMetadataHint')}</p>
              )}
            </div>

            <button
              onClick={handleClean}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <Eraser size={18} /> {t('tools.clean-metadata.purgeButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState icon={Eraser} title={t('tools.clean-metadata.processingTitle')} duration={1000} />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">
                {t('tools.clean-metadata.doneTitle')}
              </p>
              <p className="mt-1 text-sm text-zinc-400">{t('tools.clean-metadata.doneDescription')}</p>
            </div>
            <DownloadButton fileName="ONE_cleaned.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.clean-metadata.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
