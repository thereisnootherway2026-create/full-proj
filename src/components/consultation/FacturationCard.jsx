import { CreditCard, Wallet, X } from 'lucide-react'

export default function FacturationCard({
  amount = '250,00',
  onChangeAmount,
  description = 'Consultation de suivi',
  onChangeDescription,
  onViewFacture,
  className = '',
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-xs ${className}`}>
      {/* Title */}
      <h3 className="text-[16px] font-bold text-slate-900">Facturation</h3>

      {/* Inputs Grid */}
      <div className="mt-3.5 grid grid-cols-1 gap-4 sm:grid-cols-[180px_1fr] items-start">
        {/* Montant (MAD) */}
        <div>
          <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
            Montant (MAD)
          </label>
          <div className="relative">
            <input
              type="text"
              value={amount}
              onChange={(e) => onChangeAmount?.(e.target.value)}
              placeholder="0,00"
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 pr-8 transition-all"
            />
            {amount && (
              <button
                type="button"
                onClick={() => onChangeAmount?.('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Effacer le montant"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="text-[12px] font-medium text-slate-500 mb-1.5 block">
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => onChangeDescription?.(e.target.value)}
            placeholder="Consultation de suivi"
            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition-all"
          />
        </div>
      </div>

      {/* Voir la facture action */}
      <div className="mt-3.5 pt-2">
        <button
          type="button"
          onClick={onViewFacture}
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-600 hover:text-emerald-700 transition-colors group cursor-pointer"
        >
          <Wallet className="h-4 w-4 text-emerald-600 group-hover:scale-105 transition-transform" />
          <span className="underline-offset-2 group-hover:underline">Voir la facture</span>
        </button>
      </div>
    </div>
  )
}
