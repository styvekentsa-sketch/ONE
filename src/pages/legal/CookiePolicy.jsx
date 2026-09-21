import { useTranslation } from 'react-i18next'
import { Cookie } from 'lucide-react'
import LegalPageLayout from '../../components/legal/LegalPageLayout'
import { requestOpenPreferences } from '../../utils/cookieConsent'

export default function CookiePolicy() {
  const { t } = useTranslation()
  const content = t('legal.cookiePolicy', { returnObjects: true })

  return (
    <>
      <LegalPageLayout title={content.title} intro={content.intro} sections={content.sections} />
      <div className="mx-auto -mt-6 mb-12 max-w-3xl px-4 sm:px-6 lg:px-8">
        <button
          onClick={requestOpenPreferences}
          className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 ease-in-out hover:bg-indigo-400 active:scale-[0.98]"
        >
          <Cookie size={16} aria-hidden="true" /> {t('cookieConsent.customize')}
        </button>
      </div>
    </>
  )
}
