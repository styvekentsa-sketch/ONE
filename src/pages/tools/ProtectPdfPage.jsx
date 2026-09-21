import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, FileText, Lock, LockOpen, X } from 'lucide-react'
import DragDropZone from '../../components/DragDropZone'
import ProcessingState from '../../components/ProcessingState'
import DownloadButton from '../../components/DownloadButton'
import { protectPdf, unlockPdfWithPassword } from '../../utils/qpdf'
import { addHistoryEntry } from '../../utils/historyStorage'

const STEPS = {
  UPLOAD: 'upload',
  CONFIGURE: 'configure',
  PROCESSING: 'processing',
  DONE: 'done',
}

const MIN_PASSWORD_LENGTH = 4

function PasswordInput({ id, label, placeholder, value, onChange, show, onToggleShow }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="new-password"
          className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 pr-11 text-sm text-zinc-900 placeholder:text-zinc-500 dark:placeholder:text-zinc-400 focus:border-indigo-400 focus:outline-none dark:border-white/10 dark:bg-zinc-800/60 dark:text-white"
        />
        <button
          type="button"
          onClick={onToggleShow}
          aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </div>
  )
}

function FileChip({ file, onChange, t }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-white/10 dark:bg-zinc-800/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <FileText size={16} />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">{file.name}</p>
      <button
        onClick={onChange}
        className="shrink-0 text-xs font-medium text-indigo-500 transition-colors duration-200 hover:text-indigo-400 dark:text-indigo-400"
      >
        {t('tools.protect.changeFile')}
      </button>
    </div>
  )
}

