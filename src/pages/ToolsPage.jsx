import { useTranslation } from 'react-i18next'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import MediaSwitch from '../components/MediaSwitch'
import ToolsGrid from '../components/ToolsGrid'
import { useFilteredTools } from '../hooks/useFilteredTools'
import { getCategoriesByMediaType, isMediaTypeComingSoon, MEDIA_TYPES } from '../data/tools'

/**
 * Onglet « Outils » : tout le catalogue, tous médias confondus par défaut,
 * filtrable par média, catégorie et recherche.
 */
export default function ToolsPage() {
  const { t } = useTranslation()
  const { query, setQuery, activeCategory, setActiveCategory, mediaType, setMediaType, filteredTools } = useFilteredTools({ initialMediaType: 'all' })

  const categories = getCategoriesByMediaType(mediaType)
  const comingSoon = mediaType !== 'all' && isMediaTypeComingSoon(mediaType)
  const MediaIcon = MEDIA_TYPES.find((m) => m.id === mediaType)?.icon
  const filtering = query.trim() !== '' || activeCategory !== 'Tous'

  return (
    <div className="mx-auto max-w-6xl pb-12 md:px-6 lg:px-8">
      <section className="flex flex-col gap-3 px-4 pb-6 pt-6 md:px-0 md:pt-12">
        <h1 className="text-[28px] font-bold tracking-tight text-stone-900 md:text-4xl dark:text-white">{t('nav.tools')}</h1>
        <SearchBar value={query} onChange={setQuery} placeholder={t('search.filterPlaceholder')} className="mt-2 md:max-w-md" />
        <MediaSwitch
          includeAll
          active={mediaType}
          onChange={(id) => {
            setMediaType(id)
            setActiveCategory('Tous')
          }}
          className="md:max-w-lg"
        />
        {!comingSoon && mediaType !== 'all' && <CategoryFilter categories={categories} active={activeCategory} onChange={setActiveCategory} />}
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
        <ToolsGrid tools={filteredTools} grouped={!filtering} groupBy={mediaType === 'all' ? 'media' : 'category'} />
      )}
    </div>
  )
}
