import { useTranslation } from 'react-i18next'
import { CATEGORY_ICONS } from '../data/tools'

/**
 * Puces de filtre par catégorie. Une seule rangée qui défile
 * horizontalement au doigt sur mobile (pas de retour à la ligne qui pousse
 * le contenu), centrée sur grand écran.
 */
export default function CategoryFilter({ categories, active, onChange, className = '' }) {
  const { t } = useTranslation()
  const label = (cat) => (cat === 'Tous' ? t('categories.all') : t(`categories.${cat}`, cat))

  return (
    <div className={`scrollbar-none -mx-4 overflow-x-auto px-4 md:mx-0 md:px-0 ${className}`}>
      <div className="flex w-max gap-2 md:w-auto md:flex-wrap" role="tablist" aria-label={t('categories.label')}>
        {categories.map((cat) => {
          const Icon = CATEGORY_ICONS[cat]
          const isActive = active === cat
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(cat)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-stone-900 bg-stone-900 text-white dark:border-white dark:bg-white dark:text-stone-900'
                  : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300 dark:hover:border-stone-700'
              }`}
            >
              {Icon && <Icon size={14} aria-hidden="true" />}
              {label(cat)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
