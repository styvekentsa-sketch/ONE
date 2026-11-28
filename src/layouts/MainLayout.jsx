import { Suspense, useEffect, useLayoutEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from '../components/Header'
import MobileAppBar from '../components/MobileAppBar'
import Footer from '../components/Footer'
import BottomNav from '../components/BottomNav'
import { isTabBarVisible } from '../utils/routeMeta'
import MagicAssistantModal from '../components/MagicAssistantModal'
import ToolSearchDialog from '../components/ToolSearchDialog'
import CookieConsentBanner from '../components/CookieConsentBanner'
import RouteFallback from '../components/RouteFallback'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useAssistant } from '../context/AssistantContext'

/**
 * Coquille de l'application.
 * - Mobile : barre supérieure contextuelle (MobileAppBar) + barre d'onglets
 *   sur les écrans racines.
 * - Tablette / ordinateur : un seul en-tête (Header), pied de page sur grand écran.
 * Défilement : un nouvel écran s'ouvre en haut de page ; un retour arrière
 * retrouve la position où l'on avait quitté l'écran précédent.
 */
export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const navigationType = useNavigationType()
  const { t } = useTranslation()
  const { isOpen, close, isSearchOpen, openSearch, closeSearch } = useAssistant()
  const scrollPositions = useRef(new Map())
  const tabBar = isTabBarVisible(location.pathname)

  // Les fenêtres globales se ferment à chaque changement d'écran.
  useEffect(() => {
    close()
    closeSearch()
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mémorise la position de défilement de l'écran que l'on quitte.
  useEffect(() => {
    const key = location.key
    const positions = scrollPositions.current
    return () => positions.set(key, window.scrollY)
  }, [location.key])

  useLayoutEffect(() => {
    const saved = scrollPositions.current.get(location.key)
    window.scrollTo({ top: navigationType === 'POP' && saved !== undefined ? saved : 0, behavior: 'instant' })
  }, [location.key, navigationType])

  // Recherche d'outil au clavier : Ctrl/⌘ + K, comme dans les outils pro.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openSearch])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        {t('common.skipToContent')}
      </a>

      <MobileAppBar />
      <Header />

      <main
        id="main-content"
        tabIndex={-1}
        className={`flex-1 outline-none md:pb-0 ${tabBar ? 'pb-[calc(4rem+env(safe-area-inset-bottom))]' : 'pb-[env(safe-area-inset-bottom)]'}`}
      >
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <div key={location.pathname} className="animate-fade-in">
              <Outlet />
            </div>
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      <BottomNav />
      <CookieConsentBanner />

      <ToolSearchDialog open={isSearchOpen} onClose={closeSearch} />

      <MagicAssistantModal
        open={isOpen}
        onClose={close}
        onSelectTool={(tool) => {
          close()
          navigate(tool.route)
        }}
      />
    </div>
  )
}
