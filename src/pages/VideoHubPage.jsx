import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, Film, Video as VideoIcon, VolumeX } from 'lucide-react'
import DragDropZone from '../components/DragDropZone'
import ProcessingState from '../components/ProcessingState'
import DownloadButton from '../components/DownloadButton'
import MediaEditorStudio from '../components/studio/MediaEditorStudio'
import { videoToGif, muteVideo } from '../utils/videoWorker'
import { addHistoryEntry } from '../utils/historyStorage'

const TABS = [
  { id: 'gif', icon: Film },
  { id: 'mute', icon: VolumeX },
]

const STEPS = {
  UPLOAD: 'upload',
  ANALYZING: 'analyzing',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

const MAX_GIF_DURATION = 15
const FPS_OPTIONS = [5, 8, 12, 15]
const WIDTH_OPTIONS = [240, 320, 400, 480]

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function GifPanel({ t }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [editState, setEditState] = useState(null)
  const [fps, setFps] = useState(8)
  const [width, setWidth] = useState(320)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const urlRef = useRef(null)
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef(null)

  useEffect(
    () => () => {
      isMountedRef.current = false
      // Si l'utilisateur quitte la page pendant la génération du GIF (boucle
      // d'échantillonnage image par image, potentiellement longue), on
      // demande l'arrêt immédiat plutôt que de laisser tourner un travail
      // dont plus personne n'a besoin.
      abortControllerRef.current?.abort()
      urlRef.current && URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const handleFiles = (files) => {
    const [videoFile] = files
    setError(null)
    setFile(videoFile)
    setEditState(null)
    setStep(STEPS.CONFIGURE)
  }

  const handleSubmit = async () => {
    if (!editState) return
    setError(null)
    setProgress({ done: 0, total: 0 })
    setStep(STEPS.PROCESSING)
    abortControllerRef.current = new AbortController()
    try {
      const { blob } = await videoToGif(file, {
        start: editState.start,
        end: editState.end,
        fps,
        width,
        effectFilter: editState.effectFilter,
        aspectRatio: editState.aspectRatioValue,
        signal: abortControllerRef.current.signal,
        onProgress: (done, total) => isMountedRef.current && setProgress({ done, total }),
      })
      if (!isMountedRef.current) return
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setResult({ url, blob })
      addHistoryEntry({ toolId: 'video-to-gif', toolName: t('tools.video-to-gif.name'), message: `GIF généré — ${file.name}` })
      setStep(STEPS.DONE)
    } catch (err) {
      if (!isMountedRef.current || err?.message === 'ABORTED') return
      setError(t('tools.video-hub.errorGeneric'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setEditState(null)
    setResult(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.url
    link.download = `${file.name.replace(/\.[^.]+$/, '')}.gif`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {step === STEPS.UPLOAD && (
        <DragDropZone onFiles={handleFiles} multiple={false} accept="video/*" hint={t('tools.video-hub.dropHintGif')} />
      )}

      {step === STEPS.CONFIGURE && (
        <div className="flex flex-col gap-4">
          <MediaEditorStudio
            mediaType="video"
            file={file}
            maxRangeDuration={MAX_GIF_DURATION}
            onChange={setEditState}
            onTrackError={() => setError(t('tools.video-hub.errorLoad'))}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('tools.video-hub.fps')}</p>
              <div className="flex flex-wrap gap-1.5">
                {FPS_OPTIONS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFps(f)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ease-in-out active:scale-95 ${
                      fps === f ? 'bg-indigo-500 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{t('tools.video-hub.width')}</p>
              <div className="flex flex-wrap gap-1.5">
                {WIDTH_OPTIONS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWidth(w)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ease-in-out active:scale-95 ${
                      width === w ? 'bg-indigo-500 text-white' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
          >
            <Film size={18} /> {t('tools.video-hub.gifButton')}
          </button>
        </div>
      )}

      {step === STEPS.PROCESSING && (
        <ProcessingState
          icon={Film}
          title={t('tools.video-hub.gifProcessingTitle')}
          description={
            progress.total > 0 ? t('tools.video-hub.gifProgress', { done: progress.done, total: progress.total }) : undefined
          }
          duration={4000}
        />
      )}

      {step === STEPS.DONE && (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
            <CheckCircle2 size={28} />
          </span>
          <div>
            <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.video-hub.gifDoneTitle')}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.video-hub.gifDoneDescription')}</p>
          </div>
          {result?.url && <img src={result.url} alt="GIF généré" className="max-h-64 rounded-xl border border-zinc-200 dark:border-white/10" />}
          <DownloadButton fileName={`${file.name.replace(/\.[^.]+$/, '')}.gif`} onDownload={handleDownload} />
          <button
            onClick={handleRestart}
            className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            {t('tools.video-hub.restartLabel')}
          </button>
        </div>
      )}
    </div>
  )
}

function MutePanel({ t }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const urlRef = useRef(null)
  const isMountedRef = useRef(true)
  const abortControllerRef = useRef(null)

  useEffect(
    () => () => {
      isMountedRef.current = false
      // La suppression du son rejoue la vidéo en temps réel pour la
      // ré-enregistrer : si on quitte la page en cours de route, il faut
      // arrêter la lecture/l'enregistrement tout de suite, sinon la vidéo
      // continue d'être décodée et enregistrée en arrière-plan.
      abortControllerRef.current?.abort()
      urlRef.current && URL.revokeObjectURL(urlRef.current)
    },
    [],
  )

  const handleFiles = (files) => {
    const [videoFile] = files
    setError(null)
    setFile(videoFile)
    setResult(null)
    setStep(STEPS.CONFIGURE)
  }

  const handleSubmit = async () => {
    setError(null)
    setProgress({ current: 0, total: 0 })
    setStep(STEPS.PROCESSING)
    abortControllerRef.current = new AbortController()
    try {
      const { blob, extension } = await muteVideo(file, {
        signal: abortControllerRef.current.signal,
        onProgress: (current, total) => isMountedRef.current && setProgress({ current, total }),
      })
      if (!isMountedRef.current) return
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setResult({ url, blob, extension })
      addHistoryEntry({ toolId: 'mute-video', toolName: t('tools.mute-video.name'), message: `Son supprimé — ${file.name}` })
      setStep(STEPS.DONE)
    } catch (err) {
      if (!isMountedRef.current || err?.message === 'ABORTED') return
      const key =
        err?.message === 'CAPTURE_UNSUPPORTED' || err?.message === 'RECORDING_UNSUPPORTED'
          ? 'tools.video-hub.errorUnsupported'
          : 'tools.video-hub.errorGeneric'
      setError(t(key))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setResult(null)
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!result) return
    const link = document.createElement('a')
    link.href = result.url
    link.download = `${file.name.replace(/\.[^.]+$/, '')}_muet.${result.extension}`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {step === STEPS.UPLOAD && (
        <DragDropZone onFiles={handleFiles} multiple={false} accept="video/*" hint={t('tools.video-hub.dropHintMute')} />
      )}

      {step === STEPS.CONFIGURE && (
        <div className="flex flex-col gap-4">
          <p className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{file.name}</p>
          <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
            {t('tools.video-hub.realtimeDisclosure')}
          </p>
          <button
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
          >
            <VolumeX size={18} /> {t('tools.video-hub.muteButton')}
          </button>
        </div>
      )}

      {step === STEPS.PROCESSING && (
        <ProcessingState
          icon={VolumeX}
          title={t('tools.video-hub.muteProcessingTitle')}
          description={
            progress.total > 0
              ? t('tools.video-hub.muteProgress', { current: formatTime(progress.current), total: formatTime(progress.total) })
              : undefined
          }
          duration={4000}
        />
      )}

      {step === STEPS.DONE && (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
            <CheckCircle2 size={28} />
          </span>
          <div>
            <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.video-hub.muteDoneTitle')}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.video-hub.muteDoneDescription', { format: result?.extension?.toUpperCase() })}</p>
          </div>
          {result?.url && <video src={result.url} controls muted className="max-h-64 rounded-xl border border-zinc-200 dark:border-white/10" />}
          <DownloadButton fileName={`${file.name.replace(/\.[^.]+$/, '')}_muet.${result?.extension}`} onDownload={handleDownload} />
          <button
            onClick={handleRestart}
            className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            {t('tools.video-hub.restartLabel')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function VideoHubPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'gif'
  const [tab, setTab] = useState(initialTab)

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200">
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <VideoIcon size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">{t('tools.video-hub.name')}</h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.video-hub.subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
              tab === id
                ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white'
                : 'text-zinc-500 dark:text-zinc-400'
            }`}
          >
            <Icon size={14} />
            {t(`tools.video-hub.tab${id[0].toUpperCase()}${id.slice(1)}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {tab === 'gif' && <GifPanel t={t} />}
        {tab === 'mute' && <MutePanel t={t} />}
      </div>
    </div>
  )
}
