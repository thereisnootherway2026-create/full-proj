import React from 'react';
import { Statut } from './data';
import { cn } from '../../lib/utils';

export const statutMeta: Record<Statut, { label: string; wrapperClass: string; dotClass?: string }> = {
  payee: { label: 'Payée', wrapperClass: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200', dotClass: 'bg-emerald-500' },
  partielle: { label: 'Partielle', wrapperClass: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
  en_attente: { label: 'En attente', wrapperClass: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200', dotClass: 'bg-slate-400' },
  en_retard: { label: 'En retard', wrapperClass: 'bg-red-50 text-red-700 ring-1 ring-red-200', dotClass: 'bg-red-500' },
  annulee: { label: 'Annulée', wrapperClass: 'bg-rose-50 text-rose-600 ring-1 ring-rose-200' },
  brouillon: { label: 'Brouillon', wrapperClass: 'bg-indigo-50 text-indigo-600 ring-1 ring-indigo-200' }
};

export function StatutBadge({ statut, className }: { statut: Statut; className?: string }) {
  const meta = statutMeta[statut];
  if (!meta) return null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full', meta.wrapperClass, className)}>
      {meta.dotClass && <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClass)} />}
      {meta.label}
    </span>
  );
}

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm p-4', className)}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, subtitle, className }: { title: string; subtitle?: string; className?: string }) {
  return (
    <div className={cn('mb-4', className)}>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function Ring({ progress, size = 48, strokeWidth = 4, colorClass = 'text-blue-600' }: { progress: number; size?: number; strokeWidth?: number; colorClass?: string }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <svg className="transform -rotate-90" width={size} height={size}>
      <circle
        className="text-slate-100"
        strokeWidth={strokeWidth}
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
      <circle
        className={cn("transition-all duration-1000 ease-out", colorClass)}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        stroke="currentColor"
        fill="transparent"
        r={radius}
        cx={size / 2}
        cy={size / 2}
      />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200', className)} />;
}

export function ErrorState({ error, onRetry }: { error: Error; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-red-50/50 rounded-2xl border border-red-100 text-center">
      <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Une erreur est survenue</h3>
      <p className="text-sm text-slate-500 mb-4 max-w-sm">{error.message || 'Impossible de charger les données.'}</p>
      {onRetry && (
        <button 
          onClick={onRetry}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

