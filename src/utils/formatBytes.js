/**
 * Formate un nombre d'octets en chaîne lisible (ex: 4.5 MB).
 * Réutilisable par n'importe quel outil manipulant des tailles de fichiers.
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)))
  const value = bytes / Math.pow(k, i)

  return `${value.toFixed(i === 0 ? 0 : decimals)} ${sizes[i]}`
}
