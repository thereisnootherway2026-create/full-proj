import { Banknote, CreditCard, Landmark, Check, Printer, Info } from 'lucide-react'
import Modal from './Modal'
import Button from './Button'

// The one payment-collection UI. It is used by the File d'attente "Encaisser" (as a modal) and
// by Facturation (as a modal from the Débiteurs list, and embedded in place inside the facture
// detail). The pieces are exported so a host can embed them in its own panel:
//   PaymentBody   amount + method + guidance      PaymentFooter  Annuler / Confirmer
//   PaymentDone   "Paiement enregistré" + "Générer le reçu ? Oui / Non"
// `method` values are the database's: cash | card | transfer. These are the patient's own payments;
// the share an organism pays in tiers payant is not collected here but tracked on its claim
// (Facturation > Tiers payant).

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Espèces', Icon: Banknote },
  { value: 'card', label: 'Carte', Icon: CreditCard },
  { value: 'transfer', label: 'Virement', Icon: Landmark },
]

export const paymentMethodLabel = (value) => PAYMENT_METHODS.find((m) => m.value === value)?.label || 'Espèces'

const mad = (n) => `${(Number(n) || 0).toLocaleString('fr-FR')} MAD`

// Single source of truth for what an entered amount means against the remaining balance.
export function paymentAmountState(amount, reste) {
  const value = parseFloat(amount)
  const valid = !Number.isNaN(value) && value > 0 && value <= reste
  return { value, valid, isPartial: valid && value < reste, tooHigh: !Number.isNaN(value) && value > reste }
}

function Stat({ label, value, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 text-[15px] font-bold ${tone}`}>{value}</p>
    </div>
  )
}

export function PaymentBody({ total, alreadyPaid, reste, amount, onAmountChange, method, onMethodChange, error, blockedReason }) {
  const { value, valid, isPartial, tooHigh } = paymentAmountState(amount, reste)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total dû" value={mad(total)} />
        <Stat label="Déjà payé" value={mad(alreadyPaid)} />
        <Stat label="Reste" value={mad(reste)} tone="text-amber-700" />
      </div>

      {blockedReason && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">{blockedReason}</p>
      )}

      <div>
        <label htmlFor="pay-amount" className="mb-2 block text-sm font-semibold text-slate-700">Montant encaissé maintenant</label>
        <div className="relative">
          <input
            id="pay-amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            className={`w-full rounded-xl border-2 bg-white px-4 py-3 pr-16 text-[22px] font-bold text-slate-900 outline-none transition-colors ${
              tooHigh ? 'border-red-300 focus:border-red-400' : 'border-slate-200 focus:border-green-600'
            }`}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">MAD</span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[12.5px]">
          <button
            type="button"
            onClick={() => onAmountChange(String(reste))}
            className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 transition-colors hover:border-green-600 hover:text-green-700"
          >
            Tout le solde ({mad(reste)})
          </button>
          {tooHigh && <span className="font-semibold text-red-600">Dépasse le reste à payer</span>}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700">Mode de paiement</p>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Mode de paiement">
          {PAYMENT_METHODS.map(({ value: v, label, Icon }) => {
            const selected = method === v
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onMethodChange(v)}
                className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-[13px] font-semibold transition-all ${
                  selected
                    ? 'border-green-600 bg-green-50 text-green-800 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700">{error}</p>}

      {isPartial && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span><strong>Paiement partiel</strong> : {mad(reste - value)} resteront dus et la visite restera dans la file de caisse.</span>
        </div>
      )}
      {valid && !isPartial && (
        <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2.5 text-[13px] text-green-800">
          <Check className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>Solde intégral : la consultation sera clôturée.</span>
        </div>
      )}
    </div>
  )
}

export function PaymentFooter({ amount, reste, processing, blockedReason, onCancel, onConfirm, cancelLabel = 'Annuler' }) {
  const { valid } = paymentAmountState(amount, reste)
  return (
    <div className="flex items-center justify-between gap-3">
      <Button variant="secondary" onClick={onCancel} disabled={processing}>{cancelLabel}</Button>
      <Button variant="success" onClick={onConfirm} disabled={processing || !valid || Boolean(blockedReason)}>
        {processing ? 'Traitement…' : 'Confirmer le paiement'}
      </Button>
    </div>
  )
}

export function PaymentDone({ patientName, done, onReceiptYes, onReceiptNo }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white">
        <Check className="h-7 w-7" strokeWidth={3} />
      </div>
      <h2 className="mt-4 text-[18px] font-bold text-slate-900">Paiement enregistré</h2>
      <p className="mt-1 text-[13.5px] text-slate-500">
        {mad(done.paid)} encaissés · {patientName}
      </p>
      {done.reste > 0 && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold text-amber-800">
          Reste à payer : {mad(done.reste)}
        </p>
      )}
      <p className="mt-6 text-[15px] font-semibold text-slate-900">Générer le reçu ?</p>
      <div className="mt-4 grid w-full grid-cols-2 gap-3">
        <Button variant="secondary" onClick={onReceiptNo}>Non</Button>
        <Button variant="success" onClick={onReceiptYes}>
          <Printer className="h-4 w-4" /> Oui
        </Button>
      </div>
    </div>
  )
}

// Two steps in one dialog:
//   1. form  -> amount + method, then "Confirmer" records the payment.
//   2. done  -> payment is recorded; asks whether to generate the receipt (Oui / Non).
export default function PaymentModal({
  open, patientName, total, alreadyPaid, reste,
  amount, onAmountChange, method, onMethodChange,
  processing, error, blockedReason, onConfirm, onCancel,
  done, onReceiptYes, onReceiptNo,
}) {
  if (done) {
    return (
      <Modal open={open} onClose={onReceiptNo} width="max-w-sm" noScroll>
        <PaymentDone patientName={patientName} done={done} onReceiptYes={onReceiptYes} onReceiptNo={onReceiptNo} />
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      title="Encaisser"
      description={patientName}
      onClose={processing ? () => {} : onCancel}
      width="max-w-lg"
      footer={<PaymentFooter amount={amount} reste={reste} processing={processing} blockedReason={blockedReason} onCancel={onCancel} onConfirm={onConfirm} />}
    >
      <PaymentBody
        total={total} alreadyPaid={alreadyPaid} reste={reste}
        amount={amount} onAmountChange={onAmountChange} method={method} onMethodChange={onMethodChange}
        error={error} blockedReason={blockedReason}
      />
    </Modal>
  )
}
