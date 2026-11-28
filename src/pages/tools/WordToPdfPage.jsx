import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, FileText } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import { convertWordToPdf } from '../../utils/wordToPdf'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'
import { saveFile } from '../../utils/download'

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
    saveFile(downloadUrl, `${fileName.replace(/\.docx$/i, '') || 'ONE_document'}.pdf`)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm dark:bg-stone-800/80 dark:text-white">
          <FileText size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('tools.word-to-pdf.name')}</h1>
          <p className="text-stone-500 dark:text-stone-400">{t('tools.word-to-pdf.subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-8 dark:border-stone-800 dark:bg-stone-900">
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
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-stone-800 dark:text-white">{t('tools.word-to-pdf.doneTitle')}</p>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('tools.word-to-pdf.doneDescription')}</p>
            </div>
            <DownloadButton fileName="ONE_document.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
            >
              {t('tools.word-to-pdf.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
