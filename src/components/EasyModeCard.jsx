import { useTranslation } from 'react-i18next'
import { ArrowRight, Wand2 } from 'lucide-react'

/**
 * Entrée vers l'Assistant (Mode Facile) : déposer un fichier et se voir
 * proposer le bon outil. Bandeau sobre, sans dégradé ni halo.
 */
export default function EasyModeCard({ onOpen, className = '' }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`group flex w-full items-center gap-4 rounded-2xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-stone-300 active:bg-stone-50 sm:p-5 dark:border-stone-800 dark:bg-stone-900 dark:hover:border-stone-700 dark:active:bg-stone-800 ${className}`}
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
        <Wand2 size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-stone-900 dark:text-white">{t('easyModeCard.title')}</span>
        <span className="mt-0.5 block text-sm text-stone-500 dark:text-stone-400">{t('easyModeCard.text')}</span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-stone-400 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
