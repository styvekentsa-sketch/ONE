/**
 * Téléchargements de ONE : un seul point de passage pour tous les outils.
 *
 * - Noms uniques : chaque nom déjà téléchargé est mémorisé (sur l'appareil) ;
 *   un nouveau fichier qui porterait le même nom devient « nom (2).pdf »,
 *   « nom (3).pdf »… Deux téléchargements n'ont donc jamais le même nom.
 * - Renommer : avant chaque téléchargement, une fenêtre propose le nom et
 *   permet de le modifier (désactivable dans Réglages).
 * - Lots (plusieurs fichiers d'un coup) : pas de fenêtre par fichier, mais
 *   des noms toujours uniques.
 */

const NAMES_KEY = 'one-downloaded-names'
const SETTINGS_KEY = 'one-download-settings'
const SETTINGS_EVENT = 'one-download-settings-change'
const MAX_REMEMBERED = 1000
const DEFAULT_SETTINGS = { askName: true }
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g

let promptHandler = null
let queue = Promise.resolve()

// ——— Réglages ———

export function getDownloadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function setDownloadSettings(patch) {
  const next = { ...getDownloadSettings(), ...patch }
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next))
  } catch {
    // Stockage indisponible : le réglage vaut pour la session.
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }))
}

export function onDownloadSettingsChange(listener) {
  const handler = (event) => listener(event.detail)
  window.addEventListener(SETTINGS_EVENT, handler)
  return () => window.removeEventListener(SETTINGS_EVENT, handler)
}

// ——— Noms ———

let usedNames = null
function loadUsedNames() {
  if (usedNames) return usedNames
  try {
    usedNames = JSON.parse(localStorage.getItem(NAMES_KEY) ?? '[]')
  } catch {
    usedNames = []
  }
  return usedNames
}

function rememberName(name) {
  const names = loadUsedNames()
  names.push(name.toLowerCase())
  if (names.length > MAX_REMEMBERED) names.splice(0, names.length - MAX_REMEMBERED)
  try {
    localStorage.setItem(NAMES_KEY, JSON.stringify(names))
  } catch {
    // Mémoire de session uniquement.
  }
}

/** Sépare « rapport.final.pdf » en { base: 'rapport.final', ext: '.pdf' }. */
export function splitName(name) {
  const match = /^(.+?)(\.[a-z0-9]{1,8})$/i.exec(name)
  return match ? { base: match[1], ext: match[2] } : { base: name, ext: '' }
}

/** Nettoie un nom saisi : caractères interdits retirés, espaces superflus, longueur bornée. */
export function sanitizeBase(base) {
  return base.replace(ILLEGAL, '').replace(/\s+/g, ' ').trim().replace(/^\.+|\.+$/g, '').slice(0, 180)
}

export function isNameUsed(name) {
  return loadUsedNames().includes(name.toLowerCase())
}

/** Renvoie un nom jamais encore utilisé : « nom.pdf », sinon « nom (2).pdf », « nom (3).pdf »… */
export function uniqueName(name) {
  if (!isNameUsed(name)) return name
  const { base, ext } = splitName(name)
  const root = base.replace(/ \(\d+\)$/, '')
  for (let n = 2; ; n++) {
    const candidate = `${root} (${n})${ext}`
    if (!isNameUsed(candidate)) return candidate
  }
}

// ——— Fenêtre « Renommer » ———

/** Enregistré par <DownloadNameDialog /> : (suggestedName) => Promise<string | null>. */
export function registerDownloadPrompt(handler) {
  promptHandler = handler
  return () => {
    if (promptHandler === handler) promptHandler = null
  }
}

function askName(suggested) {
  // Une seule fenêtre à la fois : les demandes s'enchaînent.
  const next = queue.then(() => (promptHandler ? promptHandler(suggested) : suggested))
  queue = next.catch(() => {})
  return next
}

// ——— Téléchargement ———

function triggerDownload(source, name) {
  const isBlob = source instanceof Blob
  const url = isBlob ? URL.createObjectURL(source) : source
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  if (isBlob) setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Télécharge un fichier (Blob ou URL) sous un nom unique.
 * @param {Blob|string} source
 * @param {string} name nom proposé, extension comprise
 * @param {{ ask?: boolean }} [options] ask: false pour les lots (pas de fenêtre)
 * @returns {Promise<string|null>} le nom final, ou null si l'utilisateur annule
 */
export async function saveFile(source, name, { ask = true } = {}) {
  const fallback = name?.trim() || 'ONE_fichier'
  let chosen = fallback
  if (ask && getDownloadSettings().askName) {
    chosen = await askName(uniqueName(fallback))
    if (!chosen) return null
  }
  const final = uniqueName(chosen)
  rememberName(final)
  triggerDownload(source, final)
  return final
}

/** Plusieurs fichiers d'un coup : noms uniques, sans fenêtre par fichier. */
export function saveFiles(items) {
  return items.map(({ source, name }) => saveFile(source, name, { ask: false }))
}

/** Oublie les noms déjà utilisés (Réglages). */
export function resetUsedNames() {
  usedNames = []
  try {
    localStorage.removeItem(NAMES_KEY)
  } catch {
    // Rien à effacer.
  }
}
