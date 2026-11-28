import { useTranslation } from 'react-i18next'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

/** Bascule clair / sombre : simple bouton icône, état annoncé aux lecteurs d'écran. */
export default function ThemeToggle({ className = '' }) {
  const { t } = useTranslation()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? t('settings.switchToLight') : t('settings.switchToDark')}
      title={isDark ? t('settings.switchToLight') : t('settings.switchToDark')}
      className={`flex h-10 w-10 items-center justify-center rounded-xl text-stone-600 transition-colors hover:bg-stone-200/70 hover:text-stone-900 active:bg-stone-200 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white ${className}`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}
