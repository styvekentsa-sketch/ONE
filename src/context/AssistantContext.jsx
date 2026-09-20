import { createContext, useContext, useState } from 'react'

const AssistantContext = createContext(null)

/**
 * État partagé de l'Assistant Magique. Le rendre disponible via un contexte
 * (plutôt qu'un state local à la page d'accueil) permet à n'importe quel
 * point de l'app — carte "Mode Facile", onglet "Assistant" de la barre de
 * navigation mobile, etc. — de l'ouvrir, quelle que soit la page affichée.
 */
export function AssistantProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <AssistantContext.Provider
      value={{ isOpen, open: () => setIsOpen(true), close: () => setIsOpen(false) }}
    >
      {children}
    </AssistantContext.Provider>
  )
}

export function useAssistant() {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error('useAssistant must be used within an AssistantProvider')
  return ctx
}
