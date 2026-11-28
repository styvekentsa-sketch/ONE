import { useTranslation } from 'react-i18next'

/**
 * Sélecteur de niveau générique (cartes cliquables). Conçu pour la
 * compression PDF mais réutilisable par tout futur outil ayant besoin
 * d'un choix de qualité/intensité (ex: compression d'images).
 */
export default function CompressionLevelSelector({ levels, value, onChange }) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {levels.map((level) => {
        const isActive = value === level.id
        const label = t(`compressionLevels.${level.id}.label`, level.label)
        const description = t(`compressionLevels.${level.id}.description`, level.description)
        return (
          <button
            key={level.id}
            type="button"
            onClick={() => onChange(level.id)}
            aria-pressed={isActive}
            className={`flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-all duration-200 ease-in-out active:scale-[0.98] ${
              isActive
                ? 'border-brand-500 bg-brand-500/5'
                : 'border-stone-200 bg-white hover:border-stone-300 dark:border-white/10 dark:bg-stone-800/60 dark:hover:border-stone-700'
            }`}
          >
            <span
              className={`text-sm font-semibold ${
                isActive ? 'text-brand-600 dark:text-brand-400' : 'text-stone-800 dark:text-stone-100'
              }`}
            >
              {label}
            </span>
            <span className="text-xs text-stone-500 dark:text-stone-400">{description}</span>
          </button>
        )
      })}
    </div>
  )
}
