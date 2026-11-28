import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MEDIA_TYPES } from '../data/tools'

const HUB_ROUTES = { pdf: '/', image: '/image', video: '/video', audio: '/audio' }

/**
 * Sélecteur de média en contrôle segmenté.
 * - Mode navigation (par défaut) : chaque segment mène à son hub.
 * - Mode filtre (`onChange`) : filtre sur place, avec un segment « Tous ».
 */
export default function MediaSwitch({ active, onChange, includeAll = false, className = '' }) {
  const { t } = useTranslation()
  const items = [...(includeAll ? [{ id: 'all', icon: null }] : []), ...MEDIA_TYPES]
  const base = 'flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors'
  const state = (id) =>
    id === active
      ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:text-white dark:ring-stone-700'
      : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'

  return (
    <div className={`flex rounded-xl bg-stone-200/60 p-1 dark:bg-stone-900 ${className}`} role="tablist" aria-label={t('mediaTypes.switcherLabel')}>
      {items.map(({ id, icon: Icon }) => {
        const content = (
          <>
            {Icon && <Icon size={15} className="hidden shrink-0 sm:block" aria-hidden="true" />}
            <span className="truncate">{t(`mediaTypes.${id}`)}</span>
          </>
        )
        return onChange ? (
          <button key={id} type="button" role="tab" aria-selected={id === active} onClick={() => onChange(id)} className={`${base} ${state(id)}`}>
            {content}
          </button>
        ) : (
          <Link key={id} to={HUB_ROUTES[id]} role="tab" aria-selected={id === active} className={`${base} ${state(id)}`}>
            {content}
          </Link>
        )
      })}
    </div>
  )
}
