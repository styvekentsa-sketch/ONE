import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, GripVertical, LayoutGrid, RotateCw, Trash2 } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import { loadPdfDocument, renderPageToCanvas } from '../../utils/pdfRender'
import { organizePdf } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  RENDERING: 'rendering',
  ORGANIZE: 'organize',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function OrganizePdfPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [pages, setPages] = useState([]) // [{ originalIndex, rotation, previewUrl }]
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const dragIndexRef = useRef(null)

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
      const items = []
      for (let i = 0; i < pdfDoc.numPages; i++) {
        const canvas = await renderPageToCanvas(pdfDoc, i + 1, 0.5)
        items.push({ originalIndex: i, rotation: 0, previewUrl: canvas.toDataURL('image/png') })
      }
      setPages(items)
      setStep(STEPS.ORGANIZE)
    } catch (err) {
      console.error(err)
      setError(t('common.corruptedPdf'))
      setStep(STEPS.UPLOAD)
    }
  }

  const rotatePage = (index) => {
    setPages((prev) => prev.map((p, i) => (i === index ? { ...p, rotation: (p.rotation + 90) % 360 } : p)))
  }

  const deletePage = (index) => {
    setPages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleDragStart = (index) => (e) => {
    dragIndexRef.current = index
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDrop = (index) => (e) => {
    e.preventDefault()
    const from = dragIndexRef.current
    dragIndexRef.current = null
    if (from === null || from === index) return

    setPages((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(index, 0, moved)
      return next
    })
  }

  const handleApply = async () => {
    if (pages.length === 0) {
      setError(t('tools.organize.errorNoPages'))
      return
    }
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await file.arrayBuffer()
      const bytes = await organizePdf(
        buffer,
        pages.map((p) => ({ index: p.originalIndex, rotation: p.rotation })),
      )
      const blob = new Blob([bytes], { type: 'application/pdf' })
      setDownloadUrl(URL.createObjectURL(blob))

      addHistoryEntry({
        toolId: 'organize',
        toolName: t('tools.organize.name'),
        message: `Pages réorganisées — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(err?.message || t('tools.organize.errorGeneric'))
      setStep(STEPS.ORGANIZE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setPages([])
    setDownloadUrl(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'ONE_organized.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

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
          <LayoutGrid size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.organize.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.organize.subtitle')}</p>
        </div>
      </div>

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
            hint={t('tools.organize.dropHint')}
          />
        )}

        {step === STEPS.RENDERING && (
          <ProcessingState
            icon={LayoutGrid}
            title={t('tools.organize.renderingTitle')}
            description={t('tools.organize.renderingDescription')}
          />
        )}

        {step === STEPS.ORGANIZE && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {pages.map((page, index) => (
                <div
                  key={page.originalIndex}
                  draggable
                  onDragStart={handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop(index)}
                  className="group relative cursor-grab overflow-hidden rounded-xl border-2 border-zinc-200 bg-white active:cursor-grabbing dark:border-white/10 dark:bg-zinc-800/40"
                >
                  <div className="flex items-center justify-between bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                    <span className="inline-flex items-center gap-1">
                      <GripVertical size={12} /> {index + 1}
                    </span>
                    <span>Page {page.originalIndex + 1}</span>
                  </div>

                  <div className="flex items-center justify-center overflow-hidden bg-zinc-50 p-3 dark:bg-zinc-950/40">
                    <img
                      src={page.previewUrl}
                      alt={`Page ${page.originalIndex + 1}`}
                      draggable={false}
                      style={{ transform: `rotate(${page.rotation}deg)` }}
                      className="max-h-40 w-auto transition-transform duration-200"
                    />
                  </div>

                  <div className="flex items-center justify-center gap-2 border-t border-zinc-100 bg-white px-2 py-1.5 dark:border-white/10 dark:bg-zinc-800/40">
                    <button
                      onClick={() => rotatePage(index)}
                      aria-label={t('tools.organize.rotatePage')}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
                    >
                      <RotateCw size={14} />
                    </button>
                    <button
                      onClick={() => deletePage(index)}
                      aria-label={t('tools.organize.deletePage')}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition-colors duration-200 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleApply}
              disabled={pages.length === 0}
              className="mx-auto inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <LayoutGrid size={18} /> {t('tools.organize.saveButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState icon={LayoutGrid} title={t('tools.organize.processingTitle')} duration={1000} />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.organize.doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.organize.doneDescription')}</p>
            </div>
            <DownloadButton fileName="ONE_organized.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.organize.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
