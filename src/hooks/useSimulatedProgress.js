import { useEffect, useState } from 'react'

/**
 * Simule une progression fluide de 0 à `max`% sur `duration` ms.
 * Réutilisable par n'importe quel écran de traitement (assistant, outils...).
 */
export function useSimulatedProgress(active, duration = 1700, max = 96) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!active) {
      setProgress(0)
      return
    }

    const start = performance.now()
    let frame

    const tick = (now) => {
      const elapsed = now - start
      setProgress(Math.min(max, (elapsed / duration) * 100))
      if (elapsed < duration) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [active, duration, max])

  return progress
}
