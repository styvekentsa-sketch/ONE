import { lazy } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AssistantProvider } from './context/AssistantContext'
import MainLayout from './layouts/MainLayout'
import Home from './pages/Home'

// Pages d'outils chargées à la demande : leur code (et les grosses
// dépendances qu'elles importent, pdf-lib / pdfjs-dist) n'est téléchargé
// que lorsqu'on ouvre la route correspondante, pas au chargement initial.
const ToolPage = lazy(() => import('./pages/ToolPage'))
const MergePdfPage = lazy(() => import('./pages/tools/MergePdfPage'))
const SplitPdfPage = lazy(() => import('./pages/tools/SplitPdfPage'))
const CompressPdfPage = lazy(() => import('./pages/tools/CompressPdfPage'))
const CleanMetadataPage = lazy(() => import('./pages/tools/CleanMetadataPage'))
const AutoRedactPage = lazy(() => import('./pages/tools/AutoRedactPage'))
const ComparePdfPage = lazy(() => import('./pages/tools/ComparePdfPage'))
const ProtectPdfPage = lazy(() => import('./pages/tools/ProtectPdfPage'))
const PdfToImagePage = lazy(() => import('./pages/tools/PdfToImagePage'))
const WatermarkPage = lazy(() => import('./pages/tools/WatermarkPage'))
const PageNumbersPage = lazy(() => import('./pages/tools/PageNumbersPage'))
const DeletePagesPage = lazy(() => import('./pages/tools/DeletePagesPage'))
const SignPdfPage = lazy(() => import('./pages/tools/SignPdfPage'))
const PdfToTextPage = lazy(() => import('./pages/tools/PdfToTextPage'))
const ExtractImagesPage = lazy(() => import('./pages/tools/ExtractImagesPage'))
const OrganizePdfPage = lazy(() => import('./pages/tools/OrganizePdfPage'))
const JpgToPdfPage = lazy(() => import('./pages/tools/JpgToPdfPage'))
const WordToPdfPage = lazy(() => import('./pages/tools/WordToPdfPage'))
const PdfToWordPage = lazy(() => import('./pages/tools/PdfToWordPage'))
const ExcelToPdfPage = lazy(() => import('./pages/tools/ExcelToPdfPage'))
const OcrPdfPage = lazy(() => import('./pages/tools/OcrPdfPage'))
const ToolsPage = lazy(() => import('./pages/ToolsPage'))
const MediaHubPage = lazy(() => import('./pages/MediaHubPage'))
const ImageHubPage = lazy(() => import('./pages/ImageHubPage'))
const AudioHubPage = lazy(() => import('./pages/AudioHubPage'))
const VideoHubPage = lazy(() => import('./pages/VideoHubPage'))
const ImageAdjustPage = lazy(() => import('./pages/tools/ImageAdjustPage'))
const ImageRetouchPage = lazy(() => import('./pages/tools/ImageRetouchPage'))
const ImageSelectPage = lazy(() => import('./pages/tools/ImageSelectPage'))
const ImageTransformPage = lazy(() => import('./pages/tools/ImageTransformPage'))
const ImageDrawPage = lazy(() => import('./pages/tools/ImageDrawPage'))
const ImageLayersPage = lazy(() => import('./pages/tools/ImageLayersPage'))
const ImageHdrPanoramaPage = lazy(() => import('./pages/tools/ImageHdrPanoramaPage'))
const ImageBatchPage = lazy(() => import('./pages/tools/ImageBatchPage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const EasyModePage = lazy(() => import('./pages/EasyModePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))
const Account = lazy(() => import('./pages/Account'))
const NotFound = lazy(() => import('./pages/NotFound'))
const LegalNotice = lazy(() => import('./pages/legal/LegalNotice'))
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy'))
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService'))
const CookiePolicy = lazy(() => import('./pages/legal/CookiePolicy'))
const RefundPolicy = lazy(() => import('./pages/legal/RefundPolicy'))

