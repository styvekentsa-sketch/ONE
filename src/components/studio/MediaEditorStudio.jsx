import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Crop,
  Gauge,
  Pause,
  Play,
  Plus,
  Scissors,
  Sparkles,
  Trash2,
  Volume2,
} from 'lucide-react'
import { generateVideoFilmstrip, generateWaveformPeaks } from '../../utils/mediaTimelineUtils'

const SPEED_OPTIONS = [0.5, 1, 1.5, 2]
const FADE_OPTIONS = [0, 1, 2, 3]
const MIN_GAP = 0.2 // écart minimal (s) entre les deux poignées, pour ne jamais les croiser

export const EFFECTS = [
  { id: 'none', label: 'Normal', filter: 'none' },
  { id: 'bw', label: 'N&B', filter: 'grayscale(1)' },
  { id: 'sepia', label: 'Sépia', filter: 'sepia(0.65)' },
  { id: 'vivid', label: 'Vif', filter: 'saturate(1.6) contrast(1.1)' },
  { id: 'cool', label: 'Froid', filter: 'hue-rotate(15deg) saturate(1.1)' },
  { id: 'warm', label: 'Chaud', filter: 'hue-rotate(-12deg) saturate(1.15)' },
]

export const ASPECT_RATIOS = [
  { id: 'original', label: 'Original', value: null },
  { id: '9:16', label: '9:16', value: 9 / 16 },
  { id: '16:9', label: '16:9', value: 16 / 9 },
  { id: '1:1', label: '1:1', value: 1 },
]

function formatTime(seconds) {
  const s = Math.max(0, seconds || 0)
  const m = Math.floor(s / 60)
  const rem = Math.floor(s % 60)
  return `${m}:${String(rem).padStart(2, '0')}`
}

function pct(value, total) {
  if (!total) return 0
  return Math.min(100, Math.max(0, (value / total) * 100))
}

/**
 * Studio de montage réutilisable (audio ou vidéo) : aperçu + HUD flottant,
 * timeline avec filmstrip/waveform réels et poignées de rognage tactiles,
 * barre d'outils rapide (scinder, fondu, ratio, effet, supprimer la
 * sélection). Ne fait AUCUN export lui-même : il notifie le parent via
 * `onChange` à chaque modification, et c'est le parent (déjà propriétaire
 * de son pipeline trimAudio/videoToGif) qui exporte avec ces valeurs —
 * ce composant est uniquement la couche d'édition/visualisation.
 *
 * Le drag des poignées et de la tête de lecture utilise l'API Pointer
 * Events (`onPointerDown` + écouteurs `pointermove`/`pointerup` sur
 * `window`) : un seul chemin de code pour souris, tactile et stylet, plutôt
 * que dupliquer la logique entre `onMouseDown` et `onTouchStart`.
 */
