import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream } from 'pdf-lib'
import { QPDF_PATHS, checkQpdf, runQpdf } from './qpdf'

/**
 * Linéarisation « Fast Web View » (annexe F de la norme PDF), 100 % locale,
 * via le binaire qpdf compilé en WASM déjà utilisé par l'outil Protéger PDF
 * (même module, même fichier .wasm, instancié une seule fois).
 *
 * Diagnostic et vérification lisent directement le dictionnaire
 * /Linearized en tête de fichier ; la vérification finale ajoute le
 * contrôle d'intégrité de qpdf (--check-linearization), qui échoue si les
 * tables d'indices ou les décalages sont incohérents.
 */

const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes)

/** Profils réseau de la simulation (débit descendant, aller-retour). */
export const NETWORKS = {
  '3g': { mbps: 1.6, rttMs: 300 },
  '4g': { mbps: 12, rttMs: 70 },
}

/** Temps estimé (s) : établissement de connexion + transfert des octets. */
export function transferSeconds(bytes, network) {
  const { mbps, rttMs } = NETWORKS[network]
  return (rttMs * 2) / 1000 + (bytes * 8) / (mbps * 1_000_000)
}

/**
 * Lit le dictionnaire de linéarisation s'il ouvre le fichier (il doit
 * figurer dans les 1024 premiers octets). `valid` : /L correspond à la
 * taille réelle — sinon une mise à jour incrémentale a rompu la
 * linéarisation et les lecteurs l'ignorent.
 */
export function readLinearization(bytes) {
  const head = latin1(bytes.subarray(0, 1024))
  const match = /\d+\s+\d+\s+obj\s*<<([\s\S]*?)>>/.exec(head)
  if (!match || !/\/Linearized\b/.test(match[1])) return { present: false }
  const dict = match[1]
  const num = (key) => {
    const m = new RegExp(`/${key}\\s+(\\d+)`).exec(dict)
    return m ? Number(m[1]) : null
  }
  const hint = /\/H\s*\[\s*([\d\s]+)\]/.exec(dict)?.[1].trim().split(/\s+/).map(Number) ?? null
  const L = num('L')
  return {
    present: true,
    L,
    E: num('E'),
    O: num('O'),
    N: num('N'),
    T: num('T'),
    hint,
    valid: L === bytes.length && Boolean(hint),
  }
}

function headerVersion(bytes) {
  return /%PDF-(\d\.\d)/.exec(latin1(bytes.subarray(0, 32)))?.[1] ?? null
}

/** Nombre de révisions incrémentales (sections ajoutées après l'original). */
function incrementalRevisions(bytes) {
  const text = latin1(bytes)
  const count = (text.match(/%%EOF/g) ?? []).length
  // Un fichier linéarisé contient légitimement deux marqueurs %%EOF.
  return Math.max(0, count - (readLinearization(bytes).present ? 2 : 1))
}

/**
 * Estimation des octets nécessaires au premier affichage d'un fichier non
 * linéarisé s'il l'était : catalogue + arbre des pages menant à la page 1 +
 * tous les objets atteignables depuis la page 1 (contenus, polices, images).
 */
function estimateFirstPageBytes(doc) {
  const context = doc.context
  const firstPage = doc.getPages()[0]
  if (!firstPage) return 0
  const seen = new Set()
  let total = 1024 // en-tête, dictionnaire de linéarisation, xref de tête
  const stack = [context.trailerInfo.Root, firstPage.ref]

  while (stack.length) {
    const item = stack.pop()
    if (!(item instanceof PDFRef)) {
      if (item instanceof PDFStream) stack.push(item.dict)
      else if (item instanceof PDFDict) {
        for (const [key, value] of item.entries()) {
          // On ne remonte pas vers les autres pages.
          if (key === PDFName.of('Parent') || key === PDFName.of('Kids')) continue
          stack.push(value)
        }
      } else if (item instanceof PDFArray) item.asArray().forEach((v) => stack.push(v))
      continue
    }
    const key = item.toString()
    if (seen.has(key)) continue
    seen.add(key)
    const obj = context.lookup(item)
    if (!obj) continue
    total += obj.sizeInBytes() + 24
    stack.push(obj)
  }
  return total
}

/** Diagnostic affiché à l'import. */
export async function diagnosePdf(bytes) {
  const linearization = readLinearization(bytes)
  const doc = await PDFDocument.load(bytes.slice(), { ignoreEncryption: true, updateMetadata: false })
  const exactFirstPage = linearization.present && linearization.valid && linearization.E
  return {
    size: bytes.length,
    version: headerVersion(bytes),
    pageCount: doc.getPageCount(),
    encrypted: doc.isEncrypted,
    revisions: incrementalRevisions(bytes),
    linearization,
    firstPageBytes: exactFirstPage ? linearization.E : Math.min(bytes.length, estimateFirstPageBytes(doc)),
    firstPageExact: Boolean(exactFirstPage),
  }
}

/**
 * Linéarise le document. Options :
 *   compress : compresse les flux non compressés et recompresse les flux
 *              Flate au niveau maximal ;
 *   cleanup  : retire les ressources inutilisées des pages et regroupe les
 *              objets en flux d'objets.
 * Toute réécriture par qpdf élimine de toute façon les révisions
 * incrémentales et les objets orphelins.
 */
export async function linearizePdf(bytes, { compress = false, cleanup = false } = {}) {
  const args = ['--linearize']
  if (compress) args.push('--stream-data=compress', '--compression-level=9', '--recompress-flate')
  if (cleanup) args.push('--remove-unreferenced-resources=yes', '--object-streams=generate')
  args.push(QPDF_PATHS.input, QPDF_PATHS.output)
  return runQpdf(bytes, args, { allowWarnings: true })
}

/** Vérification post-traitement : dictionnaire, table d'indices et contrôle qpdf. */
export async function verifyLinearization(bytes) {
  const linearization = readLinearization(bytes)
  const exitCode = await checkQpdf(bytes, ['--check-linearization', QPDF_PATHS.input])
  return {
    ...linearization,
    hintStream: Boolean(linearization.hint),
    qpdfOk: exitCode === 0,
    compliant: linearization.present && linearization.valid && exitCode === 0,
  }
}
