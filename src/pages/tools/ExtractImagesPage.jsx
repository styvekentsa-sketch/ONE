import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Download, FileArchive, ImageOff, Images } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import PrivacyBadge from '../../components/PrivacyBadge'
import { extractImages } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  PROCESSING: 'processing',
  RESULTS: 'results',
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function ExtractImagesPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [images, setImages] = useState([])
  const [unsupportedCount, setUnsupportedCount] = useState(0)
  const [error, setError] = useState(null)
  const [isZipping, setIsZipping] = useState(false)
  const objectUrlsRef = useRef([])

  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
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
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await pdfFile.arrayBuffer()
      const { images: found, unsupportedCount: skipped } = await extractImages(buffer)

      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      const withUrls = found.map((img, i) => {
        const blob = new Blob([img.bytes], { type: img.mime })
        const url = URL.createObjectURL(blob)
        objectUrlsRef.current.push(url)
        return { ...img, url, id: i }
      })

      setImages(withUrls)
      setUnsupportedCount(skipped)

      addHistoryEntry({
        toolId: 'extract-images',
        toolName: t('tools.extract-images.name'),
        message: `${found.length} image(s) extraite(s) — ${pdfFile.name}`,
      })

      setStep(STEPS.RESULTS)
    } catch (err) {
      console.error(err)
      setError(t('tools.extract-images.errorGeneric'))
      setStep(STEPS.UPLOAD)
    }
  }

  const handleDownloadOne = (img, index) => {
    const blob = new Blob([img.bytes], { type: img.mime })
    triggerDownload(blob, `ONE_image-${index + 1}.${img.ext}`)
  }

  const handleDownloadZip = async () => {
    setIsZipping(true)
    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      images.forEach((img, i) => {
        zip.file(`ONE_image-${i + 1}.${img.ext}`, img.bytes)
      })
      const zipBlob = await zip.generateAsync({ type: 'blob' })
      triggerDownload(zipBlob, 'ONE_images.zip')
    } catch (err) {
      console.error(err)
      setError(t('tools.extract-images.errorZip'))
    } finally {
      setIsZipping(false)
    }
  }

  const handleRestart = () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    objectUrlsRef.current = []
    setImages([])
    setUnsupportedCount(0)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Images size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.extract-images.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.extract-images.subtitle')}</p>
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
            hint={t('tools.extract-images.dropHint')}
          />
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={Images}
            title={t('tools.extract-images.processingTitle')}
            description={t('tools.extract-images.processingDescription')}
          />
        )}

        {step === STEPS.RESULTS && (
          <div className="flex flex-col gap-6">
            {unsupportedCount > 0 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                <p>{t('tools.extract-images.unsupportedWarning', { count: unsupportedCount })}</p>
              </div>
            )}

            {images.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center text-zinc-400">
                <ImageOff size={32} />
                <p className="text-sm">{t('tools.extract-images.noImagesFound')}</p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t('tools.extract-images.imagesFound', { count: images.length })}
                  </p>
                  <button
                    onClick={handleDownloadZip}
                    disabled={isZipping}
                    className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FileArchive size={16} />
                    {isZipping ? t('tools.extract-images.zipping') : t('tools.extract-images.downloadAllZip')}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                  {images.map((img, index) => (
                    <div
                      key={img.id}
                      className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950/40"
                    >
                      <img src={img.url} alt={`Image ${index + 1}`} className="aspect-square w-full object-contain bg-white dark:bg-zinc-900" />
                      <div className="flex items-center justify-between px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>Page {img.pageIndex + 1}</span>
                        <button
                          onClick={() => handleDownloadOne(img, index)}
                          aria-label={`${t('actions.download')} ${index + 1}`}
                          className="text-indigo-500 transition-colors duration-200 hover:text-indigo-400 dark:text-indigo-400"
                        >
                          <Download size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <button
              onClick={handleRestart}
              className="mx-auto text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.extract-images.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
