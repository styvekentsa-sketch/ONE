import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CircleUserRound, History } from 'lucide-react'
import ThemeToggle from './ThemeToggle'
import Logo from './Logo'
import PrivacyBadge from './PrivacyBadge'
import LanguageSelector from './LanguageSelector'

export default function Header({ onOpenHistory }) {
  const { t } = useTranslation()

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 md:py-4 lg:px-8">
        <Link to="/" className="text-zinc-900 dark:text-white">
          <Logo size="md" />
        </Link>

        {/* Navigation complète : desktop uniquement (la tablette a sa propre
            barre secondaire, TabletNav, sous ce header ; le choix de média
            vit maintenant dans MediaNavBar, juste sous ce header, sur toutes
            les tailles d'écran) */}
        <nav className="hidden items-center gap-8 text-sm font-medium text-zinc-600 dark:text-zinc-400 lg:flex">
          <a href="/#tools" className="transition-colors duration-200 hover:text-indigo-500 dark:hover:text-indigo-400">
            {t('nav.tools')}
          </a>
          <a href="/#easy-mode" className="transition-colors duration-200 hover:text-indigo-500 dark:hover:text-indigo-400">
            {t('nav.easyMode')}
          </a>
          <button
            onClick={onOpenHistory}
            className="inline-flex items-center gap-1.5 transition-colors duration-200 hover:text-indigo-500 dark:hover:text-indigo-400"
          >
            <History size={15} />
            {t('nav.history')}
          </button>
          <a href="#" className="transition-colors duration-200 hover:text-indigo-500 dark:hover:text-indigo-400">
            {t('nav.pricing')}
          </a>
        </nav>

        {/* Desktop uniquement : réglages complets + connexion */}
        <div className="hidden items-center gap-3 lg:flex">
          <PrivacyBadge compact />
          <LanguageSelector />
          <ThemeToggle />
          <button className="rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]">
            {t('nav.login')}
          </button>
        </div>

        {/* Tablette uniquement : contrôles condensés (la navigation
            principale vit dans TabletNav, juste en dessous) */}
        <div className="hidden items-center gap-2.5 md:flex lg:hidden">
          <LanguageSelector />
          <ThemeToggle />
          <Link
            to="/account"
            aria-label={t('nav.account')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-all duration-200 ease-in-out active:scale-[0.98] dark:bg-zinc-800/80 dark:text-zinc-300"
          >
            <CircleUserRound size={18} />
          </Link>
        </div>

        {/* Header mobile ultra-épuré : logo (ci-dessus) + langue + profil */}
        <div className="flex items-center gap-2 md:hidden">
          <LanguageSelector compact />
          <Link
            to="/account"
            aria-label={t('nav.account')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-all duration-200 ease-in-out active:scale-[0.98] dark:bg-zinc-800/80 dark:text-zinc-300"
          >
            <CircleUserRound size={18} />
          </Link>
        </div>
      </div>
    </header>
  )
}
