import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, EyeOff, FileText, Image as ImageIcon, KeyRound, Lock, Mail, Music, User, Video } from 'lucide-react'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../utils/authValidation'

const FEATURE_CARDS = [
  { icon: FileText, key: 'pdf' },
  { icon: ImageIcon, key: 'image' },
  { icon: Video, key: 'video' },
  { icon: Music, key: 'audio' },
]

function SocialButton({ mark, markClassName, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-medium text-zinc-700 transition-all duration-200 ease-in-out hover:bg-zinc-50 active:scale-[0.98] dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {Icon ? (
        <Icon size={16} aria-hidden="true" />
      ) : (
        <span className={`text-base font-bold leading-none ${markClassName}`} aria-hidden="true">
          {mark}
        </span>
      )}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </button>
  )
}

/**
 * Authentification 100% locale (voir utils/authStorage.js) : pas de vraie
 * connexion sociale possible sans backend/OAuth réel, donc les boutons
 * Google/Facebook/SSO restent honnêtes sur leur état — ils affichent un
 * avertissement plutôt que de simuler une connexion qui n'existe pas.
 */
export default function Auth() {
  const { t } = useTranslation()
  const { login, register } = useAuth()

  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [socialNotice, setSocialNotice] = useState(false)

  const isRegister = mode === 'register'

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(null)
  }

  const handleSocialClick = () => {
    setSocialNotice(true)
    window.setTimeout(() => setSocialNotice(false), 4000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)

    if (isRegister && name.trim().length < 2) {
      setError(t('auth.errorNameRequired'))
      return
    }
    if (!isValidEmail(email)) {
      setError(t('auth.errorInvalidEmail'))
      return
    }
    if (!isValidPassword(password)) {
      setError(t('auth.errorPasswordLength', { count: MIN_PASSWORD_LENGTH }))
      return
    }

    setIsSubmitting(true)
    try {
      if (isRegister) {
        await register({ name, email, password })
      } else {
        await login({ email, password })
      }
    } catch (err) {
      if (err.message === 'EMAIL_TAKEN') setError(t('auth.errorEmailTaken'))
      else if (err.message === 'INVALID_CREDENTIALS') setError(t('auth.errorInvalidCredentials'))
      else setError(t('auth.errorGeneric'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col lg:min-h-[38rem] lg:flex-row">
      {/* Colonne formulaire */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="inline-block text-zinc-900 dark:text-white">
            <Logo size="md" />
          </Link>

          <h1 className="mt-8 text-2xl font-bold text-zinc-900 dark:text-white">
            {isRegister ? t('auth.createAccountTitle') : t('auth.loginTitle')}
          </h1>
          <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {isRegister ? t('auth.createAccountSubtitle') : t('auth.loginSubtitle')}
          </p>

          <div className="mt-6 flex gap-3">
            <SocialButton mark="G" markClassName="text-[#4285F4]" label="Google" onClick={handleSocialClick} />
            <SocialButton mark="f" markClassName="text-[#1877F2]" label="Facebook" onClick={handleSocialClick} />
            <SocialButton icon={KeyRound} label="SSO" onClick={handleSocialClick} />
          </div>

          {socialNotice && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
              {t('auth.socialComingSoon')}
            </p>
          )}

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
            <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500">{t('auth.orWithEmail')}</span>
            <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  {t('auth.fullName')}
                </span>
                <div className="relative">
                  <User
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder={t('auth.fullNamePlaceholder')}
                    className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-zinc-900 outline-none transition-colors duration-200 focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                  />
                </div>
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {t('auth.email')}
              </span>
              <div className="relative">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-zinc-900 outline-none transition-colors duration-200 focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {t('auth.password')}
              </span>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
                  aria-hidden="true"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-10 pr-10 text-sm text-zinc-900 outline-none transition-colors duration-200 focus:border-indigo-500 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 transition-colors duration-150 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-1 inline-flex items-center justify-center rounded-xl bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? t('auth.submitting') : isRegister ? t('auth.submitRegister') : t('auth.submitLogin')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            {isRegister ? t('auth.alreadyMember') : t('auth.noAccountYet')}{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              {isRegister ? t('auth.switchToLogin') : t('auth.switchToRegister')}
            </button>
          </p>
        </div>
      </div>

      {/* Colonne présentation, desktop uniquement */}
      <div className="hidden w-1/2 flex-col justify-center bg-slate-50 px-16 dark:bg-zinc-900 lg:flex">
        <h2 className="text-3xl font-extrabold leading-tight text-zinc-900 dark:text-white">
          {t('auth.marketingTitle')}
        </h2>
        <p className="mt-3 max-w-md text-zinc-500 dark:text-zinc-400">{t('auth.marketingSubtitle')}</p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          {FEATURE_CARDS.map(({ icon: Icon, key }) => (
            <div
              key={key}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-800/60"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                {t(`auth.feature.${key}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
