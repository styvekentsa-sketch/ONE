/**
 * Retours sensoriels au toucher (vibration + son doux), façon application
 * native. Un seul écouteur global, posé au démarrage : il réagit à tout
 * appui tactile sur un élément interactif (bouton, lien, onglet, case…),
 * sans avoir à modifier chaque composant.
 *
 * - Uniquement au toucher (pointerType « touch ») : jamais à la souris.
 * - Vibration : API Vibration (Android et la plupart des navigateurs
 *   mobiles ; non disponible sur iPhone, où Safari ne l'expose pas).
 * - Son : synthétisé en direct (Web Audio), aucun fichier à charger. Il
 *   respecte le mode silencieux du téléphone quand le navigateur le permet.
 * - Désactivables séparément dans Réglages.
 */

const STORAGE_KEY = 'one-feedback'
const CHANGE_EVENT = 'one-feedback-change'
const DEFAULTS = { haptics: true, sound: true }

const INTERACTIVE = [
  'button',
  'a[href]',
  'summary',
  'select',
  '[role="button"]',
  '[role="tab"]',
  '[role="radio"]',
  '[role="checkbox"]',
  '[role="switch"]',
  '[role="menuitem"]',
  '[role="option"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="file"]',
  'label',
].join(',')

let settings = readSettings()
let audioContext = null

function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULTS }
  }
}

export function getFeedbackSettings() {
  return settings
}

export function setFeedbackSettings(patch) {
  settings = { ...settings, ...patch }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // stockage indisponible : réglage conservé pour la session
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: settings }))
}

export function onFeedbackSettingsChange(listener) {
  const handler = (e) => listener(e.detail)
  window.addEventListener(CHANGE_EVENT, handler)
  return () => window.removeEventListener(CHANGE_EVENT, handler)
}

export const supportsVibration = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
export const supportsSound = () => typeof window !== 'undefined' && Boolean(window.AudioContext || window.webkitAudioContext)

/** Petit « tok » feutré : sinus dont la hauteur descend, attaque et extinction rapides. */
export function playTapSound() {
  const Context = window.AudioContext || window.webkitAudioContext
  if (!Context) return
  try {
    if (!audioContext) {
      // Son d'ambiance : se tait avec le bouton silencieux de l'iPhone.
      if (navigator.audioSession) navigator.audioSession.type = 'ambient'
      audioContext = new Context()
    }
    if (audioContext.state === 'suspended') audioContext.resume()
    const now = audioContext.currentTime
    const oscillator = audioContext.createOscillator()
    const filter = audioContext.createBiquadFilter()
    const gain = audioContext.createGain()

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(620, now)
    oscillator.frequency.exponentialRampToValueAtTime(380, now + 0.06)
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(1600, now)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.045, now + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075)

    oscillator.connect(filter).connect(gain).connect(audioContext.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.09)
  } catch {
    // contexte audio refusé par le navigateur : on ignore silencieusement
  }
}

export function vibrateTap(duration = 10) {
  if (!supportsVibration()) return
  try {
    navigator.vibrate(duration)
  } catch {
    // certaines WebViews lèvent une exception : sans conséquence
  }
}

/** Déclenche les retours activés (appelable aussi depuis un composant). */
export function tapFeedback() {
  if (settings.haptics) vibrateTap()
  if (settings.sound) playTapSound()
}

function isDisabled(element) {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true' || Boolean(element.closest('fieldset:disabled'))
}

/** À appeler une fois au démarrage de l'application. */
export function installTapFeedback() {
  if (typeof document === 'undefined') return
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) settings = readSettings()
  })
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'touch' || !event.isPrimary) return
      if (!settings.haptics && !settings.sound) return
      const target = event.target instanceof Element ? event.target.closest(INTERACTIVE) : null
      if (!target || isDisabled(target)) return
      // Saisie de texte et curseurs : pas de « clic » à chaque appui.
      if (target.matches('input[type="range"], input[type="text"], textarea')) return
      tapFeedback()
    },
    { capture: true, passive: true },
  )
}
