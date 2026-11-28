import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getCurrentUser, loginUser, logoutUser, registerUser } from '../utils/authStorage'
import {
  deleteCurrentAccount,
  isFirebaseConfigured,
  loginWithEmail,
  registerWithEmail,
  sendPasswordReset,
  signInWithProvider,
  signOutUser,
  subscribeToAuth,
} from '../utils/firebaseAuth'

const AuthContext = createContext(null)
const CACHE_KEY = 'one-auth-cache'

function readCache() {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? 'null')
  } catch {
    return null
  }
}

function writeCache(user) {
  try {
    if (user) window.localStorage.setItem(CACHE_KEY, JSON.stringify(user))
    else window.localStorage.removeItem(CACHE_KEY)
  } catch {
    // stockage indisponible : la session reste en mémoire
  }
}

/**
 * Session utilisateur.
 * - Firebase configuré : vrais comptes (e-mail + connexions sociales),
 *   synchronisés entre appareils. Un aperçu du dernier utilisateur connu est
 *   gardé en cache local pour afficher l'interface connectée sans attendre
 *   le chargement de Firebase.
 * - Sinon : comptes locaux à ce navigateur (utils/authStorage.js), comme
 *   avant, sans connexion sociale.
 */
export function AuthProvider({ children }) {
  const { i18n } = useTranslation()
  const [user, setUser] = useState(() => (isFirebaseConfigured ? readCache() : getCurrentUser()))
  const [ready, setReady] = useState(!isFirebaseConfigured)

  useEffect(() => {
    if (!isFirebaseConfigured) return undefined
    let unsubscribe = () => {}
    let active = true
    subscribeToAuth((next) => {
      if (!active) return
      writeCache(next)
      setUser(next)
      setReady(true)
    })
      .then((fn) => {
        if (active) unsubscribe = fn
        else fn()
      })
      .catch(() => {
        // Firebase injoignable (hors ligne) : on garde l'aperçu en cache.
        if (active) setReady(true)
      })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const register = useCallback(
    async (payload) => {
      const next = isFirebaseConfigured ? await registerWithEmail(payload, i18n.language) : await registerUser(payload)
      setUser(next)
      if (isFirebaseConfigured) writeCache(next)
      return next
    },
    [i18n.language],
  )

  const login = useCallback(async (payload) => {
    const next = isFirebaseConfigured ? await loginWithEmail(payload) : await loginUser(payload)
    setUser(next)
    if (isFirebaseConfigured) writeCache(next)
    return next
  }, [])

  const loginWithProvider = useCallback(
    async (provider) => {
      if (!isFirebaseConfigured) throw new Error('NOT_CONFIGURED')
      const next = await signInWithProvider(provider, i18n.language)
      if (next) {
        setUser(next)
        writeCache(next)
      }
      return next
    },
    [i18n.language],
  )

  const resetPassword = useCallback(
    async (email) => {
      if (!isFirebaseConfigured) throw new Error('NOT_CONFIGURED')
      await sendPasswordReset(email, i18n.language)
    },
    [i18n.language],
  )

  const logout = useCallback(async () => {
    if (isFirebaseConfigured) {
      writeCache(null)
      await signOutUser().catch(() => {})
    } else {
      logoutUser()
    }
    setUser(null)
  }, [])

  const deleteAccount = useCallback(async () => {
    if (!isFirebaseConfigured) throw new Error('NOT_CONFIGURED')
    await deleteCurrentAccount()
    writeCache(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      ready,
      isAuthenticated: Boolean(user),
      socialAvailable: isFirebaseConfigured,
      register,
      login,
      loginWithProvider,
      resetPassword,
      logout,
      deleteAccount,
    }),
    [user, ready, register, login, loginWithProvider, resetPassword, logout, deleteAccount],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
