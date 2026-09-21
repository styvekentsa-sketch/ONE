import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, FileText } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { convertWordToPdf } from '../../utils/wordToPdf'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function WordToPdfPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [fileName, setFileName] = useState('')
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [error, setError] = useState(null)

  const handleFiles = async (files) => {
    const [docxFile] = files
    const isDocx =
      docxFile.name.toLowerCase().endsWith('.docx') ||
      docxFile.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    if (!isDocx) {
      setError(t('tools.word-to-pdf.errorInvalidFile'))
      return
    }
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const bytes = await convertWordToPdf(docxFile)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      setFileName(docxFile.name)
      setDownloadUrl(URL.createObjectURL(blob))

      addHistoryEntry({
        toolId: 'word-to-pdf',
        toolName: t('tools.word-to-pdf.name'),
        message: `Converti en PDF — ${docxFile.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(
        err?.message === 'EMPTY_DOCUMENT'
          ? t('tools.word-to-pdf.errorEmpty')
          : t('tools.word-to-pdf.errorGeneric'),
      )
      setStep(STEPS.UPLOAD)
    }
  }

  const handleRestart = () => {
    setFileName('')
    setDownloadUrl(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${fileName.replace(/\.docx$/i, '') || 'ONE_document'}.pdf`
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
          <FileText size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.word-to-pdf.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.word-to-pdf.subtitle')}</p>
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
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            hint={t('tools.word-to-pdf.dropHint')}
          />
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={FileText}
            title={t('tools.word-to-pdf.processingTitle')}
            description={t('tools.word-to-pdf.processingDescription')}
          />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.word-to-pdf.doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.word-to-pdf.doneDescription')}</p>
            </div>
            <DownloadButton fileName="ONE_document.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.word-to-pdf.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
