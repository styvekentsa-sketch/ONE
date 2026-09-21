import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronRight,
  Cookie,
  FileText,
  Globe,
  HardDrive,
  Lock,
  Moon,
  Receipt,
  Scale,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
} from 'lucide-react'
import ThemeToggle from '../components/ThemeToggle'
import { useTheme } from '../context/ThemeContext'
import { useHistory } from '../hooks/useHistory'
import { useCookieConsent } from '../hooks/useCookieConsent'
import { requestOpenPreferences } from '../utils/cookieConsent'

const LANGUAGES = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
]

/** Estimation simple (caractères clé+valeur) du volume occupé dans
 * localStorage — une indication honnête, pas une mesure d'octets exacte. */
function getLocalStorageUsage() {
  let total = 0
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      total += (key?.length ?? 0) + (window.localStorage.getItem(key)?.length ?? 0)
    }
  } catch {
    // Stockage indisponible (navigation privée, quota bloqué...) : on
    // affiche simplement 0 plutôt que de faire échouer la page.
  }
  return total
}

function SettingsGroup({ title, children }) {
  return (
    <div className="mt-6 first:mt-0">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-white/10 dark:bg-zinc-900">
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ icon: Icon, label, sub, children, last = false }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 ${last ? '' : 'border-b border-zinc-100 dark:border-white/5'}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{label}</p>
        {sub && <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

/**
 * Ligne façon menu de réglages natif (iOS/Android) : badge d'icône teinté,
 * libellé + sous-texte d'état optionnel, chevron de divulgation à droite.
 * `to` -> navigation vers une page ; `onClick` -> ouverture d'une feuille
 * (ex. les préférences de cookies) sans quitter la page. Les deux gardent
 * un chevron, l'un et l'autre menant à un nouvel écran/panneau du point de
 * vue de l'utilisateur.
 */
function LegalRow({ icon: Icon, iconClassName, label, sub, to, onClick, last = false }) {
  const rowClassName = `group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:bg-zinc-100 dark:active:bg-white/10 ${
    last ? '' : 'border-b border-zinc-100 dark:border-white/5'
  } hover:bg-zinc-50 dark:hover:bg-white/5`

  const content = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">{label}</span>
        {sub && <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>}
      </span>
      <ChevronRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-zinc-300 transition-transform duration-150 group-hover:translate-x-0.5 dark:text-zinc-600"
      />
    </>
  )

  if (to) {
    return (
      <Link to={to} className={rowClassName}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} className={rowClassName}>
      {content}
    </button>
  )
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const { entries, clear } = useHistory()
  const { consent } = useCookieConsent()
  const [usage, setUsage] = useState(0)

  useEffect(() => {
    setUsage(getLocalStorageUsage())
  }, [entries])

  const usageKb = (usage / 1024).toFixed(1)
  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.resolvedLanguage)?.label

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{t('nav.settings')}</h1>

      <SettingsGroup title={t('settings.preferencesTitle')}>
        <SettingsRow icon={Globe} label={t('settings.language')} sub={currentLanguage}>
          <div className="flex gap-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ease-in-out active:scale-95 ${
                  i18n.resolvedLanguage === lang.code
                    ? 'bg-indigo-500 text-white'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                {lang.code.toUpperCase()}
              </button>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow
          icon={theme === 'dark' ? Moon : Sun}
          label={t('settings.theme')}
          sub={theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
          last
        >
          <ThemeToggle />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.storageTitle')}>
        <SettingsRow
          icon={HardDrive}
          label={t('settings.storageUsed')}
          sub={t('settings.storageUsedValue', { size: usageKb })}
          last={entries.length === 0}
        />
        {entries.length > 0 && (
          <button
            onClick={() => {
              clear()
              setUsage(getLocalStorageUsage())
            }}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-red-600 transition-colors duration-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-500/10 dark:text-red-400">
              <Trash2 size={16} />
            </span>
            {t('common.clearHistory')}
          </button>
        )}
      </SettingsGroup>

      <SettingsGroup title={t('settings.securityTitle')}>
        <SettingsRow icon={Lock} label={t('common.localSecurity')} last />
      </SettingsGroup>

      <SettingsGroup title={t('footer.legalLinksTitle')}>
        <LegalRow
          icon={Scale}
          iconClassName="bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
          label={t('footer.legalNotice')}
          to="/legal-notice"
        />
        <LegalRow
          icon={ShieldCheck}
          iconClassName="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          label={t('footer.privacyPolicy')}
          to="/privacy-policy"
        />
        <LegalRow
          icon={FileText}
          iconClassName="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
          label={t('footer.termsOfService')}
          to="/terms-of-service"
        />
        <LegalRow
          icon={Cookie}
          iconClassName="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          label={t('footer.cookiePolicy')}
          to="/cookie-policy"
        />
        <LegalRow
          icon={Receipt}
          iconClassName="bg-rose-500/10 text-rose-600 dark:text-rose-400"
          label={t('footer.refundPolicy')}
          to="/refund-policy"
        />
        <LegalRow
          icon={SlidersHorizontal}
          iconClassName="bg-violet-500/10 text-violet-600 dark:text-violet-400"
          label={t('footer.manageCookies')}
          sub={consent.history ? t('settings.cookiesHistoryOn') : t('settings.cookiesHistoryOff')}
          onClick={requestOpenPreferences}
          last
        />
      </SettingsGroup>
    </div>
  )
}
