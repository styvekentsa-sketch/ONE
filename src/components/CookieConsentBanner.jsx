import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Cookie } from 'lucide-react'
import Modal from './Modal'
import { useCookieConsent } from '../hooks/useCookieConsent'
import { onOpenPreferencesRequest } from '../utils/cookieConsent'

function ToggleRow({ title, description, checked, disabled, onChange, alwaysActiveLabel }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 py-4 last:border-0 dark:border-white/10">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
      {disabled ? (
        <span className="mt-0.5 shrink-0 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
          {alwaysActiveLabel}
        </span>
      ) : (
        <button
          role="switch"
          aria-checked={checked}
          aria-label={title}
          onClick={() => onChange(!checked)}
          className={`relative mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out ${
            checked ? 'bg-indigo-500' : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
        >
          <span
            className={`h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
              checked ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      )}
    </div>
  )
}

/**
 * Centre de consentement cookies : bandeau discret tant que l'utilisateur
 * n'a pas fait de choix, plus une modale de préférences détaillée,
 * ré-ouvrable à tout moment (pied de page, Réglages) via
 * `requestOpenPreferences()` — sans avoir à faire remonter un état par
 * props depuis n'importe quel point de l'arborescence.
 */
export default function CookieConsentBanner() {
  const { t } = useTranslation()
  const { consent, acceptAll, rejectNonEssential, savePreferences } = useCookieConsent()
  const [showBanner, setShowBanner] = useState(() => !consent.decided)
  const [showPreferences, setShowPreferences] = useState(false)
  const [draftHistory, setDraftHistory] = useState(consent.history)

  useEffect(() => {
    if (!consent.decided) setShowBanner(true)
  }, [consent.decided])

  useEffect(() => {
    return onOpenPreferencesRequest(() => {
      setDraftHistory(consent.history)
      setShowPreferences(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAcceptAll = () => {
    acceptAll()
    setShowBanner(false)
  }

  const handleRejectNonEssential = () => {
    rejectNonEssential()
    setShowBanner(false)
  }

  const openPreferences = () => {
    setDraftHistory(consent.history)
    setShowPreferences(true)
  }

  const handleSavePreferences = () => {
    savePreferences({ history: draftHistory })
    setShowPreferences(false)
    setShowBanner(false)
  }

  return (
    <>
      {showBanner && !showPreferences && (
        <div
          role="region"
          aria-label={t('cookieConsent.bannerTitle')}
          className="animate-fade-up fixed inset-x-0 bottom-0 z-90 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/95 sm:p-5"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Cookie size={18} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">{t('cookieConsent.bannerTitle')}</p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {t('cookieConsent.bannerDescription')}{' '}
                  <Link to="/cookie-policy" className="font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400">
                    {t('cookieConsent.learnMore')}
                  </Link>
                </p>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                onClick={openPreferences}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 ease-in-out hover:border-zinc-400 active:scale-[0.98] dark:border-zinc-600 dark:text-zinc-200"
              >
                {t('cookieConsent.customize')}
              </button>
              <button
                onClick={handleRejectNonEssential}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-700 transition-all duration-200 ease-in-out hover:border-zinc-400 active:scale-[0.98] dark:border-zinc-600 dark:text-zinc-200"
              >
                {t('cookieConsent.rejectNonEssential')}
              </button>
              <button
                onClick={handleAcceptAll}
                className="rounded-full bg-indigo-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
              >
                {t('cookieConsent.acceptAll')}
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={showPreferences}
        onClose={() => setShowPreferences(false)}
        icon={Cookie}
        title={t('cookieConsent.preferencesTitle')}
        subtitle={t('cookieConsent.preferencesDescription')}
      >
        <div className="flex flex-col">
          <ToggleRow
            title={t('cookieConsent.necessaryTitle')}
            description={t('cookieConsent.necessaryDescription')}
            checked
            disabled
            alwaysActiveLabel={t('cookieConsent.alwaysActive')}
          />
          <ToggleRow
            title={t('cookieConsent.historyTitle')}
            description={t('cookieConsent.historyDescription')}
            checked={draftHistory}
            onChange={setDraftHistory}
          />
        </div>

        <Link
          to="/cookie-policy"
          onClick={() => setShowPreferences(false)}
          className="mt-4 inline-block text-xs font-medium text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
        >
          {t('cookieConsent.learnMore')}
        </Link>

        <button
          onClick={handleSavePreferences}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
        >
          {t('cookieConsent.save')}
        </button>
      </Modal>
    </>
  )
}
