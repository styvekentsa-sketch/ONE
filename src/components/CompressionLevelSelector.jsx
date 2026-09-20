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
                ? 'border-indigo-500 bg-indigo-500/5'
                : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-800/60 dark:hover:border-zinc-700'
            }`}
          >
            <span
              className={`text-sm font-semibold ${
                isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-800 dark:text-zinc-100'
              }`}
            >
              {label}
            </span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
          </button>
        )
      })}
    </div>
  )
}
