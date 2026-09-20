import { Link, Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Wrench } from 'lucide-react'
import { getToolById } from '../data/tools'
import PrivacyBadge from '../components/PrivacyBadge'

/**
 * Page générique de secours pour un id d'outil sans page dédiée. En temps
 * normal elle n'est jamais atteinte : chaque outil de data/tools.js a
 * désormais sa propre `customRoute` réelle. Elle ne reste que comme filet
 * pour un id inconnu/mal formé — et affiche un état honnête ("en cours
 * d'optimisation") plutôt que de simuler un traitement et un téléchargement
 * qui ne produiraient jamais de vrai fichier.
 */
export default function ToolPage() {
  const { t } = useTranslation()
  const { toolId } = useParams()
  const tool = getToolById(toolId)

  if (!tool) return <Navigate to="/" replace />

  const Icon = tool.icon
  const toolName = t(`tools.${tool.id}.name`, tool.name)
  const toolDescription = t(`tools.${tool.id}.description`, tool.description)

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Icon size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{toolName}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{toolDescription}</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-white/10 dark:bg-zinc-900">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300">
          <Wrench size={24} />
        </span>
        <p className="font-semibold text-zinc-800 dark:text-white">{t('common.toolOptimizingTitle')}</p>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{t('common.toolOptimizingDescription')}</p>
      </div>
    </div>
  )
}
