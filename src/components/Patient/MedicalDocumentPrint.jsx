import { renderToStaticMarkup } from 'react-dom/server'
import { formatDoctorLabel, stripDoctorTitle } from '../../lib/professionalName'
import { printSheet } from './OrdonnancePrint'

const isImageDataUrl = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v)

// A printed certificat / arrêt / courrier / compte-rendu: same letterhead as the ordonnance,
// on A4. Never rendered in the app — printMedicalDocument() prints it off-screen.
function DocumentSheet({ data }) {
  const surname = stripDoctorTitle(data.medecin).split(' ').pop()
  return (
    <div className="doc-print flex flex-col">
      <div className="mb-[8mm] flex items-start justify-between gap-[5mm] border-b-2 border-slate-800 pb-[4mm]">
        {isImageDataUrl(data.logo) && (
          <img src={data.logo} alt="" className="h-auto max-h-[20mm] w-auto max-w-[36mm] shrink-0 object-contain" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[14pt] font-bold uppercase leading-tight tracking-wide text-black">{formatDoctorLabel(data.medecin)}</h1>
          {data.specialite && <p className="mt-[1mm] text-[10pt] text-slate-800">{data.specialite}</p>}
        </div>
        <div className="max-w-[70mm] shrink-0 text-right text-[9pt] leading-snug text-slate-700">
          {data.adresse && <p>{data.adresse}</p>}
          {data.telephone && <p className="mt-[0.5mm] font-semibold">Tél : {data.telephone}</p>}
        </div>
      </div>

      <div className="mb-[8mm] text-center">
        <h2 className="inline-block rounded-sm border-[1.5px] border-slate-800 px-[8mm] py-[2mm] text-[14pt] font-black uppercase tracking-[0.15em] text-black">
          {data.title}
        </h2>
      </div>

      <div className="whitespace-pre-wrap text-[11pt] leading-[1.6] text-black">{data.body}</div>

      <div className="mt-auto flex items-end justify-between gap-[6mm] pt-[12mm] text-[10pt] text-black">
        <p>Fait{data.ville ? ` à ${data.ville}` : ''}, le {data.date}</p>
        <div className="border-t border-slate-200 px-[10mm] pt-[2mm] text-center">
          <p className="mb-[5mm] text-[8pt] font-medium uppercase tracking-wider text-slate-500">Signature et cachet</p>
          {data.signe && surname && <p className="-rotate-3 font-[cursive] text-[18pt] text-black">{formatDoctorLabel(surname)}</p>}
        </div>
      </div>
    </div>
  )
}

export function printMedicalDocument(data) {
  printSheet(renderToStaticMarkup(<DocumentSheet data={data} />), {
    title: data.title,
    css: `@page { size: A4 portrait; margin: 0; }
  .doc-print { box-sizing: border-box; width: 210mm; min-height: 295mm; padding: 16mm 18mm 14mm; font-family: Arial, sans-serif; color: #000; }`,
    width: '210mm',
    height: '297mm',
  })
}
