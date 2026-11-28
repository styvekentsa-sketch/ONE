import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CircleUserRound, Search } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import Logo from './Logo'
import LanguageSelector from './LanguageSelector'
import { useAuth } from '../context/AuthContext'
import { useAssistant } from '../context/AssistantContext'

const NAV = [
  { to: '/', key: 'nav.home', end: true },
  { to: '/tools', key: 'nav.tools' },
  { to: '/easy-mode', key: 'nav.easyMode' },
  { to: '/history', key: 'nav.files' },
]

/**
 * En-tête tablette et ordinateur : une seule barre, sobre. Navigation
 * principale à gauche, recherche d'outil au centre (raccourci Ctrl/⌘ K),
 * préférences et compte à droite. Sur mobile, MobileAppBar et la barre
 * d'onglets prennent le relais.
 */
export default function Header() {
  const { t } = useTranslation()
  const { user, isAuthenticated } = useAuth()
  const { openSearch } = useAssistant()

  return (
    <header className="sticky top-0 z-40 hidden border-b border-stone-200/80 bg-stone-50/85 backdrop-blur-xl md:block dark:border-stone-800/80 dark:bg-stone-950/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-6 lg:px-8">
        <Link to="/" className="shrink-0 text-stone-900 dark:text-white" aria-label={t('nav.home')}>
          <Logo size="md" />
        </Link>

        <nav className="flex items-center gap-1 text-sm font-medium" aria-label={t('nav.main')}>
          {NAV.map(({ to, key, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 transition-colors ${
                  isActive
                    ? 'bg-stone-200/70 text-stone-900 dark:bg-stone-800 dark:text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-white'
                }`
              }
            >
              {t(key)}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={openSearch}
          className="ml-auto flex h-10 w-full max-w-xs items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-500 transition-colors hover:border-stone-300 lg:max-w-sm dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400 dark:hover:border-stone-700"
        >
          <Search size={16} />
          <span className="flex-1 truncate text-left">{t('search.short')}</span>
          <kbd className="hidden rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-sans text-[11px] font-medium text-stone-500 lg:inline dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400">
            Ctrl K
          </kbd>
        </button>

        <div className="flex shrink-0 items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
          <Link
            to="/account"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-stone-900 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
          >
            <CircleUserRound size={17} />
            <span className="hidden lg:inline">{isAuthenticated ? user.name.split(' ')[0] : t('nav.login')}</span>
          </Link>
        </div>
      </div>
    </header>
  )
}
