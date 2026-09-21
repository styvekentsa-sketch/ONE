let sharedContext = null

/** Un seul AudioContext partagé pour tout le module — en créer un par
 * opération finirait par heurter la limite du navigateur (~6 en Chrome). */
function getAudioContext() {
  if (!sharedContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    sharedContext = new Ctx()
  }
  return sharedContext
}

/**
 * Décode le flux audio d'un fichier (audio pur, ou piste audio intégrée à
 * une vidéo — `decodeAudioData` fonctionne sur les deux, le décodeur du
 * navigateur se charge de démultiplexer le conteneur). Rejette proprement
 * si le codec n'est pas supporté plutôt que de planter silencieusement.
 */
export async function decodeAudio(file) {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = getAudioContext()
  try {
    return await ctx.decodeAudioData(arrayBuffer)
  } catch {
    throw new Error('DECODE_UNSUPPORTED')
  }
}

/** Découpe un AudioBuffer entre `startSec` et `endSec` (nouveau buffer, ne
 * mute pas l'original). */
export function sliceAudioBuffer(audioBuffer, startSec, endSec) {
  const ctx = getAudioContext()
  const sampleRate = audioBuffer.sampleRate
  const startSample = Math.max(0, Math.floor(startSec * sampleRate))
  const endSample = Math.min(audioBuffer.length, Math.floor(endSec * sampleRate))
  const frameCount = Math.max(1, endSample - startSample)

  const sliced = ctx.createBuffer(audioBuffer.numberOfChannels, frameCount, sampleRate)
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const source = audioBuffer.getChannelData(channel).subarray(startSample, startSample + frameCount)
    sliced.copyToChannel(source, channel)
  }
  return sliced
}

/** Concatène deux AudioBuffers bout à bout (nouveau buffer). Suppose le même
 * `sampleRate` (les deux viennent toujours du même fichier source ici). */
function concatAudioBuffers(a, b) {
  const ctx = getAudioContext()
  const numberOfChannels = Math.max(a.numberOfChannels, b.numberOfChannels)
  const out = ctx.createBuffer(numberOfChannels, a.length + b.length, a.sampleRate)
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const data = out.getChannelData(channel)
    data.set(channel < a.numberOfChannels ? a.getChannelData(channel) : new Float32Array(a.length), 0)
    data.set(channel < b.numberOfChannels ? b.getChannelData(channel) : new Float32Array(b.length), a.length)
  }
  return out
}

function floatTo16BitPCM(float32Array) {
  const output = new Int16Array(float32Array.length)
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]))
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return output
}

/**
 * Encode un AudioBuffer en WAV (PCM 16 bits) — sans dépendance, sans perte.
 * C'est le format de secours toujours disponible : contrairement au MP3,
 * aucun navigateur n'expose d'encodeur audio générique, donc l'écriture
 * manuelle de l'en-tête RIFF est la seule voie 100% locale.
 */
export function audioBufferToWav(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const channels = []
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(floatTo16BitPCM(audioBuffer.getChannelData(ch)))
  }

  const frameCount = channels[0].length
  const blockAlign = numChannels * 2
  const dataSize = frameCount * blockAlign
  const buffer = new ArrayBuffer(44 + dataSize)
  const view = new DataView(buffer)

  const writeString = (offset, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < frameCount; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      view.setInt16(offset, channels[ch][i], true)
      offset += 2
    }
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

/**
 * Encode un AudioBuffer en MP3 via lamejs (encodeur JavaScript pur,
 * chargé à la demande) — aucun navigateur ne sait produire de MP3
 * nativement, contrairement au WAV.
 */
