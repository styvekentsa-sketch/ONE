import { useTranslation } from 'react-i18next'
import { History, Trash2 } from 'lucide-react'
import Modal from './Modal'
import { useHistory } from '../hooks/useHistory'
import { formatRelativeTime } from '../utils/historyStorage'
import { getToolById } from '../data/tools'

export default function HistoryModal({ open, onClose }) {
  const { t } = useTranslation()
  const { entries, clear } = useHistory()

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={History}
      title={t('common.recentHistory')}
      subtitle={t('common.localOnlyHistory')}
    >
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
          {t('common.noActivity')}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map((entry) => {
            const tool = getToolById(entry.toolId)
            const Icon = tool?.icon ?? History
            return (
              <div
                key={entry.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-800/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <Icon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {entry.message}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatRelativeTime(entry.timestamp)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {entries.length > 0 && (
        <button
          onClick={clear}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-600 transition-all duration-200 ease-in-out hover:bg-red-50 active:scale-[0.98] dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10"
        >
          <Trash2 size={16} /> {t('common.clearHistory')}
        </button>
      )}
    </Modal>
  )
}
