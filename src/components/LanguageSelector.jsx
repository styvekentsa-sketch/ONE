import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Globe } from 'lucide-react'

const LANGUAGES = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'es', label: 'Español', short: 'ES' },
]

/** Menu compact de changement de langue (FR/EN/ES), pour le header desktop et mobile. */
export default function LanguageSelector({ className = '' }) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)

  const current = LANGUAGES.find((lang) => lang.code === i18n.resolvedLanguage) ?? LANGUAGES[0]

  const handleSelect = (code) => {
    i18n.changeLanguage(code)
    setOpen(false)
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={t('settings.language')}
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-200/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white"
      >
        <Globe size={16} />
        {current.short}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-44 animate-scale-in overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-stone-900">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-200 hover:bg-stone-100 dark:hover:bg-stone-800 ${
                  lang.code === current.code
                    ? 'text-brand-600 dark:text-brand-400'
                    : 'text-stone-700 dark:text-stone-200'
                }`}
              >
                <span>{lang.label}</span>
                {lang.code === current.code && <Check size={14} />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
