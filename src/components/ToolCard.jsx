import { Link } from 'react-router-dom'

// Carte entièrement adaptative au thème, à toutes les tailles d'écran :
// blanc pur en clair, zinc profond en sombre — aucune couleur sombre
// figée en dur, y compris sur mobile (revient sur l'ancienne convention
// "toujours sombre" façon app native, qui masquait le mode clair).
//
// Empilement vertical (icône, puis texte, puis catégorie) à toutes les
// tailles, hauteur pleine (`h-full`, la grille parente stretch déjà chaque
// ligne) et zones de titre/description à hauteur réservée (`min-h-*` +
// `line-clamp-2`) — un titre court ou une description longue ne doivent
// jamais changer la hauteur finale de la carte. La catégorie reste ancrée
// en bas (`mt-auto`) quelle que soit la longueur du texte au-dessus.
// Le survol "flottant" (hover:-translate-y/shadow renforcée) n'apparaît
// qu'à partir de lg: : sur tablette (tactile, pas de souris), on ne compte
// que sur active:scale au toucher.
export default function ToolCard({ tool, style }) {
  const Icon = tool.icon

  return (
    <Link
      to={tool.route}
      style={style}
      className="group animate-fade-up relative flex h-full flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-center text-slate-900 shadow-sm transition-all duration-200 ease-in-out hover:border-slate-300 hover:shadow-sm active:scale-95 md:items-start md:gap-3 md:p-5 md:text-left lg:hover:-translate-y-1 lg:hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:border-zinc-700"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-800 transition-colors duration-200 group-hover:bg-indigo-500/10 group-hover:text-indigo-500 md:h-12 md:w-12 dark:bg-zinc-800 dark:text-zinc-200 dark:group-hover:text-indigo-400">
        <Icon className="h-4.5 w-4.5 md:h-5.5 md:w-5.5" />
      </span>

      <div className="flex w-full min-w-0 flex-1 flex-col">
        <h3 className="line-clamp-2 min-h-9 text-xs font-semibold leading-tight text-slate-900 md:min-h-12 md:text-base md:leading-normal dark:text-zinc-100">
          {tool.name}
        </h3>
        <p className="mt-1 hidden min-h-10 line-clamp-2 text-sm leading-snug text-slate-600 md:block dark:text-zinc-400">
          {tool.description}
        </p>
      </div>

      <span className="mt-auto hidden pt-2 text-xs font-medium uppercase tracking-wide text-slate-500 md:inline-block dark:text-zinc-500">
        {tool.category}
      </span>
    </Link>
  )
}
