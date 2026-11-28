import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Download, FileText } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import { extractAllText } from '../../utils/pdfRender'
import { addHistoryEntry } from '../../utils/historyStorage'
import BackButton from '../../components/ui/BackButton'

const STEPS = {
  UPLOAD: 'upload',
  PROCESSING: 'processing',
  RESULTS: 'results',
}

export default function PdfToTextPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [fileName, setFileName] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

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
      const pages = await extractAllText(buffer)
      const fullText = pages
        .map((pageText, i) => `--- ${t('tools.pdf-to-text.pageLabel', { n: i + 1 })} ---\n${pageText || t('tools.pdf-to-text.emptyPage')}`)
        .join('\n\n')

      setFileName(pdfFile.name)
      setText(fullText)

      addHistoryEntry({
        toolId: 'pdf-to-text',
        toolName: t('tools.pdf-to-text.name'),
        message: `Texte extrait — ${pdfFile.name} (${pages.length} pages)`,
      })

      setStep(STEPS.RESULTS)
    } catch (err) {
      console.error(err)
      setError(t('tools.pdf-to-text.errorGeneric'))
      setStep(STEPS.UPLOAD)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error(err)
      setError(t('tools.pdf-to-text.errorCopy'))
    }
  }

  const handleDownload = () => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileName.replace(/\.pdf$/i, '') || 'ONE_texte'}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const handleRestart = () => {
    setFileName('')
    setText('')
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm dark:bg-stone-800/80 dark:text-white">
          <FileText size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('tools.pdf-to-text.name')}</h1>
          <p className="text-stone-500 dark:text-stone-400">{t('tools.pdf-to-text.subtitle')}</p>
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
            hint={t('tools.pdf-to-text.dropHint')}
          />
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={FileText}
            title={t('tools.pdf-to-text.processingTitle')}
            description={t('tools.pdf-to-text.processingDescription')}
          />
        )}

        {step === STEPS.RESULTS && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-stone-700 dark:text-stone-200">{fileName}</p>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 transition-all duration-200 ease-in-out hover:border-stone-300 active:scale-[0.98] dark:border-white/10 dark:text-stone-300 dark:hover:border-stone-700"
                >
                  {copied ? <Check size={14} className="text-brand-500" /> : <Copy size={14} />}
                  {copied ? t('tools.pdf-to-text.copiedLabel') : t('tools.pdf-to-text.copyButton')}
                </button>
                <button
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
                >
                  <Download size={14} />
                  {t('tools.pdf-to-text.downloadTxtButton')}
                </button>
              </div>
            </div>

            <textarea
              readOnly
              value={text}
              className="h-96 w-full resize-y rounded-xl border border-stone-200 bg-stone-50 p-4 font-mono text-xs text-stone-700 focus:border-brand-400 focus:outline-none dark:border-white/10 dark:bg-stone-950/40 dark:text-stone-300"
            />

            <button
              onClick={handleRestart}
              className="mx-auto text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
            >
              {t('tools.pdf-to-text.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
