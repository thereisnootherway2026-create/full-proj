import React, { useState, useEffect } from 'react';
import { useFacturationStore } from './store';
import { useFacturesQuery } from './queries';
import { filterFactures, getPaiementsJournal, periodeStartMs } from './selectors';
import { Card, Skeleton, ErrorState } from './ui';
import { dh, fmtDateLong } from './format';
import { Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';
import Chip from '../common/Chip';
import { numeroFacture } from './data';
import { SETTLEMENT_METHOD_LABEL, useClaimsQuery, useSettlementsQuery } from './tiersPayant';

// Patient payments only: organisms pay through tiers-payant settlements, listed separately.
const MODES = ['Especes', 'Carte', 'Virement', 'Autre'];
type Payeur = 'tous' | 'patients' | 'organismes';

// One line of the journal: a patient payment (payments.amount_paid) or a settlement received
// from an organism (insurance_settlements). The two payers are never summed into each other.
interface Ligne {
  key: string;
  date: string;
  payeur: 'patient' | 'organisme';
  organisme: string;
  patientNom: string;
  numero: string;
  mode: string;
  reference: string;
  montant: number;
  recuId: string | null; // patient receipt
}

const MODE_COLORS: Record<string, string> = {
  'Especes': 'bg-emerald-100 text-emerald-700',
  'Carte': 'bg-blue-100 text-blue-700',
  'Virement': 'bg-purple-100 text-purple-700',
  'Chèque': 'bg-amber-100 text-amber-700',
  'Tiers payant': 'bg-slate-200 text-slate-700',
  'Autre': 'bg-slate-100 text-slate-600'
};

export function PaiementsView() {
  const { filters, setRecuPaiementId } = useFacturationStore();
  const { data: factures = [], isLoading, isError, error, refetch } = useFacturesQuery();
  const filteredFactures = filterFactures(factures, filters);
  const journal = getPaiementsJournal(filteredFactures);
  const { data: claims = [] } = useClaimsQuery();
  const { data: settlements = [] } = useSettlementsQuery();
  const [payeur, setPayeur] = useState<Payeur>('tous');

  const [page, setPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    setPage(1);
  }, [filters, payeur]);

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </Card>
    );
  }

  if (isError) {
    return <ErrorState error={error as Error} onRetry={refetch} />;
  }

  const patientLignes: Ligne[] = journal.map(({ facture, paiement }) => ({
    key: `p-${paiement.id}`, date: paiement.date, payeur: 'patient', organisme: '', patientNom: facture.patientNom,
    numero: facture.numero, mode: paiement.mode, reference: '', montant: paiement.montant, recuId: paiement.id,
  }));

  // Settlements follow the same filters, dated by when the organism paid.
  const claimById = new Map(claims.map(c => [c.id, c]));
  const start = periodeStartMs(filters.periode);
  const q = filters.recherche.trim().toLowerCase();
  const organismeLignes: Ligne[] = settlements.flatMap((st): Ligne[] => {
    const c = claimById.get(st.claimId);
    if (!c) return [];
    if (start > 0 && new Date(st.receivedAt).getTime() < start) return [];
    if (filters.praticienId && c.praticienId !== filters.praticienId) return [];
    if (filters.patientId && c.patientId !== filters.patientId) return [];
    const numero = numeroFacture(c.invoiceId);
    if (q && ![c.patientNom, numero, c.organizationName, st.reference].some(v => v.toLowerCase().includes(q))) return [];
    return [{
      key: `s-${st.id}`, date: st.receivedAt, payeur: 'organisme', organisme: c.organizationName, patientNom: c.patientNom,
      numero, mode: SETTLEMENT_METHOD_LABEL[st.method], reference: st.reference, montant: st.amount, recuId: null,
    }];
  });

  const totalPatients = patientLignes.reduce((a, l) => a + l.montant, 0);
  const totalOrganismes = organismeLignes.reduce((a, l) => a + l.montant, 0);
  const lignes = (payeur === 'patients' ? patientLignes : payeur === 'organismes' ? organismeLignes : [...patientLignes, ...organismeLignes])
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalPages = Math.max(1, Math.ceil(lignes.length / itemsPerPage));
  const currentItems = lignes.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const modeBreakdown = new Map<string, number>();
  patientLignes.forEach(l => modeBreakdown.set(l.mode, (modeBreakdown.get(l.mode) || 0) + l.montant));

  return (
    <div className="space-y-6">

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-slate-900 text-white border-transparent">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total encaissé</p>
          <p className="text-2xl font-bold tracking-tight mt-1">{dh(totalPatients + totalOrganismes)}</p>
          <p className="text-sm text-slate-400 mt-1">Patients et organismes</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Encaissements patients</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900 mt-1">{dh(totalPatients)}</p>
          <p className="text-sm text-slate-500 mt-1">{patientLignes.length} facture{patientLignes.length > 1 ? 's' : ''} encaissée{patientLignes.length > 1 ? 's' : ''}</p>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Règlements organismes</p>
          <p className="text-2xl font-bold tracking-tight text-blue-700 mt-1">{dh(totalOrganismes)}</p>
          <p className="text-sm text-slate-500 mt-1">{organismeLignes.length} règlement{organismeLignes.length > 1 ? 's' : ''} en tiers payant</p>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {MODES.map(mode => (
          <Card key={mode} className="flex flex-col justify-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Patients · {mode === 'Especes' ? 'Espèces' : mode}</p>
            <p className="text-lg font-bold text-slate-900 mt-1">{dh(modeBreakdown.get(mode) || 0)}</p>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {([['tous', 'Tous'], ['patients', 'Patients'], ['organismes', 'Organismes']] as Array<[Payeur, string]>).map(([id, label]) => (
          <Chip key={id} size="md" selected={payeur === id} onClick={() => setPayeur(id)}>{label}</Chip>
        ))}
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Payeur</th>
                <th className="py-3 px-4">Patient</th>
                <th className="py-3 px-4">N° Facture</th>
                <th className="py-3 px-4 text-center">Mode</th>
                <th className="py-3 px-4">Référence</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 text-right">Reçu</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {currentItems.map((l) => (
                <tr
                  key={l.key}
                  onClick={() => l.recuId && setRecuPaiementId(l.recuId)}
                  className={cn('transition-colors group', l.recuId && 'hover:bg-slate-50 cursor-pointer')}
                >
                  <td className="py-3 px-4 text-slate-600 font-medium whitespace-nowrap">{fmtDateLong(l.date)}</td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    {l.payeur === 'organisme'
                      ? <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{l.organisme}</span>
                      : <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Patient</span>}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap font-medium text-slate-900">{l.patientNom}</td>
                  <td className="py-3 px-4 font-medium text-blue-600 whitespace-nowrap">{l.numero}</td>
                  <td className="py-3 px-4 text-center whitespace-nowrap">
                    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-bold rounded', MODE_COLORS[l.mode] || MODE_COLORS['Autre'])}>
                      {l.mode === 'Especes' ? 'Espèces' : l.mode}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">{l.reference || '—'}</td>
                  <td className="py-3 px-4 font-bold text-slate-900 text-right whitespace-nowrap">{dh(l.montant)}</td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    {l.recuId && (
                      <button
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Voir le reçu"
                        onClick={(e) => { e.stopPropagation(); setRecuPaiementId(l.recuId); }}
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    {factures.length === 0 && settlements.length === 0 ? 'Aucun paiement enregistré pour le moment.' : 'Aucun paiement ne correspond aux filtres.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-sm text-slate-500">
              Affichage de <span className="font-medium text-slate-700">{(page - 1) * itemsPerPage + 1}</span> à <span className="font-medium text-slate-700">{Math.min(page * itemsPerPage, lignes.length)}</span> sur <span className="font-medium text-slate-700">{lignes.length}</span>
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-slate-700 px-2">{page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                className="p-1 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
