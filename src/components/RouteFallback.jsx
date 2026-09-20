import { Loader2 } from 'lucide-react'

/** Affiché pendant le chargement du chunk d'une page ouverte via React.lazy. */
export default function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <Loader2 size={28} className="animate-spin text-indigo-500" />
    </div>
  )
}
