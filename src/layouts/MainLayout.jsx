import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import MediaNavBar from '../components/MediaNavBar'
import Footer from '../components/Footer'
import BottomNav from '../components/BottomNav'
import TabletNav from '../components/TabletNav'
import MagicAssistantModal from '../components/MagicAssistantModal'
import HistoryModal from '../components/HistoryModal'
import RouteFallback from '../components/RouteFallback'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { useAssistant } from '../context/AssistantContext'

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
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
      <Header onOpenHistory={() => setIsHistoryOpen(true)} />
      <MediaNavBar />
      <TabletNav />

      <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <ErrorBoundary resetKey={location.pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>

      <Footer />
      <BottomNav />

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
