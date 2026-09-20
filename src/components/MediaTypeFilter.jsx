import { useTranslation } from 'react-i18next'
import { Zap } from 'lucide-react'
import { MEDIA_TYPES } from '../data/tools'

/**
 * Sélecteur principal de type de média (PDF / Image / Vidéo / Audio / Tous),
 * affiché au-dessus du filtre par catégorie — PDF est le média historique et
 * prioritaire de l'app, donc toujours en premier et actif par défaut.
 */
export default function MediaTypeFilter({ active, onChange, className = '' }) {
  const { t } = useTranslation()

  const options = [...MEDIA_TYPES, { id: 'all', label: t('mediaTypes.all'), icon: Zap }]

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2 ${className}`}>
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ease-in-out active:scale-[0.98] ${
            active === id
              ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800/80 dark:text-zinc-300 dark:hover:bg-zinc-700'
          }`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {id === 'all' ? label : t(`mediaTypes.${id}`, label)}
        </button>
      ))}
    </div>
  )
}
