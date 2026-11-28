import { useTranslation } from 'react-i18next'
import { SearchX } from 'lucide-react'
import ToolCard from './ToolCard'
import { CATEGORY_ICONS, MEDIA_TYPES } from '../data/tools'

/**
 * Catalogue d'outils, regroupé par catégorie (sections titrées) ou à plat
 * pendant une recherche. Mobile : listes groupées dans des cartes, comme
 * des réglages natifs. Tablette / ordinateur : grille de tuiles.
 */
export default function ToolsGrid({ tools, grouped = true, groupBy = 'category' }) {
  const { t } = useTranslation()

  if (tools.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-20 text-center text-stone-500 dark:text-stone-400">
        <SearchX size={36} strokeWidth={1.6} />
        <p className="text-sm">{t('search.noResults')}</p>
      </div>
    )
  }

  const sections = grouped
    ? [...tools.reduce((map, tool) => {
        const key = groupBy === 'media' ? `media:${tool.mediaType}` : tool.category
        return map.set(key, [...(map.get(key) ?? []), tool])
      }, new Map())]
    : [[null, tools]]

  return (
    <div id="tools" className="flex flex-col gap-8 md:gap-10">
      {sections.map(([category, list]) => {
        const isMedia = category?.startsWith('media:')
        const mediaId = isMedia ? category.slice(6) : null
        const Icon = isMedia ? MEDIA_TYPES.find((m) => m.id === mediaId)?.icon : category ? CATEGORY_ICONS[category] : null
        const title = isMedia ? t(`mediaTypes.${mediaId}`) : category ? t(`categories.${category}`, category) : undefined
        return (
          <section key={category ?? 'all'} aria-label={title}>
            {category && (
              <h2 className="mb-2.5 flex items-center gap-1.5 px-5 text-[13px] font-semibold uppercase tracking-wide text-stone-500 md:mb-4 md:px-0 dark:text-stone-400">
                {Icon && <Icon size={14} />}
                {title}
                <span className="font-normal normal-case tracking-normal text-stone-400 dark:text-stone-500">· {list.length}</span>
              </h2>
            )}

            {/* Mobile : liste groupée */}
            <div className="mx-4 divide-y divide-stone-100 overflow-hidden rounded-2xl border border-stone-200 bg-white md:hidden dark:divide-stone-800 dark:border-stone-800 dark:bg-stone-900">
              {list.map((tool) => (
                <ToolCard key={tool.id} tool={tool} variant="row" />
              ))}
            </div>

            {/* Tablette / ordinateur : grille */}
            <div className="hidden grid-cols-2 gap-4 md:grid lg:grid-cols-3 xl:grid-cols-4">
              {list.map((tool) => (
                <ToolCard key={tool.id} tool={tool} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
