import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileArchive, Image as ImageIcon } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import { loadPdfDocument, renderPageToCanvas } from '../../utils/pdfRender'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'
import { saveFile } from '../../utils/download'

const STEPS = {
  UPLOAD: 'upload',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  RESULTS: 'results',
}

const FORMATS = [
  { id: 'png', label: 'PNG', mime: 'image/png', ext: 'png' },
  { id: 'jpeg', label: 'JPEG', mime: 'image/jpeg', ext: 'jpg' },
]

function canvasToBlob(canvas, mime, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}

function triggerDownload(blob, filename) {
  saveFile(blob, filename)
}

export default function PdfToImagePage() {
  const { t } = useTranslation()

  const RESOLUTIONS = [
    { id: '72', label: t('tools.pdf-to-jpg.dpi72'), hint: t('tools.pdf-to-jpg.dpi72Hint'), dpi: 72 },
    { id: '150', label: t('tools.pdf-to-jpg.dpi150'), hint: t('tools.pdf-to-jpg.dpi150Hint'), dpi: 150 },
    { id: '300', label: t('tools.pdf-to-jpg.dpi300'), hint: t('tools.pdf-to-jpg.dpi300Hint'), dpi: 300 },
  ]

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [format, setFormat] = useState('png')
  const [resolution, setResolution] = useState('150')
  const [previews, setPreviews] = useState([])
  const [error, setError] = useState(null)
  const [isZipping, setIsZipping] = useState(false)
  const canvasesRef = useRef([])

  const currentFormat = FORMATS.find((f) => f.id === format)

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

  const handleConvert = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const dpi = RESOLUTIONS.find((r) => r.id === resolution).dpi
      const scale = dpi / 72
      const buffer = await file.arrayBuffer()
      const pdfDoc = await loadPdfDocument(buffer)
      const canvases = []
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        canvases.push(await renderPageToCanvas(pdfDoc, i, scale))
      }
      canvasesRef.current = canvases
      setPreviews(canvases.map((canvas) => canvas.toDataURL('image/png')))

      addHistoryEntry({
        toolId: 'pdf-to-jpg',
        toolName: t('tools.pdf-to-jpg.name'),
        message: `Conversion en images (${dpi} DPI) — ${canvases.length} page${canvases.length > 1 ? 's' : ''} (${file.name})`,
      })

      setStep(STEPS.RESULTS)
    } catch (err) {
      console.error(err)
      setError(t('tools.pdf-to-jpg.errorGeneric'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleDownloadPage = async (index) => {
    const blob = await canvasToBlob(canvasesRef.current[index], currentFormat.mime, 0.92)
    triggerDownload(blob, `ONE_page-${index + 1}.${currentFormat.ext}`)
  }

  const handleDownloadZip = async () => {
    setIsZipping(true)
    try {
      // Chargé à la demande : la plupart des visiteurs n'exportent jamais
      // en ZIP, inutile d'alourdir le chunk de la page pour ça.
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()

      for (let i = 0; i < canvasesRef.current.length; i++) {
        const blob = await canvasToBlob(canvasesRef.current[i], currentFormat.mime, 0.92)
        zip.file(`ONE_page-${i + 1}.${currentFormat.ext}`, blob)
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      triggerDownload(zipBlob, 'ONE_pages.zip')
    } catch (err) {
      console.error(err)
      setError(t('tools.pdf-to-jpg.errorZip'))
    } finally {
      setIsZipping(false)
    }
  }

  const handleRestart = () => {
    canvasesRef.current = []
    setFile(null)
    setPreviews([])
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm dark:bg-stone-800/80 dark:text-white">
          <ImageIcon size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('tools.pdf-to-jpg.name')}</h1>
          <p className="text-stone-500 dark:text-stone-400">{t('tools.pdf-to-jpg.subtitle')}</p>
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
            accept="application/pdf"
            hint={t('tools.pdf-to-jpg.dropHint')}
          />
        )}

        {step === STEPS.CONFIGURE && file && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3 rounded-xl bg-stone-100 px-4 py-3 dark:bg-stone-800/60">
              <ImageIcon size={18} className="shrink-0 text-stone-500 dark:text-stone-400" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-700 dark:text-stone-200">
                {file.name}
              </span>
            </div>

            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                {t('tools.pdf-to-jpg.resolution')}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {RESOLUTIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setResolution(r.id)}
                    className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all duration-200 ease-in-out active:scale-[0.98] ${
                      resolution === r.id
                        ? 'border-brand-500 bg-brand-500/5'
                        : 'border-stone-200 bg-white hover:border-stone-300 dark:border-white/10 dark:bg-stone-800/40 dark:hover:border-stone-700'
                    }`}
                  >
                    <span
                      className={`text-sm font-semibold ${
                        resolution === r.id ? 'text-brand-600 dark:text-brand-400' : 'text-stone-800 dark:text-stone-100'
                      }`}
                    >
                      {r.label}
                    </span>
                    <span className="text-xs text-stone-500 dark:text-stone-400">{r.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleConvert}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
            >
              <ImageIcon size={18} /> {t('tools.pdf-to-jpg.convertButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={ImageIcon}
            title={t('tools.pdf-to-jpg.renderingTitle')}
            description={t('tools.pdf-to-jpg.renderingDescription')}
          />
        )}

        {step === STEPS.RESULTS && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-full border border-stone-200 bg-stone-100 p-1 dark:border-white/10 dark:bg-stone-800/60">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormat(f.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                      format === f.id
                        ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <button
                onClick={handleDownloadZip}
                disabled={isZipping}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileArchive size={16} />
                {isZipping
                  ? t('tools.pdf-to-jpg.zipping')
                  : t('tools.pdf-to-jpg.exportZipButton', { format: currentFormat.label })}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {previews.map((src, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50 dark:border-white/10 dark:bg-stone-950/40"
                >
                  <img src={src} alt={`Page ${index + 1}`} className="w-full" />
                  <div className="flex items-center justify-between px-3 py-2 text-xs text-stone-500 dark:text-stone-400">
                    <span>Page {index + 1}</span>
                    <button
                      onClick={() => handleDownloadPage(index)}
                      aria-label={t('tools.pdf-to-jpg.downloadPageLabel', { n: index + 1 })}
                      className="text-brand-500 transition-colors duration-200 hover:text-brand-400 dark:text-brand-400"
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={handleRestart}
              className="mx-auto text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
            >
              {t('tools.pdf-to-jpg.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
