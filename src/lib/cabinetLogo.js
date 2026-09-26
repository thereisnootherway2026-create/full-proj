// Cabinet logo: any image the user picks is redrawn onto a canvas and re-encoded as a small
// PNG (JPEG if the PNG is still too heavy). That normalises SVG/HEIC-ish oddities into a plain
// raster image and keeps it under the size limit enforced by public.cabinets
// (cabinets_logo_data_url_check: data:image/(png|jpeg|webp), <= 300 000 chars).

const MAX_W = 600
const MAX_H = 300
const MAX_CHARS = 280000 // a little under the DB limit
const MAX_INPUT_BYTES = 5 * 1024 * 1024

export const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Impossible de lire cette image."))
    img.src = src
  })
}

export async function logoFileToDataUrl(file) {
  if (!file) throw new Error('Aucun fichier sélectionné.')
  if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) {
    throw new Error('Format non pris en charge. Utilisez une image PNG, JPG, WebP ou SVG.')
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error('Image trop lourde (5 Mo maximum).')

  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const w0 = img.naturalWidth || MAX_W
    const h0 = img.naturalHeight || MAX_H
    const scale = Math.min(1, MAX_W / w0, MAX_H / h0)
    const w = Math.max(1, Math.round(w0 * scale))
    const h = Math.max(1, Math.round(h0 * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.drawImage(img, 0, 0, w, h)

    let out = canvas.toDataURL('image/png')
    if (out.length > MAX_CHARS) {
      // JPEG has no transparency: flatten onto white, the colour of the paper.
      ctx.globalCompositeOperation = 'destination-over'
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, w, h)
      for (const q of [0.9, 0.8, 0.7, 0.6]) {
        out = canvas.toDataURL('image/jpeg', q)
        if (out.length <= MAX_CHARS) break
      }
    }
    if (out.length > MAX_CHARS) throw new Error('Image trop détaillée. Essayez une version plus simple du logo.')
    return out
  } finally {
    URL.revokeObjectURL(url)
  }
}
