import { useTranslation } from 'react-i18next'
import { CircleUserRound } from 'lucide-react'

/**
 * Page de destination de l'onglet "Mon Compte" (header desktop et barre de
 * navigation mobile). Contenu minimal pour l'instant — à enrichir quand la
 * gestion de compte sera implémentée.
 */
export default function Account() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800/80 dark:text-zinc-400">
        <CircleUserRound size={28} />
      </span>
      <div>
        <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{t('common.myAccount')}</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('common.comingSoon')}</p>
      </div>
    </div>
  )
}
