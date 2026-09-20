import {
  Combine,
  Scissors,
  Minimize2,
  FileText,
  FileType2,
  Image,
  FileImage,
  RotateCw,
  LayoutGrid,
  PenTool,
  Lock,
  Unlock,
  ScanText,
  GitCompareArrows,
  Fingerprint,
  EyeOff,
  Droplets,
  Hash,
  FileMinus2,
  Images,
  FileSpreadsheet,
  Video,
  Music,
  RefreshCw,
  Maximize2,
  Volume2,
  VolumeX,
  Film,
  Aperture,
  GalleryHorizontal,
  Contrast,
  SlidersHorizontal,
  Palette,
  Blend,
  Sparkles,
  Package,
  Bandage,
  Crop,
  Paintbrush,
  PaintBucket,
  Type,
  Layers,
  Lasso,
  Wand2,
  Stamp,
} from 'lucide-react'

// Source de vérité unique pour tous les outils de l'application.
// Ajouter un outil = ajouter un objet ici (nom, description, icône,
// catégorie) ; sa page /tools/:id, sa carte sur l'accueil et son entrée dans
// l'Assistant Magique se génèrent automatiquement, sans code supplémentaire.
// Le style visuel (icône neutre + accent) est géré une seule fois par les
// composants (ToolCard, SuggestionResults...), pas ici.
const toolDefinitions = [
  {
    id: 'merge',
    name: 'Fusionner PDF',
    description: 'Combinez plusieurs fichiers en un seul PDF',
    icon: Combine,
    category: 'Organiser',
    customRoute: '/tool/merge-pdf',
  },
  {
    id: 'split',
    name: 'Diviser PDF',
    description: 'Extrayez des pages en documents séparés',
    icon: Scissors,
    category: 'Organiser',
    customRoute: '/tool/split-pdf',
  },
  {
    id: 'compress',
    name: 'Compresser PDF',
    description: 'Réduisez la taille sans perdre en qualité',
    icon: Minimize2,
    category: 'Optimiser',
    // Outil avec une page dédiée (upload réel + moteur de compression) au
    // lieu de la page générique /tools/:id.
    customRoute: '/tool/compress-pdf',
  },
  {
    id: 'pdf-to-word',
    name: 'PDF vers Word',
    description: 'Convertissez en documents .docx modifiables',
    icon: FileType2,
    category: 'Convertir',
    customRoute: '/tool/pdf-to-word',
  },
  {
    id: 'word-to-pdf',
    name: 'Word vers PDF',
    description: 'Transformez vos documents Office en PDF',
    icon: FileText,
    category: 'Convertir',
    customRoute: '/tool/word-to-pdf',
  },
  {
    id: 'excel-to-pdf',
    name: 'Excel vers PDF',
    description: 'Transformez vos feuilles de calcul en PDF',
    icon: FileSpreadsheet,
    category: 'Convertir',
    customRoute: '/tool/excel-to-pdf',
  },
  {
    id: 'pdf-to-jpg',
    name: 'PDF vers Image',
    description: 'Exportez vos pages en PNG/JPEG, ou en ZIP',
    icon: Image,
    category: 'Convertir',
    customRoute: '/tool/pdf-to-image',
  },
  {
    id: 'jpg-to-pdf',
    name: 'Image vers PDF',
    description: 'Rassemblez vos photos et images dans un PDF',
    icon: FileImage,
    category: 'Convertir',
    customRoute: '/tool/jpg-to-pdf',
  },
  {
    id: 'rotate',
    name: 'Pivoter PDF',
    description: 'Corrigez l’orientation de vos pages',
    icon: RotateCw,
    category: 'Organiser',
    // Le pivotement est une fonctionnalité de l'outil "Organiser les pages"
    // (réordonner/pivoter/supprimer) : pas de page dédiée séparée, on
    // pointe directement vers la même page fonctionnelle plutôt que de
    // dupliquer la logique ou de laisser retomber sur la page générique
    // /tools/rotate, qui ne fait que simuler un traitement.
    customRoute: '/tool/organize-pdf',
  },
  {
    id: 'organize',
    name: 'Organiser les pages',
    description: 'Réordonnez, pivotez ou supprimez des pages par glisser-déposer',
    icon: LayoutGrid,
    category: 'Organiser',
    customRoute: '/tool/organize-pdf',
  },
  {
    id: 'delete-pages',
    name: 'Supprimer des Pages',
    description: 'Choisissez les pages à retirer depuis un aperçu visuel',
    icon: FileMinus2,
    category: 'Organiser',
    customRoute: '/tool/delete-pages',
  },
  {
    id: 'sign',
    name: 'Signer PDF',
    description: 'Dessinez ou importez votre signature électronique',
    icon: PenTool,
    category: 'Sécuriser',
    customRoute: '/tool/sign-pdf',
  },
  {
    id: 'protect',
    name: 'Protéger PDF',
    description: 'Gérez les restrictions d’accès de vos fichiers',
    icon: Lock,
    category: 'Sécuriser',
    customRoute: '/tool/protect-pdf?tab=protect',
  },
  {
    id: 'unlock',
    name: 'Déverrouiller PDF',
    description: 'Retirez les restrictions d’un PDF protégé',
    icon: Unlock,
    category: 'Sécuriser',
    customRoute: '/tool/protect-pdf?tab=unlock',
  },
  {
    id: 'watermark',
    name: 'Filigrane',
    description: 'Superposez un texte (CONFIDENTIEL, SPECIMEN…) sur vos pages',
    icon: Droplets,
    category: 'Éditer',
    customRoute: '/tool/watermark-pdf',
  },
  {
    id: 'page-numbers',
    name: 'Numérotation de pages',
    description: 'Ajoutez la pagination en en-tête ou en pied de page',
    icon: Hash,
    category: 'Éditer',
    customRoute: '/tool/page-numbers',
  },
  {
    id: 'ocr',
    name: 'OCR PDF',
    description: 'Rendez vos scans consultables et copiables',
    icon: ScanText,
    category: 'Éditer',
    customRoute: '/tool/ocr-pdf',
  },
  {
    id: 'pdf-to-text',
    name: 'PDF vers Texte Brut',
    description: 'Extrayez tout le contenu textuel, page par page',
    icon: FileText,
    category: 'Convertir',
    customRoute: '/tool/pdf-to-text',
  },
  {
    id: 'extract-images',
    name: 'Extraire les Images',
    description: 'Récupérez toutes les images intégrées dans un PDF',
    icon: Images,
    category: 'Convertir',
    customRoute: '/tool/extract-images',
  },
  {
    id: 'compare',
    name: 'Comparer PDF',
    description: 'Repérez les différences entre deux versions, en local',
    icon: GitCompareArrows,
    category: 'Sécurité & Confidentialité',
    // Comparaison visuelle réelle (rendu + diff pixel) au lieu de la page
    // générique /tools/:id.
    customRoute: '/tool/compare-pdf',
  },
  {
    id: 'clean-metadata',
    name: 'Nettoyeur de Métadonnées',
    description: 'Anonymisez un PDF en purgeant ses métadonnées cachées',
    icon: Fingerprint,
    category: 'Sécurité & Confidentialité',
    customRoute: '/tool/clean-metadata',
  },
  {
    id: 'auto-redact',
    name: 'Censure Automatique',
    description: 'Masquez e-mails, téléphones et mots sensibles avant partage',
    icon: EyeOff,
    category: 'Sécurité & Confidentialité',
    customRoute: '/tool/auto-redact',
  },
  {
    id: 'compress-image',
    name: 'Compresser Image',
    description: 'Réduisez le poids de vos JPG/PNG/WebP avec un curseur de qualité',
    icon: Minimize2,
    category: 'Optimiser',
    mediaType: 'image',
    customRoute: '/tool/image-basic?tab=compress',
  },
  {
    id: 'convert-image',
    name: 'Convertir Image',
    description: 'Basculez entre JPG, PNG et WebP',
    icon: RefreshCw,
    category: 'Convertir',
    mediaType: 'image',
    customRoute: '/tool/image-basic?tab=convert',
  },
  {
    id: 'resize-image',
    name: 'Redimensionner Image',
    description: 'Ajustez les dimensions en pixels ou en pourcentage',
    icon: Maximize2,
    category: 'Éditer',
    mediaType: 'image',
    customRoute: '/tool/image-basic?tab=resize',
  },
  {
    id: 'trim-audio',
    name: 'Découper Audio',
    description: 'Extrayez un passage précis (début/fin) de votre fichier audio',
    icon: Scissors,
    category: 'Éditer',
    mediaType: 'audio',
    customRoute: '/tool/audio-basic?tab=trim',
  },
  {
    id: 'extract-audio',
    name: 'Extraire l’Audio',
    description: 'Récupérez la piste son d’une vidéo en fichier audio',
    icon: Volume2,
    category: 'Convertir',
    mediaType: 'audio',
    customRoute: '/tool/audio-basic?tab=extract',
  },
  {
    id: 'convert-audio',
    name: 'Convertir Audio',
    description: 'Basculez entre WAV et MP3',
    icon: RefreshCw,
    category: 'Convertir',
    mediaType: 'audio',
    customRoute: '/tool/audio-basic?tab=convert',
  },
  {
    id: 'video-to-gif',
    name: 'Vidéo vers GIF',
    description: 'Transformez un extrait vidéo en GIF animé',
    icon: Film,
    category: 'Convertir',
    mediaType: 'video',
    customRoute: '/tool/video-basic?tab=gif',
  },
  {
    id: 'mute-video',
    name: 'Supprimer le Son',
    description: 'Ré-exportez une vidéo sans sa piste audio',
    icon: VolumeX,
    category: 'Éditer',
    mediaType: 'video',
    customRoute: '/tool/video-basic?tab=mute',
  },

  // --- Studio Image avancé -------------------------------------------------
  // 18 fiches organisées par badge, chacune un vrai outil (Canvas2D natif).
  // Plusieurs fiches proches partagent une même page dédiée via ?tab=
  // (même convention que Protéger/Déverrouiller -> protect-pdf) : ce n'est
  // pas 18 pages séparées, mais 18 entrées cliquables bien distinctes.
  {
    id: 'brightness-contrast',
    name: 'Luminosité & Contraste',
    description: 'Ajustez la luminosité et le contraste avec des curseurs en direct',
    icon: Contrast,
    category: 'Ajustements & Couleurs',
    mediaType: 'image',
    customRoute: '/tool/image-adjust?tab=basic',
  },
  {
    id: 'levels-curves',
    name: 'Niveaux & Courbes',
    description: 'Point noir/blanc, gamma et courbes tonales simplifiées',
    icon: SlidersHorizontal,
    category: 'Ajustements & Couleurs',
    mediaType: 'image',
    customRoute: '/tool/image-adjust?tab=levels',
  },
  {
    id: 'color-balance',
    name: 'Teinte, Saturation & Balance des couleurs',
    description: 'Teinte, saturation et décalage par canal RVB',
    icon: Palette,
    category: 'Ajustements & Couleurs',
    mediaType: 'image',
    customRoute: '/tool/image-adjust?tab=color',
  },
  {
    id: 'sharpen-blur',
    name: 'Netteté & Flou',
    description: 'Accentuez les détails ou adoucissez l’image',
    icon: Aperture,
    category: 'Retouche & Correction',
    mediaType: 'image',
    customRoute: '/tool/image-adjust?tab=sharpen',
  },
  {
    id: 'clone-heal',
    name: 'Outil de Clonage & Pinceau de Guérison',
    description: 'Dupliquez une zone ou lissez un défaut par mélange doux',
    icon: Stamp,
    category: 'Retouche & Correction',
    mediaType: 'image',
    customRoute: '/tool/image-retouch?tab=clone',
  },
  {
    id: 'patch-redeye',
    name: 'Outil Pièce & Correction Yeux Rouges',
    description: 'Corrigez les yeux rouges (outil pièce à venir)',
    icon: Bandage,
    category: 'Retouche & Correction',
    mediaType: 'image',
    customRoute: '/tool/image-retouch?tab=redeye',
  },
  {
    id: 'magic-quick-select',
    name: 'Baguette Magique & Sélection Rapide',
    description: 'Sélectionnez une zone par couleur ou par glissement',
    icon: Wand2,
    category: 'Sélection & Découpage',
    mediaType: 'image',
    customRoute: '/tool/image-select?tab=wand',
  },
  {
    id: 'lasso-tools',
    name: 'Lasso (Standard, Polygonal, Magnétique)',
    description: 'Tracez une sélection à main levée ou point par point',
    icon: Lasso,
    category: 'Sélection & Découpage',
    mediaType: 'image',
    customRoute: '/tool/image-select?tab=lasso',
  },
  {
    id: 'pen-masks',
    name: 'Outil Plume & Masques de Fusion',
    description: 'Peignez un masque de fusion entre deux images (plume à venir)',
    icon: Blend,
    category: 'Sélection & Découpage',
    mediaType: 'image',
    customRoute: '/tool/image-select?tab=masks',
  },
  {
    id: 'crop-straighten',
    name: 'Recadrage & Redressement',
    description: 'Recadrez et redressez votre image par glissement',
    icon: Crop,
    category: 'Transformation & Géométrie',
    mediaType: 'image',
    customRoute: '/tool/image-transform?tab=crop',
  },
  {
    id: 'transform-geometry',
    name: 'Rotation, Échelle, Déformation & Perspective',
    description: 'Faites pivoter, redimensionnez ou retournez l’image (déformation à venir)',
    icon: Maximize2,
    category: 'Transformation & Géométrie',
    mediaType: 'image',
    customRoute: '/tool/image-transform?tab=free',
  },
  {
    id: 'brush-tools',
    name: 'Pinceau, Crayon & Gomme',
    description: 'Dessinez, esquissez ou effacez librement',
    icon: Paintbrush,
    category: 'Dessin & Graphisme',
    mediaType: 'image',
    customRoute: '/tool/image-draw?tab=brush',
  },
  {
    id: 'bucket-gradient',
    name: 'Pot de Peinture & Dégradés',
    description: 'Remplissez une zone ou appliquez un dégradé linéaire/radial',
    icon: PaintBucket,
    category: 'Dessin & Graphisme',
    mediaType: 'image',
    customRoute: '/tool/image-draw?tab=fill',
  },
  {
    id: 'text-vector',
    name: 'Outil Texte & Vectorisation',
    description: 'Ajoutez du texte sur votre image (vectorisation à venir)',
    icon: Type,
    category: 'Dessin & Graphisme',
    mediaType: 'image',
    customRoute: '/tool/image-draw?tab=text',
  },
  {
    id: 'layers-blend',
    name: 'Gestion des Calques & Modes de Fusion',
    description: 'Empilez plusieurs images avec opacité et modes de fusion réels',
    icon: Layers,
    category: 'Calques & Effets',
    mediaType: 'image',
    customRoute: '/tool/image-layers',
  },
  {
    id: 'filters-styles',
    name: 'Filtres & Styles de Calque',
    description: 'Appliquez un filtre prédéfini (N&B, Sépia, Vif…)',
    icon: Sparkles,
    category: 'Calques & Effets',
    mediaType: 'image',
    customRoute: '/tool/image-adjust?tab=presets',
  },
  {
    id: 'hdr-panorama',
    name: 'Fusion HDR & Panoramique',
    description: 'Fusion multi-expositions et assemblage panoramique',
    icon: GalleryHorizontal,
    category: 'Avancé & Automatisation',
    mediaType: 'image',
    customRoute: '/tool/image-hdr-panorama',
  },
  {
    id: 'batch-processing',
    name: 'Traitement par Lots',
    description: 'Appliquez un préréglage à plusieurs images et exportez en ZIP',
    icon: Package,
    category: 'Avancé & Automatisation',
    mediaType: 'image',
    customRoute: '/tool/image-batch',
  },
]

