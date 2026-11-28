import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'

/** Bouton de téléchargement principal, pleine largeur sur mobile. */
export default function DownloadButton({ fileName, onDownload, label, className = '' }) {
  const { t } = useTranslation()

  return (
    <button
      type="button"
      onClick={onDownload}
      className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 active:bg-brand-800 sm:w-auto ${className}`}
    >
      <Download size={18} />
      {label ?? t('common.downloadResult')}
      {fileName && <span className="hidden font-normal text-white/70 sm:inline">· {fileName}</span>}
    </button>
  )
}
