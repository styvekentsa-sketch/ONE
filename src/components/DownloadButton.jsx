import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'

/**
 * Bouton de téléchargement générique, branchable sur n'importe quel outil
 * en lui passant simplement un nom de fichier et un callback.
 */
export default function DownloadButton({
  fileName,
  onDownload,
  label,
  className = '',
}) {
  const { t } = useTranslation()

  return (
    <button
      onClick={onDownload}
      className={`group inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] ${className}`}
    >
      <Download size={18} className="transition-transform group-hover:-translate-y-0.5" />
      {label ?? t('common.downloadResult')}
      {fileName && <span className="hidden text-white/70 sm:inline">· {fileName}</span>}
    </button>
  )
}
