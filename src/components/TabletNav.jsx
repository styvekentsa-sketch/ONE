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
 * Barre de navigation secondaire, horizontale, pour le format tablette
 * (768–1023px) : entre le header complet (réservé au desktop dès lg:) et la
 * tab bar du mobile. Mêmes 5 destinations que BottomNav, en pastilles
 * icône + libellé côte à côte puisque la largeur le permet. Non fixe (au fil
 * du contenu, juste sous le header) : pas de calcul de décalage à
 * synchroniser avec la hauteur du header.
 */
export default function TabletNav() {
  const { t } = useTranslation()
  const location = useLocation()

  return (
    <nav className="hidden border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-lg md:flex lg:hidden">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-center gap-1.5 px-6 py-2.5">
        {TABS.map(({ to, icon: Icon, labelKey, match }) => {
          const active = match(location.pathname)
          return (
            <Link
              key={to}
              to={to}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-95 ${
                active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Icon size={16} />
              {t(labelKey)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
