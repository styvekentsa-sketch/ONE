import gifWorkerUrl from 'gif.js/dist/gif.worker.js?url'

const MAX_GIF_DURATION = 15 // secondes — au-delà, mémoire/temps de rendu deviennent déraisonnables côté navigateur.

function loadVideoElement(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.src = URL.createObjectURL(file)
    video.addEventListener('loadedmetadata', () => resolve(video), { once: true })
    video.addEventListener('error', () => reject(new Error('VIDEO_LOAD_FAILED')), { once: true })
  })
}

function seekTo(video, time) {
  return new Promise((resolve) => {
    const handleSeeked = () => {
      video.removeEventListener('seeked', handleSeeked)
      resolve()
    }
    video.addEventListener('seeked', handleSeeked)
    video.currentTime = time
  })
}

/**
 * Convertit un extrait vidéo (`start`→`end`, en secondes) en GIF animé :
 * échantillonne des images au débit `fps` demandé en déplaçant le temps de
 * lecture (`currentTime`) et en dessinant chaque image sur un canvas, puis
 * les encode via gif.js (Web Worker dédié, aucun serveur). Le clip est
 * plafonné à `MAX_GIF_DURATION` : au-delà, ni la mémoire ni le temps de
 * rendu ne resteraient raisonnables dans un onglet de navigateur.
 *
 * `effectFilter` (chaîne CSS `filter`, ex. "grayscale(1)") et `aspectRatio`
 * (largeur/hauteur cible, ex. 9/16 — recadrage centré sur l'image source)
 * sont appliqués frame par frame via l'API Canvas 2D (`ctx.filter` et un
 * `drawImage` avec rectangle source recadré) : ce ne sont pas de simples
 * aperçus, le rendu exporté les reflète réellement.
 */
export async function videoToGif(file, { start = 0, end, fps = 8, width = 400, effectFilter = 'none', aspectRatio = null, onProgress, signal } = {}) {
  const { default: GIF } = await import('gif.js/dist/gif.js')
  const video = await loadVideoElement(file)

  try {
    const clampedEnd = Math.min(end ?? video.duration, video.duration, start + MAX_GIF_DURATION)
    if (clampedEnd <= start) throw new Error('INVALID_RANGE')

    const sourceRatio = video.videoWidth / video.videoHeight || 1
    const targetRatio = aspectRatio || sourceRatio

    // Recadrage centré : on prend le plus grand rectangle de ratio
    // `targetRatio` qui tient dans l'image source, plutôt que de déformer
    // l'image pour forcer le ratio demandé.
    let cropWidth = video.videoWidth
    let cropHeight = video.videoWidth / targetRatio
    if (cropHeight > video.videoHeight) {
      cropHeight = video.videoHeight
      cropWidth = video.videoHeight * targetRatio
    }
    const cropX = (video.videoWidth - cropWidth) / 2
    const cropY = (video.videoHeight - cropHeight) / 2

    const targetWidth = Math.min(width, video.videoWidth)
    const targetHeight = Math.max(1, Math.round(targetWidth / targetRatio))

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    ctx.filter = effectFilter || 'none'

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width: targetWidth,
      height: targetHeight,
      workerScript: gifWorkerUrl,
    })

    const frameDelay = 1000 / fps
    const frameCount = Math.max(1, Math.round((clampedEnd - start) * fps))

    for (let i = 0; i < frameCount; i++) {
      // Si l'appelant a quitté la page (composant démonté), on arrête la
      // boucle d'échantillonnage tout de suite plutôt que de continuer à
      // décoder/dessiner des images en arrière-plan pour un résultat que
      // plus personne n'attend.
      if (signal?.aborted) throw new Error('ABORTED')
      const t = Math.min(start + i / fps, video.duration)
      await seekTo(video, t)
      ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)
      gif.addFrame(ctx, { copy: true, delay: frameDelay })
      onProgress?.(i + 1, frameCount)
    }

    const blob = await new Promise((resolve, reject) => {
      gif.on('finished', resolve)
      gif.on('abort', () => reject(new Error('GIF_ENCODING_FAILED')))
      gif.render()
    })

    return { blob }
  } finally {
    URL.revokeObjectURL(video.src)
  }
}

const MUTE_MIME_CANDIDATES = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']

function pickSupportedMimeType() {
  for (const type of MUTE_MIME_CANDIDATES) {
    if (window.MediaRecorder?.isTypeSupported(type)) return type
  }
  return ''
}

/**
 * Ré-exporte une vidéo sans sa piste audio, via `captureStream` (la piste
 * vidéo seule est reprise dans un nouveau `MediaStream`, sans jamais
 * inclure l'audio) + `MediaRecorder`. Limite honnête : aucune API
 * navigateur ne permet un ré-encodage instantané sans lecture — le
 * traitement dure donc environ la durée de la vidéo, et la sortie est au
 * format WebM (le mieux supporté par MediaRecorder), quel que soit le
 * conteneur d'origine.
 */
export async function muteVideo(file, { onProgress, signal } = {}) {
  const video = await loadVideoElement(file)

  const getCaptureStream = video.captureStream?.bind(video) || video.mozCaptureStream?.bind(video)
  if (!getCaptureStream) throw new Error('CAPTURE_UNSUPPORTED')

  const mimeType = pickSupportedMimeType()
  if (!mimeType) throw new Error('RECORDING_UNSUPPORTED')

  try {
    const sourceStream = getCaptureStream()
    const videoOnlyStream = new MediaStream(sourceStream.getVideoTracks())
    const recorder = new MediaRecorder(videoOnlyStream, { mimeType })
    const chunks = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const resultPromise = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }))
      recorder.onerror = (e) => reject(e.error ?? new Error('RECORDING_FAILED'))
    })

    // Si la page est quittée en cours d'enregistrement, on arrête
    // immédiatement la lecture et l'enregistreur : sans ça, la vidéo
    // continuerait à être rejouée et enregistrée en arrière-plan (piste
    // vidéo décodée en continu) pour un résultat que personne ne
    // récupérera jamais — exactement le genre de fuite qui ralentit
    // l'onglet après avoir changé de page.
    const abortHandler = () => {
      try {
        video.pause()
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        // Le nettoyage best-effort ne doit jamais faire échouer le flux principal.
      }
    }
    signal?.addEventListener?.('abort', abortHandler)

    video.currentTime = 0
    video.ontimeupdate = () => onProgress?.(video.currentTime, video.duration)

    recorder.start()
    await video.play()
    await new Promise((resolve) => video.addEventListener('ended', resolve, { once: true }))
    recorder.stop()
    signal?.removeEventListener?.('abort', abortHandler)

    if (signal?.aborted) throw new Error('ABORTED')

    const blob = await resultPromise
    const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
    return { blob, extension }
  } finally {
    URL.revokeObjectURL(video.src)
  }
}
