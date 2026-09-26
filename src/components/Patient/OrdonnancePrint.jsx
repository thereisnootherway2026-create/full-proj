import { renderToStaticMarkup } from 'react-dom/server'
import { formatDoctorLabel, stripDoctorTitle } from '../../lib/professionalName'

// Only inline raster images: never lets a stored value point the print document at a URL.
const isImageDataUrl = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v)

// The printed ordonnance. Never rendered in the app itself: printOrdonnance() below renders it
// into its own off-screen document and prints that, so nothing from the app (badges, overlays,
// extension widgets…) can reach the paper.
function OrdonnanceSheet({ data }) {
  const medicaments = (data.medicaments || []).filter((m) => m && String(m.nom || '').trim())
  const surname = stripDoctorTitle(data.medecin).split(' ').pop()

  // Sized for A5 (148 × 210 mm): point-based type so it reads the same on any printer.
  return (
    <div className="ordonnance-print flex flex-col">
      <div className="mb-[6mm] flex items-start justify-between gap-[4mm] border-b-2 border-slate-800 pb-[3mm]">
        {/* Cabinet logo (Paramètres → Profil & Cabinet). Space only reserved when there is one. */}
        {isImageDataUrl(data.logo) && (
          <img src={data.logo} alt="" className="h-auto max-h-[16mm] w-auto max-w-[30mm] shrink-0 object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[13pt] font-bold uppercase leading-tight tracking-wide text-black">{formatDoctorLabel(data.medecin)}</h1>
          {data.specialite && <p className="mt-[1mm] text-[9.5pt] text-slate-800">{data.specialite}</p>}
        </div>
        <div className={`${isImageDataUrl(data.logo) ? 'max-w-[40mm]' : 'max-w-[55mm]'} shrink-0 text-right text-[8pt] leading-snug text-slate-700`}>
          {data.adresse && <p>{data.adresse}</p>}
          {data.telephone && <p className="mt-[0.5mm] font-semibold">Tél : {data.telephone}</p>}
        </div>
      </div>

      <div className="mb-[5mm] text-center">
        <h2 className="inline-block rounded-sm border-[1.5px] border-slate-800 px-[6mm] py-[1.5mm] text-[14pt] font-black uppercase tracking-[0.2em] text-black">
          Ordonnance
        </h2>
      </div>

      <div className="mb-[6mm] flex items-baseline justify-between gap-[3mm] rounded border border-slate-200 px-[3mm] py-[2mm] text-[9.5pt]">
        <p className="min-w-0 text-black">
          <span className="mr-[1.5mm] text-[7.5pt] uppercase text-slate-500">Patient :</span>
          <b>{data.patient}</b>
        </p>
        <p className="shrink-0 text-right text-black">
          <span className="mr-[1mm] text-[7.5pt] uppercase text-slate-500">Le :</span>{data.date}
          {data.ville && <span className="ml-[3mm]"><span className="mr-[1mm] text-[7.5pt] uppercase text-slate-500">À :</span>{data.ville}</span>}
        </p>
      </div>

      <div className="mb-[6mm]">
        <h3 className="mb-[3mm] border-l-[3px] border-slate-300 pl-[2.5mm] font-serif text-[18pt] font-bold italic leading-none text-slate-300">Rx</h3>
        <div className="space-y-[3.5mm] pl-[4mm]">
          {medicaments.map((m, i) => (
            <div key={i} className="flex items-baseline gap-[2.5mm]">
              <p className="w-[4mm] shrink-0 text-[9pt] font-bold text-slate-400">{i + 1}.</p>
              <div className="min-w-0">
                <p className="text-[11pt] font-bold leading-snug text-black">{m.nom}</p>
                {(m.posologie || m.duree) && (
                  <p className="mt-[0.5mm] text-[9.5pt] leading-snug text-slate-800">
                    {m.posologie}
                    {m.posologie && m.duree ? <span className="font-medium"> &nbsp;&mdash;&nbsp; {m.duree}</span> : m.duree}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {data.instructions && (
        <div className="border-t border-dashed border-slate-300 pt-[3mm]">
          <strong className="mb-[1mm] block text-[7.5pt] uppercase tracking-wider text-slate-500">Instructions supplémentaires</strong>
          <p className="whitespace-pre-wrap text-[9.5pt] leading-relaxed text-black">{data.instructions}</p>
        </div>
      )}

      {/* Pushed to the bottom of the page so the signature always sits in the same place. */}
      <div className="mt-auto flex justify-end pt-[8mm]">
        <div className="border-t border-slate-200 px-[8mm] pt-[2mm] text-center">
          <p className="mb-[4mm] text-[7.5pt] font-medium uppercase tracking-wider text-slate-500">Signature du médecin</p>
          {data.signe && surname && (
            <p className="-rotate-3 font-[cursive] text-[18pt] text-black">{formatDoctorLabel(surname)}</p>
          )}
        </div>
      </div>
    </div>
  )
}

// Prints from an off-screen iframe (same approach as PreConsultationPDF), so staff never have to
// touch the print dialog:
//  - Chrome's header/footer can only show the printed document's own title and URL, which here are
//    "Ordonnance" and about:blank — never the app URL with the patient/visit ids.
//  - @page margin 0 leaves Chrome no margin to draw that header/footer in at all; the sheet's
//    padding provides the visual margin instead.
export function printOrdonnance(data) {
  printSheet(renderToStaticMarkup(<OrdonnanceSheet data={data} />), {
    title: 'Ordonnance',
    css: `@page { size: A5 portrait; margin: 0; }
  .ordonnance-print { box-sizing: border-box; width: 148mm; min-height: 208mm; padding: 10mm 11mm 9mm; font-family: Arial, sans-serif; font-size: 9.5pt; color: #000; }`,
    width: '148mm',
    height: '210mm',
  })
}

// Prints already-rendered markup through the off-screen iframe described above.
export function printSheet(sheet, { title, css, width, height }) {
  // Reuse the app's compiled CSS (Tailwind) — <link> in production, <style> in dev.
  const appStyles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('\n')

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:${width};height:${height};border:none;visibility:hidden;'

  let removed = false
  const cleanup = () => { if (!removed) { removed = true; iframe.remove() } }

  iframe.onload = async () => {
    const win = iframe.contentWindow
    try {
      await win.document.fonts?.ready
      win.addEventListener('afterprint', () => setTimeout(cleanup, 0))
      win.focus()
      win.print()
    } catch (e) {
      console.warn(`${title} print error handled:`, e)
      cleanup()
    }
    // Fallback for browsers that never fire afterprint on an iframe.
    setTimeout(cleanup, 60000)
  }

  // srcdoc, not document.write: a written iframe takes on the app page's URL (patient/visit ids),
  // while a srcdoc document's URL is just "about:srcdoc". Relative stylesheet URLs still resolve
  // against the app.
  iframe.srcdoc = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<title>${title}</title>
${appStyles}
<style>
  html, body { margin: 0; padding: 0; background: #fff; }
  ${css}
</style>
</head>
<body>${sheet}</body>
</html>`
  document.body.appendChild(iframe)
}
