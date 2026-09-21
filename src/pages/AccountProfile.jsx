import { useTranslation } from 'react-i18next'
import { History, LogOut, ShieldCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useHistory } from '../hooks/useHistory'
import { formatRelativeTime } from '../utils/historyStorage'
import { getToolById } from '../data/tools'

function initialsFor(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
}

export default function AccountProfile() {
  const { t, i18n } = useTranslation()
  const { user, logout } = useAuth()
  const { entries } = useHistory()

  const memberSince = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    year: 'numeric',
    month: 'long',
  }).format(user.createdAt)

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-lg font-bold text-white">
          {initialsFor(user.name)}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-zinc-900 dark:text-white">{user.name}</h1>
          <p className="truncate text-sm text-zinc-500 dark:text-zinc-400">{user.email}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
          {t('profile.planLabel')} · {t('profile.free')}
        </span>
        <span className="text-xs text-zinc-400 dark:text-zinc-500">
          {t('profile.memberSince', { date: memberSince })}
        </span>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs leading-relaxed text-emerald-700 dark:text-emerald-400">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {t('profile.localAccountNotice')}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('profile.recentActivity')}
        </h2>

        {entries.length === 0 ? (
          <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">
            {t('profile.noActivity')}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.slice(0, 8).map((entry) => {
              const tool = getToolById(entry.toolId)
              const Icon = tool?.icon ?? History
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-zinc-900"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{entry.message}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{formatRelativeTime(entry.timestamp)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={logout}
        className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 transition-all duration-200 ease-in-out hover:bg-red-50 active:scale-[0.98] dark:border-red-500/20 dark:text-red-400 dark:hover:bg-red-500/10"
      >
        <LogOut size={16} aria-hidden="true" />
        {t('profile.logout')}
      </button>
    </div>
  )
}
