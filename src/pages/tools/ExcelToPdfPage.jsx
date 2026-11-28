import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import { convertExcelToPdf } from '../../utils/excelToPdf'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'

const STEPS = {
  UPLOAD: 'upload',
  PROCESSING: 'processing',
  DONE: 'done',
}

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

export default function ExcelToPdfPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [fileName, setFileName] = useState('')
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [truncatedColumns, setTruncatedColumns] = useState(false)
  const [error, setError] = useState(null)

  const handleFiles = async (files) => {
    const [sheetFile] = files
    const isSpreadsheet = ACCEPTED_EXTENSIONS.some((ext) => sheetFile.name.toLowerCase().endsWith(ext))
    if (!isSpreadsheet) {
      setError(t('tools.excel-to-pdf.errorInvalidFile'))
      return
    }
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const { bytes, truncatedColumns: wasTruncated } = await convertExcelToPdf(sheetFile)
      const blob = new Blob([bytes], { type: 'application/pdf' })
      setFileName(sheetFile.name)
      setTruncatedColumns(wasTruncated)
      setDownloadUrl(URL.createObjectURL(blob))

      addHistoryEntry({
        toolId: 'excel-to-pdf',
        toolName: t('tools.excel-to-pdf.name'),
        message: `Converti en PDF — ${sheetFile.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(
        err?.message === 'EMPTY_WORKBOOK'
          ? t('tools.excel-to-pdf.errorEmpty')
          : t('tools.excel-to-pdf.errorGeneric'),
      )
      setStep(STEPS.UPLOAD)
    }
  }

  const handleRestart = () => {
    setFileName('')
    setDownloadUrl(null)
    setTruncatedColumns(false)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${fileName.replace(/\.(xlsx|xls|csv)$/i, '') || 'ONE_tableur'}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm dark:bg-stone-800/80 dark:text-white">
          <FileSpreadsheet size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('tools.excel-to-pdf.name')}</h1>
          <p className="text-stone-500 dark:text-stone-400">{t('tools.excel-to-pdf.subtitle')}</p>
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
            accept=".xlsx,.xls,.csv"
            hint={t('tools.excel-to-pdf.dropHint')}
          />
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={FileSpreadsheet}
            title={t('tools.excel-to-pdf.processingTitle')}
            description={t('tools.excel-to-pdf.processingDescription')}
          />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-stone-800 dark:text-white">{t('tools.excel-to-pdf.doneTitle')}</p>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('tools.excel-to-pdf.doneDescription')}</p>
            </div>

            {truncatedColumns && (
              <div className="flex max-w-sm items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-left text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>{t('tools.excel-to-pdf.truncatedWarning')}</p>
              </div>
            )}

            <DownloadButton fileName="ONE_tableur.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
            >
              {t('tools.excel-to-pdf.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
