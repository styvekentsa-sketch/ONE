import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** Champ de recherche filtrant la liste affichée (pages Outils et hubs). */
export default function SearchBar({ value, onChange, placeholder, clearLabel, className = '' }) {
  const { t } = useTranslation()
  return (
    <div className={`relative flex items-center ${className}`}>
      <Search size={18} className="pointer-events-none absolute left-3.5 text-stone-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('search.placeholder')}
        enterKeyHint="search"
        className="h-12 w-full rounded-xl border border-stone-200 bg-white pl-11 pr-11 text-[15px] text-stone-900 placeholder:text-stone-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/10 dark:border-stone-800 dark:bg-stone-900 dark:text-white [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={clearLabel ?? t('search.clear')}
          className="absolute right-2 flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
        >
          <X size={17} />
        </button>
      )}
    </div>
  )
}
