import { useTranslation } from 'react-i18next'
import LegalPageLayout from '../../components/legal/LegalPageLayout'

export default function RefundPolicy() {
  const { t } = useTranslation()
  const content = t('legal.refund', { returnObjects: true })

  return <LegalPageLayout title={content.title} intro={content.intro} sections={content.sections} />
}
