// Version verrouillée du logo : un badge carré aux coins arrondis pour le
// "1" suivi du texte "ONE", sans bordure ni ombre ni conteneur rectangulaire
// englobant.
// Le composant gère lui-même l'alignement (flex items-center gap-2) pour un
// rendu identique dans le Header et le Footer, quelle que soit la taille.
const SIZES = {
  sm: { badge: 'h-6 w-6 text-xs', text: 'text-sm' },
  md: { badge: 'h-8 w-8 text-sm', text: 'text-lg' },
}

export default function Logo({ size = 'md', className = '' }) {
  const { badge, text } = SIZES[size] ?? SIZES.md

  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span
        className={`flex shrink-0 items-center justify-center rounded-lg bg-zinc-900 font-bold text-white ${badge}`}
        aria-hidden="true"
      >
        1
      </span>
      <span className={`font-extrabold tracking-tight text-zinc-900 dark:text-white ${text}`}>ONE</span>
    </span>
  )
}
