import { renderToStaticMarkup } from 'react-dom/server'
import { formatDoctorLabel } from '../../lib/professionalName'
import { printSheet } from '../Patient/OrdonnancePrint'
import { amountInWords, dh, fmtDateLong } from './format'

const isImageDataUrl = (v) => typeof v === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(v)
const MODE = { Especes: 'Espèces', Carte: 'Carte', Virement: 'Virement', 'Tiers payant': 'Tiers payant', Autre: 'Autre' }

// The printed facture (A5), on the same letterhead as ordonnances and documents.
function FactureSheet({ facture: f, lignes, header, praticienNom }) {
  const paye = Number(f.paye) || 0
  const reste = Math.max(0, f.montant - paye)
  const paiements = [...f.paiements].sort((a, b) => new Date(a.date) - new Date(b.date))
  return (
    <div className="facture-print flex flex-col text-black">
      <div className="mb-[5mm] flex items-start justify-between gap-[4mm] border-b-2 border-slate-800 pb-[3mm]">
        {isImageDataUrl(header.logo) && <img src={header.logo} alt="" className="h-auto max-h-[16mm] w-auto max-w-[30mm] shrink-0 object-contain" />}
        <div className="min-w-0 flex-1">
          <h1 className="text-[12pt] font-bold uppercase leading-tight tracking-wide">{formatDoctorLabel(praticienNom || header.medecin)}</h1>
          {header.specialite && <p className="mt-[1mm] text-[9pt] text-slate-800">{header.specialite}</p>}
        </div>
        <div className="max-w-[55mm] shrink-0 text-right text-[8pt] leading-snug text-slate-700">
          {header.adresse && <p>{header.adresse}</p>}
          {header.telephone && <p className="mt-[0.5mm] font-semibold">Tél : {header.telephone}</p>}
        </div>
      </div>

      <div className="mb-[5mm] flex items-end justify-between gap-[4mm]">
        <div>
          <h2 className="text-[15pt] font-black uppercase tracking-[0.15em]">Facture</h2>
          <p className="font-mono text-[9.5pt]">N° {f.numero}</p>
        </div>
        <div className="text-right text-[9pt]">
          <p>Date : <b>{fmtDateLong(f.dateEmission)}</b></p>
          {header.ville && <p>{header.ville}</p>}
        </div>
      </div>

      <div className="mb-[5mm] rounded border border-slate-300 px-[3mm] py-[2mm] text-[9.5pt]">
        <p><span className="text-[7.5pt] uppercase text-slate-500">Patient : </span><b>{f.patientNom}</b></p>
        {f.assureurId && <p className="mt-[0.5mm]"><span className="text-[7.5pt] uppercase text-slate-500">Mutuelle : </span>{f.assureurId}</p>}
      </div>

      <table className="w-full border-collapse text-[9.5pt]">
        <thead>
          <tr className="border-b border-slate-800 text-left text-[7.5pt] uppercase tracking-wide text-slate-600">
            <th className="py-[1.5mm] font-semibold">Désignation</th>
            <th className="w-[12mm] py-[1.5mm] text-right font-semibold">Qté</th>
            <th className="w-[24mm] py-[1.5mm] text-right font-semibold">P.U.</th>
            <th className="w-[26mm] py-[1.5mm] text-right font-semibold">Montant</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={l.id || i} className="border-b border-slate-200">
              <td className="py-[1.5mm]">{l.libelle}</td>
              <td className="py-[1.5mm] text-right">{l.quantite || 1}</td>
              <td className="py-[1.5mm] text-right">{dh(l.prixUnitaire)}</td>
              <td className="py-[1.5mm] text-right font-semibold">{dh(l.prixUnitaire * (l.quantite || 1))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-[3mm] w-[62mm] space-y-[1mm] text-[9.5pt]">
        <div className="flex justify-between border-b border-slate-800 pb-[1mm] font-bold"><span>Total</span><span>{dh(f.montant, true)}</span></div>
        <div className="flex justify-between"><span>Encaissé</span><span>{dh(paye, true)}</span></div>
        <div className="flex justify-between font-bold"><span>Reste à payer</span><span>{dh(reste, true)}</span></div>
      </div>

      <p className="mt-[4mm] text-[8.5pt] italic">Arrêtée la présente facture à la somme de : <b className="not-italic">{amountInWords(Math.round(f.montant))}</b>.</p>

      {paiements.length > 0 && (
        <div className="mt-[4mm] text-[8.5pt]">
          <p className="mb-[1mm] text-[7.5pt] font-semibold uppercase tracking-wide text-slate-500">Règlements</p>
          {paiements.map((p) => (
            <p key={p.id} className="flex justify-between border-b border-dashed border-slate-200 py-[0.8mm]">
              <span>{fmtDateLong(p.date)} — {MODE[p.mode] || p.mode}</span><span>{dh(p.montant)}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-auto flex justify-end pt-[8mm]">
        <div className="border-t border-slate-200 px-[8mm] pt-[2mm] text-center">
          <p className="mb-[8mm] text-[7.5pt] font-medium uppercase tracking-wider text-slate-500">Cachet et signature</p>
        </div>
      </div>
    </div>
  )
}

export function printFacture({ facture, lignes, header, praticienNom }) {
  printSheet(renderToStaticMarkup(<FactureSheet facture={facture} lignes={lignes} header={header} praticienNom={praticienNom} />), {
    title: `Facture ${facture.numero}`,
    css: `@page { size: A5 portrait; margin: 0; }
  .facture-print { box-sizing: border-box; width: 148mm; min-height: 208mm; padding: 10mm 11mm 9mm; font-family: Arial, sans-serif; font-size: 9.5pt; }`,
    width: '148mm',
    height: '210mm',
  })
}
