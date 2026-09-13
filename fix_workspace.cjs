const fs = require('fs');
let code = fs.readFileSync('src/pages/dashboard/PatientWorkspace.jsx', 'utf8');

// 1. Add state for the new Patient Infos modal
code = code.replace(
  /const \[consultationStatus, setConsultationStatus\] = useState\(startConsultation \? 'in_progress' : 'not_started'\)/,
  `const [consultationStatus, setConsultationStatus] = useState(startConsultation ? 'in_progress' : 'not_started')\n  const [showPatientSidebar, setShowPatientSidebar] = useState(false)`
);

// 2. Add the "Dossier" button
code = code.replace(
  /\{\/\* Bouton Terminer \/ Enregistrer \(Même style que "Commencer"\) \*\/\}/g,
  `{/* Bouton Dossier (Patient Infos) */}
                <button
                  onClick={() => setShowPatientSidebar(true)}
                  className="h-10 px-4 rounded-[0.625rem] font-bold text-[13px] bg-white text-[#334155] border-2 border-[#cbd5e1] hover:bg-[#f1f5f9] hover:border-[#94a3b8] transition-all flex items-center gap-1.5 shadow-sm hover:-translate-y-0.5 active:translate-y-0"
                >
                  <User className="w-4 h-4 text-slate-600" />
                  Dossier patient
                </button>

                {/* Bouton Terminer / Enregistrer (Même style que "Commencer") */}`
);

code = code.replace(
  /<button\n\s*onClick=\{handleStartConsultation\}\n\s*className="h-10 px-5 rounded-\[0\.625rem\] font-bold text-\[13px\] bg-\[#2563eb\] text-white border-2 border-\[#60a5fa\] hover:bg-\[#1e40af\] hover:border-\[#1e3a8a\] transition-all flex items-center gap-2 shadow-\[0_3px_10px_rgba\(37,99,235,0\.25\)\] hover:-translate-y-0\.5 active:translate-y-0"\n\s*>/g,
  `<button
                onClick={() => setShowPatientSidebar(true)}
                className="h-10 px-4 rounded-[0.625rem] font-bold text-[13px] bg-white text-[#334155] border-2 border-[#cbd5e1] hover:bg-[#f1f5f9] hover:border-[#94a3b8] transition-all flex items-center gap-1.5 shadow-sm hover:-translate-y-0.5 active:translate-y-0"
              >
                <User className="w-4 h-4 text-slate-600" />
                Dossier patient
              </button>
              
              <button
                onClick={handleStartConsultation}
                className="h-10 px-5 rounded-[0.625rem] font-bold text-[13px] bg-[#2563eb] text-white border-2 border-[#60a5fa] hover:bg-[#1e40af] hover:border-[#1e3a8a] transition-all flex items-center gap-2 shadow-[0_3px_10px_rgba(37,99,235,0.25)] hover:-translate-y-0.5 active:translate-y-0"
              >`
);

// 3. Fix the Top Bar Grid
code = code.replace(
  /<div className="max-w-\[1800px\] mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-\[1fr_340px\] gap-5 items-center relative">/g,
  `<div className="max-w-[1800px] mx-auto flex justify-between items-center relative gap-5">`
);

code = code.replace(
  /<div className="flex items-center min-w-0 flex-1 md:col-span-2 lg:col-span-1 lg:order-1">/g,
  `<div className="flex items-center min-w-0 flex-1">`
);

code = code.replace(
  /\{\/\* Bloc actions côté droit \*\/\}\n\s*<div className="flex items-center gap-2\.5 shrink-0 md:col-span-1 lg:col-span-1 lg:order-2">/g,
  `{/* Bloc actions côté droit */}
          <div className="flex items-center gap-2.5 shrink-0">`
);

// 4. Remove Right Column in Main content
const rightColumnRegex = /<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-\[1fr_340px\] gap-5">[\s\S]*?\{\/\* --- Left Column: Tabs & Content --- \*\/\}\n\s*<div className="space-y-5 md:col-span-2 lg:order-1 lg:col-span-1">/g;

code = code.replace(rightColumnRegex, `<div className="w-full">\n          {/* --- Main Content --- */}\n          <div className="space-y-5 w-full">`);

// 5. Append Modal at the bottom
const modalBlock = `
      {/* Modal Dossier Patient */}
      {showPatientSidebar && (
        <SimpleModal
          title="Informations Patient"
          onClose={() => setShowPatientSidebar(false)}
          saveText="Fermer"
          onSave={() => setShowPatientSidebar(false)}
        >
          <div className="pt-2">
            <PatientSidebar
              patient={patient}
              age={age}
              chronicDisease={chronicDisease}
              currentTreatment={currentTreatment}
              emergencyContact={emergencyContact}
            />
          </div>
        </SimpleModal>
      )}
    </div>
  )
}

export default PatientWorkspace
`;

code = code.replace(/    <\/div>\n  \)\n\}\n\nexport default PatientWorkspace/g, modalBlock);

fs.writeFileSync('src/pages/dashboard/PatientWorkspace.jsx', code);
