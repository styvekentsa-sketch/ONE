// Paliers de compression Image — même esprit que compressionLevels.js (PDF),
// avec en plus le format cible et la dimension max, car pour une image (au
// contraire d'un PDF), la résolution est le levier n°1 pour réduire le
// poids : baisser la qualité JPEG seule a un effet plafonné, alors que
// diviser les dimensions par deux divise le nombre de pixels par quatre.
export const imageCompressionLevels = [
  {
    id: 'high',
    label: 'Compression Élevée',
    description: 'Qualité moindre, taille minimale (-70% à -90%)',
    quality: 0.6,
    maxDimension: 1920,
  },
  {
    id: 'recommended',
    label: 'Compression Équilibrée',
    description: 'Bon équilibre qualité / taille (-40% à -60%)',
    quality: 0.75,
    maxDimension: null,
  },
  {
    id: 'low',
    label: 'Compression Légère',
    description: 'Haute qualité, réduction légère (-20%)',
    quality: 0.85,
    maxDimension: null,
  },
]

export const DEFAULT_IMAGE_COMPRESSION_LEVEL = 'recommended'
