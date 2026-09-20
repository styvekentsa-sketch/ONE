import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { History as HistoryIcon, Plus, Search } from 'lucide-react'
import SearchBar from '../components/SearchBar'
import CategoryFilter from '../components/CategoryFilter'
import ToolsGrid from '../components/ToolsGrid'
import Logo from '../components/Logo'
import PrivacyBadge from '../components/PrivacyBadge'
import { useAssistant } from '../context/AssistantContext'
import { useFilteredTools } from '../hooks/useFilteredTools'
import { useHistory } from '../hooks/useHistory'
import { getToolById, getCategoriesByMediaType } from '../data/tools'
import { formatRelativeTime } from '../utils/historyStorage'

// L'accueil ne montre plus que les outils PDF (le choix d'un autre média se
// fait désormais via MediaNavBar, juste sous le Header, qui navigue vers
// /image, /video ou /audio plutôt que de filtrer sur place) — mediaType
// reste donc fixé ici, pas besoin de sélecteur local ni d'état "à venir".
const CATEGORIES = getCategoriesByMediaType('pdf')

export default function Home() {
  const { t } = useTranslation()
  const { open: openAssistant } = useAssistant()
  const { query, setQuery, activeCategory, setActiveCategory, filteredTools, showEasyMode } = useFilteredTools({
    initialMediaType: 'pdf',
  })
  const { entries: recentEntries } = useHistory()
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  return (
    <>
      {/* Tableau de bord mobile : header compact, recherche/catégories
          repliables et fichiers récents. Masqué dès la tablette, où le hero
          ci-dessous reprend le relais. */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3 bg-zinc-950 px-4 py-3">
          <Logo size="sm" />
          <div className="flex items-center gap-2">
            <PrivacyBadge compact />
            <button
              onClick={() => setMobileSearchOpen((open) => !open)}
              aria-label={t('search.placeholder')}
              aria-expanded={mobileSearchOpen}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-zinc-300 transition-all duration-200 ease-in-out active:scale-90"
            >
              <Search size={16} />
            </button>
          </div>
        </div>

        {mobileSearchOpen && (
          <div className="animate-fade-up border-b border-zinc-800/80 bg-zinc-950 px-4 pb-4">
            <SearchBar value={query} onChange={setQuery} />
            <div className="mt-3 flex justify-center">
              <CategoryFilter categories={CATEGORIES} active={activeCategory} onChange={setActiveCategory} />
            </div>
          </div>
        )}

        {recentEntries.length > 0 && (
          <div className="border-b border-zinc-800/80 bg-zinc-950 px-4 py-4">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t('home.recentFiles')}
            </h2>
            <div className="flex snap-x gap-3 overflow-x-auto pb-1">
              {recentEntries.slice(0, 10).map((entry) => {
                const tool = getToolById(entry.toolId)
                const Icon = tool?.icon ?? HistoryIcon
                return (
                  <Link
                    key={entry.id}
                    to={tool?.route ?? '/history'}
                    className="flex w-32 shrink-0 snap-start flex-col gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-3 transition-all duration-200 ease-in-out active:scale-95"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-300">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-200">
                        {tool ? t(`tools.${tool.id}.name`, tool.name) : entry.toolName}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">{formatRelativeTime(entry.timestamp)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Tableau de bord tablette : header non repliable (la largeur le
          permet), fichiers récents en grille. Masqué sur mobile (dashboard
          dédié ci-dessus) et sur desktop (hero ci-dessous). */}
      <div className="hidden md:block lg:hidden">
        <div className="flex items-center gap-4 border-b border-zinc-800/80 bg-zinc-950 px-6 py-4">
          <Logo size="md" />
          <div className="flex flex-1 items-center justify-end gap-3">
            <div className="w-full max-w-sm">
              <SearchBar value={query} onChange={setQuery} />
            </div>
            <PrivacyBadge compact />
          </div>
        </div>

        <div className="flex justify-center border-b border-zinc-800/80 bg-zinc-950 px-6 py-3">
          <CategoryFilter categories={CATEGORIES} active={activeCategory} onChange={setActiveCategory} />
        </div>

        {recentEntries.length > 0 && (
          <div className="border-b border-zinc-800/80 bg-zinc-950 px-6 py-5">
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t('home.recentFiles')}
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {recentEntries.slice(0, 8).map((entry) => {
                const tool = getToolById(entry.toolId)
                const Icon = tool?.icon ?? HistoryIcon
                return (
                  <Link
                    key={entry.id}
                    to={tool?.route ?? '/history'}
                    className="flex flex-col gap-2 rounded-2xl border border-zinc-800/80 bg-zinc-900/90 p-3 transition-all duration-200 ease-in-out hover:border-zinc-700 active:scale-95"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800/60 text-zinc-300">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-zinc-200">
                        {tool ? t(`tools.${tool.id}.name`, tool.name) : entry.toolName}
                      </p>
                      <p className="mt-0.5 text-[10px] text-zinc-500">{formatRelativeTime(entry.timestamp)}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Hero desktop */}
      <section className="hidden px-4 pb-10 pt-10 sm:px-6 sm:pt-16 lg:block lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-5xl">
            {t('hero.titleLine1')}
            <br />
            {t('hero.titleLine2')}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-zinc-500 dark:text-zinc-400">
            {t('hero.subtitle')}
          </p>

          <div className="mt-8">
            <SearchBar value={query} onChange={setQuery} />
          </div>

          <div className="mt-6">
            <CategoryFilter categories={CATEGORIES} active={activeCategory} onChange={setActiveCategory} />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl pb-16 sm:px-6 lg:px-8">
        <ToolsGrid tools={filteredTools} showEasyMode={showEasyMode} onOpenAssistant={openAssistant} />
      </section>

      {/* Bouton d'action flottant : ouvre directement l'import de fichier.
          Décalé au-dessus de la BottomNav sur mobile ; recollé au coin sur
          tablette, qui n'a pas de barre fixe en bas. Masqué dès le desktop
          (lg:), où l'EasyModeCard sert déjà de point d'entrée équivalent. */}
      <button
        onClick={openAssistant}
        aria-label={t('easyModeCard.badge')}
        className="fixed bottom-20 right-4 z-40 flex items-center justify-center rounded-full bg-white p-4 text-black shadow-2xl transition-transform duration-200 ease-in-out active:scale-90 md:bottom-6 md:right-6 lg:hidden"
      >
        <Plus size={22} />
      </button>
    </>
  )
}
