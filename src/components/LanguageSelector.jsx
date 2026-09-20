import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Globe } from 'lucide-react'

const LANGUAGES = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'es', label: 'Español', short: 'ES' },
]

/** Menu compact de changement de langue (FR/EN/ES), pour le header desktop et mobile. */
export default function LanguageSelector({ compact = false, className = '' }) {
  const { i18n } = useTranslation()
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
        aria-label="Changer de langue"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border border-zinc-200 font-medium text-zinc-600 transition-all duration-200 ease-in-out active:scale-[0.98] dark:border-white/10 dark:text-zinc-300 ${
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm hover:border-zinc-300 dark:hover:border-zinc-700'
        }`}
      >
        <Globe size={compact ? 12 : 14} />
        {current.short}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-2 w-40 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-zinc-900">
            {LANGUAGES.map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleSelect(lang.code)}
                className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors duration-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${
                  lang.code === current.code
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-zinc-700 dark:text-zinc-200'
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
