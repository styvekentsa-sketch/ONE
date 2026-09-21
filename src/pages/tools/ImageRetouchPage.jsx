import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Bandage, Download, Focus, Stamp } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import PrivacyBadge from '../../components/PrivacyBadge'
import { applyRedEyeReduction, exportCanvasToBlob } from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

const TABS = [
  { id: 'clone', label: 'Clonage & Correcteur', icon: Stamp },
  { id: 'redeye', label: 'Yeux rouges', icon: Focus },
]

function getPoint(e, el) {
  const rect = el.getBoundingClientRect()
  return { x: (e.clientX - rect.left) * (el.width / rect.width), y: (e.clientY - rect.top) * (el.height / rect.height) }
}

/**
 * Tampon de duplication (réel) + "Correcteur" en mélange doux (une version
 * simplifiée et honnêtement nommée du pinceau de guérison — pas de vraie
 * fusion sans-couture façon Poisson blending) + correction des yeux rouges
 * (réelle). L'outil pièce n'est pas inclus (même famille algorithmique que
 * la guérison avancée, hors de portée ici).
 */
export default function ImageRetouchPage() {
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'redeye' ? 'redeye' : 'clone'
  const [tab, setTab] = useState(initialTab)

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('clone') // clone | heal
  const [brushSize, setBrushSize] = useState(36)

  const canvasRef = useRef(null)
  const sourceRef = useRef(null) // { point, offset, snapshot }
  const dragRef = useRef(null) // { start } pour yeux rouges

  const syncPreview = () => setPreviewUrl(canvasRef.current.toDataURL())

  const handleFiles = async (files) => {
    const [imageFile] = files
    setError(null)
    try {
      const bitmap = await createImageBitmap(imageFile)
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      canvas.getContext('2d').drawImage(bitmap, 0, 0)
      canvasRef.current = canvas
      setFile(imageFile)
      syncPreview()
    } catch {
      setError('Impossible de charger cette image.')
    }
  }

  const handlePointerDown = (e) => {
    const point = getPoint(e, e.currentTarget)
    if (tab === 'clone') {
      if (e.altKey || !sourceRef.current) {
        sourceRef.current = { point, offset: null, snapshot: cloneCanvas(canvasRef.current) }
        return
      }
      if (!sourceRef.current.offset) {
        sourceRef.current.offset = { dx: point.x - sourceRef.current.point.x, dy: point.y - sourceRef.current.point.y }
      }
      sourceRef.current.painting = true
    } else if (tab === 'redeye') {
      dragRef.current = { start: point }
    }
  }

  const handlePointerMove = (e) => {
    if (tab !== 'clone' || !sourceRef.current?.painting || !sourceRef.current.offset) return
    const point = getPoint(e, e.currentTarget)
    const { dx, dy } = sourceRef.current.offset
    const size = brushSize
    const ctx = canvasRef.current.getContext('2d')
    ctx.save()
    ctx.beginPath()
    ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2)
    ctx.clip()
    if (mode === 'heal') ctx.globalAlpha = 0.55
    ctx.drawImage(sourceRef.current.snapshot, point.x - dx - size / 2, point.y - dy - size / 2, size, size, point.x - size / 2, point.y - size / 2, size, size)
    ctx.restore()
    syncPreview()
  }

  const handlePointerUp = (e) => {
    if (tab === 'clone' && sourceRef.current) sourceRef.current.painting = false
    if (tab === 'redeye' && dragRef.current) {
      const point = getPoint(e, e.currentTarget)
      const { start } = dragRef.current
      const x = Math.max(0, Math.round(Math.min(start.x, point.x) - 10))
      const y = Math.max(0, Math.round(Math.min(start.y, point.y) - 10))
      const w = Math.min(canvasRef.current.width - x, Math.abs(point.x - start.x) + 20 || 40)
      const h = Math.min(canvasRef.current.height - y, Math.abs(point.y - start.y) + 20 || 40)
      const ctx = canvasRef.current.getContext('2d')
      const region = ctx.getImageData(x, y, w, h)
      applyRedEyeReduction(region)
      ctx.putImageData(region, x, y)
      syncPreview()
      dragRef.current = null
    }
  }

  const handleDownload = async () => {
    if (!canvasRef.current || !file) return
    const blob = await exportCanvasToBlob(canvasRef.current, 'png')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.[^.]+$/, '')}_retouche.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addHistoryEntry({ toolId: 'clone-heal', toolName: 'Retouche Image', message: `Image retouchée — ${file.name}` })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link to="/image" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200">
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Bandage size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Retouche & Correction</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Clonage, correcteur et yeux rouges</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      {!file ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="image/*" hint="Déposez une image à retoucher" />
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
              <img
                src={previewUrl}
                alt={file.name}
                className="max-h-[60vh] max-w-full touch-none rounded"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {tab === 'clone' ? (
                <>
                  <div className="inline-flex rounded-full border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
                    {['clone', 'heal'].map((m) => (
                      <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 font-medium ${mode === m ? 'bg-indigo-500 text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {m === 'clone' ? 'Tampon' : 'Correcteur'}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Taille
                    <input type="range" min={10} max={120} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-24 accent-indigo-500" />
                  </label>
                  <span className="w-full text-xs text-zinc-500 dark:text-zinc-400">
                    Alt/Option + clic pour définir la source, puis peignez pour dupliquer. Outil pièce non inclus (bientôt disponible).
                  </span>
                </>
              ) : (
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Cliquez-glissez sur chaque œil rouge pour l'atténuer.</span>
              )}
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

function cloneCanvas(source) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  canvas.getContext('2d').drawImage(source, 0, 0)
  return canvas
}
