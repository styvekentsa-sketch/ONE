import { useTranslation } from 'react-i18next'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import MediaTypeFilter from '../components/MediaTypeFilter'
import ToolsGrid from '../components/ToolsGrid'
import { useAssistant } from '../context/AssistantContext'
import { useFilteredTools } from '../hooks/useFilteredTools'
import { getCategoriesByMediaType, isMediaTypeComingSoon, MEDIA_TYPES } from '../data/tools'

/** Page dédiée à l'onglet "Outils" de la barre de navigation mobile : la
 * grille complète (tous médias confondus par défaut), sans le hero
 * marketing de l'accueil. Le sélecteur de média permet d'y basculer entre
 * PDF/Image/Vidéo/Audio, y compris sur mobile où la BottomNav elle-même ne
 * porte que 5 destinations fixes. */
export default function ToolsPage() {
  const { t } = useTranslation()
  const { open: openAssistant } = useAssistant()
  const {
    query,
    setQuery,
    activeCategory,
    setActiveCategory,
    mediaType,
    setMediaType,
    filteredTools,
    showEasyMode,
  } = useFilteredTools({ initialMediaType: 'all' })

  const categories = getCategoriesByMediaType(mediaType)
  const comingSoon = mediaType !== 'all' && isMediaTypeComingSoon(mediaType)
  const MediaIcon = MEDIA_TYPES.find((m) => m.id === mediaType)?.icon

  const handleMediaTypeChange = (id) => {
    setMediaType(id)
    setActiveCategory('Tous')
  }

  return (
    <div className="pb-16">
      <div className="px-4 pt-8 text-center sm:px-6 lg:px-8">
        <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
          {t('nav.tools')}
        </h1>
        <div className="mx-auto mt-6 max-w-xl">
          <SearchBar value={query} onChange={setQuery} />
        </div>
        <div className="mt-5">
          <MediaTypeFilter active={mediaType} onChange={handleMediaTypeChange} />
        </div>
        {!comingSoon && (
          <div className="mt-4">
            <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />
          </div>
        )}
      </div>

      <div className="mx-auto mt-8 max-w-7xl sm:px-6 lg:px-8">
        {comingSoon ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300">
              {MediaIcon && <MediaIcon className="h-6 w-6" aria-hidden="true" />}
            </span>
            <p className="font-semibold text-zinc-800 dark:text-white">{t('mediaTypes.comingSoonTitle')}</p>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{t(`mediaTypes.comingSoon_${mediaType}`)}</p>
          </div>
        ) : (
          <ToolsGrid tools={filteredTools} showEasyMode={showEasyMode} onOpenAssistant={openAssistant} />
        )}
      </div>
    </div>
  )
}
