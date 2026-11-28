import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Download, EllipsisVertical, FolderDown, Maximize2, Share, ShieldCheck, Smartphone, SquarePlus, WifiOff } from 'lucide-react'
import Modal from './Modal'
import { APK_URL, getApkInfo, getInstallState, isAndroid, onInstallStateChange, promptInstall } from '../utils/pwaInstall'

function StepList({ steps }) {
  return (
    <ol className="flex flex-col gap-3">
      {steps.map(({ icon: Icon, text }, i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white dark:bg-white dark:text-stone-900">{i + 1}</span>
          <span className="min-w-0 flex-1 text-sm text-stone-700 dark:text-stone-200">{text}</span>
          <Icon size={20} className="shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
        </li>
      ))}
    </ol>
  )
}

function stepsFor(kind, t) {
  if (kind === 'apk') {
    return [
      { icon: FolderDown, text: t('install.apk.step1') },
      { icon: ShieldCheck, text: t('install.apk.step2') },
      { icon: CheckCircle2, text: t('install.apk.step3') },
    ]
  }
  if (kind === 'ios') {
    return [
      { icon: Share, text: t('install.ios.step1') },
      { icon: SquarePlus, text: t('install.ios.step2') },
      { icon: CheckCircle2, text: t('install.ios.step3') },
    ]
  }
  return [
    { icon: EllipsisVertical, text: t('install.manual.step1') },
    { icon: Download, text: t('install.manual.step2') },
    { icon: CheckCircle2, text: t('install.manual.step3') },
  ]
}

const formatSize = (bytes, language) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)

/**
 * Carte « Télécharger l'application » des Réglages.
 * - Android : le bouton télécharge le vrai fichier d'installation (ONE.apk).
 * - Ordinateur (Chrome, Edge) : installation native en un clic.
 * - iPhone / iPad : Apple n'autorise l'installation d'applications que via
 *   l'App Store ; on guide l'ajout à l'écran d'accueil depuis Safari.
 */
export default function InstallAppCard() {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState(getInstallState)
  const [apk, setApk] = useState(null)
  const [help, setHelp] = useState(null) // null | 'apk' | 'ios' | 'manual'
  const [busy, setBusy] = useState(false)
  const android = isAndroid()

  useEffect(() => onInstallStateChange(() => setState(getInstallState())), [])
  useEffect(() => {
    let alive = true
    getApkInfo().then((info) => alive && setApk(info))
    return () => {
      alive = false
    }
  }, [])

  if (state === 'installed') {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <img src="/icon-192.png" alt="" className="h-11 w-11 shrink-0 rounded-xl dark:ring-1 dark:ring-stone-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-stone-900 dark:text-white">{t('install.installedTitle')}</p>
          <p className="text-xs text-stone-500 dark:text-stone-400">{t('install.installedText')}</p>
        </div>
        <CheckCircle2 size={22} className="shrink-0 text-brand-600 dark:text-brand-400" />
      </div>
    )
  }

  const apkMeta = apk ? t('install.apk.meta', { version: apk.versionName, size: formatSize(apk.size, i18n.language) }) : null
  const primaryClass =
    'inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-600 text-[15px] font-semibold text-white transition-colors hover:bg-brand-700 active:bg-brand-800 disabled:opacity-60'

  const handleNativeInstall = async () => {
    if (state !== 'available') {
      setHelp(state === 'ios' ? 'ios' : 'manual')
      return
    }
    setBusy(true)
    try {
      await promptInstall()
    } finally {
      setBusy(false)
      setState(getInstallState())
    }
  }

  // Sur Android avec un APK publié : le bouton est un vrai lien de téléchargement.
  const androidDownload = android && apk

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900">
        <div className="flex items-start gap-3.5 p-4">
          <img src="/icon-192.png" alt="" className="h-14 w-14 shrink-0 rounded-2xl shadow-sm dark:ring-1 dark:ring-stone-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-stone-900 dark:text-white">{t('install.title')}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-stone-500 dark:text-stone-400">
              {androidDownload ? t('install.apk.subtitle') : t('install.subtitle')}
            </p>
          </div>
        </div>
        <ul className="grid grid-cols-3 border-t border-stone-100 text-center dark:border-stone-800">
          {[
            { icon: Smartphone, key: 'homeScreen' },
            { icon: Maximize2, key: 'fullScreen' },
            { icon: WifiOff, key: 'offline' },
          ].map(({ icon: Icon, key }) => (
            <li key={key} className="flex flex-col items-center gap-1 px-2 py-3 text-[11px] font-medium leading-tight text-stone-600 dark:text-stone-300">
              <Icon size={17} className="text-stone-500 dark:text-stone-400" aria-hidden="true" />
              {t(`install.benefits.${key}`)}
            </li>
          ))}
        </ul>
        <div className="border-t border-stone-100 p-3 dark:border-stone-800">
          {androidDownload ? (
            <>
              <a href={APK_URL} download="ONE.apk" type="application/vnd.android.package-archive" onClick={() => setHelp('apk')} className={primaryClass}>
                <Download size={18} />
                {t('install.apk.button')}
              </a>
              <p className="mt-2 text-center text-[11px] text-stone-500 dark:text-stone-400">{apkMeta}</p>
            </>
          ) : (
            <>
              <button type="button" onClick={handleNativeInstall} disabled={busy} className={primaryClass}>
                <Download size={18} />
                {state === 'available' ? t('install.button') : t('install.howTo')}
              </button>
              {apk && !android && (
                <a
                  href={APK_URL}
                  download="ONE.apk"
                  className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-brand-700 hover:underline dark:text-brand-400"
                >
                  <Smartphone size={14} aria-hidden="true" />
                  {t('install.apk.desktopLink')} · {apkMeta}
                </a>
              )}
            </>
          )}
        </div>
      </div>

      <Modal
        open={help !== null}
        onClose={() => setHelp(null)}
        icon={help === 'apk' ? Download : Smartphone}
        title={help === 'apk' ? t('install.apk.modalTitle') : t('install.title')}
        subtitle={help === 'apk' ? t('install.apk.modalSubtitle') : help === 'ios' ? t('install.ios.subtitle') : t('install.manual.subtitle')}
        maxWidth="max-w-md"
      >
        {help && <StepList steps={stepsFor(help, t)} />}
        {help === 'apk' && <p className="mt-4 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{t('install.apk.note')}</p>}
        <button
          type="button"
          onClick={() => setHelp(null)}
          className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-stone-900 text-sm font-semibold text-white hover:bg-stone-700 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-200"
        >
          {t('install.gotIt')}
        </button>
      </Modal>
    </>
  )
}
