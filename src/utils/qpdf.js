import qpdfWasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url'

const INPUT_PATH = '/input.pdf'
const OUTPUT_PATH = '/output.pdf'

let modulePromise = null

/**
 * Instancie qpdf (vrai binaire qpdf compilé en WASM, cf.
 * https://github.com/neslinesli93/qpdf-wasm) à la demande, une seule fois.
 * C'est le même moteur que celui utilisé côté serveur par de nombreux
 * outils PDF pour le chiffrement/déchiffrement — ici il tourne entièrement
 * dans l'onglet du navigateur, aucun fichier ne le quitte jamais.
 */
async function getQpdf() {
  if (!modulePromise) {
    modulePromise = import('@neslinesli93/qpdf-wasm').then(({ default: createModule }) =>
      createModule({ locateFile: () => qpdfWasmUrl, noInitialRun: true }),
    )
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
async function runQpdf(inputBytes, args) {
  const qpdf = await getQpdf()
  qpdf.FS.writeFile(INPUT_PATH, inputBytes)

  let exitCode
  try {
    exitCode = qpdf.callMain(args)
  } catch (err) {
    // Emscripten peut lever une exception interne (ex: appel à exit())
    // plutôt que de renvoyer proprement un code non nul selon les cas.
    throw new Error('QPDF_EXECUTION_FAILED', { cause: err })
  }

  if (exitCode !== 0) {
    throw new Error('QPDF_EXECUTION_FAILED')
  }

  const output = qpdf.FS.readFile(OUTPUT_PATH)
  // Copie indépendante : le buffer retourné par FS.readFile pointe dans la
  // mémoire WASM et peut être invalidé par un appel qpdf ultérieur.
  return new Uint8Array(output)
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
