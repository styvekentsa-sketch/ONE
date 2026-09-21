import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <button
      onClick={toggleTheme}
      aria-label="Basculer le thème"
      className="relative flex h-10 w-18 items-center rounded-full border border-zinc-200 bg-white p-1 shadow-sm transition-all duration-200 ease-in-out active:scale-[0.98] dark:border-white/10 dark:bg-zinc-800"
    >
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-white shadow-md transition-transform duration-300 ease-out ${
          isDark ? 'translate-x-8' : 'translate-x-0'
        }`}
      >
        {isDark ? <Moon size={16} /> : <Sun size={16} />}
      </span>
      <Sun size={14} className="absolute left-2 text-zinc-500 dark:text-zinc-400" />
      <Moon size={14} className="absolute right-2 text-zinc-500 dark:text-zinc-400" />
    </button>
  )
}
