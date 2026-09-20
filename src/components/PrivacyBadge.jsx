import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'

/**
 * Rassure sur le traitement 100% local. `compact` donne une pastille pour
 * la barre de navigation ; sinon un bandeau complet pour les pages d'outil.
 */
export default function PrivacyBadge({ compact = false, className = '' }) {
  const { t } = useTranslation()

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 ${className}`}
      >
        <Lock size={12} />
        {t('common.localSecurityCompact')}
      </span>
    )
  }

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 ${className}`}
    >
      <Lock size={14} className="shrink-0" />
      {t('common.localSecurity')}
    </div>
  )
}
