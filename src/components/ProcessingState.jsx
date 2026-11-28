import { useTranslation } from 'react-i18next'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import ProgressBar from './ProgressBar'

/** État « traitement en cours » : icône, titre, détail et progression. */
export default function ProcessingState({ icon: Icon, title, description, duration = 1700 }) {
  const { t } = useTranslation()
  const progress = useSimulatedProgress(true, duration)
  const resolvedTitle = title ?? t('common.processingDefault')

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center" role="status" aria-live="polite">
      <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
        <Icon size={24} />
        <span className="absolute inset-0 animate-pulse rounded-2xl ring-1 ring-brand-500/25" aria-hidden="true" />
      </span>
      <div>
        <p className="font-semibold text-stone-900 dark:text-white">{resolvedTitle}</p>
        {description && <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{description}</p>}
      </div>
      <ProgressBar progress={progress} />
    </div>
  )
}
