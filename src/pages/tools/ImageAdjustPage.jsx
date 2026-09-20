import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Contrast, Download } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import PrivacyBadge from '../../components/PrivacyBadge'
import AdjustmentsPanel from '../../components/studio/AdjustmentsPanel'
import {
  buildCssFilter, bakeFilter, sharpenImageData, buildLevelsLUT, buildSimplifiedCurveLUT,
  applyLUT, applyChannelOffsets, applyGradientMap, exportCanvasToBlob,
} from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

const DEFAULT_ADJUSTMENTS = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  hueRotate: 0,
  blur: 0,
  sharpen: 0,
  levels: { inputMin: 0, inputMax: 255, gamma: 1 },
  curve: { shadows: 0, midtones: 128, highlights: 255 },
  channelOffsets: { r: 0, g: 0, b: 0 },
  gradientMap: { enabled: false, from: '#000000', to: '#ffffff' },
}

const PRESET_VALUES = {
  none: {},
  bw: { saturate: 0 },
  sepia: { saturate: 55, hueRotate: -20, channelOffsets: { r: 20, g: 5, b: -15 } },
  vivid: { saturate: 165, contrast: 112 },
  cool: { hueRotate: 12, channelOffsets: { r: -10, g: 0, b: 18 } },
  warm: { hueRotate: -10, channelOffsets: { r: 18, g: 5, b: -10 } },
}

const TAB_TITLES = {
  basic: 'Luminosité & Contraste',
  levels: 'Niveaux & Courbes',
  color: 'Teinte, Saturation & Balance des couleurs',
  sharpen: 'Netteté & Flou',
  presets: 'Filtres & Styles',
}

/**
 * Outil "Ajustements & Couleurs" unifié : chaque fiche de la grille Image
 * (Luminosité & Contraste, Niveaux & Courbes, Teinte/Saturation/Balance,
 * Netteté & Flou, Filtres) pointe ici — ce sont des facettes d'un même
 * pipeline de réglages réel (voir canvasEngine.js), pas des gadgets
 * séparés. `?tab=` ne fait qu'ajuster le titre affiché.
 */
export default function ImageAdjustPage() {
  const [searchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'basic'

  const [file, setFile] = useState(null)
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS)
  const [error, setError] = useState(null)
  const originalCanvasRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const handleFiles = async (files) => {
    const [imageFile] = files
    setError(null)
    try {
      const bitmap = await createImageBitmap(imageFile)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      originalCanvasRef.current = canvas
      setFile(imageFile)
      setAdjustments(DEFAULT_ADJUSTMENTS)
    } catch {
      setError('Impossible de charger cette image.')
    }
  }

  useEffect(() => {
    if (!originalCanvasRef.current) return

    if (!previewCanvasRef.current) {
      previewCanvasRef.current = document.createElement('canvas')
    }
    const preview = previewCanvasRef.current
    preview.width = originalCanvasRef.current.width
    preview.height = originalCanvasRef.current.height

    bakeFilter(originalCanvasRef.current, preview, buildCssFilter(adjustments))

    const ctx = preview.getContext('2d')
    let imageData = ctx.getImageData(0, 0, preview.width, preview.height)
    if (adjustments.sharpen > 0) imageData = sharpenImageData(imageData, adjustments.sharpen / 100)
    imageData = applyLUT(imageData, buildLevelsLUT(adjustments.levels))
    imageData = applyLUT(imageData, buildSimplifiedCurveLUT(adjustments.curve))
    imageData = applyChannelOffsets(imageData, adjustments.channelOffsets)
    if (adjustments.gradientMap.enabled) {
      imageData = applyGradientMap(imageData, [
        { offset: 0, color: adjustments.gradientMap.from },
        { offset: 1, color: adjustments.gradientMap.to },
      ])
    }
    ctx.putImageData(imageData, 0, 0)

    setPreviewUrl(preview.toDataURL())
  }, [adjustments, file])

  const handleApplyPreset = (presetId) => setAdjustments({ ...DEFAULT_ADJUSTMENTS, ...PRESET_VALUES[presetId] })
  const handleReset = () => setAdjustments(DEFAULT_ADJUSTMENTS)

  const handleApply = async () => {
    if (!previewCanvasRef.current || !file) return
    const blob = await exportCanvasToBlob(previewCanvasRef.current, 'png')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.[^.]+$/, '')}_ajuste.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addHistoryEntry({ toolId: 'brightness-contrast', toolName: 'Ajustements Image', message: `Image ajustée — ${file.name}` })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/image"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Contrast size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{TAB_TITLES[tab] ?? 'Ajustements & Couleurs'}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Réglages réels (pixel par pixel), aperçu en direct</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {!file ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="image/*" hint="Déposez une image à ajuster" />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-950/40">
              {previewUrl && <img src={previewUrl} alt={file.name} className="max-h-full max-w-full object-contain" />}
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="truncate">{file.name}</span>
              <button
                onClick={() => setFile(null)}
                className="shrink-0 font-medium text-indigo-500 transition-colors duration-200 hover:text-indigo-400 dark:text-indigo-400"
              >
                Changer d'image
              </button>
            </div>
            <button
              onClick={handleApply}
              className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <Download size={16} /> Télécharger le résultat
            </button>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <AdjustmentsPanel
              values={adjustments}
              onChange={setAdjustments}
              onApplyPreset={handleApplyPreset}
              onApply={handleApply}
              onReset={handleReset}
              hasSelection={false}
              applyLabel="Télécharger le résultat"
            />
          </div>
        </div>
      )}
    </div>
  )
}
