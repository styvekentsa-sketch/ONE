import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Folder, Home, LayoutGrid, Settings, Zap } from 'lucide-react'

const TABS = [
  { to: '/', icon: Home, labelKey: 'nav.home', match: (path) => path === '/' },
  { to: '/history', icon: Folder, labelKey: 'nav.files', match: (path) => path.startsWith('/history') },
  {
    to: '/tools',
    icon: LayoutGrid,
    labelKey: 'nav.tools',
    match: (path) => path.startsWith('/tools') || path.startsWith('/tool/'),
  },
  { to: '/easy-mode', icon: Zap, labelKey: 'nav.easyMode', match: (path) => path.startsWith('/easy-mode') },
  { to: '/settings', icon: Settings, labelKey: 'nav.settings', match: (path) => path.startsWith('/settings') },
]

/**
 * Barre de navigation inférieure façon app native, visible uniquement sur
 * mobile (le header complet reprend le relais dès la tablette). Reste
 * volontairement sombre (bg-zinc-950/90) quel que soit le thème choisi,
 * comme une vraie tab bar native.
 */
export default function BottomNav() {
  const { t } = useTranslation()
  const location = useLocation()

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800/80 bg-zinc-950/90 backdrop-blur-lg md:hidden">
      <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ to, icon: Icon, labelKey, match }) => {
          const active = match(location.pathname)
          return (
            <Link key={to} to={to} className="flex flex-col items-center justify-center gap-1 py-2">
              <span
                className={`flex items-center justify-center rounded-full px-4 py-1.5 transition-all duration-200 ease-in-out active:scale-95 ${
                  active ? 'bg-zinc-800 text-white' : 'text-zinc-400'
                }`}
              >
                <Icon size={18} />
              </span>
              <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-zinc-400'}`}>
                {t(labelKey)}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
