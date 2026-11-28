import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

/**
 * Entrée d'outil.
 * - Mobile : ligne de liste façon réglages natifs (icône, nom, description,
 *   chevron), facile à viser au pouce, regroupée dans une carte par section.
 * - Tablette et ordinateur : tuile de grille, hauteur homogène.
 */
export default function ToolCard({ tool, variant = 'tile' }) {
  const Icon = tool.icon

  if (variant === 'row') {
    return (
      <Link to={tool.route} className="flex min-h-16 items-center gap-3.5 px-4 py-3 transition-colors active:bg-stone-100 dark:active:bg-stone-800/70">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-100">
          <Icon size={20} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-stone-900 dark:text-white">{tool.name}</span>
          <span className="block truncate text-[13px] text-stone-500 dark:text-stone-400">{tool.description}</span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-stone-300 dark:text-stone-600" />
      </Link>
    )
  }

  return (
    <Link
      to={tool.route}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_8px_24px_-12px_rgb(28_25_23/0.18)] active:translate-y-0 active:scale-[0.99] dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-stone-100 text-stone-800 transition-colors group-hover:bg-brand-50 group-hover:text-brand-700 dark:bg-stone-800 dark:text-stone-100 dark:group-hover:bg-brand-500/15 dark:group-hover:text-brand-300">
        <Icon size={21} strokeWidth={1.9} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-semibold leading-snug text-stone-900 dark:text-white">{tool.name}</span>
        <span className="mt-1 line-clamp-2 block text-sm leading-snug text-stone-500 dark:text-stone-400">{tool.description}</span>
      </span>
    </Link>
  )
}
