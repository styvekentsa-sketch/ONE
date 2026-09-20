import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Check, CheckCircle2, FileArchive, Files, Scissors } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { loadPdfDocument, renderPageToCanvas } from '../../utils/pdfRender'
import { extractPages, splitPdfToPages } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  RENDERING: 'rendering',
  SELECT: 'select',
  PROCESSING: 'processing',
  DONE: 'done',
}

/** "1-3, 5, 8-10" -> [1,2,3,5,8,9,10] (dédupliqué, trié, borné à maxPage). */
function parsePageRanges(input, maxPage) {
  const result = new Set()
  const parts = input.split(',').map((p) => p.trim()).filter(Boolean)

  for (const part of parts) {
    const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      let start = Number(rangeMatch[1])
      let end = Number(rangeMatch[2])
      if (start > end) [start, end] = [end, start]
      for (let i = start; i <= end; i++) {
        if (i >= 1 && i <= maxPage) result.add(i)
      }
    } else if (/^\d+$/.test(part)) {
      const n = Number(part)
      if (n >= 1 && n <= maxPage) result.add(n)
    }
  }

  return [...result].sort((a, b) => a - b)
}

/** [1,2,3,5,8,9,10] -> "1-3, 5, 8-10" */
function formatRanges(pages) {
  const sorted = [...pages].sort((a, b) => a - b)
  const ranges = []
  let start = null
  let prev = null

  for (const n of sorted) {
    if (start === null) {
      start = n
      prev = n
      continue
    }
    if (n === prev + 1) {
      prev = n
      continue
    }
    ranges.push(start === prev ? `${start}` : `${start}-${prev}`)
    start = n
    prev = n
  }
  if (start !== null) ranges.push(start === prev ? `${start}` : `${start}-${prev}`)

  return ranges.join(', ')
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

export default function SplitPdfPage() {
  const { t } = useTranslation()
  const MODES = [
    { id: 'extract', label: t('tools.split.modeExtract'), icon: Scissors },
    { id: 'split-all', label: t('tools.split.modeSplitAll'), icon: Files },
  ]

  const [step, setStep] = useState(STEPS.UPLOAD)
  const [mode, setMode] = useState('extract')
  const [file, setFile] = useState(null)
  const [previews, setPreviews] = useState([])
  const [selectedPages, setSelectedPages] = useState(new Set())
  const [rangeInput, setRangeInput] = useState('')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

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
      setSelectedPages(new Set())
      setRangeInput('')
      setStep(STEPS.SELECT)
    } catch (err) {
      console.error(err)
      setError(t('common.corruptedPdf'))
      setStep(STEPS.UPLOAD)
    }
  }

  const togglePage = (n) => {
    setSelectedPages((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      setRangeInput(formatRanges(next))
      return next
    })
  }

  const applyRangeInput = () => {
    const parsed = parsePageRanges(rangeInput, previews.length)
    setSelectedPages(new Set(parsed))
    setRangeInput(formatRanges(parsed))
  }

  const handleExtract = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      // Conversion UI (base 1) vers pdf-lib (base 0), dans l'ordre croissant.
      const zeroBasedIndexes = [...selectedPages].sort((a, b) => a - b).map((p) => p - 1)
      const buffer = await file.arrayBuffer()
      const bytes = await extractPages(buffer, zeroBasedIndexes)
      const blob = new Blob([bytes], { type: 'application/pdf' })

      setResult({ kind: 'single', blob })

      addHistoryEntry({
        toolId: 'split',
        toolName: t('tools.split.name'),
        message: `${zeroBasedIndexes.length} page(s) extraite(s) — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(err?.message || t('tools.split.errorExtract'))
      setStep(STEPS.SELECT)
    }
  }

  const handleSplitAll = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await file.arrayBuffer()
      const pages = await splitPdfToPages(buffer)

      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      pages.forEach((bytes, i) => {
        zip.file(`page_${i + 1}.pdf`, bytes)
      })
      const zipBlob = await zip.generateAsync({ type: 'blob' })

      setResult({ kind: 'zip', blob: zipBlob, count: pages.length })

      addHistoryEntry({
        toolId: 'split',
        toolName: t('tools.split.name'),
        message: `Éclaté en ${pages.length} fichiers — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.split.errorSplit'))
      setStep(STEPS.SELECT)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setPreviews([])
    setSelectedPages(new Set())
    setRangeInput('')
    setResult(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!result) return
    triggerDownload(result.blob, result.kind === 'zip' ? 'ONE_pages.zip' : 'ONE_extracted.pdf')
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
          <Scissors size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.split.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.split.subtitle')}</p>
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
            hint={t('tools.split.dropHint')}
          />
        )}

        {step === STEPS.RENDERING && (
          <ProcessingState
            icon={Scissors}
            title={t('tools.split.renderingTitle')}
            description={t('tools.split.renderingDescription')}
          />
        )}

        {step === STEPS.SELECT && (
          <div className="flex flex-col gap-6">
            <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
              {MODES.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                    mode === id
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>

            {mode === 'extract' && (
              <div>
                <label htmlFor="page-ranges" className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('tools.split.pagesToKeep')}
                </label>
                <div className="flex gap-2">
                  <input
                    id="page-ranges"
                    type="text"
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    onBlur={applyRangeInput}
                    onKeyDown={(e) => e.key === 'Enter' && applyRangeInput()}
                    placeholder={t('tools.split.rangePlaceholder')}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none dark:border-white/10 dark:bg-zinc-800/40 dark:text-white"
                  />
                  <button
                    onClick={applyRangeInput}
                    className="shrink-0 rounded-xl border border-zinc-200 px-4 text-sm font-medium text-zinc-600 transition-colors duration-200 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-300 dark:hover:border-zinc-700"
                  >
                    {t('actions.apply')}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {previews.map((src, index) => {
                const pageNumber = index + 1
                const isSelected = selectedPages.has(pageNumber)
                return (
                  <button
                    key={index}
                    onClick={() => mode === 'extract' && togglePage(pageNumber)}
                    disabled={mode !== 'extract'}
                    className={`group relative overflow-hidden rounded-xl border-2 text-left transition-all duration-200 ease-in-out ${
                      mode === 'extract' ? 'active:scale-[0.98]' : 'cursor-default'
                    } ${
                      mode === 'extract' && isSelected
                        ? 'border-emerald-500'
                        : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-zinc-700'
                    }`}
                  >
                    <img src={src} alt={`Page ${pageNumber}`} className="w-full" />
                    {mode === 'extract' && isSelected && (
                      <span className="absolute inset-0 flex items-center justify-center bg-emerald-500/10">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check size={16} />
                        </span>
                      </span>
                    )}
                    <span className="absolute bottom-0 left-0 right-0 bg-zinc-950/70 px-2 py-1 text-center text-[11px] font-medium text-white">
                      Page {pageNumber}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col items-center gap-2 border-t border-zinc-100 pt-5 dark:border-white/10">
              {mode === 'extract' ? (
                <>
                  <button
                    onClick={handleExtract}
                    disabled={selectedPages.size === 0}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-500"
                  >
                    <Scissors size={18} /> {t('tools.split.extractButton')}
                  </button>
                  <p className="text-xs text-zinc-400">
                    {selectedPages.size === 0
                      ? t('tools.split.checkPagesHint')
                      : t('tools.split.pagesSelected', { count: selectedPages.size })}
                  </p>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSplitAll}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
                  >
                    <FileArchive size={18} /> {t('tools.split.downloadZipButton', { count: previews.length })}
                  </button>
                  <p className="text-xs text-zinc-400">{t('tools.split.splitAllHint')}</p>
                </>
              )}
            </div>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={mode === 'extract' ? Scissors : Files}
            title={mode === 'extract' ? t('tools.split.extractingTitle') : t('tools.split.splittingTitle')}
            description={
              mode === 'extract' ? t('tools.split.extractingDescription') : t('tools.split.splittingDescription')
            }
          />
        )}

        {step === STEPS.DONE && result && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">
                {result.kind === 'zip' ? t('tools.split.splitDoneTitle') : t('tools.split.extractDoneTitle')}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                {result.kind === 'zip'
                  ? t('tools.split.splitDoneDescription', { count: result.count })
                  : t('tools.split.extractDoneDescription')}
              </p>
            </div>
            <DownloadButton
              fileName={result.kind === 'zip' ? 'ONE_pages.zip' : 'ONE_extracted.pdf'}
              onDownload={handleDownload}
            />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.split.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
