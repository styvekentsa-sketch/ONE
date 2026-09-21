import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Header from '../components/Header'
import MediaNavBar from '../components/MediaNavBar'
import Footer from '../components/Footer'
import BottomNav from '../components/BottomNav'
import TabletNav from '../components/TabletNav'
import MagicAssistantModal from '../components/MagicAssistantModal'
import HistoryModal from '../components/HistoryModal'
import CookieConsentBanner from '../components/CookieConsentBanner'
import RouteFallback from '../components/RouteFallback'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useAssistant } from '../context/AssistantContext'

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { t } = useTranslation()
  const { isOpen, close } = useAssistant()
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)

  // Un changement de route ferme systématiquement les fenêtres globales
  // (Assistant Magique, Historique) : elles vivent dans ce layout partagé
  // par toutes les pages, donc rien ne les referme automatiquement quand on
  // navigue ailleurs (bouton "précédent" du navigateur compris) — sans ça,
  // une modale reste ouverte par-dessus la page suivante.
  useEffect(() => {
    close()
    setIsHistoryOpen(false)
  }, [location.pathname]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-full focus:bg-indigo-500 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
      >
        {t('common.skipToContent')}
      </a>

      <Header onOpenHistory={() => setIsHistoryOpen(true)} />
      <MediaNavBar />
      <TabletNav />

      <main id="main-content" tabIndex={-1} className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] outline-none md:pb-0">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      <BottomNav />
      <CookieConsentBanner />

      <MagicAssistantModal
        open={isOpen}
        onClose={close}
        onSelectTool={(tool) => {
          close()
          navigate(tool.route)
        }}
      />

      <HistoryModal open={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} />
    </div>
  )
}
