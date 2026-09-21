import { useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Blend, Download, Lasso, Wand2 } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import PrivacyBadge from '../../components/PrivacyBadge'
import { floodFillMask, maskFromPath, exportCanvasToBlob } from '../../utils/canvasEngine'
import { addHistoryEntry } from '../../utils/historyStorage'

const TABS = [
  { id: 'wand', label: 'Baguette Magique & Sélection Rapide', icon: Wand2 },
  { id: 'lasso', label: 'Lasso (Standard, Polygonal)', icon: Lasso },
  { id: 'masks', label: 'Masques de Fusion', icon: Blend },
]

function getPoint(e, el) {
  const rect = el.getBoundingClientRect()
  return { x: (e.clientX - rect.left) * (el.width / rect.width), y: (e.clientY - rect.top) * (el.height / rect.height) }
}

/**
 * Sélection par couleur (baguette magique, réel flood-fill), sélection
 * rapide (même algorithme, appliqué le long d'un glissement), lasso à main
 * levée et polygonal (réels), et un vrai éditeur de masque de fusion entre
 * deux images peint au pinceau. La plume (tracés bézier éditables) et le
 * lasso magnétique (accroche aux contours) ne sont pas inclus.
 */
export default function ImageSelectPage() {
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some((t) => t.id === searchParams.get('tab')) ? searchParams.get('tab') : 'wand'
  const [tab, setTab] = useState(initialTab)

  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [error, setError] = useState(null)
  const [tolerance, setTolerance] = useState(32)
  const [lassoMode, setLassoMode] = useState('freehand')
  const [selection, setSelection] = useState(null)

  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const selectDragRef = useRef(null)
  const polygonRef = useRef([])

  // --- Masques (onglet dédié, canvas séparé) ---
  const [baseUrl, setBaseUrl] = useState(null)
  const [overlayImgUrl, setOverlayImgUrl] = useState(null)
  const maskBaseRef = useRef(null)
  const maskOverlayRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const maskPaintingRef = useRef(false)
  const [maskBrush, setMaskBrush] = useState('reveal')

  const syncPreview = () => setPreviewUrl(canvasRef.current.toDataURL())
  const syncMaskPreview = () => setOverlayImgUrl(renderMaskComposite())

  const renderMaskComposite = () => {
    if (!maskBaseRef.current || !maskOverlayRef.current || !maskCanvasRef.current) return null
    const { width, height } = maskBaseRef.current
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    ctx.drawImage(maskBaseRef.current, 0, 0)
    const overlayBuffer = document.createElement('canvas')
    overlayBuffer.width = width
    overlayBuffer.height = height
    const obCtx = overlayBuffer.getContext('2d')
    obCtx.drawImage(maskOverlayRef.current, 0, 0, width, height)
    obCtx.globalCompositeOperation = 'destination-in'
    obCtx.drawImage(maskCanvasRef.current, 0, 0)
    ctx.drawImage(overlayBuffer, 0, 0)
    return out.toDataURL()
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
      canvasRef.current = canvas
      setFile(imageFile)
      setSelection(null)
      syncPreview()
    } catch {
      setError('Impossible de charger cette image.')
    }
  }

  const handleBaseFiles = async (files) => {
    const bitmap = await createImageBitmap(files[0])
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    maskBaseRef.current = canvas
    setBaseUrl(canvas.toDataURL())

    const mask = document.createElement('canvas')
    mask.width = bitmap.width
    mask.height = bitmap.height
    const mctx = mask.getContext('2d')
    mctx.fillStyle = '#000'
    mctx.fillRect(0, 0, mask.width, mask.height)
    maskCanvasRef.current = mask
  }

  const handleOverlayFiles = async (files) => {
    const bitmap = await createImageBitmap(files[0])
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    canvas.getContext('2d').drawImage(bitmap, 0, 0)
    maskOverlayRef.current = canvas
    if (maskBaseRef.current) syncMaskPreview()
  }

  const paintMask = (point) => {
    if (!maskCanvasRef.current) return
    const ctx = maskCanvasRef.current.getContext('2d')
    ctx.fillStyle = maskBrush === 'reveal' ? '#fff' : '#000'
    ctx.beginPath()
    ctx.arc(point.x, point.y, 28, 0, Math.PI * 2)
    ctx.fill()
    syncMaskPreview()
  }

  const renderOverlayOutline = (mask) => {
    const canvas = overlayRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    if (!mask) return
    const imageData = ctx.createImageData(canvas.width, canvas.height)
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 0) {
        imageData.data[i * 4] = 56
        imageData.data[i * 4 + 1] = 130
        imageData.data[i * 4 + 2] = 246
        imageData.data[i * 4 + 3] = 90
      }
    }
    ctx.putImageData(imageData, 0, 0)
  }

  const handleWandPointerDown = (e) => {
    const point = getPoint(e, e.currentTarget)
    const ctx = canvasRef.current.getContext('2d')
    const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    const mask = floodFillMask(data, Math.round(point.x), Math.round(point.y), tolerance)
    selectDragRef.current = mask
    setSelection(mask)
    renderOverlayOutline(mask)
  }

  const handleWandPointerMove = (e) => {
    if (!selectDragRef.current) return
    const point = getPoint(e, e.currentTarget)
    const ctx = canvasRef.current.getContext('2d')
    const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    const local = floodFillMask(data, Math.round(point.x), Math.round(point.y), tolerance)
    for (let i = 0; i < local.length; i++) if (local[i] > 0) selectDragRef.current[i] = 255
    setSelection(new Uint8ClampedArray(selectDragRef.current))
    renderOverlayOutline(selectDragRef.current)
  }

  const handleLassoPointerDown = (e) => {
    const point = getPoint(e, e.currentTarget)
    if (lassoMode === 'polygon') {
      polygonRef.current.push(point)
      drawPolygonPreview()
    } else {
      selectDragRef.current = { points: [point] }
    }
  }

  const handleLassoPointerMove = (e) => {
    if (lassoMode !== 'freehand' || !selectDragRef.current) return
    const point = getPoint(e, e.currentTarget)
    selectDragRef.current.points.push(point)
    const ctx = overlayRef.current.getContext('2d')
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    const pts = selectDragRef.current.points
    ctx.moveTo(pts[0].x, pts[0].y)
    pts.forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.stroke()
  }

  const handleLassoPointerUp = () => {
    if (lassoMode !== 'freehand' || !selectDragRef.current) return
    const points = selectDragRef.current.points
    if (points.length > 2) {
      const path = new Path2D()
      path.moveTo(points[0].x, points[0].y)
      points.forEach((p) => path.lineTo(p.x, p.y))
      path.closePath()
      const mask = maskFromPath(path, canvasRef.current.width, canvasRef.current.height)
      setSelection(mask)
      renderOverlayOutline(mask)
    }
    selectDragRef.current = null
  }

  const drawPolygonPreview = () => {
    const ctx = overlayRef.current.getContext('2d')
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    const points = polygonRef.current
    ctx.strokeStyle = '#3b82f6'
    ctx.lineWidth = 1.5
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y))
    ctx.stroke()
    points.forEach((p) => {
      ctx.fillStyle = '#3b82f6'
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2)
      ctx.fill()
    })
  }

  const closePolygon = () => {
    const points = polygonRef.current
    if (points.length < 3) {
      polygonRef.current = []
      return
    }
    const path = new Path2D()
    path.moveTo(points[0].x, points[0].y)
    points.slice(1).forEach((p) => path.lineTo(p.x, p.y))
    path.closePath()
    const mask = maskFromPath(path, canvasRef.current.width, canvasRef.current.height)
    setSelection(mask)
    renderOverlayOutline(mask)
    polygonRef.current = []
  }

  const handleExtractSelection = () => {
    if (!selection || !canvasRef.current) return
    const { width, height } = canvasRef.current
    let minX = width, minY = height, maxX = 0, maxY = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (selection[y * width + x] > 0) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < minX) return
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const octx = out.getContext('2d')
    octx.drawImage(canvasRef.current, -minX, -minY)
    const data = octx.getImageData(0, 0, w, h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const globalIdx = (y + minY) * width + (x + minX)
        if (selection[globalIdx] === 0) data.data[(y * w + x) * 4 + 3] = 0
      }
    }
    octx.putImageData(data, 0, 0)
    downloadCanvas(out, 'selection_extraite.png')
  }

  const handleDeleteSelection = () => {
    if (!selection || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    const data = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)
    for (let i = 0; i < selection.length; i++) {
      if (selection[i] > 0) data.data[i * 4 + 3] = 0
    }
    ctx.putImageData(data, 0, 0)
    syncPreview()
  }

  const downloadCanvas = async (canvas, name) => {
    const blob = await exportCanvasToBlob(canvas, 'png')
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    addHistoryEntry({ toolId: 'magic-quick-select', toolName: 'Sélection Image', message: name })
  }

  const handleDownloadMask = () => {
    if (!maskBaseRef.current) return
    const composite = document.createElement('canvas')
    composite.width = maskBaseRef.current.width
    composite.height = maskBaseRef.current.height
    const ctx = composite.getContext('2d')
    ctx.drawImage(maskBaseRef.current, 0, 0)
    if (maskOverlayRef.current) {
      const buffer = document.createElement('canvas')
      buffer.width = composite.width
      buffer.height = composite.height
      const bctx = buffer.getContext('2d')
      bctx.drawImage(maskOverlayRef.current, 0, 0, composite.width, composite.height)
      bctx.globalCompositeOperation = 'destination-in'
      bctx.drawImage(maskCanvasRef.current, 0, 0)
      ctx.drawImage(buffer, 0, 0)
    }
    downloadCanvas(composite, 'fusion_masque.png')
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link to="/image" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200">
        <ArrowLeft size={16} /> Retour aux outils Image
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Wand2 size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Sélection & Découpage</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Baguette magique, lasso et masques de fusion</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}

      <div className="mt-6 inline-flex flex-wrap rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
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

      {tab === 'masks' ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {!baseUrl ? (
            <DragDropZone onFiles={handleBaseFiles} multiple={false} accept="image/*" hint="Déposez l'image de fond" />
          ) : !maskOverlayRef.current ? (
            <DragDropZone onFiles={handleOverlayFiles} multiple={false} accept="image/*" hint="Déposez l'image à fusionner par-dessus" />
          ) : (
            <>
              <div className="flex justify-center overflow-auto rounded-xl bg-zinc-100 p-4 dark:bg-zinc-950/40">
                <img
                  src={overlayImgUrl}
                  alt="Fusion"
                  className="max-h-[60vh] max-w-full touch-none rounded"
                  onPointerDown={(e) => {
                    maskPaintingRef.current = true
                    paintMask(getPoint(e, e.currentTarget))
                  }}
                  onPointerMove={(e) => maskPaintingRef.current && paintMask(getPoint(e, e.currentTarget))}
                  onPointerUp={() => (maskPaintingRef.current = false)}
                  onPointerLeave={() => (maskPaintingRef.current = false)}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                <div className="inline-flex rounded-full border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
                  {['reveal', 'hide'].map((m) => (
                    <button key={m} onClick={() => setMaskBrush(m)} className={`rounded-full px-3 py-1 font-medium ${maskBrush === m ? 'bg-indigo-500 text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                      {m === 'reveal' ? 'Révéler' : 'Masquer'}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Peignez pour révéler ou masquer l'image du dessus (plume non incluse).</span>
                <button onClick={handleDownloadMask} className="ml-auto inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white">
                  <Download size={14} /> Télécharger
                </button>
              </div>
            </>
          )}
        </div>
      ) : !file ? (
        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="image/*" hint="Déposez une image à sélectionner" />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="relative flex justify-center overflow-auto rounded-xl bg-zinc-100 p-4 dark:bg-zinc-950/40">
              <div className="relative">
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="max-h-[60vh] max-w-full touch-none rounded"
                  onPointerDown={tab === 'wand' ? handleWandPointerDown : handleLassoPointerDown}
                  onPointerMove={tab === 'wand' ? handleWandPointerMove : handleLassoPointerMove}
                  onPointerUp={tab === 'wand' ? () => (selectDragRef.current = null) : handleLassoPointerUp}
                  onDoubleClick={() => lassoMode === 'polygon' && closePolygon()}
                  onLoad={(e) => {
                    overlayRef.current.width = e.currentTarget.naturalWidth
                    overlayRef.current.height = e.currentTarget.naturalHeight
                  }}
                />
                <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
              {tab === 'wand' && (
                <>
                  <label className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Tolérance
                    <input type="range" min={1} max={128} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-28 accent-indigo-500" />
                  </label>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Cliquez pour sélectionner par couleur, glissez pour étendre (sélection rapide).</span>
                </>
              )}
              {tab === 'lasso' && (
                <>
                  <div className="inline-flex rounded-full border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
                    {['freehand', 'polygon'].map((m) => (
                      <button key={m} onClick={() => setLassoMode(m)} className={`rounded-full px-3 py-1 font-medium ${lassoMode === m ? 'bg-indigo-500 text-white' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        {m === 'freehand' ? 'Standard' : 'Polygonal'}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {lassoMode === 'polygon' ? 'Cliquez pour ajouter des points, double-cliquez pour fermer.' : 'Glissez pour tracer la sélection.'} Lasso magnétique non inclus.
                  </span>
                </>
              )}
              {selection && (
                <div className="flex w-full gap-2 border-t border-zinc-100 pt-3 dark:border-white/10">
                  <button onClick={handleExtractSelection} className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm font-medium text-zinc-600 dark:border-zinc-700 dark:text-zinc-300">
                    Extraire la sélection
                  </button>
                  <button onClick={handleDeleteSelection} className="rounded-full border border-red-200 px-4 py-1.5 text-sm font-medium text-red-600 dark:border-red-500/30 dark:text-red-400">
                    Supprimer la sélection
                  </button>
                </div>
              )}
            </div>
          </div>

          <button onClick={() => setFile(null)} className="self-start text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
            Changer d'image
          </button>
        </div>
      )}
    </div>
  )
}
