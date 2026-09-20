// estimatedRatio : fraction approximative de la taille d'origine affichée
// pendant le traitement, avant de connaître le résultat réel.
export const compressionLevels = [
  {
    id: 'high',
    label: 'Compression Élevée',
    description: 'Qualité moindre, taille minimale',
    estimatedRatio: 0.3,
  },
  {
    id: 'recommended',
    label: 'Compression Recommandée',
    description: 'Bon équilibre qualité / taille',
    estimatedRatio: 0.55,
  },
  {
    id: 'low',
    label: 'Faible Compression',
    description: 'Haute qualité, réduction légère',
    estimatedRatio: 0.85,
  },
]

export const DEFAULT_COMPRESSION_LEVEL = 'recommended'
