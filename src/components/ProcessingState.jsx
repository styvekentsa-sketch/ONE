import { useTranslation } from 'react-i18next'
import { useSimulatedProgress } from '../hooks/useSimulatedProgress'
import ProgressBar from './ProgressBar'

/**
 * Écran générique de traitement en cours (spinner pulsé + barre de progression).
 * Se branche sur n'importe quel flux : Assistant Magique, page d'outil, etc.
 */
export default function ProcessingState({
  icon: Icon,
  title,
  description,
  duration = 1700,
}) {
  const { t } = useTranslation()
  const progress = useSimulatedProgress(true, duration)
  const resolvedTitle = title ?? t('common.processingDefault')

  return (
    <div className="flex flex-col items-center gap-5 py-10 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-indigo-500/30" />
        <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/20">
          <Icon size={26} />
        </span>
      </span>

      <div>
        <p className="font-semibold text-zinc-800 dark:text-white">{resolvedTitle}</p>
        {description && <p className="mt-1 text-sm text-zinc-400">{description}</p>}
      </div>

      <ProgressBar progress={progress} />
    </div>
  )
}
