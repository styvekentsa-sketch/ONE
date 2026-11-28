/**
 * Comptes utilisateurs via Firebase Authentication (Google).
 *
 * - Configuration par variables d'environnement Vite (fichier .env.local en
 *   local, variables d'environnement du projet sur Vercel) : aucune clé
 *   n'est écrite dans le code. Voir docs/connexions-sociales.md.
 * - Le SDK Firebase n'est chargé qu'à la demande (import dynamique) : il
 *   n'alourdit pas le premier chargement de l'application.
 * - Seul le compte (nom, e-mail, photo, fournisseur) transite par
 *   Firebase. Les fichiers traités par ONE restent 100 % sur l'appareil.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId)

/** Fournisseurs pris en charge, dans l'ordre d'affichage. */
export const PROVIDERS = ['google', 'apple', 'microsoft', 'github', 'facebook']

/**
 * Fournisseurs réellement activés (VITE_AUTH_PROVIDERS, séparés par des
 * virgules) : on n'affiche que ceux configurés dans la console Firebase.
 */
export const enabledProviders = (() => {
  const raw = import.meta.env.VITE_AUTH_PROVIDERS ?? 'google'
  const wanted = raw.split(',').map((p) => p.trim().toLowerCase())
  return PROVIDERS.filter((p) => wanted.includes(p))
})()

let firebasePromise = null

/** Initialise Firebase une seule fois et renvoie { auth, sdk }. */
async function loadFirebase() {
  if (!isFirebaseConfigured) throw new Error('NOT_CONFIGURED')
  firebasePromise ??= Promise.all([import('firebase/app'), import('firebase/auth')]).then(([app, sdk]) => {
    const firebaseApp = app.getApps()[0] ?? app.initializeApp(config)
    const auth = sdk.getAuth(firebaseApp)
    return { auth, sdk }
  })
  return firebasePromise
}

/** Forme publique de l'utilisateur, identique à celle des comptes locaux. */
export function toPublicUser(firebaseUser) {
  if (!firebaseUser) return null
  const providers = firebaseUser.providerData.map((p) => p.providerId)
  const created = Date.parse(firebaseUser.metadata?.creationTime ?? '')
  return {
    id: firebaseUser.uid,
    name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Utilisateur',
    email: firebaseUser.email ?? '',
    photoURL: firebaseUser.photoURL ?? null,
    emailVerified: firebaseUser.emailVerified,
    providers,
    plan: 'free',
    createdAt: Number.isNaN(created) ? Date.now() : created,
  }
}

/** Codes d'erreur Firebase -> codes stables utilisés par l'interface. */
export function mapAuthError(error) {
  const code = error?.code ?? error?.message ?? ''
  const table = {
    'auth/email-already-in-use': 'EMAIL_TAKEN',
    'auth/invalid-credential': 'INVALID_CREDENTIALS',
    'auth/invalid-login-credentials': 'INVALID_CREDENTIALS',
    'auth/wrong-password': 'INVALID_CREDENTIALS',
    'auth/user-not-found': 'INVALID_CREDENTIALS',
    'auth/invalid-email': 'INVALID_EMAIL',
    'auth/weak-password': 'WEAK_PASSWORD',
    'auth/popup-closed-by-user': 'CANCELLED',
    'auth/cancelled-popup-request': 'CANCELLED',
    'auth/user-cancelled': 'CANCELLED',
    'auth/account-exists-with-different-credential': 'ACCOUNT_EXISTS',
    'auth/operation-not-allowed': 'PROVIDER_DISABLED',
    'auth/unauthorized-domain': 'UNAUTHORIZED_DOMAIN',
    'auth/network-request-failed': 'NETWORK',
    'auth/too-many-requests': 'TOO_MANY_REQUESTS',
    'auth/user-disabled': 'USER_DISABLED',
    NOT_CONFIGURED: 'NOT_CONFIGURED',
  }
  return table[code] ?? 'GENERIC'
}

