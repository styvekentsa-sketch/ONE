import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, FileMinus2, Trash2 } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { loadPdfDocument, renderPageToCanvas } from '../../utils/pdfRender'
import { removePages } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  RENDERING: 'rendering',
  SELECT: 'select',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function DeletePagesPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [previews, setPreviews] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const [removedCount, setRemovedCount] = useState(0)

  const handleFiles = async (files) => {
    const [pdfFile] = files
    const isPdf = pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setFile(pdfFile)
    setStep(STEPS.RENDERING)

    try {
      const buffer = await pdfFile.arrayBuffer()
      const pdfDoc = await loadPdfDocument(buffer)
      const thumbnails = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const canvas = await renderPageToCanvas(pdfDoc, i, 0.5)
        thumbnails.push(canvas.toDataURL('image/png'))
      }
      setPreviews(thumbnails)
      setSelected(new Set())
      setStep(STEPS.SELECT)
    } catch (err) {
      console.error(err)
      setError(t('common.corruptedPdf'))
      setStep(STEPS.UPLOAD)
    }
  }

  const toggleSelected = (index) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleDownload = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await file.arrayBuffer()
      const bytes = await removePages(buffer, [...selected])
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)

      setDownloadUrl(url)
      setRemovedCount(selected.size)

      addHistoryEntry({
        toolId: 'delete-pages',
        toolName: t('tools.delete-pages.name'),
        message: `${selected.size} page${selected.size > 1 ? 's' : ''} supprimée${selected.size > 1 ? 's' : ''} — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.delete-pages.errorGeneric'))
      setStep(STEPS.SELECT)
    }
  }

  const handleRestart = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl)
    setFile(null)
    setPreviews([])
    setSelected(new Set())
    setDownloadUrl(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const triggerDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'ONE_pages_removed.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const allSelected = previews.length > 0 && selected.size === previews.length

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <FileMinus2 size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.delete-pages.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.delete-pages.subtitle')}</p>
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
            hint={t('tools.delete-pages.dropHint')}
          />
        )}

        {step === STEPS.RENDERING && (
          <ProcessingState
            icon={FileMinus2}
            title={t('tools.delete-pages.renderingTitle')}
            description={t('tools.delete-pages.renderingDescription')}
          />
        )}

        {step === STEPS.SELECT && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {previews.map((src, index) => {
                const isSelected = selected.has(index)
                return (
                  <button
                    key={index}
                    onClick={() => toggleSelected(index)}
                    className={`group relative overflow-hidden rounded-xl border-2 text-left transition-all duration-200 ease-in-out active:scale-[0.98] ${
                      isSelected
                        ? 'border-red-500'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-zinc-700'
                    }`}
                  >
                    <img
                      src={src}
                      alt={`Page ${index + 1}`}
                      className={`w-full transition-opacity duration-200 ${isSelected ? 'opacity-30' : ''}`}
                    />
                    {isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-red-500/10">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white">
                          <Trash2 size={16} />
                        </span>
                      </span>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-zinc-950/70 px-2 py-1 text-center text-[11px] font-medium text-white">
                      Page {index + 1}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-5 dark:border-white/10">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {selected.size === 0
                  ? t('tools.delete-pages.clickToRemoveHint')
                  : t('tools.delete-pages.pagesSelected', { count: selected.size })}
                {allSelected && ` ${t('tools.delete-pages.cannotRemoveAll')}`}
              </p>
              <button
                onClick={handleDownload}
                disabled={selected.size === 0 || allSelected}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-500"
              >
                <Trash2 size={18} /> {t('tools.delete-pages.downloadCleanButton')}
              </button>
            </div>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState icon={FileMinus2} title={t('tools.delete-pages.processingTitle')} duration={900} />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">
                {t('tools.delete-pages.doneTitle', { count: removedCount })}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.delete-pages.doneDescription')}</p>
            </div>
            <DownloadButton fileName="ONE_pages_removed.pdf" onDownload={triggerDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.delete-pages.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
