import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { History, LogOut, MailWarning, ShieldCheck, Trash2 } from 'lucide-react'
import ProviderLogo, { PROVIDER_NAMES } from '../components/auth/ProviderLogo'
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
  const { user, logout, socialAvailable, deleteAccount } = useAuth()
  const [deleteError, setDeleteError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(t('profile.deleteConfirm'))) return
    setDeleteError(null)
    setDeleting(true)
    try {
      await deleteAccount()
    } catch (err) {
      setDeleteError(err.message === 'REQUIRES_RECENT_LOGIN' ? t('profile.deleteRecentLogin') : t('profile.deleteError'))
    } finally {
      setDeleting(false)
    }
  }
  const socialProviders = (user.providers ?? []).filter((p) => p !== 'password').map((p) => p.replace('.com', ''))
  const needsVerification = socialAvailable && user.providers?.includes('password') && user.emailVerified === false
  const { entries } = useHistory()

  const memberSince = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    year: 'numeric',
    month: 'long',
  }).format(user.createdAt)

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
        {user.photoURL ? (
          <img src={user.photoURL} alt="" referrerPolicy="no-referrer" className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-stone-200 dark:ring-stone-800" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white">
            {initialsFor(user.name)}
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-stone-900 dark:text-white">{user.name}</h1>
          <p className="truncate text-sm text-stone-500 dark:text-stone-400">{user.email}</p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
          {t('profile.planLabel')} · {t('profile.free')}
        </span>
        <span className="text-xs text-stone-400 dark:text-stone-500">
          {t('profile.memberSince', { date: memberSince })}
        </span>
        {socialProviders.length > 0 && (
          <span className="inline-flex items-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
            {t('profile.connectedWith')}
            {socialProviders.map((p) => (
              <span key={p} title={PROVIDER_NAMES[p]} className="text-stone-800 dark:text-stone-100">
                <ProviderLogo provider={p} size={15} />
              </span>
            ))}
          </span>
        )}
      </div>

      {needsVerification && (
        <p className="mt-4 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          <MailWarning size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {t('profile.emailNotVerified')}
        </p>
      )}

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-brand-500/20 bg-brand-500/5 p-4 text-xs leading-relaxed text-brand-700 dark:text-brand-400">
        <ShieldCheck size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        {socialAvailable ? t('profile.cloudAccountNotice') : t('profile.localAccountNotice')}
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          {t('profile.recentActivity')}
        </h2>

        {entries.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white px-4 py-8 text-center text-sm text-stone-500 dark:border-white/10 dark:bg-stone-900 dark:text-stone-400">
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
                  className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-stone-900"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    <Icon size={16} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-stone-800 dark:text-stone-100">{entry.message}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{formatRelativeTime(entry.timestamp)}</p>
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

      {socialAvailable && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-stone-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-stone-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Trash2 size={14} aria-hidden="true" />
            {t('profile.deleteAccount')}
          </button>
          {deleteError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deleteError}</p>}
        </div>
      )}
    </div>
  )
}
