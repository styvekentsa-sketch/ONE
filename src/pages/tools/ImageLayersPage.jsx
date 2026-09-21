import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Layers as LayersIcon } from 'lucide-react'
import PrivacyBadge from '../../components/PrivacyBadge'
import LayersPanel from '../../components/studio/LayersPanel'
import { createLayer, compositeLayers, exportCanvasToBlob } from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

/**
 * Empilement de calques avec opacité et modes de fusion réellement natifs
 * (`globalCompositeOperation` — Normal/Multiplier/Écran/Incrustation…,
 * exactement les mêmes noms que Photoshop). Les masques de fusion se
 * gèrent depuis "Sélection & Découpage" (peinture de masque) ; objets
 * intelligents et styles de calque avancés ne sont pas inclus ici.
 */
export default function ImageLayersPage() {
  const docRef = useRef({ width: 0, height: 0, layers: [] })
  const canvasRef = useRef(null)
  const [hasDoc, setHasDoc] = useState(false)
  const [layers, setLayers] = useState([])
  const [activeLayerId, setActiveLayerId] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)

  const syncMeta = useCallback(() => {
    setLayers(
      docRef.current.layers.map((l) => ({
        id: l.id, name: l.name, visible: l.visible, opacity: l.opacity, blendMode: l.blendMode, locked: l.locked, maskCanvas: l.maskCanvas,
      })),
    )
  }, [])

  const redraw = useCallback(() => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
    }
    canvasRef.current.width = docRef.current.width
    canvasRef.current.height = docRef.current.height
    compositeLayers(docRef.current, canvasRef.current.getContext('2d'))
    setPreviewUrl(canvasRef.current.toDataURL())
  }, [])

  const addFromFile = async (file) => {
    const bitmap = await createImageBitmap(file)
    if (!hasDoc) {
      docRef.current = { width: bitmap.width, height: bitmap.height, layers: [] }
      setHasDoc(true)
    }
    const layer = createLayer({
      width: docRef.current.width,
      height: docRef.current.height,
      name: file.name.replace(/\.[^.]+$/, ''),
      image: bitmap,
    })
    docRef.current.layers.push(layer)
    setActiveLayerId(layer.id)
    syncMeta()
    redraw()
  }

  const addBlank = () => {
    if (!hasDoc) return
    const layer = createLayer({ width: docRef.current.width, height: docRef.current.height, name: `Calque ${docRef.current.layers.length + 1}` })
    docRef.current.layers.push(layer)
    setActiveLayerId(layer.id)
    syncMeta()
    redraw()
  }

  const mutate = (id, fn) => {
    const layer = docRef.current.layers.find((l) => l.id === id)
    if (!layer) return
    fn(layer)
    syncMeta()
    redraw()
  }

  const duplicate = (id) => {
    const source = docRef.current.layers.find((l) => l.id === id)
    if (!source) return
    const copy = createLayer({ width: docRef.current.width, height: docRef.current.height, name: `${source.name} copie` })
    copy.canvas.getContext('2d').drawImage(source.canvas, 0, 0)
    copy.opacity = source.opacity
    copy.blendMode = source.blendMode
    docRef.current.layers.splice(docRef.current.layers.indexOf(source) + 1, 0, copy)
    setActiveLayerId(copy.id)
    syncMeta()
    redraw()
  }

  const remove = (id) => {
    if (docRef.current.layers.length <= 1) return
    docRef.current.layers = docRef.current.layers.filter((l) => l.id !== id)
    if (activeLayerId === id) setActiveLayerId(docRef.current.layers[docRef.current.layers.length - 1].id)
    syncMeta()
    redraw()
  }

  const move = (id, dir) => {
    const layers2 = docRef.current.layers
    const index = layers2.findIndex((l) => l.id === id)
    const target = index + dir
    if (target < 0 || target >= layers2.length) return
    ;[layers2[index], layers2[target]] = [layers2[target], layers2[index]]
    syncMeta()
    redraw()
  }

  const toggleMask = (id) => {
    mutate(id, (l) => {
      if (l.maskCanvas) {
        l.maskCanvas = null
      } else {
        const mask = document.createElement('canvas')
        mask.width = l.canvas.width
        mask.height = l.canvas.height
        mask.getContext('2d').fillStyle = '#fff'
        mask.getContext('2d').fillRect(0, 0, mask.width, mask.height)
        l.maskCanvas = mask
      }
    })
  }

  const handleDownload = async () => {
    if (!canvasRef.current) return
    const blob = await exportCanvasToBlob(canvasRef.current, 'png')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ONE_calques.png'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addHistoryEntry({ toolId: 'layers-blend', toolName: 'Calques Image', message: `Composition exportée (${layers.length} calques)` })
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      <Link to="/image" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200">
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <LayersIcon size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Calques & Modes de Fusion</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Empilez des images avec opacité et modes de fusion réels</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      {!hasDoc ? (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Ajoutez une première image pour créer la composition.</p>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-400">
            Choisir une image
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files[0] && addFromFile(e.target.files[0])} />
          </label>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex aspect-video items-center justify-center overflow-hidden rounded-xl bg-[conic-gradient(#e5e5e5_90deg,#fff_90deg_180deg,#e5e5e5_180deg_270deg,#fff_270deg)] bg-[length:16px_16px] dark:bg-zinc-950/40">
              {previewUrl && <img src={previewUrl} alt="Composition" className="max-h-full max-w-full object-contain" />}
            </div>
            <button
              onClick={handleDownload}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <Download size={16} /> Télécharger la composition
            </button>
          </div>

          <div className="h-[28rem] rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <LayersPanel
              layers={layers}
              activeLayerId={activeLayerId}
              onSelect={setActiveLayerId}
              onAddBlank={addBlank}
              onAddFromFile={addFromFile}
              onDuplicate={duplicate}
              onDelete={remove}
              onToggleVisible={(id) => mutate(id, (l) => (l.visible = !l.visible))}
              onOpacityChange={(id, v) => mutate(id, (l) => (l.opacity = v))}
              onBlendModeChange={(id, v) => mutate(id, (l) => (l.blendMode = v))}
              onMoveUp={(id) => move(id, 1)}
              onMoveDown={(id) => move(id, -1)}
              onToggleMask={toggleMask}
              onRename={(id, name) => mutate(id, (l) => (l.name = name))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
