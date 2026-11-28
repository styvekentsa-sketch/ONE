import { useTranslation } from 'react-i18next'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import ToolsGrid from '../components/ToolsGrid'
import MediaSwitch from '../components/MediaSwitch'
import { useFilteredTools } from '../hooks/useFilteredTools'
import { MEDIA_TYPES, getCategoriesByMediaType, isMediaTypeComingSoon } from '../data/tools'

/**
 * Hub d'un type de média (/pdf, /image, /video, /audio) : même structure
 * que l'accueil, pré-filtrée sur un média. Tant qu'un média n'a aucun outil,
 * la page l'annonce clairement plutôt que d'afficher une grille vide.
 */
export default function MediaHubPage({ mediaType }) {
  const { t } = useTranslation()
  const { query, setQuery, activeCategory, setActiveCategory, filteredTools } = useFilteredTools({ initialMediaType: mediaType })
  const meta = MEDIA_TYPES.find((m) => m.id === mediaType)
  const MediaIcon = meta?.icon
  const comingSoon = isMediaTypeComingSoon(mediaType)
  const categories = getCategoriesByMediaType(mediaType)
  const filtering = query.trim() !== '' || activeCategory !== 'Tous'

  return (
    <div className="mx-auto max-w-6xl pb-12 md:px-6 lg:px-8">
      <section className="px-4 pb-6 pt-6 md:px-0 md:pt-12">
        <h1 className="hidden text-[28px] font-bold tracking-tight text-stone-900 md:block md:text-4xl dark:text-white">{t(`mediaTypes.${mediaType}`, meta?.label)}</h1>
        <MediaSwitch active={mediaType} className="md:mt-6 md:max-w-md" />
      </section>

      {comingSoon ? (
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {MediaIcon && <MediaIcon size={24} aria-hidden="true" />}
          </span>
          <p className="font-semibold text-stone-900 dark:text-white">{t('mediaTypes.comingSoonTitle')}</p>
          <p className="text-sm text-stone-500 dark:text-stone-400">{t(`mediaTypes.comingSoon_${mediaType}`)}</p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3 px-4 md:px-0">
            <SearchBar value={query} onChange={setQuery} placeholder={t('search.filterPlaceholder')} className="md:max-w-md" />
            <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />
          </div>
          <ToolsGrid tools={filteredTools} grouped={!filtering} />
        </>
      )}
    </div>
  )
}
