import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CheckCircle2, EyeOff } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import { redactPdf } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'
import { saveFile } from '../../utils/download'

const STEPS = {
  UPLOAD: 'upload',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

export default function AutoRedactPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [redactEmails, setRedactEmails] = useState(true)
  const [redactPhones, setRedactPhones] = useState(true)
  const [keywordsInput, setKeywordsInput] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
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

  const handleGenerate = async () => {
    const keywords = keywordsInput
      .split(/[\n,]/)
      .map((word) => word.trim())
      .filter(Boolean)

    if (!redactEmails && !redactPhones && keywords.length === 0) {
      setError(t('tools.auto-redact.errorNoOption'))
      return
    }

    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await file.arrayBuffer()
      const { bytes, redactionCount } = await redactPdf(buffer, {
        redactEmails,
        redactPhones,
        keywords,
      })
      const blob = new Blob([bytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)

      setResult({ url: downloadUrlRef.current, redactionCount })

      addHistoryEntry({
        toolId: 'auto-redact',
        toolName: t('tools.auto-redact.name'),
        message: `Censure automatique — ${redactionCount} zone${redactionCount > 1 ? 's' : ''} masquée${redactionCount > 1 ? 's' : ''} (${file.name})`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.auto-redact.errorGeneric'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setKeywordsInput('')
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!result) return
    saveFile(result.url, 'ONE_redacted.pdf')
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm dark:bg-stone-800/80 dark:text-white">
          <EyeOff size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('tools.auto-redact.name')}</h1>
          <p className="text-stone-500 dark:text-stone-400">{t('tools.auto-redact.subtitle')}</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" />
        <p>{t('tools.auto-redact.warning')}</p>
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
            hint={t('tools.auto-redact.dropHint')}
          />
        )}

        {step === STEPS.CONFIGURE && file && (
          <div className="flex flex-col gap-6">
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                {t('tools.auto-redact.whatToHide')}
              </p>
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 transition-colors duration-200 hover:border-stone-300 dark:border-white/10 dark:bg-stone-800/40 dark:text-stone-200 dark:hover:border-stone-700">
                  <input
                    type="checkbox"
                    checked={redactEmails}
                    onChange={(e) => setRedactEmails(e.target.checked)}
                    className="h-4 w-4 rounded accent-brand-500"
                  />
                  {t('tools.auto-redact.emails')}
                </label>
                <label className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-700 transition-colors duration-200 hover:border-stone-300 dark:border-white/10 dark:bg-stone-800/40 dark:text-stone-200 dark:hover:border-stone-700">
                  <input
                    type="checkbox"
                    checked={redactPhones}
                    onChange={(e) => setRedactPhones(e.target.checked)}
                    className="h-4 w-4 rounded accent-brand-500"
                  />
                  {t('tools.auto-redact.phones')}
                </label>
              </div>
            </div>

            <div>
              <label htmlFor="keywords" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                {t('tools.auto-redact.customWords')}
              </label>
              <textarea
                id="keywords"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder={t('tools.auto-redact.customWordsPlaceholder')}
                rows={3}
                className="w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-500 dark:placeholder:text-stone-400 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-stone-800/40 dark:text-white"
              />
            </div>

            <button
              onClick={handleGenerate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
            >
              <EyeOff size={18} /> {t('tools.auto-redact.generateButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={EyeOff}
            title={t('tools.auto-redact.processingTitle')}
            description={t('tools.auto-redact.processingDescription')}
          />
        )}

        {step === STEPS.DONE && result && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-stone-800 dark:text-white">
                {result.redactionCount > 0
                  ? t('tools.auto-redact.zonesHidden', { count: result.redactionCount })
                  : t('tools.auto-redact.noMatchTitle')}
              </p>
              <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
                {result.redactionCount > 0
                  ? t('tools.auto-redact.zonesHiddenDescription')
                  : t('tools.auto-redact.noMatchDescription')}
              </p>
            </div>
            <DownloadButton fileName="ONE_redacted.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
            >
              {t('tools.auto-redact.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
