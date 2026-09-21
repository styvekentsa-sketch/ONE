import { decodeAudio } from './audioWorker'

/**
 * Génère `count` vignettes régulièrement espacées sur toute la durée d'une
 * vidéo, pour construire un "filmstrip" façon éditeur mobile. Utilise un
 * <video> hors-DOM + un canvas de capture : aucune dépendance, ça tourne
 * entièrement dans le navigateur. Les seeks sont séquentiels (pas en
 * parallèle) car un seul <video> ne peut être qu'à une position à la fois.
 */
export async function generateVideoFilmstrip(file, count = 16) {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url

  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve()
      video.onerror = () => reject(new Error('VIDEO_LOAD_FAILED'))
    })

    const { duration, videoWidth, videoHeight } = video
    if (!duration || !Number.isFinite(duration)) throw new Error('VIDEO_LOAD_FAILED')

    const canvas = document.createElement('canvas')
    const thumbHeight = 96
    canvas.width = Math.max(1, Math.round((videoWidth / videoHeight) * thumbHeight))
    canvas.height = thumbHeight
    const ctx = canvas.getContext('2d')

    const frames = []
    for (let i = 0; i < count; i++) {
      // Centre chaque vignette sur son segment plutôt que d'échantillonner
      // pile sur les bornes 0 et durée (souvent noires/gelées sur certains
      // encodages) — un léger décalage donne un filmstrip plus représentatif.
      const t = ((i + 0.5) / count) * duration
      await new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked)
          resolve()
        }
        video.addEventListener('seeked', onSeeked)
        video.currentTime = Math.min(duration - 0.01, Math.max(0, t))
      })
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      frames.push(canvas.toDataURL('image/jpeg', 0.6))
    }

    return { frames, duration }
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Réduit la forme d'onde d'un fichier audio à `bucketCount` valeurs d'crête
 * (0-1), moyennées sur tous les canaux — assez pour dessiner une waveform
 * stylisée sans conserver l'intégralité des échantillons en mémoire.
 */
export async function generateWaveformPeaks(file, bucketCount = 120) {
  const buffer = await decodeAudio(file)
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  const samplesPerBucket = Math.max(1, Math.floor(buffer.length / bucketCount))
  const peaks = new Array(bucketCount).fill(0)

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = bucket * samplesPerBucket
    const end = Math.min(buffer.length, start + samplesPerBucket)
    let peak = 0
    for (const data of channels) {
      for (let i = start; i < end; i++) {
        const abs = Math.abs(data[i])
        if (abs > peak) peak = abs
      }
    }
    peaks[bucket] = peak
  }

  // Normalise sur le pic max du fichier plutôt que sur 1.0 brut : un fichier
  // enregistré en dessous du niveau max resterait sinon écrasé visuellement
  // (waveform plate) alors qu'il a bien du dynamisme à afficher.
  const max = Math.max(...peaks, 0.0001)
  return { peaks: peaks.map((p) => p / max), duration: buffer.duration }
}
