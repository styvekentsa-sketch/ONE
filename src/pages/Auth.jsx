import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Eye, EyeOff, FileText, Image as ImageIcon, LoaderCircle, Lock, Mail, Music, User, Video } from 'lucide-react'
import ProviderLogo, { PROVIDER_NAMES } from '../components/auth/ProviderLogo'
import { enabledProviders } from '../utils/firebaseAuth'
import Logo from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { isValidEmail, isValidPassword, MIN_PASSWORD_LENGTH } from '../utils/authValidation'

const FEATURE_CARDS = [
  { icon: FileText, key: 'pdf' },
  { icon: ImageIcon, key: 'image' },
  { icon: Video, key: 'video' },
  { icon: Music, key: 'audio' },
]

function SocialButton({ provider, label, pending, disabled, onClick, compact = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-busy={pending}
      className={`flex h-12 items-center justify-center gap-2.5 rounded-xl border border-stone-200 bg-white px-4 text-[15px] font-medium text-stone-800 transition-colors hover:border-stone-300 hover:bg-stone-50 active:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-stone-600 dark:hover:bg-stone-800 ${compact ? 'min-w-0 flex-1 px-2' : 'w-full'}`}
    >
      {pending ? <LoaderCircle size={18} className="shrink-0 animate-spin text-stone-500" /> : <ProviderLogo provider={provider} />}
      <span className={compact ? 'truncate text-sm' : ''}>{label}</span>
    </button>
  )
}

/** Clé de message lisible pour chaque code d'erreur renvoyé par le contexte d'authentification. */
function errorKey(code) {
  const keys = {
    EMAIL_TAKEN: 'auth.errorEmailTaken',
    INVALID_CREDENTIALS: 'auth.errorInvalidCredentials',
    INVALID_EMAIL: 'auth.errorInvalidEmail',
    WEAK_PASSWORD: 'auth.errorWeakPassword',
    ACCOUNT_EXISTS: 'auth.errorAccountExists',
    PROVIDER_DISABLED: 'auth.errorProviderDisabled',
    UNAUTHORIZED_DOMAIN: 'auth.errorUnauthorizedDomain',
    NETWORK: 'auth.errorNetwork',
    TOO_MANY_REQUESTS: 'auth.errorTooManyRequests',
    USER_DISABLED: 'auth.errorUserDisabled',
  }
  return keys[code] ?? 'auth.errorGeneric'
}

/**
 * Connexion / inscription. Avec Firebase configuré : e-mail et connexions
 * sociales réelles (Google, Apple, Microsoft, GitHub, Facebook selon
 * VITE_AUTH_PROVIDERS) et réinitialisation du mot de passe par e-mail.
 * Sans configuration : comptes locaux à ce navigateur, sans connexion sociale.
 */