export async function audioBufferToMp3(audioBuffer, kbps = 128) {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const numChannels = Math.min(2, audioBuffer.numberOfChannels)
  const encoder = new Mp3Encoder(numChannels, audioBuffer.sampleRate, kbps)

  const left = floatTo16BitPCM(audioBuffer.getChannelData(0))
  const right = numChannels > 1 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : null

  const CHUNK_SIZE = 1152 // taille de trame attendue par lame
  const chunks = []
  for (let i = 0; i < left.length; i += CHUNK_SIZE) {
    const leftChunk = left.subarray(i, i + CHUNK_SIZE)
    const rightChunk = right ? right.subarray(i, i + CHUNK_SIZE) : undefined
    const encoded = encoder.encodeBuffer(leftChunk, rightChunk)
    if (encoded.length > 0) chunks.push(encoded)
  }
  const tail = encoder.flush()
  if (tail.length > 0) chunks.push(tail)

  return new Blob(chunks, { type: 'audio/mpeg' })
}

async function exportAudioBuffer(audioBuffer, format) {
  if (format === 'mp3') {
    return { blob: await audioBufferToMp3(audioBuffer), extension: 'mp3' }
  }
  return { blob: audioBufferToWav(audioBuffer), extension: 'wav' }
}

/** Applique un fondu d'entrée/sortie linéaire (en secondes) directement sur
 * les échantillons d'un AudioBuffer — modifie le buffer en place, aucune
 * dépendance à OfflineAudioContext nécessaire pour un simple ramp de gain. */
function applyFade(audioBuffer, { fadeIn = 0, fadeOut = 0 } = {}) {
  if (!fadeIn && !fadeOut) return audioBuffer
  const length = audioBuffer.length
  const fadeInSamples = Math.min(length, Math.floor(fadeIn * audioBuffer.sampleRate))
  const fadeOutSamples = Math.min(length, Math.floor(fadeOut * audioBuffer.sampleRate))

  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const data = audioBuffer.getChannelData(channel)
    for (let i = 0; i < fadeInSamples; i++) {
      data[i] *= i / fadeInSamples
    }
    for (let i = 0; i < fadeOutSamples; i++) {
      data[length - 1 - i] *= i / fadeOutSamples
    }
  }
  return audioBuffer
}

/**
 * Découpe un fichier audio entre `start`/`end` (secondes) et l'exporte au
 * format demandé ('wav' | 'mp3'), avec fondu d'entrée/sortie optionnel
 * (`fadeIn`/`fadeOut`, en secondes, appliqué après la découpe).
 *
 * `mode: 'keep'` (par défaut) conserve l'intervalle [start, end]. `mode:
 * 'remove'` fait l'inverse — sélection réellement supprimée : les segments
 * avant `start` et après `end` sont concaténés, pas juste masqués.
 */
export async function trimAudio(file, { start, end, format = 'wav', fadeIn = 0, fadeOut = 0, mode = 'keep' }) {
  const buffer = await decodeAudio(file)
  const clampedEnd = Math.min(end, buffer.duration)
  if (start >= clampedEnd) throw new Error('INVALID_RANGE')

  let result
  if (mode === 'remove') {
    const before = start > 0 ? sliceAudioBuffer(buffer, 0, start) : null
    const after = clampedEnd < buffer.duration ? sliceAudioBuffer(buffer, clampedEnd, buffer.duration) : null
    if (!before && !after) throw new Error('INVALID_RANGE')
    result = before && after ? concatAudioBuffers(before, after) : (before ?? after)
  } else {
    result = sliceAudioBuffer(buffer, start, clampedEnd)
  }

  applyFade(result, { fadeIn, fadeOut })
  return exportAudioBuffer(result, format)
}

/** Extrait la piste audio complète d'une vidéo (ou ré-exporte un fichier
 * audio tel quel) au format demandé. */
export async function extractAudio(file, { format = 'wav' } = {}) {
  const buffer = await decodeAudio(file)
  return exportAudioBuffer(buffer, format)
}

/** Convertit un fichier audio vers un autre format ('wav' | 'mp3'). */
export async function convertAudioFormat(file, format) {
  const buffer = await decodeAudio(file)
  return exportAudioBuffer(buffer, format)
}
