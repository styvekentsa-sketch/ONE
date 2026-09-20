import { Sparkles, Wand2, ArrowRight } from 'lucide-react'

export default function EasyModeCard({ onOpen }) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen()
    }
  }

  return (
    <div
      id="easy-mode"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={handleKeyDown}
      className="group relative col-span-full cursor-pointer overflow-hidden rounded-2xl border border-indigo-100 bg-linear-to-r from-indigo-50 via-purple-50 to-blue-50 p-6 text-slate-900 transition-all duration-200 ease-in-out hover:border-indigo-200 active:scale-[0.98] sm:p-8 lg:col-span-2 lg:row-span-2 dark:border-zinc-800 dark:bg-linear-to-r dark:from-zinc-900 dark:via-zinc-900 dark:to-indigo-950/40 dark:text-white dark:hover:border-indigo-500/50"
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />

      <div className="relative flex h-full flex-col justify-between">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-600 ring-1 ring-inset ring-indigo-500/20 dark:text-indigo-300">
            <Sparkles size={14} />
            Assistant Magique
          </span>

          <h2 className="mt-5 text-2xl font-bold leading-tight sm:text-3xl">
            Pas sûr de l’outil qu’il vous faut ?
          </h2>
          <p className="mt-3 max-w-md text-sm text-slate-700 sm:text-base dark:text-zinc-300">
            Laissez le <span className="font-semibold text-slate-900 dark:text-white">Mode Facile</span> vous
            guider pas à pas. Décrivez ce que vous voulez faire avec votre document,
            et on s’occupe du reste.
          </p>
        </div>

        <div className="relative mt-8 flex flex-wrap items-center gap-4">
          <button className="group/btn inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]">
            <Wand2 size={18} />
            Lancer l’Assistant
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
          </button>
          <span className="text-xs text-slate-500 dark:text-zinc-500">
            Idéal pour les débutants · 3 questions, 30 secondes
          </span>
        </div>
      </div>
    </div>
  )
}
