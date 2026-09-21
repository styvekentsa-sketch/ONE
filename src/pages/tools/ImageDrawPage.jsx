import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Download, Paintbrush, PaintBucket, Type } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import { floodFillMask, exportCanvasToBlob } from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

const TABS = [
  { id: 'brush', label: 'Pinceau, Crayon & Gomme', icon: Paintbrush },
  { id: 'fill', label: 'Pot de Peinture & Dégradés', icon: PaintBucket },
  { id: 'text', label: 'Texte', icon: Type },
]

function getPoint(e, el) {
  const rect = el.getBoundingClientRect()
  return { x: (e.clientX - rect.left) * (el.width / rect.width), y: (e.clientY - rect.top) * (el.height / rect.height) }
}

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

/**
 * Dessin & graphisme : pinceau/crayon/gomme, pot de peinture, dégradés et
 * texte — tous réels (Canvas2D). La "vectorisation" du texte (conversion en
 * tracés éditables) n'est pas incluse : le texte reste ici un calque de
 * pixels, pas des contours vectoriels (il faudrait analyser les glyphes de
 * la police, hors de portée sans une librairie dédiée).
 */
export default function ImageDrawPage() {
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'brush'
  const [tab, setTab] = useState(initialTab)

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)

  const [tool, setTool] = useState('brush') // brush | pencil | eraser (dans l'onglet Pinceau)
  const [fillTool, setFillTool] = useState('bucket') // bucket | gradient
  const [brushSize, setBrushSize] = useState(24)
  const [color, setColor] = useState('#1f2937')
  const [tolerance, setTolerance] = useState(32)
  const [gradientColors, setGradientColors] = useState({ from: '#6366f1', to: '#ec4899' })
  const [gradientType, setGradientType] = useState('linear')
  const [textDraft, setTextDraft] = useState({ content: 'Votre texte', size: 48, pending: null })

  const canvasRef = useRef(null)
  const strokeRef = useRef(null)

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

  const handlePointerDown = (e, displayEl) => {
    const point = getPoint(e, displayEl)
    if (tab === 'brush') {
      strokeRef.current = { last: point }
    } else if (tab === 'fill') {
      if (fillTool === 'gradient') strokeRef.current = { start: point }
      else applyBucket(point)
    } else if (tab === 'text') {
      setTextDraft((d) => ({ ...d, pending: point }))
    }
  }

  const handlePointerMove = (e, displayEl) => {
    if (tab === 'brush' && strokeRef.current) {
      const point = getPoint(e, displayEl)
      const ctx = canvasRef.current.getContext('2d')
      ctx.save()
      ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over'
      ctx.strokeStyle = color
      ctx.lineWidth = brushSize
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.globalAlpha = tool === 'pencil' ? 1 : 0.85
      ctx.beginPath()
      ctx.moveTo(strokeRef.current.last.x, strokeRef.current.last.y)
      ctx.lineTo(point.x, point.y)
      ctx.stroke()
      ctx.restore()
      strokeRef.current.last = point
      syncPreview()
    }
  }

  const handlePointerUp = () => {
    strokeRef.current = null
  }

  const applyBucket = (point) => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const mask = floodFillMask(data, Math.round(point.x), Math.round(point.y), tolerance)
    const [r, g, b] = hexToRgb(color)
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 0) {
        data.data[i * 4] = r
        data.data[i * 4 + 1] = g
        data.data[i * 4 + 2] = b
        data.data[i * 4 + 3] = 255
      }
    }
    ctx.putImageData(data, 0, 0)
    syncPreview()
  }

  const applyGradient = (endPoint) => {
    if (!strokeRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const { start } = strokeRef.current
    const grad =
      gradientType === 'linear'
        ? ctx.createLinearGradient(start.x, start.y, endPoint.x, endPoint.y)
        : ctx.createRadialGradient(start.x, start.y, 0, start.x, start.y, Math.hypot(endPoint.x - start.x, endPoint.y - start.y))
    grad.addColorStop(0, gradientColors.from)
    grad.addColorStop(1, gradientColors.to)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    strokeRef.current = null
    syncPreview()
  }

  const insertText = () => {
    if (!textDraft.pending) return
    const ctx = canvasRef.current.getContext('2d')
    ctx.font = `${textDraft.size}px system-ui, sans-serif`
    ctx.fillStyle = color
    ctx.textBaseline = 'top'
    ctx.fillText(textDraft.content, textDraft.pending.x, textDraft.pending.y)
    setTextDraft((d) => ({ ...d, pending: null }))
    syncPreview()
  }

  const handleDownload = async () => {
    if (!canvasRef.current || !file) return
    const blob = await exportCanvasToBlob(canvasRef.current, 'png')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.[^.]+$/, '')}_dessin.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addHistoryEntry({ toolId: 'brush-tools', toolName: 'Dessin Image', message: `Image annotée — ${file.name}` })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link to="/image" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200">
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Paintbrush size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Dessin & Graphisme</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Pinceau, remplissage, dégradés et texte</p>
        </div>
      </div>

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      {!file ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="image/*" hint="Déposez une image à retoucher" />
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-4">
          <div className="inline-flex flex-wrap self-start rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
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
                onPointerDown={(e) => handlePointerDown(e, e.currentTarget)}
                onPointerMove={(e) => handlePointerMove(e, e.currentTarget)}
                onPointerUp={(e) => (tab === 'fill' && fillTool === 'gradient' ? applyGradient(getPoint(e, e.currentTarget)) : handlePointerUp())}
                onPointerLeave={handlePointerUp}
              />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {tab === 'brush' && (
                <>
                  <div className="inline-flex rounded-full border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
                    {['brush', 'pencil', 'eraser'].map((t) => (
                      <button key={t} onClick={() => setTool(t)} className={`rounded-full px-3 py-1 font-medium capitalize ${tool === t ? 'bg-indigo-500 text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {t === 'brush' ? 'Pinceau' : t === 'pencil' ? 'Crayon' : 'Gomme'}
                      </button>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Taille
                    <input type="range" min={2} max={100} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} className="w-24 accent-indigo-500" />
                  </label>
                  {tool !== 'eraser' && <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700" />}
                </>
              )}

              {tab === 'fill' && (
                <>
                  <div className="inline-flex rounded-full border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
                    {['bucket', 'gradient'].map((t) => (
                      <button key={t} onClick={() => setFillTool(t)} className={`rounded-full px-3 py-1 font-medium ${fillTool === t ? 'bg-indigo-500 text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {t === 'bucket' ? 'Pot de peinture' : 'Dégradé'}
                      </button>
                    ))}
                  </div>
                  {fillTool === 'bucket' ? (
                    <>
                      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700" />
                      <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        Tolérance
                        <input type="range" min={1} max={128} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-24 accent-indigo-500" />
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="inline-flex rounded-full border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
                        {['linear', 'radial'].map((t) => (
                          <button key={t} onClick={() => setGradientType(t)} className={`rounded-full px-3 py-1 font-medium ${gradientType === t ? 'bg-indigo-500 text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                            {t === 'linear' ? 'Linéaire' : 'Radial'}
                          </button>
                        ))}
                      </div>
                      <input type="color" value={gradientColors.from} onChange={(e) => setGradientColors((g) => ({ ...g, from: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700" />
                      <input type="color" value={gradientColors.to} onChange={(e) => setGradientColors((g) => ({ ...g, to: e.target.value }))} className="h-8 w-10 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700" />
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">Cliquez-glissez sur l'image</span>
                    </>
                  )}
                </>
              )}

              {tab === 'text' && (
                <>
                  <input value={textDraft.content} onChange={(e) => setTextDraft((d) => ({ ...d, content: e.target.value }))} className="w-40 rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                  <input type="number" min={8} max={200} value={textDraft.size} onChange={(e) => setTextDraft((d) => ({ ...d, size: Number(e.target.value) }))} className="w-16 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800" />
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-zinc-200 dark:border-zinc-700" />
                  <button onClick={insertText} disabled={!textDraft.pending} className="rounded-full bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                    {textDraft.pending ? 'Insérer ici' : 'Cliquez sur l\'image'}
                  </button>
                  <p className="w-full text-xs text-zinc-500 dark:text-zinc-400">Vectorisation (texte en tracés éditables) non incluse (bientôt disponible).</p>
                </>
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
