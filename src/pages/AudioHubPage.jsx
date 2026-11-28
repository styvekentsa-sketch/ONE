import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Music, RefreshCw, Scissors, Volume2 } from 'lucide-react'
import DragDropZone from '../components/DragDropZone'
import ProcessingState from '../components/ProcessingState'
import DownloadButton from '../components/DownloadButton'
import MediaEditorStudio from '../components/studio/MediaEditorStudio'
import { trimAudio, extractAudio, convertAudioFormat } from '../utils/audioWorker'
import { addHistoryEntry } from '../utils/historyStorage'
import BackButton from '../components/ui/BackButton'
import { saveFile } from '../utils/download'

const TABS = [
  { id: 'trim', icon: Scissors },
  { id: 'extract', icon: Volume2 },
  { id: 'convert', icon: RefreshCw },
]

const STEPS = {
  UPLOAD: 'upload',
  ANALYZING: 'analyzing',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

function FormatPicker({ format, onChange, t }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t('tools.audio-hub.exportFormat')}</p>
      <div className="grid grid-cols-2 gap-2">
        {['wav', 'mp3'].map((f) => (
          <button
            key={f}
            onClick={() => onChange(f)}
            className={`rounded-xl border-2 px-3 py-2.5 text-sm font-semibold uppercase transition-all duration-200 ease-in-out active:scale-[0.98] ${
              format === f
                ? 'border-brand-500 bg-brand-500/5 text-brand-600 dark:text-brand-400'
                : 'border-stone-200 text-stone-600 hover:border-stone-300 dark:border-white/10 dark:text-stone-300 dark:hover:border-stone-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      {format === 'mp3' && <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">{t('tools.audio-hub.mp3Hint')}</p>}
    </div>
  )
}

function ResultPanel({ result, fileLabel, onDownload, onRestart, t }) {
  return (
    <div className="flex flex-col items-center gap-5 py-4 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-100 text-brand-600 dark:bg-brand-500/10">
        <CheckCircle2 size={28} />
      </span>
      <div>
        <p className="text-lg font-semibold text-stone-800 dark:text-white">{t('tools.audio-hub.doneTitle')}</p>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{t('tools.audio-hub.doneDescription')}</p>
      </div>
      {result?.url && <audio controls src={result.url} className="w-full max-w-xs" />}
      <DownloadButton fileName={fileLabel} onDownload={onDownload} />
      <button
        onClick={onRestart}
        className="text-sm font-medium text-stone-500 dark:text-stone-400 transition-colors duration-200 hover:text-stone-600 dark:hover:text-stone-200"
      >
        {t('tools.audio-hub.restartLabel')}
      </button>
    </div>
  )
}

function TrimPanel({ t }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [editState, setEditState] = useState(null)
  const [format, setFormat] = useState('wav')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const urlRef = useRef(null)

  useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), [])

  const handleFiles = (files) => {
    const [audioFile] = files
    setError(null)
    setFile(audioFile)
    setEditState(null)
    setStep(STEPS.CONFIGURE)
  }

  const handleSubmit = async () => {
    if (!editState) return
    setError(null)
    setStep(STEPS.PROCESSING)
    try {
      const { blob, extension } = await trimAudio(file, {
        start: editState.start,
        end: editState.end,
        format,
        fadeIn: editState.fadeIn,
        fadeOut: editState.fadeOut,
        mode: editState.mode,
      })
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setResult({ url, blob, extension })
      addHistoryEntry({ toolId: 'trim-audio', toolName: t('tools.trim-audio.name'), message: `Audio découpé — ${file.name}` })
      setStep(STEPS.DONE)
    } catch (err) {
      setError(err?.message === 'DECODE_UNSUPPORTED' ? t('tools.audio-hub.errorDecode') : t('tools.audio-hub.errorGeneric'))
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
    saveFile(result.url, `${file.name.replace(/\.[^.]+$/, '')}_trim.${result.extension}`)
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {step === STEPS.UPLOAD && (
        <DragDropZone onFiles={handleFiles} multiple={false} accept="audio/*" hint={t('tools.audio-hub.dropHintTrim')} />
      )}

      {step === STEPS.CONFIGURE && (
        <div className="flex flex-col gap-4">
          <MediaEditorStudio
            mediaType="audio"
            file={file}
            onChange={setEditState}
            onTrackError={() => setError(t('tools.audio-hub.errorDecode'))}
          />

          <FormatPicker format={format} onChange={setFormat} t={t} />

          <button
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
          >
            <Scissors size={18} /> {t('tools.audio-hub.trimButton')}
          </button>
        </div>
      )}

      {step === STEPS.PROCESSING && <ProcessingState icon={Scissors} title={t('tools.audio-hub.processingTitle')} duration={1500} />}

      {step === STEPS.DONE && (
        <ResultPanel
          result={result}
          fileLabel={`${file.name.replace(/\.[^.]+$/, '')}_trim.${result?.extension}`}
          onDownload={handleDownload}
          onRestart={handleRestart}
          t={t}
        />
      )}
    </div>
  )
}

function ExtractPanel({ t }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [format, setFormat] = useState('wav')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const urlRef = useRef(null)

  useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), [])

  const handleFiles = (files) => {
    const [videoFile] = files
    setError(null)
    setFile(videoFile)
    setResult(null)
    setStep(STEPS.CONFIGURE)
  }

  const handleSubmit = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)
    try {
      const { blob, extension } = await extractAudio(file, { format })
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setResult({ url, blob, extension })
      addHistoryEntry({ toolId: 'extract-audio', toolName: t('tools.extract-audio.name'), message: `Audio extrait — ${file.name}` })
      setStep(STEPS.DONE)
    } catch (err) {
      setError(err?.message === 'DECODE_UNSUPPORTED' ? t('tools.audio-hub.errorDecode') : t('tools.audio-hub.errorGeneric'))
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
    saveFile(result.url, `${file.name.replace(/\.[^.]+$/, '')}_audio.${result.extension}`)
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {step === STEPS.UPLOAD && (
        <DragDropZone onFiles={handleFiles} multiple={false} accept="video/*" hint={t('tools.audio-hub.dropHintExtract')} />
      )}

      {step === STEPS.CONFIGURE && (
        <div className="flex flex-col gap-4">
          <p className="truncate text-sm font-medium text-stone-700 dark:text-stone-200">{file.name}</p>
          <FormatPicker format={format} onChange={setFormat} t={t} />
          <button
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
          >
            <Volume2 size={18} /> {t('tools.audio-hub.extractButton')}
          </button>
        </div>
      )}

      {step === STEPS.PROCESSING && <ProcessingState icon={Volume2} title={t('tools.audio-hub.extractingTitle')} duration={2000} />}

      {step === STEPS.DONE && (
        <ResultPanel
          result={result}
          fileLabel={`${file.name.replace(/\.[^.]+$/, '')}_audio.${result?.extension}`}
          onDownload={handleDownload}
          onRestart={handleRestart}
          t={t}
        />
      )}
    </div>
  )
}

function ConvertPanel({ t }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [format, setFormat] = useState('mp3')
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
  const urlRef = useRef(null)

  useEffect(() => () => urlRef.current && URL.revokeObjectURL(urlRef.current), [])

  const handleFiles = (files) => {
    const [audioFile] = files
    setError(null)
    setFile(audioFile)
    setResult(null)
    setStep(STEPS.CONFIGURE)
  }

  const handleSubmit = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)
    try {
      const { blob, extension } = await convertAudioFormat(file, format)
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
      const url = URL.createObjectURL(blob)
      urlRef.current = url
      setResult({ url, blob, extension })
      addHistoryEntry({ toolId: 'convert-audio', toolName: t('tools.convert-audio.name'), message: `Audio converti — ${file.name}` })
      setStep(STEPS.DONE)
    } catch (err) {
      setError(err?.message === 'DECODE_UNSUPPORTED' ? t('tools.audio-hub.errorDecode') : t('tools.audio-hub.errorGeneric'))
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
    saveFile(result.url, `${file.name.replace(/\.[^.]+$/, '')}.${result.extension}`)
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>
      )}

      {step === STEPS.UPLOAD && (
        <DragDropZone onFiles={handleFiles} multiple={false} accept="audio/*" hint={t('tools.audio-hub.dropHintConvert')} />
      )}

      {step === STEPS.CONFIGURE && (
        <div className="flex flex-col gap-4">
          <p className="truncate text-sm font-medium text-stone-700 dark:text-stone-200">{file.name}</p>
          <FormatPicker format={format} onChange={setFormat} t={t} />
          <button
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
          >
            <RefreshCw size={18} /> {t('tools.audio-hub.convertButton')}
          </button>
        </div>
      )}

      {step === STEPS.PROCESSING && <ProcessingState icon={RefreshCw} title={t('tools.audio-hub.convertingTitle')} duration={1800} />}

      {step === STEPS.DONE && (
        <ResultPanel
          result={result}
          fileLabel={`${file.name.replace(/\.[^.]+$/, '')}.${result?.extension}`}
          onDownload={handleDownload}
          onRestart={handleRestart}
          t={t}
        />
      )}
    </div>
  )
}

export default function AudioHubPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialTab = TABS.some((tab) => tab.id === searchParams.get('tab')) ? searchParams.get('tab') : 'trim'
  const [tab, setTab] = useState(initialTab)

  return (
    <div className="mx-auto max-w-3xl px-4 pb-12 pt-5 sm:px-6 md:pt-10 lg:px-8">
      <BackButton />

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-700 shadow-sm dark:bg-stone-800/80 dark:text-white">
          <Music size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-white">{t('tools.audio-hub.name')}</h1>
          <p className="text-stone-500 dark:text-stone-400">{t('tools.audio-hub.subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-stone-200 bg-stone-100 p-1 dark:border-white/10 dark:bg-stone-800/60">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ease-in-out active:scale-[0.98] ${
              tab === id
                ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-white'
                : 'text-stone-500 dark:text-stone-400'
            }`}
          >
            <Icon size={14} />
            {t(`tools.audio-hub.tab${id[0].toUpperCase()}${id.slice(1)}`)}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:p-8 dark:border-stone-800 dark:border-stone-800 dark:bg-stone-900">
        {tab === 'trim' && <TrimPanel t={t} />}
        {tab === 'extract' && <ExtractPanel t={t} />}
        {tab === 'convert' && <ConvertPanel t={t} />}
      </div>
    </div>
  )
}
