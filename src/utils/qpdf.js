import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'

const INPUT_PATH = '/input.pdf'
const OUTPUT_PATH = '/output.pdf'

let modulePromise = null

// Ce build WASM lie sa sortie standard / d'erreur à console.log et
// console.error au moment de son instanciation (pas d'option print). On
// installe donc un relais pendant l'instanciation : il renvoie vers la
// console d'origine en temps normal, et vers `captureSink` pendant une
// exécution dont on veut récupérer les messages (journal de diagnostic).
let captureSink = null
const relay = (original) => (...args) => {
  if (captureSink) captureSink.push(args.join(' '))
  else original(...args)
}

/**
 * Instancie qpdf (vrai binaire qpdf compilé en WASM, cf.
 * https://github.com/neslinesli93/qpdf-wasm) à la demande, une seule fois.
 * C'est le même moteur que celui utilisé côté serveur par de nombreux
 * outils PDF pour le chiffrement/déchiffrement — ici il tourne entièrement
 * dans l'onglet du navigateur, aucun fichier ne le quitte jamais.
 */
async function getQpdf() {
  if (!modulePromise) {
    modulePromise = import('@neslinesli93/qpdf-wasm').then(async ({ default: createModule }) => {
      const { log, error } = console
      console.log = relay(log)
      console.error = relay(error)
      try {
        return await createModule({ locateFile: () => qpdfWasmUrl, noInitialRun: true })
      } finally {
        console.log = log
        console.error = error
      }
    })
  }
  return modulePromise
}

/**
 * Exécute qpdf sur un buffer d'entrée et renvoie les octets du fichier de
 * sortie. `callMain` reflète l'interface en ligne de commande de qpdf ;
 * chaque appel utilise des chemins fixes dans le système de fichiers
 * virtuel du module (réinitialisé entre deux exécutions par `mount`/`unlink`
 * n'étant pas nécessaire ici : on écrase simplement les mêmes chemins).
 */
/**
 * Codes de sortie qpdf : 0 = succès, 2 = erreur, 3 = succès avec
 * avertissements (fichier produit malgré des défauts mineurs réparés).
 */
async function execQpdf(inputBytes, args) {
  const qpdf = await getQpdf()
  qpdf.FS.writeFile(INPUT_PATH, inputBytes)
  try {
    qpdf.FS.unlink(OUTPUT_PATH)
  } catch {
    // pas de sortie précédente
  }
  const lines = []
  captureSink = lines
  try {
    return { qpdf, exitCode: qpdf.callMain(args), output: lines }
  } catch (err) {
    // Emscripten peut lever une exception interne (ex: appel à exit())
    // plutôt que de renvoyer proprement un code non nul selon les cas.
    throw new Error('QPDF_EXECUTION_FAILED', { cause: err })
  } finally {
    captureSink = null
  }
}

/**
 * Exécution avec journal : renvoie le code de sortie, les messages de qpdf
 * et, si un fichier a été produit, ses octets. Ne lève pas d'erreur sur un
 * code non nul : c'est à l'appelant d'interpréter le résultat.
 */
export async function runQpdfLogged(inputBytes, args) {
  const { qpdf, exitCode, output } = await execQpdf(inputBytes, args)
  let bytes = null
  try {
    bytes = new Uint8Array(qpdf.FS.readFile(OUTPUT_PATH))
  } catch {
    bytes = null
  }
  // Le préfixe « programme: chemin: » de qpdf n'apporte rien à l'utilisateur.
  const log = output
    .map((line) =>
      line
        .replace(/^(?!WARNING)[^\s:]+:\s+(?=\/input\.pdf)/, '')
        .replace(/\/input\.pdf:?\s*/g, '')
        .trim(),
    )
    .filter(Boolean)
  return { exitCode, log, bytes }
}

export async function runQpdf(inputBytes, args, { allowWarnings = false } = {}) {
  const { qpdf, exitCode } = await execQpdf(inputBytes, args)

  if (exitCode !== 0 && !(allowWarnings && exitCode === 3)) {
    throw new Error('QPDF_EXECUTION_FAILED')
  }

  const output = qpdf.FS.readFile(OUTPUT_PATH)
  // Copie indépendante : le buffer retourné par FS.readFile pointe dans la
  // mémoire WASM et peut être invalidé par un appel qpdf ultérieur.
  return new Uint8Array(output)
}

/** Chemins virtuels attendus par `runQpdf` (entrée / sortie). */
export const QPDF_PATHS = { input: INPUT_PATH, output: OUTPUT_PATH }

/**
 * Lance une commande de contrôle (sans fichier de sortie) et renvoie
 * uniquement son code de sortie (messages disponibles via runQpdfLogged).
 */
export async function checkQpdf(inputBytes, args) {
  const { exitCode } = await execQpdf(inputBytes, args)
  return exitCode
}

/**
 * Chiffre un PDF avec un mot de passe (utilisateur = propriétaire, comme
 * dans la plupart des outils grand public "protéger par mot de passe").
 * `keyLength` : 128 (RC4 par défaut chez qpdf, on force `--use-aes=y` pour
 * un AES-128 réel) ou 256 (AES par défaut selon la spec PDF 2.0).
 */
export async function protectPdf(pdfBuffer, { password, keyLength = 256 }) {
  if (!password) {
    throw new Error('PASSWORD_REQUIRED')
  }

  const args = [
    INPUT_PATH,
    OUTPUT_PATH,
    '--encrypt',
    password,
    password,
    String(keyLength),
  ]
  if (keyLength === 128) args.push('--use-aes=y')
  args.push('--')

  return runQpdf(new Uint8Array(pdfBuffer), args)
}

/**
 * Déchiffre un PDF réellement protégé par mot de passe d'ouverture et
 * renvoie une copie propre, sans aucune protection. Un mot de passe erroné
 * fait échouer qpdf (code de sortie non nul) : on le traduit en erreur
 * explicite plutôt que de renvoyer un fichier corrompu.
 */
export async function unlockPdfWithPassword(pdfBuffer, password) {
  if (!password) {
    throw new Error('PASSWORD_REQUIRED')
  }

  try {
    return await runQpdf(new Uint8Array(pdfBuffer), [
      '--decrypt',
      `--password=${password}`,
      INPUT_PATH,
      OUTPUT_PATH,
    ])
  } catch (err) {
    throw new Error('WRONG_PASSWORD', { cause: err })
  }
}