export default function Auth() {
  const { t } = useTranslation()
  const { login, register, loginWithProvider, resetPassword, socialAvailable } = useAuth()

  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingProvider, setPendingProvider] = useState(null)
  const [info, setInfo] = useState(null)

  const isRegister = mode === 'register'
  const isReset = mode === 'reset'
  const showSocial = socialAvailable && enabledProviders.length > 0 && !isReset

  const toggleMode = () => {
    setMode((m) => (m === 'login' ? 'register' : 'login'))
    setError(null)
    setInfo(null)
  }

  const handleSocial = async (provider) => {
    setError(null)
    setInfo(null)
    setPendingProvider(provider)
    try {
      await loginWithProvider(provider)
    } catch (err) {
      // Fenêtre fermée par l'utilisateur : rien à signaler.
      if (err.message !== 'CANCELLED') setError(t(errorKey(err.message), { provider: PROVIDER_NAMES[provider] }))
    } finally {
      setPendingProvider(null)
    }
  }

  const handleReset = async (e) => {
    e.preventDefault()
    setError(null)
    if (!isValidEmail(email)) {
      setError(t('auth.errorInvalidEmail'))
      return
    }
    setIsSubmitting(true)
    try {
      await resetPassword(email)
      setInfo(t('auth.resetSent', { email: email.trim() }))
    } catch (err) {
      setError(t(errorKey(err.message)))
    } finally {
      setIsSubmitting(false)
    }
  }

  const goTo = (next) => {
    setMode(next)
    setError(null)
    setInfo(null)
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
      setError(t(errorKey(err.message)))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col lg:min-h-[38rem] lg:flex-row">
      {/* Colonne formulaire */}
      <div className="flex w-full flex-col justify-center px-6 py-12 sm:px-12 lg:w-1/2 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/" className="inline-block text-stone-900 dark:text-white">
            <Logo size="md" />
          </Link>

          <h1 className="mt-8 text-2xl font-bold text-stone-900 dark:text-white">
            {isReset ? t('auth.resetTitle') : isRegister ? t('auth.createAccountTitle') : t('auth.loginTitle')}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500 dark:text-stone-400">
            {isReset ? t('auth.resetSubtitle') : isRegister ? t('auth.createAccountSubtitle') : t('auth.loginSubtitle')}
          </p>

          {showSocial && (
            <>
              <div className="mt-6 flex flex-col gap-2.5">
                {enabledProviders.slice(0, 2).map((provider) => (
                  <SocialButton
                    key={provider}
                    provider={provider}
                    label={t('auth.continueWith', { provider: PROVIDER_NAMES[provider] })}
                    pending={pendingProvider === provider}
                    disabled={Boolean(pendingProvider)}
                    onClick={() => handleSocial(provider)}
                  />
                ))}
                {enabledProviders.length > 2 && (
                  <div className="flex gap-2.5">
                    {enabledProviders.slice(2).map((provider) => (
                      <SocialButton
                        key={provider}
                        compact
                        provider={provider}
                        label={PROVIDER_NAMES[provider]}
                        pending={pendingProvider === provider}
                        disabled={Boolean(pendingProvider)}
                        onClick={() => handleSocial(provider)}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
                <span className="text-xs font-medium text-stone-400 dark:text-stone-500">{t('auth.orWithEmail')}</span>
                <div className="h-px flex-1 bg-stone-200 dark:bg-stone-800" />
              </div>
            </>
          )}

          {!socialAvailable && import.meta.env.DEV && (
            <p className="mt-6 rounded-lg border border-dashed border-stone-300 px-3 py-2 text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
              {t('auth.devSocialHint')}
            </p>
          )}

          {!showSocial && <div className="mt-6" />}

          {isReset ? (
            <form onSubmit={handleReset} className="flex flex-col gap-4" noValidate>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300">{t('auth.email')}</span>
                <div className="relative">
                  <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" aria-hidden="true" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-stone-900 outline-none transition-colors duration-200 focus:border-brand-500 dark:border-stone-700 dark:bg-stone-900 dark:text-white"
                  />
                </div>
              </label>
              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
              {info && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-medium text-brand-800 dark:bg-brand-500/10 dark:text-brand-300">{info}</p>}
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 items-center justify-center rounded-xl bg-brand-600 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700 disabled:opacity-60"
              >
                {isSubmitting ? t('auth.submitting') : t('auth.resetSubmit')}
              </button>
              <button
                type="button"
                onClick={() => goTo('login')}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
              >
                <ArrowLeft size={15} /> {t('auth.backToLogin')}
              </button>
            </form>
          ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            {isRegister && (
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                  {t('auth.fullName')}
                </span>
                <div className="relative">
                  <User
                    size={16}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder={t('auth.fullNamePlaceholder')}
                    className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-stone-900 outline-none transition-colors duration-200 focus:border-brand-500 dark:border-white/10 dark:bg-stone-900 dark:text-white"
                  />
                </div>
              </label>
            )}

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                {t('auth.email')}
              </span>
              <div className="relative">
                <Mail
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-stone-900 outline-none transition-colors duration-200 focus:border-brand-500 dark:border-white/10 dark:bg-stone-900 dark:text-white"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-stone-600 dark:text-stone-300">
                {t('auth.password')}
              </span>
              <div className="relative">
                <Lock
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-10 pr-10 text-sm text-stone-900 outline-none transition-colors duration-200 focus:border-brand-500 dark:border-white/10 dark:bg-stone-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 transition-colors duration-150 hover:text-stone-600 dark:hover:text-stone-200"
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
              className="mt-1 inline-flex items-center justify-center rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? t('auth.submitting') : isRegister ? t('auth.submitRegister') : t('auth.submitLogin')}
            </button>

            {!isRegister && socialAvailable && (
              <button type="button" onClick={() => goTo('reset')} className="text-center text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                {t('auth.forgotPassword')}
              </button>
            )}
          </form>
          )}

          {!isReset && (
          <p className="mt-6 text-center text-sm text-stone-500 dark:text-stone-400">
            {isRegister ? t('auth.alreadyMember') : t('auth.noAccountYet')}{' '}
            <button
              type="button"
              onClick={toggleMode}
              className="font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              {isRegister ? t('auth.switchToLogin') : t('auth.switchToRegister')}
            </button>
          </p>
          )}
        </div>
      </div>

      {/* Colonne présentation, desktop uniquement */}
      <div className="hidden w-1/2 flex-col justify-center bg-stone-50 px-16 dark:bg-stone-900 lg:flex">
        <h2 className="text-3xl font-extrabold leading-tight text-stone-900 dark:text-white">
          {t('auth.marketingTitle')}
        </h2>
        <p className="mt-3 max-w-md text-stone-500 dark:text-stone-400">{t('auth.marketingSubtitle')}</p>

        <div className="mt-8 grid grid-cols-2 gap-4">
          {FEATURE_CARDS.map(({ icon: Icon, key }) => (
            <div
              key={key}
              className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-stone-800/60"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <Icon size={20} aria-hidden="true" />
              </span>
              <p className="mt-3 text-sm font-semibold text-stone-800 dark:text-stone-100">
                {t(`auth.feature.${key}`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
