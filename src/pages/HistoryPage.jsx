import { useTranslation } from 'react-i18next'
import { Folder, History as HistoryIcon, Trash2 } from 'lucide-react'
import { useHistory } from '../hooks/useHistory'
import { formatRelativeTime } from '../utils/historyStorage'
import { getToolById } from '../data/tools'

/** Page dédiée à l'onglet "Fichiers" de la barre de navigation mobile :
 * l'historique local complet, en version pleine page plutôt qu'en modal. */
export default function HistoryPage() {
  const { t } = useTranslation()
  const { entries, clear } = useHistory()

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 dark:bg-stone-800/80 dark:text-white">
          <Folder size={22} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t('nav.files')}</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">{t('common.localOnlyHistory')}</p>
        </div>
      </div>

      <div className="mt-6">
        {entries.length === 0 ? (
          <p className="py-16 text-center text-sm text-stone-500 dark:text-stone-400">{t('common.noActivity')}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => {
              const tool = getToolById(entry.toolId)
              const Icon = tool?.icon ?? HistoryIcon
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-stone-900"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    <Icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">
                      {entry.message}
                    </p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{formatRelativeTime(entry.timestamp)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <button
          onClick={clear}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-all duration-200 ease-in-out hover:bg-red-50 active:scale-[0.98] dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <Trash2 size={16} /> {t('common.clearHistory')}
        </button>
      )}
    </div>
  )
}
