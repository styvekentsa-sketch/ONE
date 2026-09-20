const STORAGE_KEY = 'one-history'
const MAX_ENTRIES = 20
const UPDATE_EVENT = 'one:history-updated'

function readEntries() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeEntries(entries) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Stockage plein ou indisponible (navigation privée) : l'historique
    // n'est qu'un confort, pas une donnée critique — on abandonne en silence.
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT))
}

/**
 * Ajoute une entrée d'historique. 100% local (localStorage) : rien n'est
 * jamais envoyé à un serveur. Ne conserve que les `MAX_ENTRIES` plus
 * récentes pour éviter une croissance illimitée.
 */
export function addHistoryEntry({ toolId, toolName, message }) {
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    toolId,
    toolName,
    message,
    timestamp: Date.now(),
  }
  writeEntries([entry, ...readEntries()].slice(0, MAX_ENTRIES))
  return entry
}

export function getHistory() {
  return readEntries()
}

export function clearHistory() {
  writeEntries([])
}

export function onHistoryChange(callback) {
  window.addEventListener(UPDATE_EVENT, callback)
  // Garde l'historique synchronisé si un autre onglet du même navigateur
  // modifie le localStorage.
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(UPDATE_EVENT, callback)
    window.removeEventListener('storage', callback)
  }
}

export function formatRelativeTime(timestamp) {
  const diffMs = Date.now() - timestamp
  const diffMin = Math.round(diffMs / 60000)

  if (diffMin < 1) return 'À l’instant'
  if (diffMin < 60) return `Il y a ${diffMin} min`

  const diffHours = Math.round(diffMin / 60)
  if (diffHours < 24) return `Il y a ${diffHours} h`

  const diffDays = Math.round(diffHours / 24)
  return `Il y a ${diffDays} j`
}
