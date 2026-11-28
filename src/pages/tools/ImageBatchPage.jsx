import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Loader2, Package } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { buildCssFilter, bakeFilter, exportCanvasToBlob } from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

const PRESETS = [
  { id: 'none', label: 'Aucun (recompression seule)', values: {} },
  { id: 'bw', label: 'Noir & blanc', values: { saturate: 0 } },
  { id: 'sepia', label: 'Sépia', values: { saturate: 55, hueRotate: -20 } },
  { id: 'vivid', label: 'Vif', values: { saturate: 165, contrast: 112 } },
]

const BASE = { brightness: 100, contrast: 100, saturate: 100, hueRotate: 0, blur: 0 }

/**
 * Traitement par lots : applique un même préréglage (issu du même pipeline
 * de filtre CSS que l'outil Ajustements) à plusieurs images d'un coup et
 * les renvoie dans une seule archive ZIP — un vrai automatisme, à mi-chemin
 * entre "Actions/Scripts enregistrables" (hors de portée honnête ici) et
 * un simple traitement répété.
 */
export default function ImageBatchPage() {
  const [files, setFiles] = useState([])
  const [presetId, setPresetId] = useState('none')
  const [format, setFormat] = useState('jpeg')
  const [isBusy, setIsBusy] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)
  const isMountedRef = useRef(true)
  const abortedRef = useRef(false)

  useEffect(
    () => () => {
      isMountedRef.current = false
      // Beaucoup d'images = boucle potentiellement longue : si l'utilisateur
      // change de page en cours de route, on arrête dès la prochaine image
      // plutôt que de continuer à décoder/réencoder en arrière-plan.
      abortedRef.current = true
    },
    [],
  )

  const handleFiles = (dropped) => {
    setError(null)
    setFiles(dropped.filter((f) => f.type.startsWith('image/')))
  }

  const handleProcess = async () => {
    if (files.length === 0) return
    abortedRef.current = false
    setIsBusy(true)
    setError(null)
    setProgress({ done: 0, total: files.length })

    try {
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]
      const filterString = buildCssFilter({ ...BASE, ...preset.values })

      for (let i = 0; i < files.length; i++) {
        if (abortedRef.current) return

        const file = files[i]
        const bitmap = await createImageBitmap(file)
        const original = document.createElement('canvas')
        original.width = bitmap.width
        original.height = bitmap.height
        original.getContext('2d').drawImage(bitmap, 0, 0)

        const result = document.createElement('canvas')
        result.width = bitmap.width
        result.height = bitmap.height
        bakeFilter(original, result, filterString)

        const blob = await exportCanvasToBlob(result, format, 0.9)
        const ext = format === 'jpeg' ? 'jpg' : format
        zip.file(`${file.name.replace(/\.[^.]+$/, '')}.${ext}`, blob)
        if (isMountedRef.current) setProgress({ done: i + 1, total: files.length })
      }

      if (abortedRef.current) return

      const zipBlob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(zipBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'ONE_lot_images.zip'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)

      addHistoryEntry({ toolId: 'batch-processing', toolName: 'Traitement par lots', message: `${files.length} image(s) traitées` })
    } catch {
      if (isMountedRef.current) setError('Le traitement par lots a échoué sur au moins un fichier.')
    } finally {
      if (isMountedRef.current) setIsBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <Link
        to="/image"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
      >
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm dark:bg-stone-800/80 dark:text-white">
          <Package size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">Traitement par Lots</h1>
          <p className="text-stone-500 dark:text-stone-400">Appliquez un préréglage à plusieurs images et exportez en ZIP</p>
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      <div className="mt-6 flex flex-col gap-5 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900">
        <DragDropZone onFiles={handleFiles} multiple accept="image/*" hint="Déposez plusieurs images à traiter" />

        {files.length > 0 && <p className="text-sm text-stone-500 dark:text-stone-400">{files.length} fichier(s) sélectionné(s)</p>}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Préréglage</p>
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setPresetId(preset.id)}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                  presetId === preset.id
                    ? 'border-brand-500 bg-brand-500/5 text-brand-600 dark:text-brand-400'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300 dark:border-white/10 dark:text-stone-300 dark:hover:border-stone-700'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Format de sortie</p>
          <div className="grid grid-cols-3 gap-2">
            {['jpeg', 'png', 'webp'].map((f) => (
              <button
                key={f}
                onClick={() => setFormat(f)}
                className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold uppercase transition-all duration-200 ease-in-out active:scale-[0.98] ${
                  format === f
                    ? 'border-brand-500 bg-brand-500/5 text-brand-600 dark:text-brand-400'
                    : 'border-stone-200 text-stone-600 hover:border-stone-300 dark:border-white/10 dark:text-stone-300 dark:hover:border-stone-700'
                }`}
              >
                {f === 'jpeg' ? 'JPG' : f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleProcess}
          disabled={files.length === 0 || isBusy}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isBusy ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
          {isBusy ? `Traitement… ${progress.done}/${progress.total}` : 'Traiter et télécharger (ZIP)'}
        </button>
      </div>
    </div>
  )
}
