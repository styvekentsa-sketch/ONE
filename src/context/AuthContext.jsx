import { createContext, useContext, useState } from 'react'
import { getCurrentUser, loginUser, logoutUser, registerUser } from '../utils/authStorage'

const AuthContext = createContext(null)

/**
 * Session 100% locale (voir utils/authStorage.js pour les limites de
 * sécurité réelles) : ce contexte expose juste l'utilisateur courant et les
 * actions login/register/logout à toute l'application, comme ThemeContext
 * le fait pour le thème.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCurrentUser())

  const register = async (payload) => {
    const newUser = await registerUser(payload)
    setUser(newUser)
    return newUser
  }

  const login = async (payload) => {
    const loggedInUser = await loginUser(payload)
    setUser(loggedInUser)
    return loggedInUser
  }

  const logout = () => {
    logoutUser()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: Boolean(user), register, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
