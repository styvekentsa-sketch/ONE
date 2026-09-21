import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Download, Maximize2 } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { exportCanvasToBlob } from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

/**
 * Transformation libre (rotation, échelle, miroir) — de vraies opérations
 * Canvas2D. Le recadrage/redressement a sa propre fiche dédiée ailleurs
 * dans l'app (reste possible directement dans une galerie mobile, donc pas
 * retenu ici) ; déformation et perspective ne sont pas incluses : un vrai
 * warp non affine demande soit WebGL, soit un remappage pixel par pixel
 * bien plus lourd qu'une session ne le permet honnêtement.
 */
export default function ImageTransformPage() {
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)
  const [transformDraft, setTransformDraft] = useState({ rotate: 0, scale: 100, flipH: false, flipV: false })

  const workingCanvasRef = useRef(null)

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
      syncDisplay()
    } catch {
      setError('Impossible de charger cette image.')
    }
  }

  const displaySize = () => {
    const c = workingCanvasRef.current
    return c ? { width: c.width, height: c.height } : { width: 0, height: 0 }
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
    addHistoryEntry({ toolId: 'transform-geometry', toolName: 'Transformation Image', message: `Image transformée — ${file.name}` })
  }

  const { width, height } = displaySize()

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/image"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Maximize2 size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Rotation, Échelle & Miroir</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Rotation, mise à l'échelle et miroir horizontal/vertical</p>
        </div>
      </div>

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {!file ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="image/*" hint="Déposez une image à transformer" />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex justify-center overflow-auto rounded-xl bg-zinc-100 p-4 dark:bg-zinc-950/40">
              <div style={{ width, height, maxWidth: '100%' }}>
                <img src={previewUrl} alt={file.name} width={width} height={height} className="block h-auto max-w-full" style={{ width, height }} />
              </div>
            </div>

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
              <p className="w-full text-xs text-zinc-500 dark:text-zinc-400">Déformation et perspective non incluses (bientôt disponible).</p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <button onClick={() => setFile(null)} className="text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
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
