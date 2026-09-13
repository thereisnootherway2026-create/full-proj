import React from 'react';

/* ─────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────── */
interface Vital {
  label: string;
  value: string;
  unit: string;
  date: string;
  trend: string;
}

interface HistoriqueEntry {
  date: string;
  action: string;
  auteur?: string;
}

interface Medication {
  id: string;
  nom: string;
  dosage: string;
  posologie: string;
  indication: string;
  statut: string;
  debut: string;
  historique: HistoriqueEntry[];
}

interface Vaccination {
  label: string;
  status: string;
  ok: boolean;
}

interface Antecedents {
  medical: string[];
  chirurgical: string[];
  familial: string[];
  habitudes: string[];
  vaccinations: Vaccination[];
}

interface ResumeClinique {
  phrase: string;
  problemesActifs: { nom: string; depuis: string; statut: string }[];
  traitements: { nom: string; posologie: string; depuis: string; observance: string }[];
  vigilance: string[];
  derniereConclusion: string;
}

interface BiologyRow {
  exam: string;
  value: string;
  unit: string;
  norm: string;
  status: string;
  date: string;
}

interface Patient {
  prenom: string;
  nom: string;
  age: number;
  ddn: string;
  sexe: string;
  cnss: string;
  groupe: string;
  tel: string;
  email: string;
  ville: string;
  assurance: string;
  depuis: string;
  medecin: string;
  derniereVisite: string;
}

interface PreConsultationPDFProps {
  patient: Patient;
  resumeClinique: ResumeClinique;
  vitals: Vital[];
  antecedents: Antecedents;
  medications: Medication[];
  biology: BiologyRow[];
}

