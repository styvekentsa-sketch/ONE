import { useTranslation } from 'react-i18next'

export default function CategoryFilter({ categories, active, onChange }) {
  const { t } = useTranslation()

  const label = (cat) => (cat === 'Tous' ? t('categories.all') : t(`categories.${cat}`, cat))

  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onChange(cat)}
          className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
            active === cat
              ? 'bg-indigo-500 text-white shadow-sm'
              : 'bg-white text-zinc-600 shadow-sm hover:bg-zinc-100 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700'
          }`}
        >
          {label(cat)}
        </button>
      ))}
    </div>
  )
}
