import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MEDIA_TYPES } from '../data/tools'

// Un onglet média est actif dès qu'on est sur son hub, ou sur une des pages
// d'outil dédiées à ce média. Les outils Image/Vidéo/Audio vivent tous sous
// /tool/image-*, /tool/video-*, /tool/audio-* : il faut les exclure
// explicitement du préfixe /tool/ générique (sinon PDF, qui matche tout
// /tool/*, resterait actif même sur une page d'outil Image ou Vidéo — c'est
// exactement le décalage rapporté).
const MATCHERS = {
  pdf: (path) =>
    path === '/' ||
    path === '/pdf' ||
    path.startsWith('/tools/') ||
    (path.startsWith('/tool/') && !/^\/tool\/(image|video|audio)-/.test(path)),
  image: (path) => path === '/image' || path.startsWith('/tool/image-'),
  video: (path) => path === '/video' || path.startsWith('/tool/video-'),
  audio: (path) => path === '/audio' || path.startsWith('/tool/audio-'),
}

/**
 * Sous-barre de navigation persistante, juste sous le Header, sur toutes
 * les pages : bascule instantanément entre les 4 hubs de média (PDF étant
 * le média par défaut de l'app). Remplace l'ancien menu déroulant
 * MediaSwitcher — une vraie navigation au clic plutôt qu'un menu à ouvrir.
 */
export default function MediaNavBar() {
  const { t } = useTranslation()
  const location = useLocation()

  return (
    <nav className="border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-1.5 px-4 py-2.5 sm:px-6 lg:px-8">
        {MEDIA_TYPES.map(({ id, label, icon: Icon }) => {
          const active = MATCHERS[id]?.(location.pathname) ?? false
          return (
            <Link
              key={id}
              to={`/${id}`}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-200 ease-in-out active:scale-[0.98] ${
                active
                  ? 'bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {t(`mediaTypes.${id}`, label)}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
