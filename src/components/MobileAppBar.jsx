import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, CircleUserRound, Search } from 'lucide-react'
import Logo from './Logo'
import { useSmartBack } from '../hooks/useSmartBack'
import { useAssistant } from '../context/AssistantContext'
import { getRouteMeta } from '../utils/routeMeta'

/**
 * Barre supérieure mobile, façon application native :
 * - écrans racines (onglets) : logo, recherche d'outil et compte ;
 * - écrans empilés (outil, réglage, page légale…) : retour à gauche et
 *   titre de l'écran, à l'endroit où le pouce et l'œil l'attendent.
 */
export default function MobileAppBar() {
  const { t } = useTranslation()
  const location = useLocation()
  const { openSearch } = useAssistant()
  const { isRoot, title, fallback } = getRouteMeta(location.pathname, location.search, t)
  const goBack = useSmartBack(fallback)

  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-stone-50/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden dark:border-stone-800/80 dark:bg-stone-950/85">
      <div className="flex h-14 items-center gap-1 px-2">
        {isRoot ? (
          <>
            <Link to="/" className="flex h-11 items-center px-2 text-stone-900 dark:text-white" aria-label={t('nav.home')}>
              <Logo size="sm" />
            </Link>
            <div className="flex-1" />
            <button
              type="button"
              onClick={openSearch}
              aria-label={t('search.open')}
              className="flex h-11 w-11 items-center justify-center rounded-full text-stone-700 active:bg-stone-200 dark:text-stone-200 dark:active:bg-stone-800"
            >
              <Search size={21} />
            </button>
            <Link
              to="/account"
              aria-label={t('nav.account')}
              className="flex h-11 w-11 items-center justify-center rounded-full text-stone-700 active:bg-stone-200 dark:text-stone-200 dark:active:bg-stone-800"
            >
              <CircleUserRound size={22} />
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={goBack}
              aria-label={t('common.back')}
              className="flex h-11 shrink-0 items-center gap-0.5 rounded-full pl-1 pr-2 text-brand-600 active:bg-stone-200 dark:text-brand-400 dark:active:bg-stone-800"
            >
              <ChevronLeft size={26} strokeWidth={2.25} />
              <span className="text-[15px] font-medium">{t('common.back')}</span>
            </button>
            <h1 className="min-w-0 flex-1 truncate px-1 text-center text-[15px] font-semibold text-stone-900 dark:text-white">{title}</h1>
            {/* Équilibre visuel : le titre reste centré sous le retour. */}
            <span className="w-[76px] shrink-0" aria-hidden="true" />
          </>
        )}
      </div>
    </header>
  )
}
