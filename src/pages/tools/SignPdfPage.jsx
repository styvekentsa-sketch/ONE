import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eraser,
  PenTool,
  Upload,
} from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import PrivacyBadge from '../../components/PrivacyBadge'
import { loadPdfDocument, renderPageToCanvas } from '../../utils/pdfRender'
import { signPdf } from '../../utils/pdfWorker'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  CAPTURE: 'capture',
  PLACE: 'place',
  PROCESSING: 'processing',
  DONE: 'done',
}

const DISPLAY_SCALE = 1.3
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export default function SignPdfPage() {
  const { t } = useTranslation()
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [pdfFile, setPdfFile] = useState(null)
  const [pageCount, setPageCount] = useState(0)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageImage, setPageImage] = useState(null) // { dataUrl, width, height }
  const [sigMode, setSigMode] = useState('draw')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [sigFile, setSigFile] = useState(null)
  const [signature, setSignature] = useState(null) // { previewUrl, mime }
  const [sigPos, setSigPos] = useState({ x: 40, y: 40 })
  const [sigSize, setSigSize] = useState({ width: 160, height: 80 })
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)

  const pdfDocRef = useRef(null)
  const canvasRef = useRef(null)
  const isDrawingRef = useRef(false)
  const containerRef = useRef(null)
  const dragStateRef = useRef(null)

  const loadPage = async (index) => {
    const canvas = await renderPageToCanvas(pdfDocRef.current, index + 1, DISPLAY_SCALE)
    const image = { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
    setPageImage(image)
    // Position par défaut : coin bas-droit, taille proportionnelle à la page.
    const width = Math.min(200, image.width * 0.3)
    setSigSize({ width, height: width / 2 })
    setSigPos({ x: image.width - width - 24, y: image.height - width / 2 - 24 })
  }

  const handleFiles = async (files) => {
    const [file] = files
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)

    try {
      const buffer = await file.arrayBuffer()
      pdfDocRef.current = await loadPdfDocument(buffer)
      setPdfFile(file)
      setPageCount(pdfDocRef.current.numPages)
      setPageIndex(0)
      await loadPage(0)
      setStep(STEPS.CAPTURE)
    } catch (err) {
      console.error(err)
      setError(t('common.corruptedPdf'))
    }
  }

  // --- Dessin de la signature à main levée ---
  const getCanvasPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    }
  }

  const handleDrawStart = (e) => {
    const canvas = canvasRef.current
    canvas.setPointerCapture(e.pointerId)
    isDrawingRef.current = true
    const ctx = canvas.getContext('2d')
    const pos = getCanvasPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const handleDrawMove = (e) => {
    if (!isDrawingRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getCanvasPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
    setHasDrawn(true)
  }

  const handleDrawEnd = (e) => {
    isDrawingRef.current = false
    canvasRef.current?.releasePointerCapture?.(e.pointerId)
  }

  const handleClearDrawing = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const handleSignatureFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      setError(t('tools.sign.errorInvalidImage'))
      return
    }
    setError(null)
    setSigFile(file)
  }

  const handleContinueToPlace = () => {
    if (sigMode === 'draw') {
      if (!hasDrawn) {
        setError(t('tools.sign.errorNoDrawing'))
        return
      }
      setSignature({ previewUrl: canvasRef.current.toDataURL('image/png'), mime: 'image/png' })
    } else {
      if (!sigFile) {
        setError(t('tools.sign.errorNoImage'))
        return
      }
      setSignature({ previewUrl: URL.createObjectURL(sigFile), mime: sigFile.type })
    }
    setError(null)
    setStep(STEPS.PLACE)
  }

  const goToPage = async (index) => {
    if (index < 0 || index >= pageCount) return
    setPageIndex(index)
    await loadPage(index)
  }

  // --- Glisser-déposer / redimensionner la signature sur l'aperçu ---
  const getScaleFactor = () => {
    const rect = containerRef.current.getBoundingClientRect()
    return pageImage.width / rect.width
  }

  const handleDragMove = (e) => {
    const state = dragStateRef.current
    if (!state) return
    const dx = (e.clientX - state.startX) * state.scaleFactor
    const dy = (e.clientY - state.startY) * state.scaleFactor

    if (state.mode === 'move') {
      setSigPos({
        x: clamp(state.origPos.x + dx, 0, pageImage.width - state.origSize.width),
        y: clamp(state.origPos.y + dy, 0, pageImage.height - state.origSize.height),
      })
    } else {
      const newWidth = clamp(state.origSize.width + dx, 40, pageImage.width)
      const ratio = state.origSize.height / state.origSize.width
      setSigSize({ width: newWidth, height: newWidth * ratio })
    }
  }

  const handleDragEnd = () => {
    dragStateRef.current = null
    window.removeEventListener('pointermove', handleDragMove)
    window.removeEventListener('pointerup', handleDragEnd)
  }

  const startDrag = (mode) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    dragStateRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origPos: { ...sigPos },
      origSize: { ...sigSize },
      scaleFactor: getScaleFactor(),
    }
    window.addEventListener('pointermove', handleDragMove)
    window.addEventListener('pointerup', handleDragEnd)
  }

  const handleApply = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const imageBytes =
        sigMode === 'draw'
          ? new Uint8Array(await (await fetch(signature.previewUrl)).arrayBuffer())
          : new Uint8Array(await sigFile.arrayBuffer())

      const pdfX = sigPos.x / DISPLAY_SCALE
      const pdfY = (pageImage.height - (sigPos.y + sigSize.height)) / DISPLAY_SCALE
      const pdfWidth = sigSize.width / DISPLAY_SCALE
      const pdfHeight = sigSize.height / DISPLAY_SCALE

      const buffer = await pdfFile.arrayBuffer()
      const bytes = await signPdf(buffer, {
        pageIndex,
        imageBytes,
        imageType: signature.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png',
        x: pdfX,
        y: pdfY,
        width: pdfWidth,
        height: pdfHeight,
      })

      const blob = new Blob([bytes], { type: 'application/pdf' })
      setDownloadUrl(URL.createObjectURL(blob))

      addHistoryEntry({
        toolId: 'sign',
        toolName: t('tools.sign.name'),
        message: `Signature ajoutée (page ${pageIndex + 1}) — ${pdfFile.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.sign.errorGeneric'))
      setStep(STEPS.PLACE)
    }
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = 'ONE_signed.pdf'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const handleRestart = () => {
    pdfDocRef.current = null
    setPdfFile(null)
    setPageImage(null)
    setSigFile(null)
    setSignature(null)
    setHasDrawn(false)
    setDownloadUrl(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <PenTool size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.sign.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.sign.subtitle')}</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        {error && (
          <p className="mb-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
            {error}
          </p>
        )}

        {step === STEPS.UPLOAD && (
          <DragDropZone
            onFiles={handleFiles}
            multiple={false}
            accept="application/pdf"
            hint={t('tools.sign.dropHint')}
          />
        )}

        {step === STEPS.CAPTURE && (
          <div className="flex flex-col gap-6">
            <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
              <button
                onClick={() => setSigMode('draw')}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                  sigMode === 'draw'
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <PenTool size={14} /> {t('tools.sign.drawTab')}
              </button>
              <button
                onClick={() => setSigMode('upload')}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                  sigMode === 'upload'
                    ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                <Upload size={14} /> {t('tools.sign.uploadTab')}
              </button>
            </div>

            {sigMode === 'draw' ? (
              <div className="flex flex-col gap-3">
                <canvas
                  ref={canvasRef}
                  width={500}
                  height={180}
                  onPointerDown={handleDrawStart}
                  onPointerMove={handleDrawMove}
                  onPointerUp={handleDrawEnd}
                  onPointerLeave={handleDrawEnd}
                  className="aspect-[500/180] w-full touch-none rounded-xl border border-zinc-200 bg-white [cursor:crosshair] dark:border-white/10 dark:bg-zinc-950/40"
                />
                <button
                  onClick={handleClearDrawing}
                  className="mx-auto inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <Eraser size={14} /> {t('tools.sign.clearDrawing')}
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-8 text-center transition-colors duration-200 hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50">
                <Upload size={24} className="text-zinc-400" />
                <span className="text-sm text-zinc-500 dark:text-zinc-400">
                  {sigFile ? sigFile.name : t('tools.sign.chooseImage')}
                </span>
                <input type="file" accept="image/png,image/jpeg" onChange={handleSignatureFile} className="sr-only" />
              </label>
            )}

            <button
              onClick={handleContinueToPlace}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              {t('tools.sign.continueButton')}
            </button>
          </div>
        )}

        {step === STEPS.PLACE && pageImage && signature && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
              <button
                onClick={() => goToPage(pageIndex - 1)}
                disabled={pageIndex === 0}
                aria-label={t('tools.sign.previousPage')}
                className="rounded-full p-1.5 transition-colors duration-200 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >
                <ChevronLeft size={16} />
              </button>
              <span>{t('tools.sign.pageIndicator', { current: pageIndex + 1, total: pageCount })}</span>
              <button
                onClick={() => goToPage(pageIndex + 1)}
                disabled={pageIndex === pageCount - 1}
                aria-label={t('tools.sign.nextPage')}
                className="rounded-full p-1.5 transition-colors duration-200 hover:bg-zinc-100 disabled:opacity-30 dark:hover:bg-zinc-800"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div ref={containerRef} className="relative mx-auto w-full max-w-md select-none">
              <img
                src={pageImage.dataUrl}
                alt={`Page ${pageIndex + 1}`}
                className="w-full rounded-lg border border-zinc-200 dark:border-white/10"
                draggable={false}
              />
              <div
                onPointerDown={startDrag('move')}
                style={{
                  left: `${(sigPos.x / pageImage.width) * 100}%`,
                  top: `${(sigPos.y / pageImage.height) * 100}%`,
                  width: `${(sigSize.width / pageImage.width) * 100}%`,
                  height: `${(sigSize.height / pageImage.height) * 100}%`,
                }}
                className="absolute touch-none cursor-move border-2 border-dashed border-indigo-500 bg-white/50"
              >
                <img
                  src={signature.previewUrl}
                  alt="Signature"
                  className="pointer-events-none h-full w-full object-contain"
                  draggable={false}
                />
                <span
                  onPointerDown={startDrag('resize')}
                  className="absolute -bottom-1.5 -right-1.5 h-4 w-4 touch-none rounded-full border-2 border-white bg-indigo-500 [cursor:se-resize]"
                />
              </div>
            </div>
            <p className="text-center text-xs text-zinc-400">{t('tools.sign.dragResizeHint')}</p>

            <button
              onClick={handleApply}
              className="mx-auto inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
            >
              <PenTool size={18} /> {t('tools.sign.applyButton')}
            </button>
          </div>
        )}

        {step === STEPS.PROCESSING && (
          <ProcessingState icon={PenTool} title={t('tools.sign.processingTitle')} duration={1000} />
        )}

        {step === STEPS.DONE && (
          <div className="flex flex-col items-center gap-5 py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
              <CheckCircle2 size={28} />
            </span>
            <div>
              <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.sign.doneTitle')}</p>
              <p className="mt-1 text-sm text-zinc-400">{t('tools.sign.doneDescription')}</p>
            </div>
            <DownloadButton fileName="ONE_signed.pdf" onDownload={handleDownload} />
            <button
              onClick={handleRestart}
              className="text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              {t('tools.sign.restartLabel')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
