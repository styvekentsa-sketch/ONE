const SIZES = {
  sm: { mark: 22, text: 'text-[17px]' },
  md: { mark: 26, text: 'text-lg' },
}

/**
 * Marque ONE : une feuille au coin replié, tracée à l'encre, avec un
 * trait cobalt. Sobre, lisible en petit, identique en clair et en sombre.
 */
export default function Logo({ size = 'md', className = '' }) {
  const { mark, text } = SIZES[size] ?? SIZES.md

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg width={mark} height={mark} viewBox="0 0 26 26" aria-hidden="true" className="shrink-0">
        <path d="M6 2.5h9.5L21 8v15.5H6z" className="fill-stone-900 dark:fill-white" />
        <path d="M15.5 2.5V8H21" className="fill-stone-600 dark:fill-stone-300" />
        <rect x="9" y="13" width="9" height="2.2" rx="1.1" className="fill-brand-500" />
        <rect x="9" y="17.4" width="6" height="2.2" rx="1.1" className="fill-stone-50 dark:fill-stone-900" opacity="0.55" />
      </svg>
      <span className={`font-bold tracking-tight text-stone-900 dark:text-white ${text}`}>ONE</span>
    </span>
  )
}
