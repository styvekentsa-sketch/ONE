import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, FileText, GitCompareArrows, X } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import PrivacyBadge from '../../components/PrivacyBadge'
import { comparePdfs } from '../../utils/pdfDiff'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  PROCESSING: 'processing',
  RESULTS: 'results',
}

function FileSlot({ label, file, onFiles, onClear, dropLabel, t }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-800/40">
          <FileText size={18} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {file.name}
          </span>
          <button
            onClick={onClear}
            aria-label={`${t('actions.remove')} ${label}`}
            className="shrink-0 text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={16} />
          </button>
        </div>
      ) : (
        <DragDropZone onFiles={onFiles} multiple={false} accept="application/pdf" label={dropLabel} hint=" " className="p-6" />
      )}
    </div>
  )
}

export default function ComparePdfPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [fileA, setFileA] = useState(null)
  const [fileB, setFileB] = useState(null)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const validatePdf = (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

  const handleCompare = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)
    try {
      const [bufferA, bufferB] = await Promise.all([fileA.arrayBuffer(), fileB.arrayBuffer()])
      const comparison = await comparePdfs(bufferA, bufferB)
      setResult(comparison)

      addHistoryEntry({
        toolId: 'compare',
        toolName: t('tools.compare.name'),
        message: `Comparaison ${fileA.name} / ${fileB.name} — ${comparison.diffCount} page(s) différente(s)`,
      })

      setStep(STEPS.RESULTS)
    } catch (err) {
      console.error(err)
      setError(t('tools.compare.errorGeneric'))
      setStep(STEPS.UPLOAD)
    }
  }

  const handleRestart = () => {
    setFileA(null)
    setFileB(null)
    setResult(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <GitCompareArrows size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.compare.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.compare.subtitle')}</p>
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
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FileSlot
                t={t}
                label={t('tools.compare.originalLabel')}
                dropLabel={t('tools.compare.dropPdf')}
                file={fileA}
                onClear={() => setFileA(null)}
                onFiles={([f]) => (validatePdf(f) ? setFileA(f) : setError(t('tools.compare.errorInvalid')))}
              />
              <FileSlot
                t={t}
                label={t('tools.compare.modifiedLabel')}
                dropLabel={t('tools.compare.dropPdf')}
                file={fileB}
                onClear={() => setFileB(null)}
                onFiles={([f]) => (validatePdf(f) ? setFileB(f) : setError(t('tools.compare.errorInvalid')))}
              />
            </div>

            <button
              onClick={handleCompare}
              disabled={!fileA || !fileB}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-indigo-500"
            >
              <GitCompareArrows size={18} /> {t('tools.compare.compareButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState
            icon={GitCompareArrows}
            title={t('tools.compare.processingTitle')}
            description={t('tools.compare.processingDescription')}
          />
        )}

        {step === STEPS.RESULTS && result && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3 rounded-xl bg-zinc-100 px-4 py-3 text-sm dark:bg-zinc-800/60">
              {result.diffCount === 0 ? (
                <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
              ) : (
                <GitCompareArrows size={18} className="shrink-0 text-amber-500" />
              )}
              <span className="text-zinc-600 dark:text-zinc-300">
                {t('tools.compare.originalLabel')} :{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {t('tools.compare.pageCount', { count: result.pageCountA })}
                </strong>
                {' · '}
                {t('tools.compare.modifiedLabel')} :{' '}
                <strong className="text-zinc-900 dark:text-white">
                  {t('tools.compare.pageCount', { count: result.pageCountB })}
                </strong>
                {' · '}
                {result.diffCount === 0 ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {t('tools.compare.noDifference')}
                  </span>
                ) : (
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    {t('tools.compare.differentPages', { count: result.diffCount })}
                  </span>
                )}
              </span>
            </div>

            <div className="sticky top-0 z-10 grid grid-cols-2 gap-4 rounded-lg bg-white/90 py-1 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400 backdrop-blur-sm dark:bg-zinc-900/90">
              <span>{t('tools.compare.originalLabel')}</span>
              <span>{t('tools.compare.modifiedLabel')}</span>
            </div>

            {/* Une ligne par numéro de page : les deux côtés partagent la
                même rangée de grille, donc la même hauteur — impossible
                qu'une colonne s'écrase ou se désynchronise de l'autre. */}
            <div className="flex flex-col gap-6">
              {result.pairs.map((pair) => (
                <div key={pair.pageNumber} className="grid grid-cols-2 gap-4">
                  <PagePreview pageNumber={pair.pageNumber} image={pair.imageA} isDifferent={pair.isDifferent} t={t} />
                  <PagePreview pageNumber={pair.pageNumber} image={pair.imageB} isDifferent={pair.isDifferent} t={t} />
                </div>
              ))}
            </div>

            <button
              onClick={handleRestart}
              className="mx-auto text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.compare.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PagePreview({ pageNumber, image, isDifferent, t }) {
  return (
    <div
      className={`flex flex-col overflow-hidden rounded-lg border-2 bg-white dark:bg-zinc-900 ${
        isDifferent ? 'border-amber-400/70' : 'border-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        <span>Page {pageNumber}</span>
        {isDifferent ? (
          <span className="text-amber-500">{t('tools.compare.different')}</span>
        ) : (
          <span className="text-emerald-500">{t('tools.compare.identical')}</span>
        )}
      </div>

      {/* Ratio et hauteur minimale fixes : chaque case (image réelle ou
          bloc "page inexistante") occupe toujours le même espace, quel
          que soit le nombre de pages de l'autre document. */}
      <div className="aspect-[1/1.41] min-h-[350px] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-950/40">
        {image ? (
          <img
            src={image}
            alt={`Page ${pageNumber}`}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            {t('tools.compare.missingPage')}
          </div>
        )}
      </div>
    </div>
  )
}
