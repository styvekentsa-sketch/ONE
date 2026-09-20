import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-zinc-200 dark:text-zinc-800">404</p>
      <p className="text-zinc-500 dark:text-zinc-400">{t('common.notFoundMessage')}</p>
      <Link
        to="/"
        className="rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
      >
        {t('common.backHome')}
      </Link>
    </div>
  )
}
