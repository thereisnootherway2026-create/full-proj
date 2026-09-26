import { findMrz } from './mrz'
import { parseCinText } from './cin'

// On-device identity scan (CIN, passport). The image is read in the browser with tesseract.js and is
// never uploaded or stored; only the extracted fields leave this module. Language data is downloaded
// once by tesseract.js and cached by the browser.
//
// Pipeline: normalise the photo -> OCR the whole card -> OCR the bottom strip for the MRZ -> parse the MRZ
// (check-digit verified) and the printed CIN layout -> merge. Each field carries a confidence:
//   high    machine-readable zone with a passing check digit (or MRZ and printed text agree)
//   medium  read next to a printed label, or MRZ names (no check digit exists for names)
//   low     guessed from shape alone
// The UI never fills a form silently: everything goes through a review screen.

const MAX_SIDE = 1800

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z]/g, '')

// Grayscale + contrast stretch on a downscaled copy: OCR is more reliable on a flat, high-contrast image
// than on a raw phone photo. `strip` keeps only the bottom fraction of the image (the MRZ lives there).
async function preprocess(file, strip = 1) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const upscale = strip < 1 ? Math.max(1, 2200 / (bitmap.width * scale)) : 1
  const w = Math.round(bitmap.width * scale * upscale)
  const fullH = Math.round(bitmap.height * scale * upscale)
  const h = Math.round(fullH * strip)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, bitmap.height * (1 - strip), bitmap.width, bitmap.height * strip, 0, 0, w, h)
  bitmap.close?.()
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
    d[i] = d[i + 1] = d[i + 2] = g
    hist[g | 0] += 1
  }
  // Stretch between the 2nd and 98th percentile.
  const total = w * h
  let lo = 0
  let hi = 255
  for (let acc = 0; lo < 255 && acc + hist[lo] < total * 0.02; lo += 1) acc += hist[lo]
  for (let acc = 0; hi > 0 && acc + hist[hi] < total * 0.02; hi -= 1) acc += hist[hi]
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range))
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(img, 0, 0)
  return canvas
}

// MRZ characters only; some OCR outputs read "<" as other glyphs, the parser normalises those.
const MRZ_WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<'

export async function readText(file, { onProgress } = {}) {
  const { createWorker, PSM } = await import('tesseract.js')
  const report = (stage, p = 0) => onProgress?.({ stage, progress: p })

  report('Préparation de l’image…')
  const page = await preprocess(file, 1)
  const strip = await preprocess(file, 0.4)

  report('Lecture du document…')
  const printed = await createWorker('fra+eng', 1, {
    logger: (m) => { if (m.status === 'recognizing text') report('Lecture du document…', m.progress) },
  })
  let text = ''
  try {
    text = (await printed.recognize(page)).data.text || ''
  } finally {
    await printed.terminate()
  }

  // Cheap check first: skip the MRZ pass when the full-page text already contains a valid MRZ.
  let mrzText = text
  if (!findMrz(text)) {
    report('Lecture de la zone lisible par machine…')
    const mrzWorker = await createWorker('eng', 1, {})
    try {
      await mrzWorker.setParameters({ tessedit_char_whitelist: MRZ_WHITELIST, tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '0' })
      mrzText = (await mrzWorker.recognize(strip)).data.text || ''
    } finally {
      await mrzWorker.terminate()
    }
  }
  return { text, mrzText }
}

// A merged field: { value, confidence, source: 'mrz' | 'texte' }.
const field = (value, confidence, source) => (value ? { value, confidence, source } : null)

// Pure: combine the MRZ result and the printed-text candidates into review-ready fields.
export function mergeIdentity(mrz, printed = {}) {
  const fields = {}
  const set = (key, f) => { if (f) fields[key] = f }

  if (mrz) {
    const v = mrz.verified
    // Names have no check digit: 'medium', upgraded to 'high' when the printed text agrees.
    const agree = (mrzVal, printedField) => printedField && fold(printedField.value) === fold(mrzVal)
    const namePick = (key, mrzVal) => {
      const p = printed[key]
      if (!mrzVal) return p ? field(p.value, p.confidence, 'texte') : null
      if (agree(mrzVal, p)) return field(p.value, 'high', 'mrz') // printed text keeps the accents
      return field(mrzVal, 'medium', 'mrz')
    }
    set('nom', namePick('nom', mrz.nom))
    set('prenom', namePick('prenom', mrz.prenom))
    set('dateNaissance', field(mrz.dateNaissance, v.birth ? 'high' : 'low', 'mrz'))
    set('sexe', field(mrz.sexe, v.composite || v.birth ? 'high' : 'medium', 'mrz'))

    if (mrz.docType === 'cin' || mrz.country === 'MAR') {
      // The CIN number is either the document number or in the optional data of a MAR ID card.
      const cinLike = (s) => (/^[A-Z]{1,2}\d{5,7}$/.test(s) ? s : '')
      const fromMrz = cinLike(mrz.optional) || cinLike(mrz.numeroDocument)
      if (fromMrz) set('cin', field(fromMrz, cinLike(mrz.numeroDocument) && v.docNumber ? 'high' : 'medium', 'mrz'))
    }
  }

  // Anything the MRZ did not provide comes from the printed layout.
  Object.entries(printed).forEach(([key, p]) => {
    if (!fields[key] && p?.value) set(key, field(p.value, p.confidence, 'texte'))
  })
  // Printed text confirming the MRZ's number is the only thing that upgrades it; printed text alone never does.
  if (printed.cin && fields.cin?.source === 'mrz' && fields.cin.value === printed.cin.value) fields.cin.confidence = 'high'

  const docType = mrz?.docType || (fields.cin ? 'cin' : 'inconnu')
  return { docType, fields, hasMrz: Boolean(mrz), expiry: mrz?.dateExpiration || '' }
}

export async function scanIdentity(file, opts = {}) {
  const { text, mrzText } = await readText(file, opts)
  const mrz = findMrz(mrzText) || findMrz(text)
  return { ...mergeIdentity(mrz, parseCinText(text)), rawLength: text.length }
}
