const USERS_KEY = 'one-auth-users'
const SESSION_KEY = 'one-auth-session'

/**
 * IMPORTANT — ceci est une authentification 100% locale de démonstration,
 * pas un vrai système de compte sécurisé : il n'existe aucun serveur dans
 * cette application (voir la Politique de confidentialité). Les "comptes"
 * créés ici vivent uniquement dans le `localStorage` de ce navigateur, ne
 * sont jamais synchronisés ailleurs, et disparaissent si l'utilisateur
 * efface ses données de navigation. Le mot de passe est haché (SHA-256, Web
 * Crypto native) avant stockage — pas en clair — mais rien n'empêche
 * quelqu'un ayant accès à cet appareil de lire ce hash depuis les DevTools :
 * ne jamais réutiliser un mot de passe important pour ce formulaire.
 */

async function hashPassword(password) {
  const data = new TextEncoder().encode(password)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function readUsers() {
  try {
    const raw = window.localStorage.getItem(USERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function writeUsers(users) {
  try {
    window.localStorage.setItem(USERS_KEY, JSON.stringify(users))
  } catch {
    // Stockage indisponible (navigation privée, quota plein) : la session
    // en cours continue de fonctionner en mémoire, mais rien ne persistera
    // à la prochaine visite.
  }
}

function readSessionUserId() {
  try {
    return window.localStorage.getItem(SESSION_KEY)
  } catch {
    return null
  }
}

function writeSessionUserId(id) {
  try {
    if (id) window.localStorage.setItem(SESSION_KEY, id)
    else window.localStorage.removeItem(SESSION_KEY)
  } catch {
    // idem : dégrade en session mémoire uniquement.
  }
}

function toPublicUser(user) {
  const { passwordHash: _passwordHash, ...publicUser } = user
  return publicUser
}

export async function registerUser({ name, email, password }) {
  const users = readUsers()
  const normalizedEmail = email.trim().toLowerCase()

  if (users.some((u) => u.email === normalizedEmail)) {
    throw new Error('EMAIL_TAKEN')
  }

  const user = {
    id: crypto.randomUUID(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    plan: 'free',
    createdAt: Date.now(),
  }

  writeUsers([...users, user])
  writeSessionUserId(user.id)
  return toPublicUser(user)
}

export async function loginUser({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase()
  const passwordHash = await hashPassword(password)
  const user = readUsers().find((u) => u.email === normalizedEmail && u.passwordHash === passwordHash)

  if (!user) {
    throw new Error('INVALID_CREDENTIALS')
  }

  writeSessionUserId(user.id)
  return toPublicUser(user)
}

export function logoutUser() {
  writeSessionUserId(null)
}

export function getCurrentUser() {
  const id = readSessionUserId()
  if (!id) return null
  const user = readUsers().find((u) => u.id === id)
  return user ? toPublicUser(user) : null
}
