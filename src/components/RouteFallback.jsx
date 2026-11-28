import { LoaderCircle } from 'lucide-react'

export default function RouteFallback() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" role="status">
      <LoaderCircle size={26} className="animate-spin text-stone-400" />
    </div>
  )
}
