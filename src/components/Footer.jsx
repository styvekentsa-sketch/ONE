import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Logo from './Logo'
import { requestOpenPreferences } from '../utils/cookieConsent'

const LEGAL_LINKS = [
  { to: '/legal-notice', key: 'legalNotice' },
  { to: '/privacy-policy', key: 'privacyPolicy' },
  { to: '/terms-of-service', key: 'termsOfService' },
  { to: '/cookie-policy', key: 'cookiePolicy' },
  { to: '/refund-policy', key: 'refundPolicy' },
]

/**
 * Visible sur toutes les tailles d'écran (y compris mobile, où elle
 * précède la barre de navigation fixe `BottomNav` — d'où le padding bas
 * supplémentaire qui reprend la même hauteur réservée pour elle dans
 * `MainLayout`, sans quoi son dernier contenu resterait masqué derrière).
 */
export default function Footer() {
  const { t } = useTranslation()

  return (
    <footer className="border-t border-zinc-200 bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom))] dark:border-white/10 dark:bg-zinc-950 md:pb-10">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <Logo size="sm" />
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t('footer.rights', { year: new Date().getFullYear() })}
          </p>
        </div>

        <nav
          aria-label={t('footer.legalLinksTitle')}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-zinc-100 pt-6 dark:border-white/5"
        >
          {LEGAL_LINKS.map(({ to, key }) => (
            <Link
              key={to}
              to={to}
              className="text-xs font-medium text-zinc-500 transition-colors duration-200 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
            >
              {t(`footer.${key}`)}
            </Link>
          ))}
          <button
            onClick={requestOpenPreferences}
            className="text-xs font-medium text-zinc-500 transition-colors duration-200 hover:text-indigo-600 dark:text-zinc-400 dark:hover:text-indigo-400"
          >
            {t('footer.manageCookies')}
          </button>
        </nav>
      </div>
    </footer>
  )
}
