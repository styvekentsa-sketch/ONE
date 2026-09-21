import { useCallback, useEffect, useState } from 'react'
import { getConsent, onConsentChange, requestOpenPreferences, setConsent } from '../utils/cookieConsent'

/** Préférences de cookies réactives : se mettent à jour dans tous les
 * composants montés dès qu'un choix est enregistré (bandeau, Réglages...). */
export function useCookieConsent() {
  const [consent, setConsentState] = useState(() => getConsent())

  useEffect(() => {
    const refresh = () => setConsentState(getConsent())
    return onConsentChange(refresh)
  }, [])

  const acceptAll = useCallback(() => setConsent({ history: true }), [])
  const rejectNonEssential = useCallback(() => setConsent({ history: false }), [])
  const savePreferences = useCallback((prefs) => setConsent(prefs), [])

  return { consent, acceptAll, rejectNonEssential, savePreferences, openPreferences: requestOpenPreferences }
}
