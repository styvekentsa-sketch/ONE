import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowLeft, ArrowUp, CheckCircle2, FileImage, X } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { imagesToPdf } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  REVIEW: 'review',
  PROCESSING: 'processing',
  DONE: 'done',
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function JpgToPdfPage() {
  const { t } = useTranslation()

  const PAGE_SIZES = [
    { id: 'a4', label: t('tools.jpg-to-pdf.pageFormatA4') },
    { id: 'original', label: t('tools.jpg-to-pdf.pageFormatOriginal') },
  ]

  const ORIENTATIONS = [
    { id: 'portrait', label: t('tools.jpg-to-pdf.orientationPortrait') },
    { id: 'landscape', label: t('tools.jpg-to-pdf.orientationLandscape') },
  ]

  const MARGINS = [
    { id: 'none', label: t('tools.jpg-to-pdf.marginsNone') },
    { id: 'small', label: t('tools.jpg-to-pdf.marginsSmall') },
    { id: 'large', label: t('tools.jpg-to-pdf.marginsLarge') },
  ]

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [images, setImages] = useState([])
  const [pageSize, setPageSize] = useState('a4')
  const [orientation, setOrientation] = useState('portrait')
  const [margin, setMargin] = useState('none')
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const downloadUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
  }, [])

  const handleFiles = (files) => {
    const invalid = files.find((f) => !ACCEPTED_TYPES.includes(f.type))
    if (invalid) {
      setError(t('tools.jpg-to-pdf.errorInvalid'))
      return
    }
    setError(null)
    setImages((prev) => [...prev, ...files])
    setStep(STEPS.REVIEW)
  }

  const removeImage = (index) => {
    setImages((prev) => {
      const next = prev.filter((_, i) => i !== index)
      if (next.length === 0) setStep(STEPS.UPLOAD)
      return next
    })
  }

  const moveImage = (index, direction) => {
    setImages((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  const handleGenerate = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const bytes = await imagesToPdf(images, { pageSize, orientation, margin })
      const blob = new Blob([bytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)
      setDownloadUrl(downloadUrlRef.current)

      addHistoryEntry({
        toolId: 'jpg-to-pdf',
        toolName: t('tools.jpg-to-pdf.name'),
        message: `PDF généré à partir de ${images.length} image${images.length > 1 ? 's' : ''}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(err?.message || t('tools.jpg-to-pdf.errorGeneric'))
      setStep(STEPS.REVIEW)
    }
  }

  const handleRestart = () => {
    setImages([])
    setDownloadUrl(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'ONE_images.pdf'
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
          <FileImage size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.jpg-to-pdf.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.jpg-to-pdf.subtitle')}</p>
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
            accept="image/jpeg,image/png,image/webp"
            hint={t('tools.jpg-to-pdf.dropHint')}
          />
        )}

        {step === STEPS.REVIEW && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {images.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-white/10 dark:bg-zinc-950/40"
                >
                  <img
                    src={URL.createObjectURL(file)}
                    alt={file.name}
                    className="aspect-square w-full object-cover"
                  />
                  <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-950/70 text-[10px] font-semibold text-white">
                    {index + 1}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-zinc-950/70 py-1">
                    <button
                      onClick={() => moveImage(index, -1)}
                      disabled={index === 0}
                      aria-label={t('common.moveUp')}
                      className="rounded p-1 text-white transition-opacity duration-200 hover:opacity-80 disabled:opacity-30"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      onClick={() => moveImage(index, 1)}
                      disabled={index === images.length - 1}
                      aria-label={t('common.moveDown')}
                      className="rounded p-1 text-white transition-opacity duration-200 hover:opacity-80 disabled:opacity-30"
                    >
                      <ArrowDown size={12} />
                    </button>
                    <button
                      onClick={() => removeImage(index)}
                      aria-label={t('actions.remove')}
                      className="rounded p-1 text-white transition-opacity duration-200 hover:opacity-80"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <DragDropZone
              onFiles={handleFiles}
              accept="image/jpeg,image/png,image/webp"
              label={t('tools.jpg-to-pdf.addMoreImages')}
              hint=" "
              className="p-6"
            />

            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('tools.jpg-to-pdf.pageFormat')}
                </p>
                <div className="flex flex-col gap-1.5">
                  {PAGE_SIZES.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPageSize(p.id)}
                      className={`rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                        pageSize === p.id
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
                          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={pageSize === 'original' ? 'opacity-40' : ''}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('tools.jpg-to-pdf.orientation')}
                </p>
                <div className="flex flex-col gap-1.5">
                  {ORIENTATIONS.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => setOrientation(o.id)}
                      disabled={pageSize === 'original'}
                      className={`rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] disabled:cursor-not-allowed ${
                        orientation === o.id
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
                          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  {t('tools.jpg-to-pdf.margins')}
                </p>
                <div className="flex flex-col gap-1.5">
                  {MARGINS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setMargin(m.id)}
                      className={`rounded-lg border-2 px-3 py-2 text-left text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                        margin === m.id
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
                          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <FileImage size={18} /> {t('tools.jpg-to-pdf.generateButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={FileImage}
            title={t('tools.jpg-to-pdf.processingTitle')}
            description={t('tools.jpg-to-pdf.processingDescription')}
          />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.jpg-to-pdf.doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {t('tools.jpg-to-pdf.doneDescription', { count: images.length })}
              </p>
            </div>
            <DownloadButton fileName="ONE_images.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.jpg-to-pdf.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