// Chaque outil hérite d'une route dérivée de son id : /tools/<id>, sauf s'il
// définit `customRoute` (cas d'un outil avec une page dédiée sur mesure,
// ex: /tool/compress-pdf). Le calcul automatique évite les doublons/fautes
// de frappe entre l'id et la route pour tous les outils génériques.
//
// `mediaType` classe chaque outil par grand type de média (pdf/image/video/
// audio) pour les hubs dédiés (/pdf, /image, /video, /audio) et le sélecteur
// de la page d'accueil. Tous les outils actuels sont des outils PDF ; c'est
// pourquoi c'est la seule valeur par défaut ici plutôt qu'un champ répété 21
// fois dans toolDefinitions — un futur outil Image/Vidéo/Audio n'aura qu'à
// déclarer `mediaType` explicitement dans sa définition.
export const tools = toolDefinitions.map((tool) => ({
  ...tool,
  mediaType: tool.mediaType ?? 'pdf',
  route: tool.customRoute ?? `/tools/${tool.id}`,
}))

export const categories = ['Tous', ...new Set(tools.map((t) => t.category))]

// Grands types de média proposés par l'app. `icon` est un composant
// lucide-react (jamais un emoji) — même convention que les outils eux-mêmes.
export const MEDIA_TYPES = [
  { id: 'pdf', label: 'PDF', icon: FileText },
  { id: 'image', label: 'Image', icon: Image },
  { id: 'video', label: 'Vidéo', icon: Video },
  { id: 'audio', label: 'Audio', icon: Music },
]

export function getToolById(id) {
  return tools.find((tool) => tool.id === id)
}

export function getToolsByMediaType(mediaType) {
  return tools.filter((tool) => tool.mediaType === mediaType)
}

export function getCategoriesByMediaType(mediaType) {
  return ['Tous', ...new Set(getToolsByMediaType(mediaType).map((t) => t.category))]
}

// Une catégorie de média sans outil réel n'a pas encore de fonctionnalité
// livrée : les pages qui l'affichent doivent le dire honnêtement plutôt que
// de présenter des cartes non fonctionnelles.
export function isMediaTypeComingSoon(mediaType) {
  return getToolsByMediaType(mediaType).length === 0
}
