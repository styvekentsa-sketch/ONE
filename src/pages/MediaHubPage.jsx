import { useTranslation } from 'react-i18next'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import ToolsGrid from '../components/ToolsGrid'
import { useAssistant } from '../context/AssistantContext'
import { useFilteredTools } from '../hooks/useFilteredTools'
import { MEDIA_TYPES, getCategoriesByMediaType, isMediaTypeComingSoon } from '../data/tools'

/**
 * Hub dédié à un type de média (/pdf, /image, /video, /audio) : même
 * structure recherche + catégories + grille que la page Outils générale,
 * mais pré-filtrée sur un seul `mediaType` et sans sélecteur pour en
 * changer (le routing fait déjà ce choix). Tant qu'un média n'a aucun outil
 * réel, la page l'annonce honnêtement plutôt que d'afficher une grille vide
 * ou des cartes qui ne fonctionnent pas.
 */
export default function MediaHubPage({ mediaType }) {
  const { t } = useTranslation()
  const { open: openAssistant } = useAssistant()
  const { query, setQuery, activeCategory, setActiveCategory, filteredTools, showEasyMode } = useFilteredTools({
    initialMediaType: mediaType,
  })

  const meta = MEDIA_TYPES.find((m) => m.id === mediaType)
  const MediaIcon = meta?.icon
  const comingSoon = isMediaTypeComingSoon(mediaType)
  const categories = getCategoriesByMediaType(mediaType)

  return (
    <div className="pb-16">
      <div className="px-4 pt-8 text-center sm:px-6 lg:px-8">
        <h1 className="inline-flex items-center gap-2 text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {MediaIcon && <MediaIcon className="h-6 w-6 sm:h-7 sm:w-7" aria-hidden="true" />}
          {t(`mediaTypes.${mediaType}`, meta?.label)}
        </h1>

        {!comingSoon && (
          <>
            <div className="mx-auto mt-6 max-w-xl">
              <SearchBar value={query} onChange={setQuery} />
            </div>
            <div className="mt-5">
              <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />
            </div>
          </>
        )}
      </div>

      {comingSoon ? (
        <div className="mx-auto mt-10 flex max-w-md flex-col items-center gap-3 px-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300">
            {MediaIcon && <MediaIcon className="h-6 w-6" aria-hidden="true" />}
          </span>
          <p className="font-semibold text-zinc-800 dark:text-white">{t('mediaTypes.comingSoonTitle')}</p>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t(`mediaTypes.comingSoon_${mediaType}`)}
          </p>
        </div>
      ) : (
        <div className="mx-auto mt-8 max-w-7xl sm:px-6 lg:px-8">
          <ToolsGrid tools={filteredTools} showEasyMode={showEasyMode} onOpenAssistant={openAssistant} />
        </div>
      )}
    </div>
  )
}
