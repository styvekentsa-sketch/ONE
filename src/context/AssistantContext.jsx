import { createContext, useCallback, useContext, useMemo, useState } from 'react'

const AssistantContext = createContext(null)

/**
 * Fenêtres globales partagées par toute l'application :
 * - l'Assistant (Mode Facile) : déposer un fichier pour se voir proposer
 *   le bon outil ;
 * - la recherche d'outil (palette de commandes, Ctrl/⌘ K).
 * Un contexte permet de les ouvrir depuis n'importe quel écran.
 */
export function AssistantProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const openSearch = useCallback(() => setIsSearchOpen(true), [])
  const closeSearch = useCallback(() => setIsSearchOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, open, close, isSearchOpen, openSearch, closeSearch }),
    [isOpen, open, close, isSearchOpen, openSearch, closeSearch],
  )

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export function useAssistant() {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error('useAssistant must be used within an AssistantProvider')
  return ctx
}
