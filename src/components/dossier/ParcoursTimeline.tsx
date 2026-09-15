import { useMemo, useState } from 'react';
import { Search, Stethoscope, FlaskConical, AlertTriangle, Pill, FileText, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DossierEvent, DossierEventFilter, DossierEventKind } from './types';
import { StatutBadge } from '../facturation/ui';
import { fmtMonthShort } from '../facturation/format';

const FILTERS: { key: DossierEventFilter; label: string }[] = [
  { key: 'tout', label: 'Tout' },
  { key: 'consultation', label: 'Consultations' },
  { key: 'analyse', label: 'Analyses' },
  { key: 'urgence', label: 'Urgences' },
  { key: 'ordonnance', label: 'Ordonnances' },
];

const KIND_META: Record<DossierEventKind, { icon: typeof Stethoscope; bg: string; text: string }> = {
  consultation: { icon: Stethoscope, bg: 'bg-blue-50', text: 'text-blue-600' },
  analyse: { icon: FlaskConical, bg: 'bg-emerald-50', text: 'text-emerald-600' },
  urgence: { icon: AlertTriangle, bg: 'bg-red-50', text: 'text-red-600' },
  ordonnance: { icon: Pill, bg: 'bg-purple-50', text: 'text-purple-600' },
  document: { icon: FileText, bg: 'bg-sky-50', text: 'text-sky-600' },
};

function formatDMY(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${d.getMonth()}`;
}

interface ParcoursTimelineProps {
  events: DossierEvent[];
  acteur: string;
}

export function ParcoursTimeline({ events, acteur }: ParcoursTimelineProps) {
  const [filter, setFilter] = useState<DossierEventFilter>('tout');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filtered/searched view of the SAME events array the header count and the
  // conclusion strip read from — the "N événements" count below is always
  // derived from this array, never a separate query.
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (filter !== 'tout' && e.kind !== filter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const haystack = `${e.titre} ${e.sousTitre || ''} ${e.ref || ''}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [events, filter, search]);

  let lastMonthKey = '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 print:shadow-none print:border-0">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Parcours de soins</h2>
          <p className="text-[12px] text-slate-500">
            {filtered.length} événement{filtered.length > 1 ? 's' : ''}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-3 print:hidden">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors',
              filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="relative mb-5 print:hidden">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher dans le dossier…"
          className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-lg text-[13px] text-slate-700 placeholder:text-slate-400 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="py-12 text-center text-[13px] text-slate-500">
          {events.length === 0
            ? 'Aucun historique médical — les événements apparaîtront ici.'
            : 'Aucun événement pour ce filtre.'}
        </div>
      ) : (
        <div className="relative pl-7">
          <div className="absolute left-[13px] top-1 bottom-1 w-px bg-slate-200 print:hidden" />
          <div className="space-y-3">
            {filtered.map((event) => {
              const mKey = monthKey(event.date);
              const showSeparator = mKey !== lastMonthKey;
              lastMonthKey = mKey;
              const meta = KIND_META[event.kind];
              const Icon = meta.icon;
              const isExpanded = expandedId === event.id;

              return (
                <div key={event.id}>
                  {showSeparator && (
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2 -ml-7">
                      {fmtMonthShort(event.date)}
                    </p>
                  )}
                  <div className="relative">
                    <div
                      className={cn(
                        'absolute -left-7 top-1 w-6 h-6 rounded-lg flex items-center justify-center print:hidden',
                        meta.bg
                      )}
                    >
                      <Icon className={cn('w-3.5 h-3.5', meta.text)} />
                    </div>
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      className="w-full text-left bg-slate-50 hover:bg-slate-100 border border-slate-100 rounded-xl px-3.5 py-3 transition-colors print:bg-white print:border-slate-200"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-slate-900">{event.titre}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {formatDMY(event.date)}
                            {acteur ? ` · ${acteur}` : ''}
                            {event.ref ? ` · ${event.ref}` : ''}
                          </p>
                          {event.sousTitre && <p className="text-[12px] text-slate-600 mt-1">{event.sousTitre}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {event.statutFacturation && <StatutBadge statut={event.statutFacturation} />}
                          <ChevronDown
                            className={cn('w-4 h-4 text-slate-400 transition-transform print:hidden', isExpanded && 'rotate-180')}
                          />
                        </div>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="mt-1.5 ml-1 px-3.5 py-3 bg-white border border-slate-100 rounded-xl text-[12px] text-slate-600 space-y-1.5">
                        <EventDetail event={event} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function EventDetail({ event }: { event: DossierEvent }) {
  if (event.kind === 'consultation') {
    const { diagnosis, treatment, chief_complaint, lignes } = event.payload || {};
    const items: { label: string; value: string }[] = [];
    if (chief_complaint) items.push({ label: 'Motif', value: chief_complaint });
    if (diagnosis) items.push({ label: 'Diagnostic', value: diagnosis });
    if (treatment) items.push({ label: 'Traitement', value: treatment });
    const hasLignes = Array.isArray(lignes) && lignes.length > 0;

    if (items.length === 0 && !hasLignes) {
      return <p className="text-slate-400">Aucun détail enregistré.</p>;
    }
    return (
      <>
        {items.map((it) => (
          <p key={it.label}>
            <span className="font-semibold text-slate-700">{it.label} :</span> {it.value}
          </p>
        ))}
        {hasLignes && (
          <div className="pt-1 space-y-1">
            {lignes.map((l: any, i: number) => (
              <div key={i} className="flex justify-between">
                <span>
                  {l.libelle} × {l.quantite}
                </span>
                <span className="font-medium text-slate-700">{l.prix} DH</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  if (event.kind === 'ordonnance') {
    const meds = event.payload?.medicaments;
    if (!Array.isArray(meds) || meds.length === 0) {
      return <p className="text-slate-400">Détail non disponible.</p>;
    }
    return (
      <div className="space-y-1">
        {meds.map((m: any, i: number) => (
          <p key={m.id || i}>{[m.nom, m.posologie, m.duree].filter(Boolean).join(' — ')}</p>
        ))}
      </div>
    );
  }

  if (event.kind === 'analyse') {
    const { result_text, result_value, unit, status } = event.payload || {};
    const text = result_text || (result_value != null ? `${result_value} ${unit || ''}`.trim() : null);
    if (!text) return <p className="text-slate-400">Aucun détail enregistré.</p>;
    return (
      <p>
        {text}
        {status && status !== 'normal' && <span className="ml-2 text-amber-600 font-medium">({status})</span>}
      </p>
    );
  }

  return <p className="text-slate-400">Aucun détail supplémentaire.</p>;
}
