import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Folder, Home, LayoutGrid, Settings, Wand2 } from 'lucide-react'
import { isTabBarVisible } from '../utils/routeMeta'

const TABS = [
  { to: '/', icon: Home, labelKey: 'nav.home' },
  { to: '/tools', icon: LayoutGrid, labelKey: 'nav.tools' },
  { to: '/easy-mode', icon: Wand2, labelKey: 'nav.easyMode' },
  { to: '/history', icon: Folder, labelKey: 'nav.files' },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings' },
]

/**
 * Barre d'onglets mobile : suit le thème (clair / sombre), icône et libellé
 * toujours visibles, onglet actif en bleu cobalt. Masquée dans les écrans
 * empilés (outils, réglages détaillés), qui gagnent ainsi toute la hauteur.
 */
export default function BottomNav() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  if (!isTabBarVisible(pathname)) return null

  return (
    <nav
      aria-label={t('nav.main')}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200/80 bg-stone-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden dark:border-stone-800/80 dark:bg-stone-950/90"
    >
      <div className="grid h-16 grid-cols-5">
        {TABS.map(({ to, icon: Icon, labelKey }) => {
          const active = pathname === to
          return (
            <Link
              key={to}
              to={to}
              aria-current={active ? 'page' : undefined}
              className="group flex flex-col items-center justify-center gap-1"
            >
              <span
                className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 group-active:scale-95 ${
                  active ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300' : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                <Icon size={21} strokeWidth={active ? 2.25 : 1.9} />
              </span>
              <span className={`text-[11px] leading-none ${active ? 'font-semibold text-stone-900 dark:text-white' : 'font-medium text-stone-500 dark:text-stone-400'}`}>
                {t(labelKey)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