function App() {
  return (
    <AssistantProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<Home />} />
            {/* Pages sur mesure pour les outils avec une logique spécifique */}
            <Route path="/tool/merge-pdf" element={<MergePdfPage />} />
            <Route path="/tool/split-pdf" element={<SplitPdfPage />} />
            <Route path="/tool/compress-pdf" element={<CompressPdfPage />} />
            <Route path="/tool/clean-metadata" element={<CleanMetadataPage />} />
            <Route path="/tool/auto-redact" element={<AutoRedactPage />} />
            <Route path="/tool/compare-pdf" element={<ComparePdfPage />} />
            <Route path="/tool/protect-pdf" element={<ProtectPdfPage />} />
            <Route path="/tool/pdf-to-image" element={<PdfToImagePage />} />
            <Route path="/tool/watermark-pdf" element={<WatermarkPage />} />
            <Route path="/tool/page-numbers" element={<PageNumbersPage />} />
            <Route path="/tool/delete-pages" element={<DeletePagesPage />} />
            <Route path="/tool/sign-pdf" element={<SignPdfPage />} />
            <Route path="/tool/pdf-to-text" element={<PdfToTextPage />} />
            <Route path="/tool/extract-images" element={<ExtractImagesPage />} />
            <Route path="/tool/organize-pdf" element={<OrganizePdfPage />} />
            <Route path="/tool/jpg-to-pdf" element={<JpgToPdfPage />} />
            <Route path="/tool/word-to-pdf" element={<WordToPdfPage />} />
            <Route path="/tool/pdf-to-word" element={<PdfToWordPage />} />
            <Route path="/tool/excel-to-pdf" element={<ExcelToPdfPage />} />
            <Route path="/tool/ocr-pdf" element={<OcrPdfPage />} />
            <Route path="/tool/image-basic" element={<ImageHubPage />} />
            <Route path="/tool/audio-basic" element={<AudioHubPage />} />
            <Route path="/tool/video-basic" element={<VideoHubPage />} />
            <Route path="/tool/image-adjust" element={<ImageAdjustPage />} />
            <Route path="/tool/image-retouch" element={<ImageRetouchPage />} />
            <Route path="/tool/image-select" element={<ImageSelectPage />} />
            <Route path="/tool/image-transform" element={<ImageTransformPage />} />
            <Route path="/tool/image-draw" element={<ImageDrawPage />} />
            <Route path="/tool/image-layers" element={<ImageLayersPage />} />
            <Route path="/tool/image-hdr-panorama" element={<ImageHdrPanoramaPage />} />
            <Route path="/tool/image-batch" element={<ImageBatchPage />} />
            {/* Onglets de la barre de navigation mobile */}
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/easy-mode" element={<EasyModePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            {/* Hubs dédiés par grand type de média. `key` force un vrai
                démontage/remontage à chaque changement d'onglet : sans elle,
                comme les 4 routes rendent le même composant à la même
                position sous <Outlet/>, React se contente de mettre à jour
                les props sans redémarrer le composant — l'état interne de
                useFilteredTools (mediaType, initialisé une seule fois via
                useState) reste alors bloqué sur le premier média visité,
                et la grille continue d'afficher les outils de cet ancien
                média après avoir changé d'onglet. */}
            <Route path="/pdf" element={<MediaHubPage key="pdf" mediaType="pdf" />} />
            <Route path="/image" element={<MediaHubPage key="image" mediaType="image" />} />
            <Route path="/video" element={<MediaHubPage key="video" mediaType="video" />} />
            <Route path="/audio" element={<MediaHubPage key="audio" mediaType="audio" />} />
            {/* Page générique pour tous les autres outils */}
            <Route path="/tools/:toolId" element={<ToolPage />} />
            <Route path="/account" element={<Account />} />
            {/* Pages légales */}
            <Route path="/legal-notice" element={<LegalNotice />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/cookie-policy" element={<CookiePolicy />} />
            <Route path="/refund-policy" element={<RefundPolicy />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AssistantProvider>
  )
}

export default App
