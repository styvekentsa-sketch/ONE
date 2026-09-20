import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function SearchBar({ value, onChange, placeholder, clearLabel }) {
  const { t } = useTranslation()
  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="group relative flex items-center rounded-2xl border border-zinc-200 bg-white/80 shadow-sm backdrop-blur-md transition-all duration-200 ease-in-out focus-within:border-indigo-400 dark:border-white/10 dark:bg-zinc-900/80">
        <Search
          size={20}
          className="pointer-events-none absolute left-4 text-zinc-400 transition-colors duration-200 group-focus-within:text-indigo-500 dark:group-focus-within:text-indigo-400"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? t('search.placeholder')}
          className="w-full rounded-2xl bg-transparent py-3.5 pl-12 pr-10 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white sm:text-base"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            aria-label={clearLabel ?? t('search.clear')}
            className="absolute right-4 text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  )
}
