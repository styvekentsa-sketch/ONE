import { useAuth } from '../context/AuthContext'
import Auth from './Auth'
import AccountProfile from './AccountProfile'

/**
 * Point d'entrée unique de l'onglet "Mon compte" (header desktop et barre de
 * navigation mobile) : affiche le formulaire de connexion/inscription tant
 * que personne n'est connecté, puis le profil une fois authentifié.
 */
export default function Account() {
  const { isAuthenticated } = useAuth()

  return isAuthenticated ? <AccountProfile /> : <Auth />
}
