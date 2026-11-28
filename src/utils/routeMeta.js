import { tools } from '../data/tools'

/**
 * Carte de navigation de l'application : pour chaque URL, son titre, son
 * niveau (écran racine d'onglet ou écran « empilé ») et la destination de
 * repli du bouton retour quand on arrive directement sur la page (lien
 * partagé, rechargement) et qu'il n'y a donc pas d'écran précédent.
 */

/** Écrans racines : accessibles depuis la barre d'onglets, sans bouton retour. */
export const ROOT_PATHS = ['/', '/tools', '/history', '/easy-mode', '/settings']

/** La barre d'onglets n'apparaît que sur les écrans racines (comme sur iOS/Android). */
export function isTabBarVisible(pathname) {
  return ROOT_PATHS.includes(pathname)
}

const STATIC_TITLES = {
  '/': 'nav.home',
  '/tools': 'nav.tools',
  '/history': 'nav.files',
  '/easy-mode': 'nav.easyMode',
  '/settings': 'nav.settings',
  '/account': 'nav.account',
  '/pdf': 'mediaTypes.pdf',
  '/image': 'mediaTypes.image',
  '/video': 'mediaTypes.video',
  '/audio': 'mediaTypes.audio',
  '/legal-notice': 'footer.legalNotice',
  '/privacy-policy': 'footer.privacyPolicy',
  '/terms-of-service': 'footer.termsOfService',
  '/cookie-policy': 'footer.cookiePolicy',
  '/refund-policy': 'footer.refundPolicy',
}

const LEGAL_PATHS = ['/legal-notice', '/privacy-policy', '/terms-of-service', '/cookie-policy', '/refund-policy']

/** Outil correspondant à une URL (en tenant compte de ?tab= pour les outils qui partagent une page). */
export function findToolForLocation(pathname, search = '') {
  const tab = new URLSearchParams(search).get('tab')
  const candidates = tools.filter((tool) => tool.route.split('?')[0] === pathname)
  if (!candidates.length) {
    const generic = /^\/tools\/([^/]+)$/.exec(pathname)
    return generic ? tools.find((tool) => tool.id === generic[1]) ?? null : null
  }
  return candidates.find((tool) => new URLSearchParams(tool.route.split('?')[1] ?? '').get('tab') === tab) ?? candidates[0]
}

/** Hub de média d'une URL d'outil (destination de repli du bouton retour). */
export function fallbackFor(pathname) {
  if (/^\/tool\/image-/.test(pathname)) return '/image'
  if (/^\/tool\/video-/.test(pathname)) return '/video'
  if (/^\/tool\/audio-/.test(pathname)) return '/audio'
  if (LEGAL_PATHS.includes(pathname)) return '/settings'
  if (pathname.startsWith('/tool/') || pathname.startsWith('/tools/')) return '/'
  return '/'
}

/** Titre (clé i18n ou nom d'outil traduit), niveau et repli d'un écran. */
export function getRouteMeta(pathname, search, t) {
  const isRoot = ROOT_PATHS.includes(pathname)
  const tool = findToolForLocation(pathname, search)
  let title = ''
  if (tool) title = t(`tools.${tool.id}.name`, tool.name)
  else if (STATIC_TITLES[pathname]) title = t(STATIC_TITLES[pathname])
  return { isRoot, title, tool, fallback: fallbackFor(pathname) }
}
