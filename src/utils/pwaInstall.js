/**
 * Installation de ONE comme application (PWA).
 *
 * - Chrome, Edge, Samsung Internet (Android, ordinateur) : le navigateur
 *   émet « beforeinstallprompt » ; on le garde pour afficher la fenêtre
 *   d'installation native au moment où l'utilisateur appuie sur le bouton.
 * - iPhone / iPad : Apple ne permet pas aux sites de déclencher
 *   l'installation ; on affiche les étapes (Partager → Sur l'écran d'accueil).
 * - Autres navigateurs : instructions génériques (menu → Installer).
 */

const CHANGE_EVENT = 'one-install-change'
let deferredPrompt = null
let justInstalled = false

const emit = () => window.dispatchEvent(new Event(CHANGE_EVENT))

export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export function isIOS() {
  const ua = window.navigator.userAgent
  return /iPad|iPhone|iPod/.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

/** 'installed' | 'available' | 'ios' | 'manual' */
export function getInstallState() {
  if (justInstalled || isStandalone()) return 'installed'
  if (deferredPrompt) return 'available'
  if (isIOS()) return 'ios'
  return 'manual'
}

export function onInstallStateChange(listener) {
  window.addEventListener(CHANGE_EVENT, listener)
  const media = window.matchMedia('(display-mode: standalone)')
  media.addEventListener('change', listener)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    media.removeEventListener('change', listener)
  }
}

/** Affiche la fenêtre d'installation native. Renvoie 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable'
  const prompt = deferredPrompt
  deferredPrompt = null
  await prompt.prompt()
  const { outcome } = await prompt.userChoice
  emit()
  return outcome
}

/** À appeler au démarrage : capture l'invitation et enregistre le service worker. */
export function installPwaSupport() {
  if (typeof window === 'undefined') return
  window.addEventListener('beforeinstallprompt', (event) => {
    // On garde l'invitation pour le bouton des Réglages plutôt que la
    // bannière automatique du navigateur.
    event.preventDefault()
    deferredPrompt = event
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    justInstalled = true
    emit()
  })

  // Service worker uniquement en production : en développement il
  // gênerait le rechargement à chaud de Vite.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
    })
  }
}
