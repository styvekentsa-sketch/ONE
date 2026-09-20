import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Image as ImageIcon, Loader2, Maximize2, Minimize2, RefreshCw } from 'lucide-react'
import DragDropZone from '../components/DragDropZone'
import DownloadButton from '../components/DownloadButton'
import PrivacyBadge from '../components/PrivacyBadge'
import { compressImage, convertImageFormat, resizeImage } from '../utils/imageWorker'
import { imageCompressionLevels, DEFAULT_IMAGE_COMPRESSION_LEVEL } from '../data/imageCompressionLevels'
import { addHistoryEntry } from '../utils/historyStorage'

const TABS = [
  { id: 'compress', icon: Minimize2 },
  { id: 'convert', icon: RefreshCw },
  { id: 'resize', icon: Maximize2 },
]

const FORMATS = ['jpeg', 'png', 'webp']
const RESOLUTION_OPTIONS = [100, 75, 50]

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`
}

export default function ImageHubPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'compress'
  const [tab, setTab] = useState(initialTab)

  const [file, setFile] = useState(null)
  const [originalUrl, setOriginalUrl] = useState(null)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [result, setResult] = useState(null) // { blob, url, width, height, format, ... }

  const defaultLevel = imageCompressionLevels.find((l) => l.id === DEFAULT_IMAGE_COMPRESSION_LEVEL)
  const [levelId, setLevelId] = useState(DEFAULT_IMAGE_COMPRESSION_LEVEL)
  const [quality, setQuality] = useState(Math.round(defaultLevel.quality * 100))
  const [resolutionPercent, setResolutionPercent] = useState(100)
  const [compressFormat, setCompressFormat] = useState('auto')
  const [targetFormat, setTargetFormat] = useState('jpeg')
  const [resizeMode, setResizeMode] = useState('percentage') // 'percentage' | 'pixels'
  const [percentage, setPercentage] = useState(100)
  const [width, setWidth] = useState('')
  const [height, setHeight] = useState('')
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true)

  const resultUrlRef = useRef(null)
  const originalUrlRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    return () => {
      if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
      if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current)
    }
  }, [])

  const handleFiles = (files) => {
    const [imageFile] = files
    const isImage = imageFile.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(imageFile.name)
    if (!isImage) {
      setError(t('tools.image-hub.errorInvalidFile'))
      return
    }
    setError(null)

    if (originalUrlRef.current) URL.revokeObjectURL(originalUrlRef.current)
    const url = URL.createObjectURL(imageFile)
    originalUrlRef.current = url

    setFile(imageFile)
    setOriginalUrl(url)
    setResult(null)
    setTargetFormat(imageFile.type === 'image/png' ? 'webp' : imageFile.type === 'image/webp' ? 'jpeg' : 'jpeg')
    setPercentage(100)
    setWidth('')
    setHeight('')
    setLevelId(DEFAULT_IMAGE_COMPRESSION_LEVEL)
    setQuality(Math.round(defaultLevel.quality * 100))
    setResolutionPercent(100)
    setCompressFormat('auto')
  }

  const handleSelectLevel = (level) => {
    setLevelId(level.id)
    setQuality(Math.round(level.quality * 100))
  }

  const handleChangeFile = () => {
    setFile(null)
    setOriginalUrl(null)
    setResult(null)
    setError(null)
  }

  // Retraite l'image (via imageWorker) à chaque changement d'option, avec un
  // léger anti-rebond pour ne pas relancer un encodage canvas à chaque frappe.
  useEffect(() => {
    if (!file) return

    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      setIsProcessing(true)
      setError(null)

      try {
        let outcome
        if (tab === 'compress') {
          const selectedLevel = imageCompressionLevels.find((l) => l.id === levelId)
          outcome = await compressImage(file, {
            quality: quality / 100,
            maxDimension: selectedLevel?.maxDimension ?? null,
            scalePercent: resolutionPercent,
            format: compressFormat,
          })
        } else if (tab === 'convert') {
          outcome = await convertImageFormat(file, targetFormat)
        } else {
          const opts =
            resizeMode === 'percentage'
              ? { percentage, maintainAspectRatio: true }
              : { width: width ? Number(width) : undefined, height: height ? Number(height) : undefined, maintainAspectRatio }
          outcome = await resizeImage(file, opts)
        }

        if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current)
        const url = URL.createObjectURL(outcome.blob)
        resultUrlRef.current = url

        setResult({ ...outcome, url })
      } catch (err) {
        console.error(err)
        setError(t('tools.image-hub.errorGeneric'))
      } finally {
        setIsProcessing(false)
      }
    }, 250)

    return () => clearTimeout(debounceRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, tab, quality, resolutionPercent, compressFormat, levelId, targetFormat, resizeMode, percentage, width, height, maintainAspectRatio])

  const handleDownload = () => {
    if (!result) return
    const baseName = file?.name?.replace(/\.[^.]+$/, '') || 'ONE_image'
    const ext = result.format === 'jpeg' ? 'jpg' : result.format
    const link = document.createElement('a')
    link.href = result.url
    link.download = `${baseName}.${ext}`
    document.body.appendChild(link)
    link.click()
    link.remove()

    addHistoryEntry({
      toolId: 'compress-image',
      toolName: t('tools.image-hub.name'),
      message: `Image traitée — ${file.name}`,
    })
  }

  const gainPercent =
    result && tab === 'compress' && file
      ? Math.max(0, Math.round((1 - result.compressedSize / file.size) * 100))
      : null

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <ImageIcon size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.image-hub.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.image-hub.subtitle')}</p>
        </div>
      </div>

      <PrivacyBadge className="mt-5" />

      {error && (
        <p className="mt-5 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      {!file ? (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <DragDropZone onFiles={handleFiles} multiple={false} accept="image/*" hint={t('tools.image-hub.dropHint')} />
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Aperçu */}
          <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-zinc-100 dark:bg-zinc-950/40">
              <img
                src={result?.url ?? originalUrl}
                alt={file.name}
                className="max-h-full max-w-full object-contain"
              />
              {isProcessing && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/30">
                  <Loader2 size={22} className="animate-spin text-white" />
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span className="truncate">{file.name}</span>
              <button
                onClick={handleChangeFile}
                className="shrink-0 font-medium text-indigo-500 transition-colors duration-200 hover:text-indigo-400 dark:text-indigo-400"
              >
                {t('tools.image-hub.changeFile')}
              </button>
            </div>

            {tab === 'compress' && result && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm dark:border-white/5 dark:bg-zinc-800/40">
                <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.image-hub.originalSize')}</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatBytes(file.size)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                  <span>{t('tools.image-hub.compressedSize')}</span>
                  <span className="font-medium text-zinc-700 dark:text-zinc-200">
                    {formatBytes(result.compressedSize)} · {result.format.toUpperCase()} · {result.width}×{result.height}px
                  </span>
                </div>
                {gainPercent !== null && (
                  <div className="mt-2 flex items-center justify-between border-t border-zinc-200 pt-2 dark:border-white/10">
                    <span className="text-zinc-500 dark:text-zinc-400">{t('tools.image-hub.gain')}</span>
                    <span
                      className={`font-semibold ${gainPercent > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}`}
                    >
                      {gainPercent > 0 ? `-${gainPercent}%` : t('tools.image-hub.noGain')}
                    </span>
                  </div>
                )}
                {result.keptOriginal && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t('tools.image-hub.keptOriginal')}</p>
                )}
              </div>
            )}

            {result && (tab === 'convert' || tab === 'resize') && (
              <div className="rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 text-sm text-zinc-500 dark:border-white/5 dark:bg-zinc-800/40 dark:text-zinc-400">
                {result.width} × {result.height} px · {result.format.toUpperCase()} · {formatBytes(result.blob.size)}
              </div>
            )}

            <DownloadButton
              fileName={file.name}
              onDownload={handleDownload}
              label={t('tools.image-hub.downloadButton')}
              className="w-full justify-center"
            />
          </div>

          {/* Options */}
          <div className="flex flex-col gap-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
              {TABS.map(({ id, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
                    tab === id
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                      : 'text-zinc-500 dark:text-zinc-400'
                  }`}
                >
                  <Icon size={14} />
                  {t(`tools.image-hub.tab${id[0].toUpperCase()}${id.slice(1)}`)}
                </button>
              ))}
            </div>

            {tab === 'compress' && (
              <div className="flex flex-col gap-5">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t('tools.image-hub.levelLabel')}
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {imageCompressionLevels.map((level) => (
                      <button
                        key={level.id}
                        onClick={() => handleSelectLevel(level)}
                        className={`flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 py-2 text-left transition-all duration-200 ease-in-out active:scale-[0.98] ${
                          levelId === level.id
                            ? 'border-indigo-500 bg-indigo-500/5'
                            : 'border-zinc-200 hover:border-zinc-300 dark:border-white/10 dark:hover:border-zinc-700'
                        }`}
                      >
                        <span className={`text-sm font-semibold ${levelId === level.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-800 dark:text-zinc-100'}`}>
                          {t(`tools.image-hub.levels.${level.id}.label`, level.label)}
                        </span>
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {t(`tools.image-hub.levels.${level.id}.description`, level.description)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="image-quality"
                    className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-400"
                  >
                    {t('tools.image-hub.quality')}
                    <span className="font-mono text-zinc-500 dark:text-zinc-400">{quality}%</span>
                  </label>
                  <input
                    id="image-quality"
                    type="range"
                    min={10}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full accent-indigo-500"
                  />
                  <p className="mt-2 text-xs text-zinc-400">{t('tools.image-hub.qualityHint')}</p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t('tools.image-hub.resolution')}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {RESOLUTION_OPTIONS.map((pct) => (
                      <button
                        key={pct}
                        onClick={() => setResolutionPercent(pct)}
                        className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition-all duration-200 ease-in-out active:scale-[0.98] ${
                          resolutionPercent === pct
                            ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{t('tools.image-hub.resolutionHint')}</p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t('tools.image-hub.compressFormat')}
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {['auto', 'webp', 'jpeg', 'png'].map((f) => (
                      <button
                        key={f}
                        onClick={() => setCompressFormat(f)}
                        className={`rounded-xl border-2 px-2 py-2 text-xs font-semibold uppercase transition-all duration-200 ease-in-out active:scale-[0.98] ${
                          compressFormat === f
                            ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
                            : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        {f === 'auto' ? t('tools.image-hub.formatAuto') : f === 'jpeg' ? 'JPG' : f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {compressFormat === 'png' && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{t('tools.image-hub.pngLossless')}</p>
                  )}
                </div>
              </div>
            )}

            {tab === 'convert' && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  {t('tools.image-hub.targetFormat')}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {FORMATS.map((format) => (
                    <button
                      key={format}
                      onClick={() => setTargetFormat(format)}
                      className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold uppercase transition-all duration-200 ease-in-out active:scale-[0.98] ${
                        targetFormat === format
                          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
                          : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-300 dark:hover:border-zinc-700'
                      }`}
                    >
                      {format === 'jpeg' ? 'JPG' : format.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {tab === 'resize' && (
              <div className="flex flex-col gap-4">
                <div className="inline-flex self-start rounded-full border border-zinc-200 bg-zinc-100 p-1 text-xs dark:border-white/10 dark:bg-zinc-800/60">
                  {['percentage', 'pixels'].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setResizeMode(mode)}
                      className={`rounded-full px-3 py-1 font-medium transition-all duration-200 ease-in-out ${
                        resizeMode === mode
                          ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                          : 'text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      {t(`tools.image-hub.resizeMode.${mode}`)}
                    </button>
                  ))}
                </div>

                {resizeMode === 'percentage' ? (
                  <div>
                    <label
                      htmlFor="image-percentage"
                      className="mb-2 flex justify-between text-xs font-semibold uppercase tracking-wide text-zinc-400"
                    >
                      {t('tools.image-hub.percentage')}
                      <span className="font-mono text-zinc-500 dark:text-zinc-400">{percentage}%</span>
                    </label>
                    <input
                      id="image-percentage"
                      type="range"
                      min={1}
                      max={200}
                      value={percentage}
                      onChange={(e) => setPercentage(Number(e.target.value))}
                      className="w-full accent-indigo-500"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label htmlFor="image-width" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          {t('tools.image-hub.width')}
                        </label>
                        <input
                          id="image-width"
                          type="number"
                          min={1}
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          placeholder="px"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none dark:border-white/10 dark:bg-zinc-800/60 dark:text-white"
                        />
                      </div>
                      <div className="flex-1">
                        <label htmlFor="image-height" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                          {t('tools.image-hub.height')}
                        </label>
                        <input
                          id="image-height"
                          type="number"
                          min={1}
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          placeholder="px"
                          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-indigo-400 focus:outline-none dark:border-white/10 dark:bg-zinc-800/60 dark:text-white"
                        />
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={maintainAspectRatio}
                        onChange={(e) => setMaintainAspectRatio(e.target.checked)}
                        className="h-4 w-4 accent-indigo-500"
                      />
                      {t('tools.image-hub.maintainAspectRatio')}
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
