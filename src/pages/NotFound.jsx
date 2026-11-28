import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-24 text-center">
      <p className="text-6xl font-extrabold text-stone-200 dark:text-stone-800">404</p>
      <p className="text-stone-500 dark:text-stone-400">{t('common.notFoundMessage')}</p>
      <Link
        to="/"
        className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-brand-700 active:scale-[0.98]"
      >
        {t('common.backHome')}
      </Link>
    </div>
  )
}
