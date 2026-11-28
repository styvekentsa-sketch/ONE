import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronRight, History as HistoryIcon } from 'lucide-react'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import ToolsGrid from '../components/ToolsGrid'
import MediaSwitch from '../components/MediaSwitch'
import EasyModeCard from '../components/EasyModeCard'
import PrivacyBadge from '../components/PrivacyBadge'
import { useAssistant } from '../context/AssistantContext'
import { useFilteredTools } from '../hooks/useFilteredTools'
import { useHistory } from '../hooks/useHistory'
import { getToolById, getCategoriesByMediaType } from '../data/tools'
import { formatRelativeTime } from '../utils/historyStorage'

const CATEGORIES = getCategoriesByMediaType('pdf')
// Les outils les plus utilisés, en accès direct.
const QUICK_ACTIONS = ['merge', 'compress', 'pdf-to-word', 'sign']

/**
 * Accueil : une seule mise en page, fluide du téléphone à l'écran large.
 * Titre, choix du média, accès rapide, fichiers récents, assistant, puis le
 * catalogue complet des outils PDF classés par catégorie.
 */
export default function Home() {
  const { t } = useTranslation()
  const { open: openAssistant } = useAssistant()
  const { query, setQuery, activeCategory, setActiveCategory, filteredTools } = useFilteredTools({ initialMediaType: 'pdf' })
  const { entries: recentEntries } = useHistory()
  const filtering = query.trim() !== '' || activeCategory !== 'Tous'

  return (
    <div className="mx-auto max-w-6xl pb-12 md:px-6 lg:px-8">
      {/* En-tête de page */}
      <section className="px-4 pb-6 pt-6 md:px-0 md:pb-8 md:pt-12">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-stone-900 md:text-4xl dark:text-white">{t('home.title')}</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-stone-600 md:text-base dark:text-stone-400">{t('home.subtitle')}</p>
        <PrivacyBadge className="mt-3" />
        <MediaSwitch active="pdf" className="mt-6 md:max-w-md" />
      </section>

      {!filtering && (
        <>
          {/* Accès rapide */}
          <section className="mb-8 md:mb-10" aria-labelledby="quick-title">
            <h2 id="quick-title" className="mb-2.5 px-5 text-[13px] font-semibold uppercase tracking-wide text-stone-500 md:mb-4 md:px-0 dark:text-stone-400">
              {t('home.quickActions')}
            </h2>
            <div className="grid grid-cols-2 gap-3 px-4 md:grid-cols-4 md:gap-4 md:px-0">
              {QUICK_ACTIONS.map((id) => getToolById(id))
                .filter(Boolean)
                .map((tool) => {
                  const Icon = tool.icon
                  return (
                    <Link
                      key={tool.id}
                      to={tool.route}
                      className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300 active:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700 dark:active:bg-stone-800"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        <Icon size={20} strokeWidth={1.9} />
                      </span>
                      <span className="text-[15px] font-semibold leading-tight text-stone-900 dark:text-white">{t(`tools.${tool.id}.name`, tool.name)}</span>
                    </Link>
                  )
                })}
            </div>
          </section>

          {/* Fichiers récents */}
          {recentEntries.length > 0 && (
            <section className="mb-8 md:mb-10" aria-labelledby="recent-title">
              <div className="mb-2.5 flex items-center justify-between px-5 md:mb-4 md:px-0">
                <h2 id="recent-title" className="text-[13px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                  {t('home.recentFiles')}
                </h2>
                <Link to="/history" className="flex items-center gap-0.5 text-sm font-medium text-brand-600 dark:text-brand-400">
                  {t('home.seeAll')} <ChevronRight size={15} />
                </Link>
              </div>
              <div className="scrollbar-none flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:px-0">
                {recentEntries.slice(0, 10).map((entry) => {
                  const tool = getToolById(entry.toolId)
                  const Icon = tool?.icon ?? HistoryIcon
                  return (
                    <Link
                      key={entry.id}
                      to={tool?.route ?? '/history'}
                      className="flex w-44 shrink-0 snap-start items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 transition-colors hover:border-stone-300 active:bg-stone-50 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-stone-900 dark:text-white">
                          {tool ? t(`tools.${tool.id}.name`, tool.name) : entry.toolName}
                        </span>
                        <span className="block text-xs text-stone-500 dark:text-stone-400">{formatRelativeTime(entry.timestamp)}</span>
                      </span>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <div className="mb-10 px-4 md:px-0">
            <EasyModeCard onOpen={openAssistant} />
          </div>
        </>
      )}

      {/* Catalogue */}
      <section aria-labelledby="catalog-title">
        <div className="mb-6 flex flex-col gap-3 px-4 md:px-0">
          <h2 id="catalog-title" className="text-xl font-semibold tracking-tight text-stone-900 dark:text-white">
            {t('home.allTools')}
          </h2>
          <SearchBar value={query} onChange={setQuery} placeholder={t('search.filterPlaceholder')} className="md:max-w-md" />
          <CategoryFilter categories={CATEGORIES} active={activeCategory} onChange={setActiveCategory} />
        </div>
        <div className="md:px-0">
          <ToolsGrid tools={filteredTools} grouped={!filtering} />
        </div>
      </section>
    </div>
  )
}
