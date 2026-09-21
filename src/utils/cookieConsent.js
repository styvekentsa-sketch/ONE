const STORAGE_KEY = 'one-cookie-consent'
const UPDATE_EVENT = 'one:cookie-consent-updated'
const OPEN_REQUEST_EVENT = 'one:cookie-consent-open-request'

const DEFAULT_CONSENT = { necessary: true, history: true, decided: false }

/**
 * Préférences de confidentialité, 100% locales (localStorage), jamais
 * transmises à un serveur. `history: false` fait aussi office de refus
 * effectif : historyStorage.addHistoryEntry vérifie ce flag avant d'écrire,
 * ce n'est donc pas qu'un bandeau cosmétique.
 */
export function getConsent() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONSENT }
    return { ...DEFAULT_CONSENT, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_CONSENT }
  }
}

export function setConsent(partial) {
  const next = { ...getConsent(), ...partial, necessary: true, decided: true, updatedAt: Date.now() }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Stockage indisponible (navigation privée, quota bloqué) : le choix ne
    // sera pas mémorisé d'une visite à l'autre, mais n'empêche pas d'utiliser
    // le site pour la session en cours.
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: next }))
  return next
}

export function onConsentChange(callback) {
  window.addEventListener(UPDATE_EVENT, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

/** Permet à n'importe quel composant (pied de page, Réglages...) de rouvrir
 * le panneau de préférences sans avoir à faire remonter un state par props. */
export function requestOpenPreferences() {
  window.dispatchEvent(new CustomEvent(OPEN_REQUEST_EVENT))
}

export function onOpenPreferencesRequest(callback) {
  window.addEventListener(OPEN_REQUEST_EVENT, callback)
  return () => window.removeEventListener(OPEN_REQUEST_EVENT, callback)
}
