import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, Droplets } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { addWatermark } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function WatermarkPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [text, setText] = useState('CONFIDENTIEL')
  const [fontSize, setFontSize] = useState(48)
  const [opacity, setOpacity] = useState(30)
  const [rotation, setRotation] = useState(45)
  const [color, setColor] = useState('#808080')
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const downloadUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
  }, [])

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

  const handleApply = async () => {
    if (!text.trim()) {
      setError(t('tools.watermark.errorEmptyText'))
      return
    }
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await file.arrayBuffer()
      const bytes = await addWatermark(buffer, {
        text: text.trim(),
        fontSize,
        opacity: opacity / 100,
        rotation,
        color,
      })
      const blob = new Blob([bytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)
      setDownloadUrl(downloadUrlRef.current)

      addHistoryEntry({
        toolId: 'watermark',
        toolName: t('tools.watermark.name'),
        message: `Filigrane « ${text.trim()} » ajouté — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.watermark.errorGeneric'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setDownloadUrl(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'ONE_watermarked.pdf'
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
          <Droplets size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.watermark.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.watermark.subtitle')}</p>
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
            hint={t('tools.watermark.dropHint')}
          />
        )}

        {step === STEPS.CONFIGURE && file && (
          <div className="flex flex-col gap-6">
            <div>
              <label htmlFor="watermark-text" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('tools.watermark.textLabel')}
              </label>
              <input
                id="watermark-text"
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('tools.watermark.textPlaceholder')}
                className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none dark:border-white/10 dark:bg-zinc-800/40 dark:text-white"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label htmlFor="watermark-size" className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.watermark.size')}</span>
                  <span className="text-zinc-500 dark:text-zinc-300">{fontSize}pt</span>
                </label>
                <input
                  id="watermark-size"
                  type="range"
                  min={12}
                  max={96}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="watermark-opacity" className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.watermark.opacity')}</span>
                  <span className="text-zinc-500 dark:text-zinc-300">{opacity}%</span>
                </label>
                <input
                  id="watermark-opacity"
                  type="range"
                  min={5}
                  max={100}
                  value={opacity}
                  onChange={(e) => setOpacity(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="watermark-rotation" className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.watermark.angle')}</span>
                  <span className="text-zinc-500 dark:text-zinc-300">{rotation}°</span>
                </label>
                <input
                  id="watermark-rotation"
                  type="range"
                  min={0}
                  max={90}
                  value={rotation}
                  onChange={(e) => setRotation(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="watermark-color" className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.watermark.color')}</span>
                  <span className="text-zinc-500 dark:text-zinc-300">{color}</span>
                </label>
                <input
                  id="watermark-color"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-9 w-full cursor-pointer rounded-lg border border-zinc-200 bg-white p-1 dark:border-white/10 dark:bg-zinc-800/40"
                />
              </div>
            </div>

            <button
              onClick={handleApply}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <Droplets size={18} /> {t('tools.watermark.applyButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState icon={Droplets} title={t('tools.watermark.processingTitle')} duration={1000} />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.watermark.doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {t('tools.watermark.doneDescription', { text: text.trim() })}
              </p>
            </div>
            <DownloadButton fileName="ONE_watermarked.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.watermark.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
