const fs = require('fs');

let f = 'src/pages/dashboard/PatientWorkspace.jsx';
let code = fs.readFileSync(f, 'utf8');

// 1. Tab Bar
code = code.replace(
  /<nav role="tablist" className="bg-gray-100 rounded-full p-1 inline-flex shadow-inner">/,
  '<nav role="tablist" className="bg-gray-100 rounded-full p-1 flex w-full shadow-inner">'
);

code = code.replace(
  /className=\{`px-5 py-2 text-\[13\.5px\] font-semibold rounded-full transition-all duration-200 \$\{/g,
  'className={`flex-1 px-5 py-2 text-[13.5px] font-semibold rounded-full transition-all duration-200 ${'
);


// 2. Remove state & filters block
code = code.replace(/\n\s*const \[activeFilter, setActiveFilter\] = useState\('Tout'\)/, '');
code = code.replace(/\n\s*const \[showMoreOptions, setShowMoreOptions\] = useState\(false\)/, '');

const filteredTimelineRegex = /\n\s*\/\/ --- Filtered Timeline ---\n\s*const filteredTimeline = useMemo\(\(\) => \{\n\s*if \(activeFilter === 'Tout'\) return \[\]\n\s*const filterMap = \{ 'Consultations': 'consultation', 'Analyses': 'lab', 'Urgences': 'urgency' \}\n\s*return \[\]\.filter\(event => event\.type === filterMap\[activeFilter\]\)\n\s*\}, \[activeFilter\]\)/;
code = code.replace(filteredTimelineRegex, '');

// Remove the filter pills inside Historique
// We'll replace the flex container containing the h2 and the filters with just the h2 part.
const headerFiltersRegex = /<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">\n\s*<div>\n\s*<h2 className="text-\[16px\] font-bold text-slate-900">\n\s*Parcours de soins\n\s*<\/h2>\n\s*<\/div>\n\s*<div className="relative flex items-center gap-2">[\s\S]*?<\/AnimatePresence>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>/;

code = code.replace(headerFiltersRegex, `<div className="mb-4">\n                        <h2 className="text-[16px] font-bold text-slate-900">\n                          Parcours de soins\n                        </h2>\n                      </div>`);


// 3. Update timeline mapping
code = code.replace(/filteredTimeline\.length > 0/g, 'TIMELINE_EVENTS.length > 0');
code = code.replace(/filteredTimeline\.map/g, 'TIMELINE_EVENTS.map');

// 4. Update empty state description
code = code.replace(
  /description="Aucun événement ne correspond aux filtres sélectionnés"/g,
  'description="Ce patient n\'a pas encore de parcours de soins"'
);

fs.writeFileSync(f, code);
