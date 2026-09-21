import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, Combine, FileText, X } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { mergePdfs } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  REVIEW: 'review',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function MergePdfPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [files, setFiles] = useState([])
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const downloadUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
  }, [])

  const handleFiles = (dropped) => {
    const nonPdf = dropped.find(
      (f) => f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf'),
    )
    if (nonPdf) {
      setError(t('tools.merge.invalidFiles'))
      return
    }
    setError(null)
    setFiles((prev) => [...prev, ...dropped])
    setStep(STEPS.REVIEW)
  }

  const removeFile = (index) => {
    setFiles((prev) => {
      const next = prev.filter((_, i) => i !== index)
      if (next.length === 0) setStep(STEPS.UPLOAD)
      return next
    })
  }

  const moveFile = (index, direction) => {
    setFiles((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleMerge = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const mergedBytes = await mergePdfs(files)
      const blob = new Blob([mergedBytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)
      setDownloadUrl(downloadUrlRef.current)

      addHistoryEntry({
        toolId: 'merge',
        toolName: t('tools.merge.name'),
        message: `Fusion de ${files.length} fichiers`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(err?.message || t('tools.merge.errorGeneric'))
      setStep(STEPS.REVIEW)
    }
  }

  const handleRestart = () => {
    setFiles([])
    setError(null)
    setDownloadUrl(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'ONE_merged.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Combine size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.merge.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.merge.subtitle')}</p>
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
            accept="application/pdf"
            hint={t('tools.merge.dropHint')}
          />
        )}

        {step === STEPS.REVIEW && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-800/40"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-xs font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    {index + 1}
                  </span>
                  <FileText size={18} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    {file.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => moveFile(index, -1)}
                      disabled={index === 0}
                      aria-label={t('common.moveUp')}
                      className="rounded p-1 text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => moveFile(index, 1)}
                      disabled={index === files.length - 1}
                      aria-label={t('common.moveDown')}
                      className="rounded p-1 text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-700 disabled:opacity-30 dark:hover:text-zinc-200"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      onClick={() => removeFile(index)}
                      aria-label={t('actions.remove')}
                      className="rounded p-1 text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-red-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <DragDropZone
              onFiles={handleFiles}
              accept="application/pdf"
              label={t('tools.merge.addMore')}
              hint=" "
              className="p-6"
            />

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleMerge}
                disabled={files.length < 2}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-500"
              >
                <Combine size={18} />
                {files.length > 1
                  ? t('tools.merge.mergeButtonMultiple', { count: files.length })
                  : t('tools.merge.mergeButtonDefault')}
              </button>
              {files.length < 2 && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('tools.merge.minFilesHint')}</p>
              )}
            </div>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={Combine}
            title={t('tools.merge.processingTitle')}
            description={t('tools.merge.processingDescription', { count: files.length })}
          />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.merge.doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {t('tools.merge.doneDescription', { count: files.length })}
              </p>
            </div>
            <DownloadButton fileName="ONE_merged.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.merge.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