function wrap(error) {
  const mapped = new Error(mapAuthError(error))
  mapped.cause = error
  return mapped
}

function buildProvider(sdk, id) {
  switch (id) {
    case 'google': {
      const p = new sdk.GoogleAuthProvider()
      p.setCustomParameters({ prompt: 'select_account' })
      return p
    }
    case 'facebook': {
      const p = new sdk.FacebookAuthProvider()
      p.addScope('email')
      return p
    }
    case 'apple': {
      const p = new sdk.OAuthProvider('apple.com')
      p.addScope('email')
      p.addScope('name')
      return p
    }
    case 'microsoft': {
      const p = new sdk.OAuthProvider('microsoft.com')
      p.setCustomParameters({ prompt: 'select_account' })
      return p
    }
    case 'github': {
      const p = new sdk.GithubAuthProvider()
      p.addScope('user:email')
      return p
    }
    default:
      throw new Error('UNKNOWN_PROVIDER')
  }
}

/** Écoute les changements de session. Renvoie la fonction de désabonnement. */
export async function subscribeToAuth(listener) {
  const { auth, sdk } = await loadFirebase()
  // Résultat d'une connexion par redirection (repli quand la fenêtre est bloquée).
  sdk.getRedirectResult(auth).catch(() => {})
  return sdk.onAuthStateChanged(auth, (user) => listener(toPublicUser(user)))
}

/**
 * Connexion par fournisseur : fenêtre surgissante, avec repli automatique
 * sur une redirection si le navigateur bloque la fenêtre (fréquent sur
 * mobile et dans les navigateurs intégrés aux applications).
 */
export async function signInWithProvider(id, language) {
  const { auth, sdk } = await loadFirebase()
  auth.languageCode = language
  const provider = buildProvider(sdk, id)
  try {
    const { user } = await sdk.signInWithPopup(auth, provider)
    return toPublicUser(user)
  } catch (error) {
    if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(error?.code)) {
      await sdk.signInWithRedirect(auth, provider)
      return null
    }
    throw wrap(error)
  }
}

export async function registerWithEmail({ name, email, password }, language) {
  const { auth, sdk } = await loadFirebase()
  auth.languageCode = language
  try {
    const { user } = await sdk.createUserWithEmailAndPassword(auth, email.trim(), password)
    await sdk.updateProfile(user, { displayName: name.trim() })
    sdk.sendEmailVerification(user).catch(() => {})
    // updateProfile met à jour l'objet utilisateur courant en place.
    return toPublicUser(auth.currentUser ?? user)
  } catch (error) {
    throw wrap(error)
  }
}

export async function loginWithEmail({ email, password }) {
  const { auth, sdk } = await loadFirebase()
  try {
    const { user } = await sdk.signInWithEmailAndPassword(auth, email.trim(), password)
    return toPublicUser(user)
  } catch (error) {
    throw wrap(error)
  }
}

export async function sendPasswordReset(email, language) {
  const { auth, sdk } = await loadFirebase()
  auth.languageCode = language
  try {
    await sdk.sendPasswordResetEmail(auth, email.trim())
  } catch (error) {
    // Par sécurité, on ne révèle pas si l'adresse possède un compte.
    if (error?.code === 'auth/user-not-found') return
    throw wrap(error)
  }
}

export async function signOutUser() {
  const { auth, sdk } = await loadFirebase()
  await sdk.signOut(auth)
}

/**
 * Suppression définitive du compte Firebase. Firebase exige une connexion
 * récente : sinon l'erreur REQUIRES_RECENT_LOGIN invite à se reconnecter.
 */
export async function deleteCurrentAccount() {
  const { auth, sdk } = await loadFirebase()
  if (!auth.currentUser) throw new Error('NOT_SIGNED_IN')
  try {
    await sdk.deleteUser(auth.currentUser)
  } catch (error) {
    if (error?.code === 'auth/requires-recent-login') throw new Error('REQUIRES_RECENT_LOGIN')
    throw wrap(error)
  }
}
