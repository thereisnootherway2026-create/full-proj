export function openPrintWindow(data) {
  const popup = window.open('', '_blank', 'width=850,height=900')
  if (!popup) return

  // Extract structured parameters or fallback to legacy sections
  const {
    title = 'REÇU DE PAIEMENT MÉDICAL',
    recuNo = `REC-${Math.floor(100000 + Math.random() * 900000)}`,
    patientName = 'Patient',
    patientCin = 'N/A',
    patientPhone = 'N/A',
    patientAssurance = 'N/A',
    date = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    time = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    montantTotal = 300,
    montantPaye = 300,
    resteAPayer = 0,
    paymentMethod = 'Espèces',
    notes = '',
    isPaid = true,
    sections
  } = data || {}

  const fmt = (n) => (Number(n) || 0).toLocaleString('fr-FR') + ' MAD'
  const isPartial = resteAPayer > 0

  const legacyHtml = sections ? sections.map((s) => `
    <div style="margin-top:20px;">
      <h3 style="font-size:13px; font-weight:700; text-transform:uppercase; color:#475569; border-bottom:1px solid #e2e8f0; padding-bottom:6px; margin-bottom:10px;">${s.title}</h3>
      ${s.content}
    </div>
  `).join('') : ''

  const htmlContent = `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>${title} — ${patientName}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 28px;
            background: #ffffff;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #2563eb;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .clinic-logo {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .clinic-icon {
            width: 44px;
            height: 44px;
            background: #2563eb;
            color: #ffffff;
            border-radius: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 800;
            font-size: 22px;
            box-shadow: 0 4px 10px rgba(37,99,235,0.2);
          }
          .clinic-title {
            font-size: 20px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: -0.5px;
          }
          .clinic-sub {
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
          }
          .doc-meta {
            text-align: right;
          }
          .doc-badge {
            display: inline-block;
            padding: 4px 14px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
          .badge-paid { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
          .badge-partial { background: #fef3c7; color: #b45309; border: 1px solid #fde047; }
          .recu-num {
            font-size: 13px;
            font-weight: 700;
            color: #334155;
            margin-top: 6px;
          }
          .recu-date {
            font-size: 11px;
            color: #94a3b8;
          }
          .patient-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 16px 20px;
            margin-bottom: 24px;
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 14px;
          }
          .field-label {
            font-size: 10px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 700;
            letter-spacing: 0.5px;
            margin-bottom: 2px;
          }
          .field-val {
            font-size: 13px;
            font-weight: 700;
            color: #0f172a;
          }
          .table-title {
            font-size: 13px;
            font-weight: 700;
            color: #1e293b;
            margin-bottom: 10px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 24px;
          }
          th {
            background: #f1f5f9;
            color: #475569;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            padding: 10px 14px;
            text-align: left;
            border-top: 1px solid #e2e8f0;
            border-bottom: 1px solid #e2e8f0;
          }
          td {
            padding: 12px 14px;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
            color: #334155;
          }
          .total-box {
            background: #f8fafc;
            border: 1px solid #cbd5e1;
            border-radius: 14px;
            padding: 18px;
            margin-left: auto;
            width: 280px;
            margin-bottom: 28px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #64748b;
            margin-bottom: 6px;
          }
          .total-row.grand {
            font-size: 16px;
            font-weight: 800;
            color: #0f172a;
            border-top: 2px solid #cbd5e1;
            padding-top: 10px;
            margin-top: 8px;
          }
          .total-row.reste {
            color: #b45309;
            font-weight: 800;
          }
          .footer-sign {
            margin-top: 48px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .sign-box {
            width: 210px;
            height: 80px;
            border: 2px dashed #cbd5e1;
            border-radius: 12px;
            background: #ffffff;
          }
          .clinic-wishes {
            font-size: 11px;
            color: #64748b;
          }
        </style>
      </head>
      <body>
        <!-- Clinic Header -->
        <div class="header">
          <div class="clinic-logo">
            <div class="clinic-icon">✚</div>
            <div>
              <div class="clinic-title">MACROMEDICA</div>
              <div class="clinic-sub">Centre Médical & Chirurgical Spécialisé</div>
              <div class="clinic-sub">142, Bd Mohamed V, Casablanca • Tél: +212 522 34 56 78</div>
            </div>
          </div>
          <div class="doc-meta">
            <div class="doc-badge ${isPartial ? 'badge-partial' : 'badge-paid'}">
              ${isPartial ? 'Encaissement Partiel' : 'Payé en totalité'}
            </div>
            <div class="recu-num">${recuNo}</div>
            <div class="recu-date">Date: ${date} ${time ? `à ${time}` : ''}</div>
          </div>
        </div>

        <!-- Patient Info Card -->
        <div class="patient-card">
          <div>
            <div class="field-label">Patient(e)</div>
            <div class="field-val">${patientName}</div>
          </div>
          <div>
            <div class="field-label">CIN / Identifiant</div>
            <div class="field-val">${patientCin}</div>
          </div>
          <div>
            <div class="field-label">Téléphone</div>
            <div class="field-val">${patientPhone}</div>
          </div>
          <div>
            <div class="field-label">Assurance / Mutuelle</div>
            <div class="field-val">${patientAssurance}</div>
          </div>
        </div>

        ${sections ? legacyHtml : `
          <!-- Itemized Table -->
          <div class="table-title">Détail des Prestations Médicales</div>
          <table>
            <thead>
              <tr>
                <th>Désignation de l'Acte</th>
                <th>Mode de Réglement</th>
                <th style="text-align:right;">Montant Dû</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Consultation Médicale / Prestation</strong><br/><span style="font-size:11px; color:#64748b;">${notes || 'Consultation de médecine générale'}</span></td>
                <td><strong>${(paymentMethod || 'Espèces').toUpperCase()}</strong></td>
                <td style="text-align:right; font-weight:700;">${fmt(montantTotal)}</td>
              </tr>
            </tbody>
          </table>

          <!-- Financial Breakdown Box -->
          <div class="total-box">
            <div class="total-row">
              <span>Montant Honoraires:</span>
              <span>${fmt(montantTotal)}</span>
            </div>
            <div class="total-row">
              <span>Montant Versé:</span>
              <span style="font-weight:700; color:#16a34a;">${fmt(montantPaye)}</span>
            </div>
            ${isPartial ? `
              <div class="total-row reste">
                <span>Reste à Payer:</span>
                <span>${fmt(resteAPayer)}</span>
              </div>
            ` : ''}
            <div class="total-row grand">
              <span>Total Réglé:</span>
              <span>${fmt(montantPaye)}</span>
            </div>
          </div>
        `}

        <!-- Footer Signatures & Disclaimer -->
        <div class="footer-sign">
          <div class="clinic-wishes">
            <p style="font-weight:600; color:#334155; margin:0 0 4px 0;">Toute l'équipe Macromedica vous souhaite un bon rétablissement.</p>
            <p style="font-size:9px; color:#94a3b8; margin:0;">Document officiel émis par le système informatique Macromedica.</p>
          </div>
          <div style="text-align:center;">
            <div class="field-label" style="margin-bottom:6px;">Cachet & Signature Médicale</div>
            <div class="sign-box"></div>
          </div>
        </div>
      </body>
    </html>
  `

  popup.document.write(htmlContent)
  popup.document.close()
  popup.focus()
  setTimeout(() => {
    popup.print()
  }, 250)
}
