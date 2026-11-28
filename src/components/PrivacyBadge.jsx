import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'

/** Rappel « traitement 100 % local » : discret, neutre, jamais criard. */
export default function PrivacyBadge({ compact = false, className = '' }) {
  const { t } = useTranslation()
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 ${className}`}>
      <Lock size={compact ? 12 : 13} className="shrink-0" />
      {compact ? t('common.localSecurityCompact') : t('common.localSecurity')}
    </span>
  )
}
