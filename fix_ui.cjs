const fs = require('fs');
let content = fs.readFileSync('src/pages/dashboard/DossierPatient.tsx', 'utf8');

// Replace Filters UI
const newFilters = `                  {/* Filters */}
                  <div className="flex bg-slate-100 p-1 rounded-xl w-max flex-wrap">
                    {filters.map((f) => (
                      <button
                        key={f}
                        onClick={() => setActiveFilter(f)}
                        className={\`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all \${
                          activeFilter === f
                            ? 'bg-white text-blue-700 shadow-[0_1px_3px_rgba(0,0,0,0.1)]'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                        }\`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>`;

// We use regex to replace it
content = content.replace(/\{\/\* Filters \*\/\}\s*<div className="flex items-center gap-2 flex-wrap">[\s\S]*?<\/div>/, newFilters);

// Replace Empty state UI
const newEmptyState = `                      {timelineLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-[16px] border border-[#E2E8F0] border-dashed">
                          <div className="w-8 h-8 border-4 border-slate-100 border-t-[#3B82F6] rounded-full animate-spin mb-4" />
                          <p className="text-[14px] font-medium text-[#64748B]">Chargement de l'historique...</p>
                        </div>
                      ) : filteredJourney.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 bg-slate-50 rounded-[16px] border border-[#E2E8F0] border-dashed text-center">
                          <div className="w-12 h-12 bg-white rounded-xl border border-slate-100 flex items-center justify-center shadow-sm mb-3">
                            <Activity className="w-6 h-6 text-slate-400" />
                          </div>
                          <h3 className="text-[14px] font-semibold text-[#0F172A]">Aucun historique médical</h3>
                          <p className="text-[13px] text-[#64748B] mt-1 max-w-[250px]">
                            {searchQuery ? "Aucun événement correspondant à votre recherche." : "Ce patient n'a pas encore de consultations ou d'examens."}
                          </p>
                        </div>
                      ) : (`;

content = content.replace(/\{\s*filteredJourney\.length === 0 \? \([\s\S]*?\) : \(/, newEmptyState);

fs.writeFileSync('src/pages/dashboard/DossierPatient.tsx', content);
