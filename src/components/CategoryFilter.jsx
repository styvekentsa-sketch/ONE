import { useTranslation } from 'react-i18next'
import { CATEGORY_ICONS } from '../data/tools'

export default function CategoryFilter({ categories, active, onChange }) {
  const { t } = useTranslation()

  const label = (cat) => (cat === 'Tous' ? t('categories.all') : t(`categories.${cat}`, cat))

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {categories.map((cat) => {
        // Sections mises en avant (ex. Outils Avancés) : icône dédiée et
        // accent émeraude tant qu'elles ne sont pas sélectionnées.
        const Icon = CATEGORY_ICONS[cat]
        const isActive = active === cat
        return (
          <button
            key={cat}
            onClick={() => onChange(cat)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
              isActive
                ? 'bg-indigo-500 text-white shadow-sm'
                : Icon
                  ? 'bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-500/30 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/30 dark:hover:bg-emerald-500/20'
                  : 'bg-white text-zinc-600 shadow-sm hover:bg-zinc-100 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700'
            }`}
          >
            {Icon && <Icon size={15} aria-hidden="true" />}
            {label(cat)}
          </button>
        )
      })}
    </div>
  )
}
