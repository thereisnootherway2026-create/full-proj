import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useFacturationStore } from './store';
import { useFacturesQuery, useFilterOptions } from './queries';
import { facturePaye, factureReste } from './data';
import type { Facture } from './data';
import { dh, fmtDateLong, joursRetard } from './format';
import { StatutBadge } from './ui';
import Button from '../common/Button';
import { X, Printer, CreditCard, AlertCircle, ArrowLeft, CheckCircle2, Receipt } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useFacturePayment } from './EncaisserModal';
import { PaymentBody, PaymentFooter, PaymentDone } from '../common/PaymentModal';
import { useAppContext } from '../../context/AppContext';
import { buildLetterhead } from '../../lib/letterhead';
import { printFacture } from './FacturePrint';

const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-slate-400';
const MODE_LABEL: Record<string, string> = { Especes: 'Espèces', Carte: 'Carte', Virement: 'Virement', 'Tiers payant': 'Tiers payant', Autre: 'Autre' };
const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const factureLignes = (facture: Facture) => (facture.lignes && facture.lignes.length > 0
  ? facture.lignes
  : [{ id: 'default', libelle: 'Consultation & Prestations médicales', prixUnitaire: facture.montant, quantite: 1 }]);

interface FactureDetailProps {
  facture: Facture;
  praticienNom?: string;
  onClose: () => void;
  onPrint: () => void;
  onEncaisser: () => void;
  onReceipt?: (paiementId: string) => void;
}