export default function MediaEditorStudio({
  mediaType,
  file,
  initialStart = 0,
  initialEnd = null,
  maxRangeDuration = null,
  showAspectRatio = mediaType === 'video',
  showVolumeFade = mediaType === 'audio',
  showEffects = mediaType === 'video',
  showRemoveSelection = mediaType === 'audio',
  onAddMore,
  onChange,
  onTrackError,
}) {
  const isVideo = mediaType === 'video'

  const objectUrl = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(objectUrl), [objectUrl])

  const mediaRef = useRef(null)
  const timelineRef = useRef(null)
  const draggingRef = useRef(null)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  const [start, setStart] = useState(initialStart)
  const [end, setEnd] = useState(initialEnd ?? 0)
  const [mode, setMode] = useState('keep') // 'keep' | 'remove' (audio uniquement)

  const [effect, setEffect] = useState(EFFECTS[0])
  const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[0])
  const [fadeIn, setFadeIn] = useState(0)
  const [fadeOut, setFadeOut] = useState(0)

  const [activeTool, setActiveTool] = useState(null)
  const [notice, setNotice] = useState(null)

  const [track, setTrack] = useState({ loading: true, frames: [], peaks: [] })

  // Génère le filmstrip (vidéo) ou la waveform (audio) une fois par fichier,
  // et initialise le point de sortie par défaut (fin de fichier, ou
  // `maxRangeDuration` si l'appelant en impose un — ex. durée max d'un GIF).
  useEffect(() => {
    let cancelled = false
    setTrack({ loading: true, frames: [], peaks: [] })

    const run = async () => {
      try {
        if (isVideo) {
          const { frames, duration: dur } = await generateVideoFilmstrip(file, 16)
          if (cancelled) return
          setDuration(dur)
          setEnd(Math.min(dur, initialEnd ?? (maxRangeDuration ? Math.min(dur, maxRangeDuration) : dur)))
          setTrack({ loading: false, frames, peaks: [] })
        } else {
          const { peaks, duration: dur } = await generateWaveformPeaks(file, 160)
          if (cancelled) return
          setDuration(dur)
          setEnd(Math.min(dur, initialEnd ?? dur))
          setTrack({ loading: false, frames: [], peaks })
        }
      } catch (err) {
        if (cancelled) return
        setTrack({ loading: false, frames: [], peaks: [] })
        onTrackError?.(err)
      }
    }
    run()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Notifie le parent à chaque changement de valeur d'édition — c'est le
  // seul canal de communication vers l'extérieur (voir doc du composant).
  useEffect(() => {
    onChange?.({ start, end, mode, fadeIn, fadeOut, effect: effect.id, effectFilter: effect.filter, aspectRatio: aspectRatio.id, aspectRatioValue: aspectRatio.value, playbackRate })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, mode, fadeIn, fadeOut, effect, aspectRatio, playbackRate])

  // Lecture bouclée sur la sélection : dépasser `end` revient à `start`,
  // comme dans un vrai éditeur de clip plutôt que de continuer sur le reste
  // du fichier qui ne fait pas partie de l'export.
  const handleTimeUpdate = useCallback(() => {
    const media = mediaRef.current
    if (!media) return
    setCurrentTime(media.currentTime)
    if (media.currentTime >= end) {
      media.currentTime = start
      if (!media.paused) media.play().catch(() => {})
    }
  }, [start, end])

  const togglePlay = () => {
    const media = mediaRef.current
    if (!media) return
    if (media.paused) {
      if (media.currentTime < start || media.currentTime >= end) media.currentTime = start
      media.play().catch(() => {})
    } else {
      media.pause()
    }
  }

  const cycleSpeed = () => {
    const nextIndex = (SPEED_OPTIONS.indexOf(playbackRate) + 1) % SPEED_OPTIONS.length
    const next = SPEED_OPTIONS[nextIndex]
    setPlaybackRate(next)
    if (mediaRef.current) mediaRef.current.playbackRate = next
  }

  // --- Drag des poignées / tête de lecture (souris + tactile unifiés) -----
  const timeFromClientX = useCallback(
    (clientX) => {
      const el = timelineRef.current
      if (!el || !duration) return 0
      const rect = el.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      return ratio * duration
    },
    [duration],
  )

  useEffect(() => {
    const handleMove = (e) => {
      if (!draggingRef.current) return
      const t = timeFromClientX(e.clientX)

      if (draggingRef.current === 'start') {
        let next = Math.min(t, end - MIN_GAP)
        if (maxRangeDuration) next = Math.max(next, end - maxRangeDuration)
        setStart(Math.max(0, next))
      } else if (draggingRef.current === 'end') {
        let next = Math.max(t, start + MIN_GAP)
        if (maxRangeDuration) next = Math.min(next, start + maxRangeDuration)
        setEnd(Math.min(duration, next))
      } else if (draggingRef.current === 'playhead') {
        const clamped = Math.min(end, Math.max(start, t))
        setCurrentTime(clamped)
        if (mediaRef.current) mediaRef.current.currentTime = clamped
      }
    }
    const handleUp = () => {
      draggingRef.current = null
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
  }, [start, end, duration, maxRangeDuration, timeFromClientX])

  const startDrag = (which) => (e) => {
    e.preventDefault()
    e.stopPropagation()
    draggingRef.current = which
  }

  const handleTimelineClick = (e) => {
    if (draggingRef.current) return
    const t = timeFromClientX(e.clientX)
    const clamped = Math.min(end, Math.max(start, t))
    setCurrentTime(clamped)
    if (mediaRef.current) mediaRef.current.currentTime = clamped
  }

  // --- Barre d'outils rapide -----------------------------------------------
  const flashNotice = (text) => {
    setNotice(text)
    window.setTimeout(() => setNotice(null), 2500)
  }

  const handleSplit = () => {
    if (currentTime <= start + MIN_GAP || currentTime >= end) {
      flashNotice('Placez la tête de lecture à l’intérieur de la sélection pour scinder.')
      return
    }
    setEnd(currentTime)
    flashNotice('Clip scindé — la partie après la tête de lecture a été retirée de la sélection.')
  }

  const handleToggleRemove = () => {
    setMode((m) => (m === 'keep' ? 'remove' : 'keep'))
  }

  const handleAddMore = () => {
    if (onAddMore) onAddMore()
    else flashNotice('Combiner plusieurs clips arrive bientôt.')
  }

  const toggleTool = (id) => setActiveTool((current) => (current === id ? null : id))

  const selectionDuration = Math.max(0, end - start)
  const previewFilterStyle = isVideo ? { filter: effect.filter } : undefined

  // Aperçu du recadrage : deux bandes semi-opaques superposées à l'aperçu,
  // dimensionnées pour représenter la zone qui serait effectivement coupée
  // à l'export (voir videoWorker.videoToGif, qui applique le même calcul).
  const cropOverlay = (() => {
    if (!isVideo || !aspectRatio.value || !mediaRef.current) return null
    const videoEl = mediaRef.current
    const sourceRatio = (videoEl.videoWidth || 16) / (videoEl.videoHeight || 9)
    if (aspectRatio.value >= sourceRatio) return null // recadrage vertical (bandes haut/bas)
    return true
  })()

  return (
    <div className="flex flex-col gap-4">
      {/* --- Aperçu + HUD flottant --- */}
      <div className="relative overflow-hidden rounded-2xl bg-zinc-950 shadow-2xl">
        {isVideo ? (
          <video
            ref={mediaRef}
            src={objectUrl}
            className="mx-auto max-h-105 w-full object-contain"
            style={previewFilterStyle}
            playsInline
            onLoadedMetadata={(e) => setDuration((d) => d || e.currentTarget.duration)}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
        ) : (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-zinc-500">
            <audio
              ref={mediaRef}
              src={objectUrl}
              onLoadedMetadata={(e) => setDuration((d) => d || e.currentTarget.duration)}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />
            <Volume2 size={40} className="text-zinc-700" aria-hidden="true" />
            <p className="max-w-[80%] truncate text-sm text-zinc-500">{file.name}</p>
          </div>
        )}

        {aspectRatio.value && isVideo && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              className="border-2 border-dashed border-white/50"
              style={
                cropOverlay
                  ? { height: '100%', aspectRatio: aspectRatio.value }
                  : { width: '100%', aspectRatio: aspectRatio.value }
              }
            />
          </div>
        )}

        {/* Pilule de contrôle flottante */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900/90 px-4 py-2 text-white shadow-xl backdrop-blur-md">
            <button
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? 'Pause' : 'Lecture'}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-zinc-900 transition-transform duration-150 active:scale-90"
            >
              {isPlaying ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
            </button>
            <span className="font-mono text-xs tabular-nums text-zinc-200">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <button
              type="button"
              onClick={cycleSpeed}
              aria-label="Vitesse de lecture"
              className="flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-zinc-200 transition-colors duration-150 hover:bg-white/10"
            >
              <Gauge size={13} aria-hidden="true" /> {playbackRate}x
            </button>
          </div>
        </div>
      </div>

      {notice && (
        <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400">
          {notice}
        </p>
      )}

      {/* --- Timeline --- */}
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={handleAddMore}
          aria-label="Ajouter un autre clip"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-xl font-bold text-zinc-900 shadow-sm transition-transform duration-150 hover:scale-105 active:scale-95 dark:bg-zinc-800 dark:text-white"
        >
          <Plus size={20} aria-hidden="true" />
        </button>

        <div
          ref={timelineRef}
          onClick={handleTimelineClick}
          className="relative h-12 flex-1 touch-none select-none overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-800"
        >
          {track.loading ? (
            <div className="flex h-full items-center justify-center text-xs text-zinc-400 dark:text-zinc-500">
              Analyse du fichier…
            </div>
          ) : isVideo ? (
            <div className="flex h-full w-full">
              {track.frames.map((src, i) => (
                <img key={i} src={src} alt="" className="h-full flex-1 object-cover" draggable={false} />
              ))}
            </div>
          ) : (
            <svg viewBox={`0 0 ${track.peaks.length} 40`} preserveAspectRatio="none" className="h-full w-full">
              {track.peaks.map((p, i) => (
                <rect
                  key={i}
                  x={i}
                  y={20 - Math.max(1, p * 18)}
                  width={0.7}
                  height={Math.max(2, p * 36)}
                  className="fill-indigo-400 dark:fill-indigo-400/80"
                />
              ))}
            </svg>
          )}

          {/* Zones assombries hors sélection */}
          <div className="pointer-events-none absolute inset-y-0 left-0 bg-zinc-950/60" style={{ width: `${pct(start, duration)}%` }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 bg-zinc-950/60" style={{ width: `${100 - pct(end, duration)}%` }} />
          {mode === 'remove' && (
            <div
              className="pointer-events-none absolute inset-y-0 bg-red-500/25"
              style={{ left: `${pct(start, duration)}%`, width: `${pct(end, duration) - pct(start, duration)}%` }}
            />
          )}

          {/* Poignée gauche */}
          <div
            onPointerDown={startDrag('start')}
            className="absolute inset-y-0 flex w-4 touch-none cursor-ew-resize items-center justify-center rounded-l-xl bg-white shadow-md"
            style={{ left: `calc(${pct(start, duration)}% - 8px)` }}
          >
            <div className="h-4 w-0.5 rounded-full bg-zinc-400" />
          </div>

          {/* Poignée droite */}
          <div
            onPointerDown={startDrag('end')}
            className="absolute inset-y-0 flex w-4 touch-none cursor-ew-resize items-center justify-center rounded-r-xl bg-white shadow-md"
            style={{ left: `calc(${pct(end, duration)}% - 8px)` }}
          >
            <div className="h-4 w-0.5 rounded-full bg-zinc-400" />
          </div>

          {/* Tête de lecture */}
          <div
            onPointerDown={startDrag('playhead')}
            className="absolute inset-y-0 w-3 -translate-x-1/2 touch-none cursor-ew-resize"
            style={{ left: `${pct(currentTime, duration)}%` }}
          >
            <div className="mx-auto h-full w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]" />
          </div>
        </div>
      </div>

      <p className="-mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
        {mode === 'remove' ? 'Segment supprimé : ' : 'Sélection : '}
        {formatTime(start)} – {formatTime(end)} ({formatTime(selectionDuration)})
        {maxRangeDuration && ` · max ${formatTime(maxRangeDuration)}`}
      </p>

      {/* --- Barre d'outils rapide --- */}
      <div className="flex flex-wrap items-center justify-center gap-1.5 border-t border-zinc-100 pt-3 dark:border-white/10">
        <ToolButton icon={Scissors} label="Scinder" onClick={handleSplit} />
        {showVolumeFade && <ToolButton icon={Volume2} label="Fondu" active={activeTool === 'volume'} onClick={() => toggleTool('volume')} />}
        {showAspectRatio && <ToolButton icon={Crop} label="Format" active={activeTool === 'aspect'} onClick={() => toggleTool('aspect')} />}
        {showEffects && <ToolButton icon={Sparkles} label="Effets" active={activeTool === 'effects'} onClick={() => toggleTool('effects')} />}
        {showRemoveSelection && (
          <ToolButton icon={Trash2} label="Supprimer" active={mode === 'remove'} onClick={handleToggleRemove} tone={mode === 'remove' ? 'danger' : 'default'} />
        )}
      </div>

      {activeTool === 'volume' && (
        <OptionRow label="Fondu d’entrée / de sortie">
          <div className="flex items-center gap-4">
            <FadeStepper label="Entrée" value={fadeIn} onChange={setFadeIn} />
            <FadeStepper label="Sortie" value={fadeOut} onChange={setFadeOut} />
          </div>
        </OptionRow>
      )}

      {activeTool === 'aspect' && (
        <OptionRow label="Format d’image">
          <div className="flex flex-wrap gap-2">
            {ASPECT_RATIOS.map((ratio) => (
              <Chip key={ratio.id} active={aspectRatio.id === ratio.id} onClick={() => setAspectRatio(ratio)}>
                {ratio.label}
              </Chip>
            ))}
          </div>
        </OptionRow>
      )}

      {activeTool === 'effects' && (
        <OptionRow label="Effet visuel">
          <div className="flex flex-wrap gap-2">
            {EFFECTS.map((fx) => (
              <Chip key={fx.id} active={effect.id === fx.id} onClick={() => setEffect(fx)}>
                {fx.label}
              </Chip>
            ))}
          </div>
        </OptionRow>
      )}
    </div>
  )
}

function ToolButton({ icon: Icon, label, onClick, active = false, tone = 'default' }) {
  const toneClasses =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : active
        ? 'text-indigo-600 dark:text-indigo-400'
        : 'text-zinc-600 dark:text-zinc-300'

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[11px] font-medium transition-colors duration-150 ${
        active ? 'bg-indigo-500/10' : tone === 'danger' ? 'bg-red-500/10' : 'hover:bg-zinc-100 dark:hover:bg-white/5'
      } ${toneClasses}`}
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </button>
  )
}

function OptionRow({ label, children }) {
  return (
    <div className="animate-fade-in rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-white/10 dark:bg-zinc-900/60">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      {children}
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 px-3 py-1.5 text-xs font-semibold transition-all duration-150 active:scale-95 ${
        active
          ? 'border-indigo-500 bg-indigo-500/5 text-indigo-600 dark:text-indigo-400'
          : 'border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:text-zinc-300 dark:hover:border-zinc-700'
      }`}
    >
      {children}
    </button>
  )
}

function FadeStepper({ label, value, onChange }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="flex gap-1">
        {FADE_OPTIONS.map((s) => (
          <Chip key={s} active={value === s} onClick={() => onChange(s)}>
            {s}s
          </Chip>
        ))}
      </div>
    </div>
  )
}
