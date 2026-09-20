import { useCallback, useEffect, useState } from 'react'
import { getHistory, clearHistory, onHistoryChange } from '../utils/historyStorage'

/** Historique réactif : se met à jour dès qu'une entrée est ajoutée/vidée. */
export function useHistory() {
  const [entries, setEntries] = useState(() => getHistory())

  useEffect(() => {
    const refresh = () => setEntries(getHistory())
    return onHistoryChange(refresh)
  }, [])

  const clear = useCallback(() => clearHistory(), [])

  return { entries, clear }
}