// The facture, read top to bottom: where the balance stands, who/when, what was billed, how it was paid.
export function FactureDetail({ facture, praticienNom, onClose, onPrint, onEncaisser, onReceipt }: FactureDetailProps) {
  const paye = facturePaye(facture);
  const reste = factureReste(facture);
  const ratio = facture.montant > 0 ? Math.min(1, paye / facture.montant) : 1;
  const retard = joursRetard(facture.dateEcheance);
  const isLate = facture.statut === 'en_retard' && reste > 0;
  const paiements = [...facture.paiements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lignes = factureLignes(facture);

  return (
    <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 px-6 pt-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-[16px] font-bold tracking-tight text-slate-900">{facture.numero}</h2>
            <StatutBadge statut={facture.statut} />
          </div>
          <p className="mt-1 truncate text-[12.5px] text-slate-500">
            {[fmtDateLong(facture.dateEmission), facture.patientNom, praticienNom, facture.assureurId].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button onClick={onClose} className="-mr-1.5 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" aria-label="Fermer">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 space-y-6 overflow-y-auto px-6 pb-5 pt-5">
        {/* Balance: one big number and a thin line */}
        <div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-slate-500">{reste > 0 ? 'Reste à payer' : 'Facture soldée'}</p>
              <p className={cn('mt-0.5 text-[34px] font-bold leading-none tracking-tight tabular-nums', reste > 0 ? (isLate ? 'text-red-600' : 'text-slate-900') : 'text-emerald-600')}>
                {reste > 0 ? dh(reste) : <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-7 w-7" />{dh(paye)}</span>}
              </p>
            </div>
            <p className="pb-0.5 text-right text-[12.5px] tabular-nums text-slate-500">{dh(paye)} / {dh(facture.montant)}</p>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
            <motion.div
              className={cn('h-full rounded-full', reste > 0 ? (isLate ? 'bg-red-500' : 'bg-blue-500') : 'bg-emerald-500')}
              initial={{ width: 0 }} animate={{ width: `${ratio * 100}%` }} transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.12 }}
            />
          </div>
          {isLate && <p className="mt-2 flex items-center gap-1 text-[12px] font-medium text-red-600"><AlertCircle className="h-3.5 w-3.5" /> En retard de {retard} jour{retard > 1 ? 's' : ''}</p>}
          {reste > 0 && !isLate && <p className="mt-2 text-[12px] text-slate-400">Échéance le {fmtDateLong(facture.dateEcheance)}</p>}
        </div>

        {/* Actes */}
        <section>
          <p className={cn(LABEL, 'mb-1')}>Actes</p>
          <ul className="divide-y divide-slate-100">
            {lignes.map((l, i) => (
              <li key={l.id || i} className="flex items-baseline justify-between gap-4 py-2.5 text-[13.5px]">
                <span className="min-w-0 text-slate-700">{l.quantite > 1 && <span className="text-slate-400">{l.quantite} × </span>}{l.libelle}</span>
                <span className="shrink-0 font-medium tabular-nums text-slate-900">{dh(l.prixUnitaire * (l.quantite || 1))}</span>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-4 py-2.5 text-[13.5px] font-semibold">
              <span className="text-slate-500">Total</span>
              <span className="tabular-nums text-slate-900">{dh(facture.montant)}</span>
            </li>
          </ul>
        </section>

        {/* Paiements */}
        <section>
          <p className={cn(LABEL, 'mb-1')}>Paiements</p>
          {paiements.length === 0 ? (
            <p className="py-2.5 text-[13px] text-slate-400">Aucun paiement pour le moment.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {paiements.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                  <span className="flex min-w-0 items-center gap-2 text-slate-700">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {fmtDateLong(p.date)} <span className="text-slate-400">· {MODE_LABEL[p.mode] || p.mode}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="font-medium tabular-nums text-slate-900">{dh(p.montant)}</span>
                    {onReceipt && (
                      <button type="button" onClick={() => onReceipt(p.id)} aria-label={`Reçu du paiement du ${fmtDateLong(p.date)}`}
                        className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" title="Reçu">
                        <Receipt className="h-4 w-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-3.5">
        <Button variant="ghost" onClick={onPrint}>
          <Printer className="h-4 w-4" /> Imprimer
        </Button>
        {reste > 0 && (
          <Button variant="primary" onClick={onEncaisser}>
            <CreditCard className="h-4 w-4" /> Encaisser
          </Button>
        )}
      </div>
    </div>
  );
}

type FacturePayment = ReturnType<typeof useFacturePayment>;

// The shared payment UI, shown in place of the detail (no second modal stacked on top).
export function FacturePaymentPanel({ facture, pay, onBack, onReceiptYes }: {
  facture: Facture; pay: FacturePayment; onBack: () => void; onReceiptYes: () => void;
}) {
  return (
    <div className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      {pay.done ? (
        <div className="p-8">
          <PaymentDone patientName={facture.patientNom} done={pay.done} onReceiptYes={onReceiptYes} onReceiptNo={onBack} />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
            <button
              onClick={onBack}
              disabled={pay.processing}
              className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              aria-label="Retour au détail de la facture"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Encaisser</h2>
              <p className="text-xs font-medium text-slate-500">{facture.numero} · {facture.patientNom}</p>
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto p-6">
            <PaymentBody
              total={pay.total} alreadyPaid={pay.alreadyPaid} reste={pay.reste}
              amount={pay.amount} onAmountChange={pay.setAmount}
              method={pay.method} onMethodChange={pay.setMethod}
              error={pay.error} blockedReason={pay.blockedReason}
            />
          </div>
          <div className="border-t border-slate-100 bg-white px-6 py-4">
            <PaymentFooter
              amount={pay.amount} reste={pay.reste} processing={pay.processing} blockedReason={pay.blockedReason}
              onCancel={onBack} onConfirm={pay.confirm} cancelLabel="Retour"
            />
          </div>
        </>
      )}
    </div>
  );
}

export function FactureDrawer() {
  const { ui, setFactureOuverteId, setRecuPaiementId } = useFacturationStore();
  const { data: factures = [] } = useFacturesQuery();
  const { praticiens } = useFilterOptions();
  const { profile, user, cabinet } = useAppContext() as any;
  const reduceMotion = useReducedMotion();
  const [view, setView] = useState<'detail' | 'pay'>('detail');

  const current = factures.find(f => f.id === ui.factureOuverteId);
  // Keep the last facture while the modal animates out.
  const lastRef = useRef<Facture | undefined>(undefined);
  if (current) lastRef.current = current;
  const facture = current ?? lastRef.current;
  const pay = useFacturePayment(current ?? null);

  // Open on the specified view (detail or pay).
  useEffect(() => {
    if (!ui.factureOuverteId) return;
    setView(ui.factureInitialView || 'detail');
    if (ui.factureInitialView === 'pay') pay.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.factureOuverteId, ui.factureInitialView]);

  useEffect(() => {
    if (!current) return undefined;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || pay.processing) return;
      if (view === 'pay') setView('detail');
      else setFactureOuverteId(null);
    };
    window.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handleEsc); document.body.style.overflow = ''; };
  }, [current, view, pay.processing, setFactureOuverteId]);

  const handleClose = () => { if (!pay.processing) setFactureOuverteId(null); };
  const startPay = () => { pay.start(); setView('pay'); };
  const praticienNom = facture ? praticiens.find((p: { id: string; nom: string }) => p.id === facture.praticienId)?.nom : undefined;
  const openReceipt = (paiementId: string) => { setFactureOuverteId(null); setRecuPaiementId(paiementId); };
  const print = () => {
    if (!facture) return;
    const doctor = profile?.id === facture.praticienId ? profile : { nom_complet: praticienNom };
    printFacture({ facture, lignes: factureLignes(facture), header: buildLetterhead({ doctor, user, cabinet }), praticienNom });
  };

  const panelInitial = reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 16 };
  const panelExit = reduceMotion
    ? { opacity: 0, transition: { duration: 0.12 } }
    : { opacity: 0, scale: 0.98, y: 8, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] as const } };
  const panelTransition = reduceMotion ? { duration: 0.12 } : { duration: 0.34, ease: EASE_OUT };

  return (
    <AnimatePresence>
      {current && facture && (
        <motion.div
          key="facture-backdrop"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.24, ease: 'easeOut' }}
          onMouseDown={handleClose}
          role="dialog" aria-modal="true" aria-label={`Facture ${facture.numero}`}
        >
          <motion.div
            key="facture-panel"
            initial={panelInitial}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={panelExit}
            transition={panelTransition}
            style={{ willChange: 'transform, opacity' }}
            onMouseDown={(e) => e.stopPropagation()}
            className={cn('w-full', view === 'pay' ? 'max-w-lg' : 'max-w-2xl')}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: view === 'pay' ? 16 : -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: view === 'pay' ? 16 : -16 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                {view === 'pay' ? (
                  <FacturePaymentPanel
                    facture={facture}
                    pay={pay}
                    onBack={() => setView('detail')}
                    onReceiptYes={() => { setRecuPaiementId(facture.id); setFactureOuverteId(null); }}
                  />
                ) : (
                  <FactureDetail
                    facture={facture}
                    praticienNom={praticienNom}
                    onClose={handleClose}
                    onPrint={print}
                    onEncaisser={startPay}
                    onReceipt={openReceipt}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