function ProtectPanel({ t }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const downloadUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
  }, [])

  const handleFiles = (files) => {
    const [pdfFile] = files
    const isPdf = pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setFile(pdfFile)
    setStep(STEPS.CONFIGURE)
  }

  const handleChangeFile = () => {
    setFile(null)
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const mismatch = confirmPassword.length > 0 && confirmPassword !== password
  const matches = confirmPassword.length > 0 && confirmPassword === password
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword

  const handleSubmit = async () => {
    if (!canSubmit) return
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await file.arrayBuffer()
      const bytes = await protectPdf(buffer, { password, keyLength: 256 })
      const blob = new Blob([bytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)
      setDownloadUrl(downloadUrlRef.current)

      addHistoryEntry({
        toolId: 'protect',
        toolName: t('tools.protect.name'),
        message: `PDF protégé par mot de passe — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(t('tools.protect.errorGeneric'))
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setPassword('')
    setConfirmPassword('')
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${file?.name?.replace(/\.pdf$/i, '') || 'ONE_protege'}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      {step === STEPS.UPLOAD && (
        <DragDropZone
          onFiles={handleFiles}
          multiple={false}
          accept="application/pdf"
          hint={t('tools.protect.dropHintProtect')}
        />
      )}

      {step === STEPS.CONFIGURE && file && (
        <div className="flex flex-col gap-4">
          <FileChip file={file} onChange={handleChangeFile} t={t} />

          <PasswordInput
            id="protect-password"
            label={t('tools.protect.passwordLabel')}
            placeholder={t('tools.protect.passwordPlaceholder')}
            value={password}
            onChange={setPassword}
            show={showPassword}
            onToggleShow={() => setShowPassword((s) => !s)}
          />
          {tooShort && (
            <p className="-mt-2 text-xs text-amber-600 dark:text-amber-400">{t('tools.protect.passwordTooShort')}</p>
          )}

          <PasswordInput
            id="protect-confirm-password"
            label={t('tools.protect.confirmPasswordLabel')}
            placeholder={t('tools.protect.confirmPasswordPlaceholder')}
            value={confirmPassword}
            onChange={setConfirmPassword}
            show={showPassword}
            onToggleShow={() => setShowPassword((s) => !s)}
          />
          {mismatch && (
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
              <X size={13} /> {t('tools.protect.passwordMismatch')}
            </p>
          )}
          {matches && (
            <p className="-mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 size={13} /> {t('tools.protect.passwordMatch')}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Lock size={18} /> {t('tools.protect.protectButton')}
          </button>
        </div>
      )}

      {step === STEPS.PROCESSING && (
        <ProcessingState
          icon={Lock}
          title={t('tools.protect.protectingTitle')}
          description={t('tools.protect.protectingDescription')}
          duration={1500}
        />
      )}

      {step === STEPS.DONE && (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
            <CheckCircle2 size={28} />
          </span>
          <div>
            <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.protect.doneTitleProtect')}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.protect.doneDescriptionProtect')}</p>
          </div>
          <DownloadButton fileName="ONE_protege.pdf" onDownload={handleDownload} />
          <button
            onClick={handleRestart}
            className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            {t('tools.protect.restartLabelProtect')}
          </button>
        </div>
      )}
    </div>
  )
}

function UnlockPanel({ t }) {
  const [step, setStep] = useState(STEPS.UPLOAD)
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [downloadUrl, setDownloadUrl] = useState(null)
  const downloadUrlRef = useRef(null)

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
    }
  }, [])

  const handleFiles = (files) => {
    const [pdfFile] = files
    const isPdf = pdfFile.type === 'application/pdf' || pdfFile.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setError(t('common.invalidPdf'))
      return
    }
    setError(null)
    setFile(pdfFile)
    setStep(STEPS.CONFIGURE)
  }

  const handleChangeFile = () => {
    setFile(null)
    setPassword('')
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleSubmit = async () => {
    setError(null)
    setStep(STEPS.PROCESSING)

    try {
      const buffer = await file.arrayBuffer()
      const bytes = await unlockPdfWithPassword(buffer, password)
      const blob = new Blob([bytes], { type: 'application/pdf' })

      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current)
      downloadUrlRef.current = URL.createObjectURL(blob)
      setDownloadUrl(downloadUrlRef.current)

      addHistoryEntry({
        toolId: 'unlock',
        toolName: t('tools.unlock.name'),
        message: `PDF déverrouillé — ${file.name}`,
      })

      setStep(STEPS.DONE)
    } catch (err) {
      console.error(err)
      setError(
        err?.message === 'WRONG_PASSWORD' ? t('tools.protect.errorWrongPassword') : t('tools.protect.errorGeneric'),
      )
      setStep(STEPS.CONFIGURE)
    }
  }

  const handleRestart = () => {
    setFile(null)
    setPassword('')
    setError(null)
    setStep(STEPS.UPLOAD)
  }

  const handleDownload = () => {
    if (!downloadUrl) return
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${file?.name?.replace(/\.pdf$/i, '') || 'ONE_deverrouille'}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
          {error}
        </p>
      )}

      {step === STEPS.UPLOAD && (
        <DragDropZone
          onFiles={handleFiles}
          multiple={false}
          accept="application/pdf"
          hint={t('tools.protect.dropHintUnlock')}
        />
      )}

      {step === STEPS.CONFIGURE && file && (
        <div className="flex flex-col gap-4">
          <FileChip file={file} onChange={handleChangeFile} t={t} />

          <div>
            <PasswordInput
              id="unlock-password"
              label={t('tools.protect.unlockPasswordLabel')}
              placeholder={t('tools.protect.unlockPasswordPlaceholder')}
              value={password}
              onChange={setPassword}
              show={showPassword}
              onToggleShow={() => setShowPassword((s) => !s)}
            />
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{t('tools.protect.unlockPasswordHint')}</p>
          </div>

          <button
            onClick={handleSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
          >
            <LockOpen size={18} /> {t('tools.protect.unlockButton')}
          </button>
        </div>
      )}

      {step === STEPS.PROCESSING && (
        <ProcessingState icon={LockOpen} title={t('tools.protect.unlockingTitle')} duration={1200} />
      )}

      {step === STEPS.DONE && (
        <div className="flex flex-col items-center gap-5 py-4 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-500/10">
            <CheckCircle2 size={28} />
          </span>
          <div>
            <p className="text-lg font-semibold text-zinc-800 dark:text-white">{t('tools.protect.doneTitleUnlock')}</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('tools.protect.doneDescriptionUnlock')}</p>
          </div>
          <DownloadButton fileName="ONE_deverrouille.pdf" onDownload={handleDownload} />
          <button
            onClick={handleRestart}
            className="text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            {t('tools.protect.restartLabelUnlock')}
          </button>
        </div>
      )}
    </div>
  )
}

export default function ProtectPdfPage() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') === 'protect' ? 'protect' : 'unlock'
  const [tab, setTab] = useState(initialTab)

  const TABS = [
    { id: 'unlock', label: t('tools.protect.unlockTab'), icon: LockOpen },
    { id: 'protect', label: t('tools.protect.protectTab'), icon: Lock },
  ]

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
      <Link
        to="/"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors duration-200 hover:text-zinc-600 dark:hover:text-zinc-200"
      >
        <ArrowLeft size={16} /> {t('common.backToTools')}
      </Link>

      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 shadow-sm dark:bg-zinc-800/80 dark:text-white">
          <Lock size={26} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">
            {t('tools.protect.name')}
          </h1>
          <p className="text-zinc-500 dark:text-zinc-400">{t('tools.protect.subtitle')}</p>
        </div>
      </div>

      <div className="mt-6 inline-flex rounded-full border border-zinc-200 bg-zinc-100 p-1 dark:border-white/10 dark:bg-zinc-800/60">
        {TABS.map(({ id, label, icon: Icon }) => (
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
            {label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-white/10 dark:bg-zinc-900">
        {tab === 'unlock' ? <UnlockPanel t={t} /> : <ProtectPanel t={t} />}
      </div>
    </div>
  )
}
