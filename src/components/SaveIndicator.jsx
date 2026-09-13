import React from 'react';

/**
 * SaveIndicator - Indicateur discret d'état de sauvegarde (point seul + tooltip)
 * Affiche uniquement un point coloré en permanence.
 * Texte + heure d'enregistrement seulement dans le tooltip au survol.
 * @param {{saveStatus: 'saved' | 'saving' | 'error' | 'idle', errorMessage?: string | null, lastSavedAt?: Date | null}} props
 */
export function SaveIndicator({ saveStatus = 'saved', errorMessage = null, lastSavedAt = null }) {
  const dotColor =
    saveStatus === 'error' ? 'bg-rose-500' :
    saveStatus === 'saving' ? 'bg-amber-500 animate-pulse' :
    saveStatus === 'saved' ? 'bg-emerald-500' :
    'bg-slate-400'; // idle

  const label =
    saveStatus === 'saved' ? 'Sauvegardé' :
    saveStatus === 'saving' ? 'Sauvegarde en cours' :
    saveStatus === 'error' ? 'Erreur de sauvegarde' :
    'En attente de sauvegarde';

  const timeStr = lastSavedAt ? lastSavedAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';

  const tooltipText = (() => {
    if (saveStatus === 'error') return errorMessage || 'Erreur de sauvegarde';
    if (saveStatus === 'saved' && timeStr) return `${label} · ${timeStr}`;
    return label;
  })();

  return (
    <div
      className="save-indicator inline-flex items-center select-none"
      title={tooltipText}
      role="status"
      aria-live="polite"
      aria-label={tooltipText}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full shadow-sm ${dotColor}`} />
    </div>
  );
}
