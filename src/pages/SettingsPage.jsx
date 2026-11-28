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
  Vibrate,
  Volume2,
} from 'lucide-react'
import Switch from '../components/ui/Switch'
import InstallAppCard from '../components/InstallAppCard'
import { getFeedbackSettings, onFeedbackSettingsChange, setFeedbackSettings, supportsSound, supportsVibration, tapFeedback } from '../utils/feedback'
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
    <div className="mt-8 first:mt-0">
      <h2 className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {title}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        {children}
      </div>
    </div>
  )
}

function SettingsRow({ icon: Icon, label, sub, children, last = false }) {
  return (
    <div
      className={`flex min-h-14 items-center gap-3 px-4 py-3 ${last ? '' : 'border-b border-stone-100 dark:border-stone-800'}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-stone-800 dark:text-stone-100">{label}</p>
        {sub && <p className="truncate text-xs text-stone-500 dark:text-stone-400">{sub}</p>}
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
  const rowClassName = `group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 active:bg-stone-100 dark:active:bg-white/10 ${
    last ? '' : 'border-b border-stone-100 dark:border-white/5'
  } hover:bg-stone-50 dark:hover:bg-white/5`

  const content = (
    <>
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon size={17} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-stone-800 dark:text-stone-100">{label}</span>
        {sub && <span className="block truncate text-xs text-stone-500 dark:text-stone-400">{sub}</span>}
      </span>
      <ChevronRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-stone-300 transition-transform duration-150 group-hover:translate-x-0.5 dark:text-stone-600"
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
  const [feedback, setFeedback] = useState(getFeedbackSettings)

  useEffect(() => onFeedbackSettingsChange(setFeedback), [])

  const updateFeedback = (patch) => {
    setFeedbackSettings(patch)
    // Aperçu immédiat du réglage activé.
    if (patch.haptics || patch.sound) tapFeedback()
  }

  useEffect(() => {
    setUsage(getLocalStorageUsage())
  }, [entries])

  const usageKb = (usage / 1024).toFixed(1)
  const currentLanguage = LANGUAGES.find((lang) => lang.code === i18n.resolvedLanguage)?.label

  return (
    <div className="mx-auto max-w-2xl px-4 pb-12 pt-6 sm:px-6 md:pt-12 lg:px-8">
      <h1 className="mb-6 px-1 text-[28px] font-bold tracking-tight text-stone-900 md:text-4xl dark:text-white">{t('nav.settings')}</h1>

      <div className="mb-8">
        <h2 className="mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{t('install.section')}</h2>
        <InstallAppCard />
      </div>

      <SettingsGroup title={t('settings.preferencesTitle')}>
        <SettingsRow icon={Globe} label={t('settings.language')} sub={currentLanguage}>
          <div className="flex gap-1">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => i18n.changeLanguage(lang.code)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all duration-200 ease-in-out active:scale-95 ${
                  i18n.resolvedLanguage === lang.code
                    ? 'bg-brand-600 text-white'
                    : 'bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
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
          <Switch checked={theme === 'dark'} onChange={toggleTheme} label={t('settings.theme')} />
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t('settings.feedbackTitle')}>
        <SettingsRow
          icon={Vibrate}
          label={t('settings.haptics')}
          sub={supportsVibration() ? t('settings.hapticsSub') : t('settings.hapticsUnsupported')}
        >
          <Switch checked={feedback.haptics} onChange={(v) => updateFeedback({ haptics: v })} label={t('settings.haptics')} disabled={!supportsVibration()} />
        </SettingsRow>
        <SettingsRow icon={Volume2} label={t('settings.sound')} sub={t('settings.soundSub')} last>
          <Switch checked={feedback.sound} onChange={(v) => updateFeedback({ sound: v })} label={t('settings.sound')} disabled={!supportsSound()} />
        </SettingsRow>
      </SettingsGroup>
      <p className="mt-2 px-4 text-xs text-stone-500 dark:text-stone-400">{t('settings.feedbackNote')}</p>

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
          iconClassName="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          label={t('footer.legalNotice')}
          to="/legal-notice"
        />
        <LegalRow
          icon={ShieldCheck}
          iconClassName="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          label={t('footer.privacyPolicy')}
          to="/privacy-policy"
        />
        <LegalRow
          icon={FileText}
          iconClassName="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          label={t('footer.termsOfService')}
          to="/terms-of-service"
        />
        <LegalRow
          icon={Cookie}
          iconClassName="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          label={t('footer.cookiePolicy')}
          to="/cookie-policy"
        />
        <LegalRow
          icon={Receipt}
          iconClassName="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          label={t('footer.refundPolicy')}
          to="/refund-policy"
        />
        <LegalRow
          icon={SlidersHorizontal}
          iconClassName="bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300"
          label={t('footer.manageCookies')}
          sub={consent.history ? t('settings.cookiesHistoryOn') : t('settings.cookiesHistoryOff')}
          onClick={requestOpenPreferences}
          last
        />
      </SettingsGroup>
    </div>
  )
}