/* ─────────────────────────────────────────────────────────────
   HTML builder — rendu statique, aucune dépendance runtime
───────────────────────────────────────────────────────────── */
function buildPDFHtml(props: PreConsultationPDFProps): string {
  const { patient, resumeClinique, vitals, antecedents, medications, biology } = props;
  const printDate = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const activeMeds = medications.filter(m => m.statut === 'Actif' || m.statut === 'Si besoin');

  const trendSymbol = (trend: string) =>
    trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→';

  const vitalsRows = vitals.map(v =>
    `<tr>
      <td class="vital-label">${v.label}</td>
      <td class="vital-val"><strong>${v.value}</strong> <span class="unit">${v.unit}</span></td>
      <td class="vital-trend ${v.trend}">${trendSymbol(v.trend)}</td>
      <td class="vital-date">${v.date}</td>
    </tr>`
  ).join('');

  const problemRows = resumeClinique.problemesActifs.map(p =>
    `<tr>
      <td>${p.nom}</td>
      <td>${p.depuis}</td>
      <td><span class="badge-status">${p.statut}</span></td>
    </tr>`
  ).join('');

  const medRows = activeMeds.map(m =>
    `<tr>
      <td><strong>${m.nom}</strong> ${m.dosage}</td>
      <td>${m.posologie}</td>
      <td>${m.indication}</td>
      <td>${m.debut}</td>
      <td><span class="badge-status ${m.statut === 'Actif' ? 'green' : 'amber'}">${m.statut}</span></td>
    </tr>`
  ).join('');

  const bioRows = biology.map(r =>
    `<tr>
      <td>${r.exam}</td>
      <td><strong>${r.value}</strong> <span class="unit">${r.unit}</span></td>
      <td class="norm">${r.norm}</td>
      <td>${r.date}</td>
      <td><span class="badge-status ${r.status === 'normal' ? 'green' : 'amber'}">${r.status === 'normal' ? 'Normal' : 'À surveiller'}</span></td>
    </tr>`
  ).join('');

  const antecedentsList = (items: string[], color: string) =>
    items.map(i => `<li><span class="dot" style="background:${color}"></span>${i}</li>`).join('');

  const vaccinRows = antecedents.vaccinations.map(v =>
    `<tr>
      <td>${v.label}</td>
      <td><span class="badge-status ${v.ok ? 'green' : 'amber'}">${v.status}</span></td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <title>Dossier pré-consultation — ${patient.prenom} ${patient.nom}</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    /* ── Page ── */
    @page {
      size: A4 portrait;
      margin: 18mm 15mm 18mm 15mm;
    }
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      font-size: 9.5pt;
      color: #1e293b;
      line-height: 1.45;
      background: #fff;
    }

    /* ── Header ── */
    .pdf-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 2.5px solid #2563eb;
      padding-bottom: 10px;
      margin-bottom: 14px;
    }
    .pdf-header-left h1 {
      font-size: 15pt;
      font-weight: 800;
      color: #2563eb;
      letter-spacing: -0.3px;
    }
    .pdf-header-left p {
      font-size: 8pt;
      color: #64748b;
      margin-top: 2px;
    }
    .pdf-header-right {
      text-align: right;
      font-size: 8pt;
      color: #64748b;
    }
    .pdf-header-right strong {
      display: block;
      font-size: 9pt;
      color: #1e293b;
      font-weight: 700;
    }

    /* ── Alertes critiques ── */
    .alerts-bar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .alert-pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 3px 10px;
      font-size: 7.5pt;
      font-weight: 800;
      border: 1px solid;
    }
    .alert-pill.red { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }
    .alert-pill.amber { background: #fffbeb; border-color: #fcd34d; color: #92400e; }

    /* ── Patient card ── */
    .patient-card {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 4px 16px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 14px;
      margin-bottom: 14px;
      font-size: 8.5pt;
    }
    .patient-card .field label { color: #94a3b8; font-size: 7pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .patient-card .field span  { display: block; font-weight: 700; color: #1e293b; }

    /* ── Section titles ── */
    .section-title {
      font-size: 8pt;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #64748b;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-bottom: 8px;
      margin-top: 14px;
    }
    .section-title:first-child { margin-top: 0; }

    /* ── Résumé clinique ── */
    .resume-phrase {
      background: #eff6ff;
      border-left: 3px solid #2563eb;
      padding: 7px 10px;
      font-size: 8.5pt;
      color: #1e40af;
      border-radius: 0 4px 4px 0;
      margin-bottom: 10px;
    }
    .vigilance-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 6px;
      padding: 8px 12px;
      margin-top: 8px;
    }
    .vigilance-box .vt { font-size: 7.5pt; font-weight: 800; color: #92400e; text-transform: uppercase; margin-bottom: 4px; }
    .vigilance-box ul { list-style: none; display: flex; flex-wrap: wrap; gap: 4px 16px; }
    .vigilance-box ul li { font-size: 8pt; color: #78350f; }
    .vigilance-box ul li::before { content: "⚠ "; }

    /* ── Tables ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
    }
    thead tr { background: #f1f5f9; }
    thead th {
      text-align: left;
      padding: 5px 8px;
      font-size: 7.5pt;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      border-bottom: 1px solid #e2e8f0;
    }
    tbody tr { border-bottom: 1px solid #f1f5f9; }
    tbody tr:last-child { border-bottom: none; }
    tbody td { padding: 5px 8px; color: #334155; vertical-align: top; }
    .unit { color: #94a3b8; font-size: 7.5pt; font-weight: 400; }
    .norm { color: #94a3b8; }

    /* Vitals trend */
    .vital-trend { font-size: 11pt; font-weight: 700; }
    .vital-trend.up   { color: #dc2626; }
    .vital-trend.down { color: #16a34a; }
    .vital-trend.stable { color: #94a3b8; }
    .vital-label { color: #64748b; font-weight: 600; }
    .vital-val { font-size: 9.5pt; }
    .vital-date { color: #94a3b8; font-size: 7.5pt; }

    /* Badges */
    .badge-status {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 7pt;
      font-weight: 700;
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #475569;
    }
    .badge-status.green { background: #f0fdf4; border-color: #86efac; color: #15803d; }
    .badge-status.amber { background: #fffbeb; border-color: #fde68a; color: #92400e; }
    .badge-status.red   { background: #fef2f2; border-color: #fca5a5; color: #b91c1c; }

    /* Antécédents lists */
    .ante-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin-bottom: 8px; }
    .ante-block h4 { font-size: 7.5pt; font-weight: 800; text-transform: uppercase; color: #94a3b8; margin-bottom: 4px; }
    .ante-block ul { list-style: none; }
    .ante-block ul li { display: flex; align-items: flex-start; gap: 5px; font-size: 8.5pt; color: #334155; margin-bottom: 2px; }
    .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }

    /* ── Two-column layout for vitals + bio side by side ── */
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; }

    /* ── Conclusion ── */
    .conclusion {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 8.5pt;
      color: #475569;
      margin-top: 8px;
    }

    /* ── Footer ── */
    .pdf-footer {
      position: fixed;
      bottom: 0;
      left: 0; right: 0;
      font-size: 7pt;
      color: #94a3b8;
      display: flex;
      justify-content: space-between;
      padding: 6px 15mm;
      border-top: 1px solid #e2e8f0;
    }

    /* ── Page break control ── */
    .no-break { page-break-inside: avoid; }
    .page-break { page-break-before: always; }

    /* ── Print-only: hide nothing, everything is print ── */
    @media screen {
      body { padding: 24px; max-width: 900px; margin: 0 auto; background: #f1f5f9; }
      .pdf-wrapper { background: white; padding: 24px; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    }
  </style>
</head>
<body>
<div class="pdf-wrapper">

  <!-- HEADER -->
  <div class="pdf-header">
    <div class="pdf-header-left">
      <h1>Dossier Pré-Consultation</h1>
      <p>MacroMedica · Cabinet ${patient.medecin}</p>
    </div>
    <div class="pdf-header-right">
      <strong>${patient.prenom} ${patient.nom}</strong>
      ${patient.age} ans · Né(e) le ${patient.ddn} · ${patient.sexe}<br/>
      Groupe sanguin : ${patient.groupe} · CNSS : ${patient.cnss}<br/>
      Généré le ${printDate}
    </div>
  </div>

  <!-- ALERTES CRITIQUES -->
  <div class="alerts-bar">
    <span class="alert-pill red">⚠ Allergie Pénicilline &amp; Bêtalactamines</span>
    <span class="alert-pill amber">◆ HTA Essentielle</span>
    <span class="alert-pill amber">◆ Diabète Type 2</span>
  </div>

  <!-- IDENTITÉ PATIENT -->
  <div class="section-title">Identité &amp; Contact</div>
  <div class="patient-card">
    <div class="field"><label>Téléphone</label><span>${patient.tel}</span></div>
    <div class="field"><label>Email</label><span>${patient.email}</span></div>
    <div class="field"><label>Ville</label><span>${patient.ville}</span></div>
    <div class="field"><label>Assurance</label><span>${patient.assurance}</span></div>
    <div class="field"><label>Patient depuis</label><span>${patient.depuis}</span></div>
    <div class="field"><label>Dernière visite</label><span>${patient.derniereVisite}</span></div>
  </div>

  <!-- RÉSUMÉ CLINIQUE -->
  <div class="section-title">Résumé Clinique</div>
  <div class="resume-phrase no-break">${resumeClinique.phrase}</div>

  <table class="no-break">
    <thead>
      <tr>
        <th>Problème actif</th>
        <th>Depuis</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>${problemRows}</tbody>
  </table>

  <div class="vigilance-box no-break">
    <div class="vt">Points de vigilance — à vérifier</div>
    <ul>${resumeClinique.vigilance.map(v => `<li>${v}</li>`).join('')}</ul>
  </div>

  ${resumeClinique.derniereConclusion ? `
  <div class="section-title" style="margin-top:10px">Dernière Conclusion</div>
  <div class="conclusion no-break">${resumeClinique.derniereConclusion}</div>
  ` : ''}

  <!-- CONSTANTES & BIOLOGIE côte à côte -->
  <div class="two-col no-break">
    <div>
      <div class="section-title">Constantes Récentes</div>
      <table>
        <thead><tr><th>Paramètre</th><th>Valeur</th><th>↕</th><th>Date</th></tr></thead>
        <tbody>${vitalsRows}</tbody>
      </table>
    </div>
    <div>
      <div class="section-title">Traitements en cours</div>
      <table>
        <thead><tr><th>Médicament</th><th>Posologie</th><th>Depuis</th></tr></thead>
        <tbody>
          ${resumeClinique.traitements.map(t => `
            <tr>
              <td><strong>${t.nom}</strong></td>
              <td>${t.posologie}</td>
              <td>${t.depuis}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  </div>

  <!-- MÉDICAMENTS ACTIFS DÉTAILLÉS -->
  ${activeMeds.length > 0 ? `
  <div class="section-title" style="margin-top:14px">Médicaments actifs (détail)</div>
  <table class="no-break">
    <thead>
      <tr>
        <th>Médicament</th>
        <th>Posologie</th>
        <th>Indication</th>
        <th>Début</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>${medRows}</tbody>
  </table>
  ` : ''}

  <!-- BILAN BIOLOGIQUE -->
  <div class="section-title" style="margin-top:14px">Bilan Biologique Structuré</div>
  <table class="no-break">
    <thead>
      <tr>
        <th>Examen</th>
        <th>Résultat</th>
        <th>Valeurs réf.</th>
        <th>Date</th>
        <th>Statut</th>
      </tr>
    </thead>
    <tbody>${bioRows}</tbody>
  </table>

  <!-- ANTÉCÉDENTS -->
  <div class="section-title page-break" style="margin-top:14px">Antécédents</div>
  <div class="ante-grid">
    <div class="ante-block">
      <h4>Médicaux</h4>
      <ul>${antecedentsList(antecedents.medical, '#3b82f6')}</ul>
    </div>
    <div class="ante-block">
      <h4>Chirurgicaux</h4>
      <ul>${antecedentsList(antecedents.chirurgical, '#8b5cf6')}</ul>
    </div>
    <div class="ante-block" style="margin-top:8px">
      <h4>Familiaux</h4>
      <ul>${antecedentsList(antecedents.familial, '#94a3b8')}</ul>
    </div>
    <div class="ante-block" style="margin-top:8px">
      <h4>Habitudes de vie</h4>
      <ul>${antecedentsList(antecedents.habitudes, '#10b981')}</ul>
    </div>
  </div>

  <!-- VACCINATIONS -->
  <div class="section-title">Statut Vaccinal</div>
  <table class="no-break">
    <thead><tr><th>Vaccin</th><th>Statut</th></tr></thead>
    <tbody>${vaccinRows}</tbody>
  </table>

  <!-- FOOTER -->
  <div class="pdf-footer">
    <span>MacroMedica · Cabinet ${patient.medecin} · Document confidentiel — usage médical exclusif</span>
    <span>Dossier pré-consultation · ${patient.prenom} ${patient.nom} · ${printDate}</span>
  </div>

</div>
</body>
</html>`;
}

/* ─────────────────────────────────────────────────────────────
   Fonction principale — injecte un iframe hors-écran,
   déclenche window.print(), puis nettoie le DOM
───────────────────────────────────────────────────────────── */
export function generatePreConsultationPDF(props: PreConsultationPDFProps): void {
  const html = buildPDFHtml(props);

  // Crée un iframe invisible hors de l'écran
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:210mm;height:297mm;border:none;visibility:hidden;';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Attendre que les ressources soient chargées avant d'imprimer
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      // Nettoyage après un délai pour laisser la dialog d'impression s'ouvrir
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 1500);
    }
  };
}

export default generatePreConsultationPDF;
