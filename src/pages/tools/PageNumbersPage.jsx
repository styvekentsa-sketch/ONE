import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlignCenter, AlignLeft, AlignRight, ArrowLeft, CheckCircle2, Hash } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { addPageNumbers } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function PageNumbersPage() {
  const { t } = useTranslation()

  const FORMATS = [
    {
      id: 'page-of-total',
      template: t('tools.page-numbers.formatPageOfTotal'),
      sample: t('tools.page-numbers.formatPageOfTotal').replace('{n}', '1').replace('{total}', '10'),
    },
    {
      id: 'n-slash-total',
      template: t('tools.page-numbers.formatSlashTotal'),
      sample: t('tools.page-numbers.formatSlashTotal').replace('{n}', '1').replace('{total}', '10'),
    },
    {
      id: 'n-only',
      template: t('tools.page-numbers.formatNumberOnly'),
      sample: t('tools.page-numbers.formatNumberOnly').replace('{n}', '1'),
    },
  ]

  const POSITIONS = [
    { id: 'footer', label: t('tools.page-numbers.positionFooter') },
    { id: 'header', label: t('tools.page-numbers.positionHeader') },
  ]

  const ALIGNMENTS = [
    { id: 'left', label: t('tools.page-numbers.alignLeft'), icon: AlignLeft },
    { id: 'center', label: t('tools.page-numbers.alignCenter'), icon: AlignCenter },
    { id: 'right', label: t('tools.page-numbers.alignRight'), icon: AlignRight },
  ]

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [position, setPosition] = useState('footer')
  const [alignment, setAlignment] = useState('center')
  const [formatId, setFormatId] = useState('page-of-total')
  const [fontSize, setFontSize] = useState(10)
  const [margin, setMargin] = useState(24)
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
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const format = FORMATS.find((f) => f.id === formatId).template
      const buffer = await file.arrayBuffer()
      const bytes = await addPageNumbers(buffer, { position, alignment, format, fontSize, margin })
      const blob = new Blob([bytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)
      setDownloadUrl(downloadUrlRef.current)

      addHistoryEntry({
        toolId: 'page-numbers',
        toolName: t('tools.page-numbers.name'),
        message: `Numérotation ajoutée — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.page-numbers.errorGeneric'))
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
    link.download = 'ONE_numbered.pdf'
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
          <Hash size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.page-numbers.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.page-numbers.subtitle')}</p>
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
            hint={t('tools.page-numbers.dropHint')}
          />
        )}

        {step === STEPS.CONFIGURE && file && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('tools.page-numbers.position')}
              </p>
              <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
                {POSITIONS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPosition(p.id)}
                    className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                      position === p.id
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('tools.page-numbers.alignment')}
              </p>
              <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
                {ALIGNMENTS.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setAlignment(id)}
                    aria-label={label}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                      alignment === id
                        ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                        : 'text-zinc-500 dark:text-zinc-400'
                    }`}
                  >
                    <Icon size={14} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('tools.page-numbers.format')}
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                {FORMATS.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFormatId(f.id)}
                    className={`rounded-xl border-2 px-4 py-3 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                      formatId === f.id
                        ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-800/40 dark:text-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    {f.sample}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="page-numbers-size" className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.page-numbers.size')}</span>
                  <span className="text-zinc-500 dark:text-zinc-300">{fontSize}pt</span>
                </label>
                <input
                  id="page-numbers-size"
                  type="range"
                  min={6}
                  max={24}
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>

              <div>
                <label htmlFor="page-numbers-margin" className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.page-numbers.margin')}</span>
                  <span className="text-zinc-500 dark:text-zinc-300">{margin}pt</span>
                </label>
                <input
                  id="page-numbers-margin"
                  type="range"
                  min={10}
                  max={60}
                  value={margin}
                  onChange={(e) => setMargin(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>

            <button
              onClick={handleApply}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <Hash size={18} /> {t('tools.page-numbers.addButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState icon={Hash} title={t('tools.page-numbers.processingTitle')} duration={900} />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.page-numbers.doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.page-numbers.doneDescription')}</p>
            </div>
            <DownloadButton fileName="ONE_numbered.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.page-numbers.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
