import { useTranslation } from 'react-i18next'
import { ChevronLeft } from 'lucide-react'
import { useSmartBack } from '../../hooks/useSmartBack'

/**
 * Bouton retour des pages d'outil sur tablette et ordinateur. Sur mobile,
 * c'est la barre supérieure de l'application (MobileAppBar) qui porte le
 * retour, à l'emplacement attendu : il est donc masqué sous md.
 */
export default function BackButton({ fallback, compact = false, className = '' }) {
  const { t } = useTranslation()
  const goBack = useSmartBack(fallback)
  return (
    <button
      type="button"
      onClick={goBack}
      className={`group hidden items-center gap-1 rounded-lg py-1.5 pl-1 pr-2.5 text-sm font-medium text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900 active:bg-stone-200 md:inline-flex dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-white ${
        compact ? 'shrink-0' : '-ml-1 mb-6'
      } ${className}`}
    >
      <ChevronLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
      {t('common.back')}
    </button>
  )
}
