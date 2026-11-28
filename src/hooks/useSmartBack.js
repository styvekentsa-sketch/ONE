import { useCallback } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { fallbackFor } from '../utils/routeMeta'

/**
 * Retour « intelligent » : revient réellement à l'écran précédent de
 * l'application (filtres, défilement et onglet retrouvés), comme le bouton
 * retour d'un téléphone. Si la page a été ouverte directement (lien
 * partagé, rechargement), il n'y a pas d'écran précédent dans l'app : on
 * remonte alors au hub du média correspondant plutôt que de quitter le site.
 */
export function useSmartBack(fallback) {
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(() => {
    // React Router numérote les entrées d'historique de l'app (idx).
    const idx = window.history.state?.idx ?? 0
    if (idx > 0) navigate(-1)
    else navigate(fallback ?? fallbackFor(location.pathname), { replace: true })
  }, [navigate, location.pathname, fallback])
}
