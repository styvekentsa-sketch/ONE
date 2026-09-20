import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Crop, Download, Maximize2 } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import PrivacyBadge from '../../components/PrivacyBadge'
import { exportCanvasToBlob } from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

const TABS = [
  { id: 'crop', label: 'Recadrage & Redressement', icon: Crop },
  { id: 'free', label: 'Rotation, Échelle & Miroir', icon: Maximize2 },
]

function getPoint(e, canvas) {
  const rect = canvas.getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  }
}

/**
 * Recadrage/redressement et transformation libre (rotation, échelle,
 * miroir) — de vraies opérations Canvas2D. Déformation et perspective ne
 * sont pas incluses : un vrai warp non affine demande soit WebGL, soit un
 * remappage pixel par pixel bien plus lourd qu'une session ne le permet
 * honnêtement.
 */
export default function ImageTransformPage() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'free' ? 'free' : 'crop'
  const [tab, setTab] = useState(initialTab)

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)
  const [rotateStraighten, setRotateStraighten] = useState(0)
  const [cropRect, setCropRect] = useState(null)
  const [transformDraft, setTransformDraft] = useState({ rotate: 0, scale: 100, flipH: false, flipV: false })

  const workingCanvasRef = useRef(null)
  const displayCanvasRef = useRef(null)
  const overlayCanvasRef = useRef(null)
  const dragRef = useRef(null)

  const syncDisplay = () => {
    const working = workingCanvasRef.current
    setPreviewUrl(working.toDataURL())
  }

  const handleFiles = async (files) => {
    const [imageFile] = files
    setError(null)
    try {
      const bitmap = await createImageBitmap(imageFile)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      workingCanvasRef.current = canvas
      setFile(imageFile)
      setCropRect(null)
      setRotateStraighten(0)
      syncDisplay()
    } catch {
      setError('Impossible de charger cette image.')
    }
  }

  const displaySize = () => {
    const c = workingCanvasRef.current
    return c ? { width: c.width, height: c.height } : { width: 0, height: 0 }
  }

  const handlePointerDown = (e) => {
    if (tab !== 'crop' || !displayCanvasRef.current) return
    const point = getPoint(e, displayCanvasRef.current)
    dragRef.current = { start: point }
  }

  const handlePointerMove = (e) => {
    if (tab !== 'crop' || !dragRef.current || !overlayCanvasRef.current) return
    const point = getPoint(e, displayCanvasRef.current)
    const { start } = dragRef.current
    const rect = {
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    }
    dragRef.current.rect = rect

    const ctx = overlayCanvasRef.current.getContext('2d')
    ctx.clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height)
    ctx.clearRect(rect.x, rect.y, rect.width, rect.height)
    ctx.strokeStyle = '#fff'
    ctx.setLineDash([5, 4])
    ctx.strokeRect(rect.x, rect.y, rect.width, rect.height)
  }

  const handlePointerUp = () => {
    if (tab !== 'crop' || !dragRef.current?.rect) {
      dragRef.current = null
      return
    }
    setCropRect(dragRef.current.rect)
    dragRef.current = null
  }

  const applyStraighten = () => {
    const working = workingCanvasRef.current
    const { width, height } = working
    const snapshot = document.createElement('canvas')
    snapshot.width = width
    snapshot.height = height
    snapshot.getContext('2d').drawImage(working, 0, 0)

    const ctx = working.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.rotate((rotateStraighten * Math.PI) / 180)
    ctx.drawImage(snapshot, -width / 2, -height / 2)
    ctx.restore()
    setRotateStraighten(0)
    syncDisplay()
  }

  const applyCrop = () => {
    if (!cropRect) return
    const working = workingCanvasRef.current
    const x = Math.round(cropRect.x)
    const y = Math.round(cropRect.y)
    const width = Math.max(1, Math.round(cropRect.width))
    const height = Math.max(1, Math.round(cropRect.height))

    const cropped = document.createElement('canvas')
    cropped.width = width
    cropped.height = height
    cropped.getContext('2d').drawImage(working, -x, -y)
    workingCanvasRef.current = cropped
    setCropRect(null)
    if (overlayCanvasRef.current) {
      overlayCanvasRef.current.getContext('2d').clearRect(0, 0, overlayCanvasRef.current.width, overlayCanvasRef.current.height)
    }
    syncDisplay()
  }

  const applyFreeTransform = () => {
    const working = workingCanvasRef.current
    const { width, height } = working
    const snapshot = document.createElement('canvas')
    snapshot.width = width
    snapshot.height = height
    snapshot.getContext('2d').drawImage(working, 0, 0)

    const ctx = working.getContext('2d')
    ctx.clearRect(0, 0, width, height)
    ctx.save()
    ctx.translate(width / 2, height / 2)
    ctx.rotate((transformDraft.rotate * Math.PI) / 180)
    ctx.scale((transformDraft.flipH ? -1 : 1) * (transformDraft.scale / 100), (transformDraft.flipV ? -1 : 1) * (transformDraft.scale / 100))
    ctx.drawImage(snapshot, -width / 2, -height / 2)
    ctx.restore()
    setTransformDraft({ rotate: 0, scale: 100, flipH: false, flipV: false })
    syncDisplay()
  }

  const handleDownload = async () => {
    if (!workingCanvasRef.current || !file) return
    const blob = await exportCanvasToBlob(workingCanvasRef.current, 'png')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.[^.]+$/, '')}_transforme.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addHistoryEntry({ toolId: 'crop-straighten', toolName: 'Transformation Image', message: `Image transformée — ${file.name}` })
  }

  const { width, height } = displaySize()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/image"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Crop size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Transformation & Géométrie</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Recadrage, redressement, rotation, échelle et miroir</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {!file ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="image/*" hint="Déposez une image à transformer" />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="inline-flex self-start rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                  tab === id ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex justify-center overflow-auto rounded-xl bg-zinc-100 p-4 dark:bg-zinc-950/40">
              <div className="relative" style={{ width, height, maxWidth: '100%' }}>
                <img ref={displayCanvasRef} src={previewUrl} alt={file.name} width={width} height={height} className="block h-auto max-w-full touch-none" style={{ width, height }} />
                <canvas
                  ref={overlayCanvasRef}
                  width={width}
                  height={height}
                  className="absolute inset-0 h-auto max-w-full touch-none"
                  style={{ width, height, cursor: tab === 'crop' ? 'crosshair' : 'default' }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                />
              </div>
            </div>

            {tab === 'crop' ? (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Redressement
                  <input type="range" min={-45} max={45} value={rotateStraighten} onChange={(e) => setRotateStraighten(Number(e.target.value))} className="w-32 accent-indigo-500" />
                  <span className="font-mono">{rotateStraighten}°</span>
                </label>
                <button onClick={applyStraighten} disabled={rotateStraighten === 0} className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-600 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300">
                  Appliquer le redressement
                </button>
                <button onClick={applyCrop} disabled={!cropRect} className="rounded-full bg-indigo-500 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-40">
                  Appliquer le recadrage
                </button>
                <span className="text-xs text-zinc-400">Glissez sur l'image pour définir la zone à recadrer</span>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Rotation
                  <input type="range" min={-180} max={180} value={transformDraft.rotate} onChange={(e) => setTransformDraft((d) => ({ ...d, rotate: Number(e.target.value) }))} className="w-28 accent-indigo-500" />
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                  Échelle
                  <input type="range" min={10} max={200} value={transformDraft.scale} onChange={(e) => setTransformDraft((d) => ({ ...d, scale: Number(e.target.value) }))} className="w-28 accent-indigo-500" />
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <input type="checkbox" checked={transformDraft.flipH} onChange={(e) => setTransformDraft((d) => ({ ...d, flipH: e.target.checked }))} /> Miroir horizontal
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <input type="checkbox" checked={transformDraft.flipV} onChange={(e) => setTransformDraft((d) => ({ ...d, flipV: e.target.checked }))} /> Miroir vertical
                </label>
                <button onClick={applyFreeTransform} className="rounded-full bg-indigo-500 px-4 py-1.5 text-sm font-semibold text-white">
                  Appliquer
                </button>
                <p className="w-full text-xs text-zinc-400">Déformation et perspective non incluses (bientôt disponible).</p>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setFile(null)} className="text-sm font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
              Changer d'image
            </button>
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <Download size={16} /> Télécharger le résultat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
