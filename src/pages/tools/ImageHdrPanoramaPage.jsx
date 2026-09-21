import { Link } from 'react-router-dom'
import { ArrowLeft, GalleryHorizontal } from 'lucide-react'

/**
 * Fusion HDR et assemblage panoramique reposent sur des algorithmes de
 * vision par ordinateur (alignement de features, estimation d'homographie,
 * fusion d'expositions) hors de portée d'une implémentation Canvas2D
 * honnête en une session — mieux vaut le dire clairement que de simuler un
 * résultat.
 */
export default function ImageHdrPanoramaPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/image"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <GalleryHorizontal size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Fusion HDR & Panoramique</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Multi-expositions et assemblage panoramique</p>
        </div>
      </div>

      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300">
          <GalleryHorizontal size={24} />
        </span>
        <p className="font-semibold text-zinc-800 dark:text-white">Bientôt disponible</p>
        <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          La fusion HDR (alignement + fusion d'expositions) et l'assemblage panoramique (détection de points
          d'intérêt + estimation d'homographie) demandent des algorithmes de vision par ordinateur nettement plus
          complexes que le reste du Studio Image. Nous préférons ne rien livrer plutôt qu'un résultat approximatif
          présenté comme fiable.
        </p>
      </div>
    </div>
  )
}
