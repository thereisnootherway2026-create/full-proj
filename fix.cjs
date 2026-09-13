const fs = require('fs');
let content = fs.readFileSync('src/pages/dashboard/DossierPatient.tsx', 'utf8');

// 1. Remove journeyData
content = content.replace(/const journeyData = \[\s*\{[\s\S]*?\}\s*\];/g, '');

// 2. Remove Urgence and Imagerie from typeConfig and EventType
content = content.replace(/type EventType = 'Consultation' \| 'Urgence' \| 'Laboratoire' \| 'Prescription' \| 'Imagerie';/g, "type EventType = 'Consultation' | 'Laboratoire' | 'Prescription' | 'Document' | 'Administratif';");

// 3. Update filterMap
content = content.replace(/const filterMap: Record<string, EventType \| null> = \{[\s\S]*?\};/, "const filterMap: Record<string, string | null> = {\n  Tous: null,\n  Consultations: 'Consultation',\n  Laboratoire: 'Laboratoire',\n  Prescriptions: 'Prescription',\n};");

// 4. Update DossierPatient component start
content = content.replace('const DossierPatient = () => {', "const DossierPatient = () => {\n  const { id: patientId } = useParams();\n  const { timeline, isLoading: timelineLoading } = usePatientDossier(patientId);");

// 5. Update filteredJourney
content = content.replace('const filteredJourney = journeyData.filter', 'const filteredJourney = (timeline || []).filter');

// 6. Fix filter pills - let's see how they are mapped.
// We'll just replace 'Urgences' and 'Imagerie' arrays
content = content.replace(/\['Tous', 'Consultations', 'Urgences', 'Laboratoire', 'Prescriptions', 'Imagerie'\]/g, "['Tous', 'Consultations', 'Laboratoire', 'Prescriptions']");

// 7. Fix empty state: search for where timeline is empty
const emptyStateJSX = `
                  {timelineLoading ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200 border-dashed">
                      <div className="w-12 h-12 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin mb-4" />
                      <p className="text-sm font-medium text-slate-500">Chargement de l'historique...</p>
                    </div>
                  ) : filteredJourney.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 bg-slate-50 rounded-xl border border-slate-200 border-dashed text-center">
                      <div className="w-12 h-12 bg-white rounded-xl border border-slate-100 flex items-center justify-center shadow-sm mb-3">
                        <Activity className="w-6 h-6 text-slate-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-slate-800">Aucun historique médical</h3>
                      <p className="text-xs text-slate-500 mt-1">Ce patient n'a pas encore de consultations ou d'examens.</p>
                    </div>
                  ) : (
`;

// It might be hard to precisely inject emptyStateJSX, so I will do it with replace_file_content separately.
fs.writeFileSync('src/pages/dashboard/DossierPatient.tsx', content);
